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

  const EXECUTION_PANEL_ID = 'execution-panel';
  const DEFAULT_VIEW = 'dashboard';
  const TRANSITION_CLASS = 'view-transition';
  const TRANSITION_DURATION = 300;

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

  let activeView = null;
  let previousView = null;
  let viewHistory = [];
  let isTransitioning = false;

  function getPanel() {
    return document.getElementById(EXECUTION_PANEL_ID);
  }

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

  const ViewManager = {

    init() {

      EventBus.on('ROUTE_CHANGED', ({ path, id }) => {
        const viewId = id || path.replace('/', '') || DEFAULT_VIEW;
        this.loadAndMountView(viewId);
      });

     EventBus.on('AUTH_LOGOUT_TRIGGERED', () => {
       this.loadAndMountView('login');
     });

      const initialRoute = Router.getCurrentRoute();
      if (initialRoute) {
        this.loadAndMountView(initialRoute.id || DEFAULT_VIEW);
      }

      console.log('[ViewManager] Initialized – managing view lifecycle & transitions');
    },

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

        if (activeView) {
          this.destroyCurrentView();
        }

        /* ❗ FIXED LINE */
        const template = await ComponentLoader.loadComponent(viewId);

        if (!template) {
          throw new Error(`Failed to load template for view: ${viewId}`);
        }

        const viewContainer = document.createElement('div');
        viewContainer.id = `view-${viewId}`;
        viewContainer.className = 'view-container';
        viewContainer.appendChild(template);

        clearPanel();
        const panel = getPanel();

        if (!panel) {
          console.error('[ViewManager] Panel missing');
          return;
        }

        panel.appendChild(viewContainer);

        const config = getViewConfig(viewId);
        applyTransition(viewContainer, config?.transition || 'fade-in');

        previousView = activeView;
        activeView = {
          id: viewId,
          element: viewContainer,
          config
        };

        recordNavigation(viewId, previousView?.id);

        emitViewEvent('VIEW_LOADED', { viewId });
        emitViewEvent('VIEW_RENDERED', { viewId });

        EventBus?.emit('VIEW_ACTIVATED', { viewId, title: config?.title });

      } catch (err) {

        console.error('[ViewManager] View load failed:', viewId, err);
        EventBus?.emit('VIEW_ERROR', { viewId, error: err.message });

        if (viewId !== DEFAULT_VIEW) {
          this.loadAndMountView(DEFAULT_VIEW);
        }

      } finally {
        isTransitioning = false;
      }
    },

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

    getActiveView() {
      return activeView ? { ...activeView } : null;
    },

    getViewHistory() {
      return [...viewHistory];
    },

    reloadCurrentView() {
      if (activeView?.id) {
        this.loadAndMountView(activeView.id);
      }
    }
  };

  window.ViewManager = ViewManager;

  function tryInit() {
    if (window.Router && window.State && window.EventBus) {
      ViewManager.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  window.__debugViews = {
    load: (viewId) => ViewManager.loadAndMountView(viewId),
    current: () => ViewManager.getActiveView(),
    history: () => ViewManager.getViewHistory(),
    reload: () => ViewManager.reloadCurrentView()
  };

})();
