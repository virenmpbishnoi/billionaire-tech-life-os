/*
 * 14-auth.session.js
 * Client-Side Session Lifecycle Manager – Billionaire Tech Adaptive Life OS
 *
 * Manages creation, refresh, validation, expiration, and destruction of authentication sessions.
 * Fully offline-capable (GitHub Pages) — relies on local crypto + storage integrity.
 *
 * Session model:
 * - Secure random token (via auth.crypto)
 * - Timestamped creation & last activity
 * - Fixed 24-hour max duration + inactivity timeout (30 min)
 * - Stored encrypted or signed (placeholder for auth.crypto)
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const SESSION_KEY = 'system:session';

  const SESSION_CONFIG = {
    maxDurationMs: 24 * 60 * 60 * 1000,     // 24 hours absolute expiry
    inactivityTimeoutMs: 30 * 60 * 1000,    // 30 minutes of inactivity → logout
    tokenLengthBytes: 32                    // 256-bit secure token
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let lastActivityTimestamp = Date.now();
  let inactivityTimer = null;

  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);

    inactivityTimer = setTimeout(() => {
      AuthSession.destroySession('inactivity_timeout');
    }, SESSION_CONFIG.inactivityTimeoutMs);
  }

  function generateSessionId() {
    // Simple fallback – real implementation uses auth.crypto
    return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function getCurrentSession() {
    const raw = Storage.read(SESSION_KEY);
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  }

  function isSessionExpired(session) {
    if (!session) return true;
    const now = Date.now();
    return (
      now - session.loginTimestamp > SESSION_CONFIG.maxDurationMs ||
      now - session.lastActivityTimestamp > SESSION_CONFIG.inactivityTimeoutMs
    );
  }

  function storeSession(session) {
    Storage.write(SESSION_KEY, session);
    EventBus.emit('SESSION_STORED', { sessionId: session.sessionId });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC SESSION API
  // ─────────────────────────────────────────────────────────────────────────────

  const AuthSession = {

    init() {
      // Restore last activity timestamp if session exists
      const session = getCurrentSession();
      if (session && !isSessionExpired(session)) {
        lastActivityTimestamp = session.lastActivityTimestamp || Date.now();
        resetInactivityTimer();
        EventBus.emit('SESSION_RESTORED', { sessionId: session.sessionId });
      }

      // Listen for user activity across the app
      ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, () => {
          if (AuthSession.isSessionActive()) {
            AuthSession.updateActivity();
          }
        }, { passive: true });
      });

      // Periodic expiry check (every 60 seconds)
      setInterval(() => {
        const sess = getCurrentSession();
        if (sess && isSessionExpired(sess)) {
          AuthSession.destroySession('periodic_expiry_check');
        }
      }, 60_000);

      console.log('[AuthSession] Initialized – inactivity timeout:', SESSION_CONFIG.inactivityTimeoutMs / 60000, 'min');
    },

    // ─── Create new session after successful login ─────────────────────────────
    createSession(userId, credentials = {}) {
      if (!userId) throw new Error('User ID required for session creation');

      // Verify user exists and is active
      const user = Storage.read(`user:${userId}:profile`);
      if (!user || user.status !== 'active') {
        throw new Error('Invalid or inactive user');
      }

      // Placeholder: verify credentials (password/PIN) via auth.crypto
      // if (!AuthCrypto.verifyCredentials(userId, credentials)) {
      //   throw new Error('Invalid credentials');
      // }

      const now = Date.now();
      const session = {
        sessionId: generateSessionId(),
        userId,
        // token: AuthCrypto.generateSecureToken(SESSION_CONFIG.tokenLengthBytes),
        token: 'placeholder-secure-token-' + Math.random().toString(36).slice(2), // temp
        loginTimestamp: now,
        lastActivityTimestamp: now,
        expiryTimestamp: now + SESSION_CONFIG.maxDurationMs,
        ip: 'offline', // placeholder – could use fingerprint later
        device: navigator.userAgent.slice(0, 100)
      };

      storeSession(session);
      lastActivityTimestamp = now;
      resetInactivityTimer();

      State.update('user', {
        id: userId,
        ...user,
        authenticated: true,
        lastLogin: now
      });

      EventBus.emit('SESSION_CREATED', {
        userId,
        sessionId: session.sessionId,
        timestamp: now
      });

      console.log('[AuthSession] Session created for user:', userId);
      return session;
    },

    // ─── Refresh activity timestamp (extends inactivity window) ───────────────
    updateActivity() {
      const session = getCurrentSession();
      if (!session || isSessionExpired(session)) return;

      const now = Date.now();
      if (now - lastActivityTimestamp < 5000) return; // throttle updates

      session.lastActivityTimestamp = now;
      storeSession(session);

      lastActivityTimestamp = now;
      resetInactivityTimer();

      EventBus.emit('SESSION_ACTIVITY_DETECTED', { timestamp: now });
    },

    // ─── Manual or forced session refresh (extends absolute expiry if allowed) ─
    refreshSession() {
      const session = getCurrentSession();
      if (!session || isSessionExpired(session)) return false;

      const now = Date.now();
      session.lastActivityTimestamp = now;
      // Optional: extend expiry if policy allows (here we keep fixed 24h from login)
      // session.expiryTimestamp = Math.min(now + SESSION_CONFIG.maxDurationMs, originalExpiry);

      storeSession(session);
      resetInactivityTimer();

      EventBus.emit('SESSION_REFRESHED', { sessionId: session.sessionId });
      return true;
    },

    // ─── Validate current session (called by AuthGuard) ────────────────────────
    validateSession() {
      const session = getCurrentSession();
      if (!session) {
        EventBus.emit('SESSION_VALIDATED', { valid: false, reason: 'no_session' });
        return false;
      }

      if (isSessionExpired(session)) {
        EventBus.emit('SESSION_VALIDATED', { valid: false, reason: 'expired' });
        this.destroySession('validation_expired');
        return false;
      }

      const user = Storage.read(`user:${session.userId}:profile`);
      if (!user || user.status !== 'active') {
        EventBus.emit('SESSION_VALIDATED', { valid: false, reason: 'invalid_user' });
        this.destroySession('invalid_user');
        return false;
      }

      // Placeholder: token integrity check
      // if (!AuthCrypto.validateSessionToken(session.token, session.userId)) {
      //   this.destroySession('token_tampered');
      //   return false;
      // }

      EventBus.emit('SESSION_VALIDATED', { valid: true, sessionId: session.sessionId });
      return true;
    },

    // ─── Destroy session (logout) ─────────────────────────────────────────────
    destroySession(reason = 'manual') {
      const session = getCurrentSession();
      if (session) {
        // Optional: log session end
        EventBus.emit('SESSION_DESTROYED', {
          sessionId: session.sessionId,
          userId: session.userId,
          reason,
          duration: Date.now() - session.loginTimestamp
        });
      }

      Storage.remove(SESSION_KEY);
      State.update('user', null);

      if (inactivityTimer) clearTimeout(inactivityTimer);

      EventBus.emit('SESSION_EXPIRED', { reason });
      console.log('[AuthSession] Session destroyed:', reason);
    },

    // ─── Query methods ────────────────────────────────────────────────────────
    isSessionActive() {
      const session = getCurrentSession();
      return !!session && !isSessionExpired(session);
    },

    getSessionInfo() {
      const session = getCurrentSession();
      if (!session) return null;

      return {
        sessionId: session.sessionId,
        userId: session.userId,
        ageMs: Date.now() - session.loginTimestamp,
        expiresInMs: session.expiryTimestamp - Date.now(),
        lastActivityMs: Date.now() - session.lastActivityTimestamp,
        expired: isSessionExpired(session)
      };
    },

    getCurrentUserId() {
      const session = getCurrentSession();
      return session?.userId || null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.AuthSession = AuthSession;

  // Auto-init after core dependencies
  function tryInit() {
    if (window.Storage && window.State && window.EventBus) {
      AuthSession.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers (remove/gate in production)
  window.__debugSession = {
    create: (userId) => AuthSession.createSession(userId),
    info: () => AuthSession.getSessionInfo(),
    refresh: () => AuthSession.refreshSession(),
    destroy: (reason) => AuthSession.destroySession(reason),
    active: () => AuthSession.isSessionActive()
  };

})();