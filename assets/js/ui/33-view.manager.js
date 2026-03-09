/*
 * 33-view.manager.js
 * View Lifecycle & Rendering Manager – Billionaire Tech Adaptive Life OS
 *
 * Single controller for SPA-style view switching inside the dashboard.
 * Coordinates:
 *   - View mounting/unmounting in #execution-panel
 *   - Lifecycle events (loading → rendered → destroyed)
 *   - Transition animations (via CSS classes)
 *   - Active view tracking
 *   - View history & analytics
 *
 * Does NOT load templates — delegates to ComponentLoader.
 * Does NOT handle routing logic — reacts to Router events.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const EXECUTION_PANEL_ID = 'execution-panel';
  const DEFAULT_VIEW = 'dashboard';
  const TRANSITION_CLASS = 'view-transition';
  const TRANSITION_DURATION = 300; // ms – matches --bt-animation-medium

const VIEW_REGISTRY = {
  dashboard:  { id: 'dashboard', title: 'Dashboard', transition: 'fade-up' },
  tasks:      { id: 'tasks', title: 'Tasks', transition: 'slide-right' },
  habits:     { id: 'habits', title: 'Habits', transition: 'fade-in' },
  missions:   { id: 'missions', title: 'Missions', transition: 'scale-in' },
  health:     { id: 'health', title: 'Health', transition: 'fade-up' },
  finance:    { id: 'finance', title: 'Finance', transition: 'slide-up' },
  targets:    { id: 'targets', title: 'Targets', transition: 'fade-in' },
  analytics:  { id: 'analytics', title: 'Analytics', transition: 'fade-up' },
  badges:     { id: 'badges', title: 'Badges', transition: 'scale-in' },
  settings:   { id: 'settings', title: 'Settings', transition: 'fade-in' },

  login: { id: 'login', title: 'Login', transition: 'fade-in' }
};

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let activeView = null;              // { id, element, config }
  let previousView = null;
  let viewHistory = [];               // array of { viewId, timestamp, from }
  let isTransitioning = false;

  function getPanel() {
  return document.getElementById(EXECUTION_PANEL_ID);
}

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getViewConfig(viewId) {
    return VIEW_REGISTRY[viewId] || null;
  }

function clearPanel() {
  const panel = getPanel();
  if (!panel) return;

  while (panel.firstChild) {
    panel.removeChild(panel.firstChild);
  }
}

  function applyTransition(viewElement, transitionType = 'fade-in') {
    if (!viewElement) return;

    viewElement.classList.add(TRANSITION_CLASS, transitionType);

    // Remove transition class after animation completes
    setTimeout(() => {
  viewElement.classList.remove(TRANSITION_CLASS, transitionType);
}, TRANSITION_DURATION + 50);
  }

  function recordNavigation(viewId, from = null) {
    viewHistory.push({
      viewId,
      from,
      timestamp: Date.now()
    });

    if (viewHistory.length > 50) viewHistory.shift();
  }

  function emitViewEvent(eventName, payload = {}) {
    EventBus?.emit(eventName, {
      view: activeView?.id || 'unknown',
      timestamp: Date.now(),
      ...payload
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC VIEW MANAGER API
  // ─────────────────────────────────────────────────────────────────────────────

  const ViewManager = {

    init() {
      // React to route changes from Router
      EventBus.on('ROUTE_CHANGED', ({ path, id }) => {
        const viewId = id || path.replace('/', '') || DEFAULT_VIEW;
        this.loadAndMountView(viewId);
      });

      // Handle route not found / fallback

      // Handle auth logout → redirect to login view
     EventBus.on('AUTH_LOGOUT_TRIGGERED', () => {
  this.loadAndMountView('login');
});

      // Initial view load (Router already set initial route)
      const initialRoute = Router.getCurrentRoute();
      if (initialRoute) {
        this.loadAndMountView(initialRoute.id || DEFAULT_VIEW);
      }

      console.log('[ViewManager] Initialized – managing view lifecycle & transitions');
    },

    // ─── Load & mount a view by ID ────────────────────────────────────────────
    async loadAndMountView(viewId) {
      if (!viewId || !getViewConfig(viewId)) {
        console.warn('[ViewManager] Invalid view requested:', viewId);
        EventBus?.emit('VIEW_ERROR', { viewId, reason: 'not_found' });
        viewId = DEFAULT_VIEW;
      }

      if (isTransitioning) {
        console.warn('[ViewManager] Transition in progress – delaying view load');
        setTimeout(() => this.loadAndMountView(viewId), 100);
        return;
      }

      isTransitioning = true;
      emitViewEvent('VIEW_LOADING', { viewId });

      try {
        // 1. Destroy current view if exists
        if (activeView) {
          this.destroyCurrentView();
        }

        // 2. Request view template from ComponentLoader
        const template = await ComponentLoader.loadViewTemplate(viewId);

        if (!template) {
          throw new Error(`Failed to load template for view: ${viewId}`);
        }

        // 3. Create container & apply transition
        const viewContainer = document.createElement('div');
        viewContainer.id = `view-${viewId}`;
        viewContainer.className = 'view-container';
        viewContainer.innerHTML = template;

        // 4. Mount into execution panel
        clearPanel();
        const panel = getPanel();
if (!panel) {
  console.error('[ViewManager] Panel missing');
  return;
}

panel.appendChild(viewContainer);

        // 5. Apply entrance transition
        const config = getViewConfig(viewId);
        applyTransition(viewContainer, config?.transition || 'fade-in');

        // 6. Update internal state
        previousView = activeView;
        activeView = {
          id: viewId,
          element: viewContainer,
          config
        };

        recordNavigation(viewId, previousView?.id);

        // 7. Emit success events
        emitViewEvent('VIEW_LOADED', { viewId });
        emitViewEvent('VIEW_RENDERED', { viewId });

        // 8. Notify other systems (sidebar, header, etc.)
        EventBus?.emit('VIEW_ACTIVATED', { viewId, title: config?.title });

      } catch (err) {
        console.error('[ViewManager] View load failed:', viewId, err);
        EventBus?.emit('VIEW_ERROR', { viewId, error: err.message });

        // Fallback to dashboard
        if (viewId !== DEFAULT_VIEW) {
          this.loadAndMountView(DEFAULT_VIEW);
        }
      } finally {
        isTransitioning = false;
      }
    },

    // ─── Destroy current active view ──────────────────────────────────────────
 destroyCurrentView() {
  if (!activeView || !activeView.element) return;

  const container = activeView.element;
  const viewId = activeView.id;

  container.classList.add('view-exit');

  setTimeout(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }

    emitViewEvent('VIEW_DESTROYED', { viewId });

    activeView = null;
  }, TRANSITION_DURATION);
},
    // ─── Get current active view info ─────────────────────────────────────────
    getActiveView() {
      return activeView ? { ...activeView } : null;
    },

    // ─── Get navigation history ───────────────────────────────────────────────
    getViewHistory() {
      return [...viewHistory];
    },

    // ─── Force reload current view ────────────────────────────────────────────
    reloadCurrentView() {
      if (activeView?.id) {
        this.loadAndMountView(activeView.id);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ViewManager = ViewManager;

  // Auto-init after Router
  function tryInit() {
    if (window.Router && window.State && window.EventBus) {
      ViewManager.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugViews = {
    load: (viewId) => ViewManager.loadAndMountView(viewId),
    current: () => ViewManager.getActiveView(),
    history: () => ViewManager.getViewHistory(),
    reload: () => ViewManager.reloadCurrentView()
  };


})();
