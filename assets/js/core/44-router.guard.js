/*
 * 44-router.guard.js
 * Navigation Guard System – Billionaire Tech Adaptive Life OS
 *
 * Intercepts and validates all navigation attempts before they reach the Router.
 * Enforces:
 *   - Authentication requirements
 *   - Route existence
 *   - Permission checks (role-based in future)
 *   - Navigation loop prevention
 *   - Lockdown mode restrictions
 *
 * Acts as the security gatekeeper for the entire routing system.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & RULES
  // ─────────────────────────────────────────────────────────────────────────────

  const PROTECTED_ROUTES = [
    '/dashboard', '/tasks', '/habits', '/missions', '/health',
    '/finance', '/targets', '/analytics', '/badges', '/settings'
  ];

  const PUBLIC_ROUTES = [
    '/login', '/'
  ];

  const LOCKDOWN_ALLOWED_ROUTES = [
    '/dashboard' // minimal access during lockdown
  ];

  const NAVIGATION_HISTORY_LIMIT = 10; // detect loops
  let navigationHistory = [];

  let lastNavigationTime = 0;
  const MIN_NAVIGATION_INTERVAL_MS = 300; // prevent spam/rapid clicks

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function isProtectedRoute(path) {
    return PROTECTED_ROUTES.includes(path);
  }

  function isPublicRoute(path) {
    return PUBLIC_ROUTES.includes(path);
  }

  function isLockdownActive() {
    return State.getPath('system.lockdown') === true;
  }

  function wouldCauseLoop(path) {
    if (navigationHistory.length < 2) return false;

    const recent = navigationHistory.slice(-NAVIGATION_HISTORY_LIMIT);
    let loopCount = 0;

    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i] === path) loopCount++;
      if (loopCount >= 3) return true; // simple loop detection
    }

    return false;
  }

  function recordNavigation(path) {
    navigationHistory.push(path);
    if (navigationHistory.length > NAVIGATION_HISTORY_LIMIT * 2) {
      navigationHistory = navigationHistory.slice(-NAVIGATION_HISTORY_LIMIT);
    }
  }

  function clearNavigationHistory() {
    navigationHistory = [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GUARD VALIDATION PIPELINE
  // ─────────────────────────────────────────────────────────────────────────────

  function validateNavigationRequest(path, source = 'unknown') {
    const now = Date.now();

    // Rate limiting
    if (now - lastNavigationTime < MIN_NAVIGATION_INTERVAL_MS) {
      return { allowed: false, reason: 'rate_limit', redirect: null };
    }

    lastNavigationTime = now;

    // Basic existence check
    if (!Router.ROUTES?.[path] && path !== '/') {
      return { allowed: false, reason: 'route_not_found', redirect: '/dashboard' };
    }

    // Public route → always allow
    if (isPublicRoute(path)) {
      return { allowed: true, reason: 'public_route' };
    }

    // Auth check
    if (!AuthSession?.isSessionActive?.()) {
      return { allowed: false, reason: 'authentication_required', redirect: '/login' };
    }

    // Protected route check
    if (isProtectedRoute(path)) {
      // Lockdown restrictions
      if (isLockdownActive() && !LOCKDOWN_ALLOWED_ROUTES.includes(path)) {
        return { allowed: false, reason: 'lockdown_restriction', redirect: '/dashboard' };
      }

      // Loop detection
      if (wouldCauseLoop(path)) {
        return { allowed: false, reason: 'navigation_loop_detected', redirect: '/dashboard' };
      }

      recordNavigation(path);
      return { allowed: true, reason: 'authorized' };
    }

    // Unknown protected route → fallback
    return { allowed: false, reason: 'unauthorized_route', redirect: '/dashboard' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC ROUTER GUARD API
  // ─────────────────────────────────────────────────────────────────────────────

  const RouterGuard = {

    init() {
      // Intercept all navigation attempts BEFORE Router processes them
      EventBus.on('NAVIGATE_REQUEST', ({ path, replace = false, source }) => {
        const validation = this.validateRoute(path, source);

        if (validation.allowed) {
          EventBus.emit('ROUTE_VALIDATED', { path, source });
          Router.navigate(path, { replace });
        } else {
          EventBus.emit('ROUTE_BLOCKED', {
            path,
            reason: validation.reason,
            redirect: validation.redirect,
            source
          });

          if (validation.redirect) {
            Router.navigate(validation.redirect, { replace: true });
          }

          // Show alert for blocked navigation
          AlertsUI?.createAlert?.('error', `Navigation blocked: ${validation.reason}`, { priority: 'MEDIUM' });
        }
      });

      // Additional guards from auth system
      EventBus.on('AUTH_SESSION_INVALID', () => {
        if (Router.getCurrentRoute()?.requiresAuth) {
          Router.navigate('/login', { replace: true });
        }
      });

      // Clear history on logout
      EventBus.on('AUTH_LOGOUT_TRIGGERED', clearNavigationHistory);

      console.log('[RouterGuard] Initialized – navigation security layer active');
    },

    // ─── Validate a navigation attempt ────────────────────────────────────────
    validateRoute(path, source = 'unknown') {
      try {
        return validateNavigationRequest(path, source);
      } catch (err) {
        console.error('[RouterGuard] Validation error:', err);
        EventBus.emit('ROUTER_GUARD_ERROR', { error: err.message, path, source });
        return { allowed: false, reason: 'guard_error', redirect: '/dashboard' };
      }
    },

    // ─── Register custom guard rule (for future extensibility) ────────────────
    registerRule(ruleName, ruleFunction) {
      // Placeholder for dynamic rules
      console.log('[RouterGuard] Custom rule registered:', ruleName);
      // In future: add to validation pipeline
    },

    // ─── Get guard state ──────────────────────────────────────────────────────
    getGuardState() {
      return {
        navigationHistory: [...navigationHistory],
        lastNavigation: lastNavigationTime,
        isLockdownActive: isLockdownActive()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.RouterGuard = RouterGuard;

  // Auto-init after boot (after Router is ready)
  function tryInit() {
    if (window.Boot?.bootCompleted && window.Router && window.State && window.EventBus) {
      RouterGuard.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  // Wait for boot completion event
  EventBus.on('BOOT_COMPLETE', () => {
    RouterGuard.init();
  });

  // Fallback init
  tryInit();

  // Debug helpers
  window.__debugGuard = {
    validate: (path) => RouterGuard.validateRoute(path),
    state: () => RouterGuard.getGuardState(),
    clearHistory: () => { navigationHistory = []; }
  };

})();