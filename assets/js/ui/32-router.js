/*
 * 32-router.js
 * Client-Side Navigation Router – Billionaire Tech Adaptive Life OS
 *
 * Single source of truth for in-app navigation in this offline-first (GitHub Pages) SPA-like dashboard.
 * Manages:
 *   - Route definitions & mapping to view components
 *   - Navigation (push/replace/history)
 *   - Route guards (auth, state validation)
 *   - Deep linking support
 *   - Navigation history & analytics
 *   - Fallback & 404 handling
 *
 * Does NOT render UI — delegates to ViewManager.
 * Communicates exclusively via EventBus.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // ROUTE DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const ROUTES = {
    '/dashboard': {
      id: 'dashboard',
      title: 'Dashboard',
      view: 'dashboard',
      requiresAuth: true,
      icon: 'home',
      showInSidebar: true
    },
    '/tasks': {
      id: 'tasks',
      title: 'Tasks',
      view: 'tasks',
      requiresAuth: true,
      icon: 'check-square',
      showInSidebar: true
    },
    '/habits': {
      id: 'habits',
      title: 'Habits',
      view: 'habits',
      requiresAuth: true,
      icon: 'repeat',
      showInSidebar: true
    },
    '/missions': {
      id: 'missions',
      title: 'Missions',
      view: 'missions',
      requiresAuth: true,
      icon: 'target',
      showInSidebar: true
    },
    '/health': {
      id: 'health',
      title: 'Health',
      view: 'health',
      requiresAuth: true,
      icon: 'heart-pulse',
      showInSidebar: true
    },
    '/finance': {
      id: 'finance',
      title: 'Finance',
      view: 'finance',
      requiresAuth: true,
      icon: 'dollar-sign',
      showInSidebar: true
    },
    '/targets': {
      id: 'targets',
      title: 'Targets',
      view: 'targets',
      requiresAuth: true,
      icon: 'bullseye',
      showInSidebar: true
    },
    '/analytics': {
      id: 'analytics',
      title: 'Analytics',
      view: 'analytics',
      requiresAuth: true,
      icon: 'bar-chart-2',
      showInSidebar: true
    },
    '/badges': {
      id: 'badges',
      title: 'Achievements',
      view: 'badges',
      requiresAuth: true,
      icon: 'award',
      showInSidebar: true
    },
    '/settings': {
      id: 'settings',
      title: 'Settings',
      view: 'settings',
      requiresAuth: true,
      icon: 'settings',
      showInSidebar: true
    },
    '/login': {
      id: 'login',
      title: 'Login',
      view: 'login',
      requiresAuth: false,
      public: true
    }
  };

  const DEFAULT_ROUTE = '/dashboard';
  const FALLBACK_ROUTE = '/login';

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let currentRoute = null;
  let previousRoute = null;
  let navigationHistory = [];
  let navigationInProgress = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // ROUTE GUARDS
  // ─────────────────────────────────────────────────────────────────────────────

  function runNavigationGuards(toPath) {
    const route = ROUTES[toPath];
    if (!route) return { allowed: false, reason: 'route_not_found' };

    // Auth guard
    if (route.requiresAuth && !AuthSession?.isSessionActive()) {
      return { allowed: false, reason: 'authentication_required', redirect: '/login' };
    }

    // Additional guards can be added here (e.g. role-based, state checks)

    return { allowed: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NAVIGATION CORE
  // ─────────────────────────────────────────────────────────────────────────────

  function navigate(path, options = {}) {
    if (navigationInProgress) return false;

    path = path.startsWith('/') ? path : '/' + path;
    if (path === currentRoute?.path) return true; // already here

    navigationInProgress = true;

    const guardResult = runNavigationGuards(path);
    if (!guardResult.allowed) {
      if (guardResult.redirect) {
        navigate(guardResult.redirect, { replace: true });
      }
      navigationInProgress = false;
      EventBus.emit('ROUTE_NAVIGATION_FAILED', { path, reason: guardResult.reason });
      return false;
    }

    const route = ROUTES[path];
    const routeData = {
      path,
      id: route?.id || 'unknown',
      title: route?.title || 'Unknown',
      timestamp: Date.now(),
      from: currentRoute?.path
    };

    // Update history
    if (!options.replace) {
      navigationHistory.push(currentRoute?.path || '/');
      if (navigationHistory.length > 50) navigationHistory.shift();
    }

    // Update browser history
    const state = { path };
    if (options.replace) {
      window.history.replaceState(state, route?.title || '', path);
    } else {
      window.history.pushState(state, route?.title || '', path);
    }

    previousRoute = currentRoute;
    currentRoute = routeData;

    // Sync to state
    State.update('route', routeData);

    // Emit events
    EventBus.emit('ROUTE_NAVIGATION_STARTED', routeData);
    EventBus.emit('ROUTE_CHANGED', routeData);

    // Trigger view load (delegated to ViewManager)
    EventBus.emit('VIEW_LOAD_REQUEST', { viewId: route?.view, path });

    navigationInProgress = false;

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC ROUTER API
  // ─────────────────────────────────────────────────────────────────────────────

  const Router = {

    init() {
      // Initial route from URL
      const initialPath = window.location.pathname || '/';
      navigate(initialPath, { replace: true });

      // Handle browser back/forward
      window.addEventListener('popstate', (event) => {
        const path = event.state?.path || window.location.pathname;
        navigate(path, { replace: true });
      });

      // Listen for programmatic navigation requests
      EventBus.on('NAVIGATE_REQUEST', ({ path, replace }) => {
        navigate(path, { replace });
      });

      // Handle 404 / invalid routes
      EventBus.on('ROUTE_NOT_FOUND', () => {
        navigate(DEFAULT_ROUTE, { replace: true });
      });

      // Protect logout / session invalidation
      EventBus.on('AUTH_LOGOUT_TRIGGERED', () => {
        if (currentRoute?.requiresAuth) {
          navigate('/login', { replace: true });
        }
      });

      console.log('[Router] Initialized – client-side navigation active');
    },

    navigate,

    replace(path) {
      return navigate(path, { replace: true });
    },

    back() {
      window.history.back();
    },

    forward() {
      window.history.forward();
    },

    getCurrentRoute() {
      return currentRoute ? { ...currentRoute } : null;
    },

    getPreviousRoute() {
      return previousRoute ? { ...previousRoute } : null;
    },

    getHistory() {
      return [...navigationHistory];
    },

    isProtectedRoute(path) {
      return ROUTES[path]?.requiresAuth === true;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.Router = Router;

  // Auto-init as early as possible (after State & EventBus)
  function tryInit() {
    if (window.State && window.EventBus) {
      Router.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers (remove in production)
  window.__debugRouter = {
    navigate: (path) => Router.navigate(path),
    current: () => Router.getCurrentRoute(),
    history: () => Router.getHistory(),
    back: () => Router.back()
  };

})();