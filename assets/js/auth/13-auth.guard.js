/*
 * 13-auth.guard.js
 * Client-Side Authentication Guard – Billionaire Tech Adaptive Life OS
 *
 * Protects protected routes/pages (dashboard, admin) in a fully offline GitHub Pages environment.
 * Enforces session validity, expiration, and user existence.
 * Redirects unauthenticated/expired users to login.html.
 *
 * Security model: client-only token + encrypted session + storage validation
 * No server → relies on local crypto + integrity checks
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const SESSION_KEY = 'system:session';
  const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  const PROTECTED_PAGES = [
    'dashboard.html',
    'admin-dashboard.html'
  ];

  const PUBLIC_PAGES = [
    'login.html',
    'index.html' // landing if exists
  ];

  const CURRENT_PAGE = window.location.pathname.split('/').pop() || 'index.html';

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function isProtectedPage() {
    return PROTECTED_PAGES.includes(CURRENT_PAGE);
  }

  function isPublicPage() {
    return PUBLIC_PAGES.includes(CURRENT_PAGE) || CURRENT_PAGE === '';
  }

  function getSessionData() {
    const raw = Storage.read(SESSION_KEY);
    if (!raw || typeof raw !== 'object') return null;

    return {
      userId: raw.userId,
      sessionToken: raw.sessionToken,
      loginTimestamp: raw.loginTimestamp,
      expiryTimestamp: raw.expiryTimestamp || (raw.loginTimestamp + MAX_SESSION_DURATION_MS)
    };
  }

  function isSessionExpired(session) {
    if (!session || !session.expiryTimestamp) return true;
    return Date.now() > session.expiryTimestamp;
  }

  function clearSession() {
    Storage.remove(SESSION_KEY);
    State.update('user', null, { silent: true });
    State.update('system.lockdown', false);
  }

  function redirectToLogin(reason = 'unauthenticated') {
    EventBus.emit('AUTH_REDIRECT_LOGIN', { reason, page: CURRENT_PAGE });
    window.location.replace('login.html?redirect=' + encodeURIComponent(CURRENT_PAGE));
  }

  function forceLogout(reason) {
    clearSession();
    EventBus.emit('AUTH_LOGOUT_TRIGGERED', { reason });
    redirectToLogin(reason);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION & USER VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  function validateSession() {
    const session = getSessionData();

    if (!session) {
      EventBus.emit('AUTH_SESSION_INVALID', { reason: 'no_session' });
      return false;
    }

    if (isSessionExpired(session)) {
      EventBus.emit('AUTH_SESSION_EXPIRED', { session });
      forceLogout('expired');
      return false;
    }

    const user = Storage.read(`user:${session.userId}:profile`);

    if (!user || user.status !== 'active') {
      EventBus.emit('AUTH_SESSION_INVALID', { reason: 'invalid_user', userId: session.userId });
      forceLogout('invalid_user');
      return false;
    }

    // Optional: verify session token integrity via auth.crypto.js (stub here)
    // if (!AuthCrypto.verifySessionToken(session.sessionToken, user)) {
    //   forceLogout('token_invalid');
    //   return false;
    // }

    // Session is valid → populate state
    State.update('user', {
      id: session.userId,
      ...user,
      authenticated: true,
      lastValidated: Date.now()
    }, { silent: true });

    EventBus.emit('AUTH_SESSION_VALID', { userId: session.userId, session });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ROUTE PROTECTION LOGIC
  // ─────────────────────────────────────────────────────────────────────────────

  function protectCurrentRoute() {
    if (isPublicPage()) {
      // Allow public pages even if authenticated
      return;
    }

    if (!isProtectedPage()) {
      console.warn('[AuthGuard] Unknown page – allowing:', CURRENT_PAGE);
      return;
    }

    EventBus.emit('AUTH_CHECK_STARTED', { page: CURRENT_PAGE });

    const isValid = validateSession();

    if (!isValid) {
      redirectToLogin('protected_route');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC AUTH GUARD API
  // ─────────────────────────────────────────────────────────────────────────────

  const AuthGuard = {

    init() {
      // Run initial check on boot
      protectCurrentRoute();

      // Listen for session-related events
      EventBus.on('STATE_UPDATED', (state, prev, change) => {
        if (change.path?.startsWith('user.')) {
          // Re-validate if user state changes externally
          validateSession();
        }
      });

      EventBus.on('AUTH_LOGOUT_REQUESTED', () => {
        forceLogout('user_requested');
      });

      // Protect against back/forward navigation (hash/history changes)
      window.addEventListener('popstate', () => {
        protectCurrentRoute();
      });

      // Optional: periodic session check (every 5 min)
      setInterval(() => {
        if (isProtectedPage()) validateSession();
      }, 5 * 60 * 1000);

      console.log('[AuthGuard] Initialized – protecting', PROTECTED_PAGES.length, 'routes');
    },

    isAuthenticated() {
      const user = State.getPath('user');
      return !!user?.authenticated;
    },

    getCurrentUser() {
      return State.getPath('user') || null;
    },

    getSessionInfo() {
      const session = getSessionData();
      if (!session) return null;

      return {
        userId: session.userId,
        expiresIn: session.expiryTimestamp - Date.now(),
        age: Date.now() - session.loginTimestamp,
        valid: !isSessionExpired(session)
      };
    },

    forceLogout(reason = 'manual') {
      forceLogout(reason);
    },

    protectRoute() {
      protectCurrentRoute();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.AuthGuard = AuthGuard;

  // Auto-init as early as possible
  if (window.Storage && window.State && window.EventBus) {
    AuthGuard.init();
  } else {
    console.warn('[AuthGuard] Core dependencies missing – delaying init');
    const initInterval = setInterval(() => {
      if (window.Storage && window.State && window.EventBus) {
        AuthGuard.init();
        clearInterval(initInterval);
      }
    }, 50);
  }

  // Debug helpers (remove in production)
  window.__debugAuth = {
    status: () => AuthGuard.isAuthenticated() ? 'authenticated' : 'unauthenticated',
    session: () => AuthGuard.getSessionInfo(),
    user: () => AuthGuard.getCurrentUser(),
    logout: () => AuthGuard.forceLogout('debug')
  };

})();