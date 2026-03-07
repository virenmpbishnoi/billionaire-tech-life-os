/*
 * 36-sidebar.ui.js
 * Sidebar Navigation Controller – Billionaire Tech Adaptive Life OS
 *
 * Controls the persistent left sidebar:
 *   - Renders navigation menu items
 *   - Highlights active route
 *   - Handles collapse/expand toggle
 *   - Displays quick rank summary
 *   - Shows risk alert indicator
 *   - Tracks navigation analytics
 *
 * Reacts to ROUTE_CHANGED, THEME_UPDATED, RISK_UPDATED.
 * Emits navigation requests to Router.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM REFERENCES & SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  const SIDEBAR_ID = 'sidebar';
  const MENU_CONTAINER_CLASS = 'sidebar-menu';
  const COLLAPSE_BTN_CLASS = 'sidebar-collapse-toggle';
  const RANK_PANEL_CLASS = 'sidebar-rank-panel';
  const RISK_INDICATOR_CLASS = 'sidebar-risk-indicator';

  let sidebarElement = null;
  let isCollapsed = false;
  let activeMenuItem = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // NAVIGATION MENU CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  const MENU_ITEMS = [
    { route: '/dashboard',  label: 'Dashboard',  icon: 'home',        show: true },
    { route: '/tasks',      label: 'Tasks',      icon: 'check-square', show: true },
    { route: '/habits',     label: 'Habits',     icon: 'repeat',       show: true },
    { route: '/missions',   label: 'Missions',   icon: 'target',       show: true },
    { route: '/health',     label: 'Health',     icon: 'heart-pulse',  show: true },
    { route: '/finance',    label: 'Finance',    icon: 'dollar-sign',  show: true },
    { route: '/targets',    label: 'Targets',    icon: 'bullseye',     show: true },
    { route: '/analytics',  label: 'Analytics',  icon: 'bar-chart-2',  show: true },
    { route: '/badges',     label: 'Badges',     icon: 'award',        show: true },
    { route: '/settings',   label: 'Settings',   icon: 'settings',     show: true }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getSidebar() {
    if (!sidebarElement) {
      sidebarElement = document.getElementById(SIDEBAR_ID);
      if (!sidebarElement) {
        console.error('[SidebarUI] Sidebar container not found: #sidebar');
      }
    }
    return sidebarElement;
  }

  function renderMenuItems() {
    const sidebar = getSidebar();
    if (!sidebar) return;

    const menuContainer = sidebar.querySelector(`.${MENU_CONTAINER_CLASS}`);
    if (!menuContainer) {
      console.warn('[SidebarUI] Menu container not found');
      return;
    }

    // Clear existing items
    menuContainer.innerHTML = '';

    MENU_ITEMS.forEach(item => {
      if (!item.show) return;

      const li = document.createElement('li');
      li.className = 'sidebar-item';
      li.dataset.route = item.route;

      li.innerHTML = `
        <a href="${item.route}" class="sidebar-link">
          <i class="icon-${item.icon}"></i>
          <span class="sidebar-label">${item.label}</span>
        </a>
      `;

      li.addEventListener('click', (e) => {
        e.preventDefault();
        Router.navigate(item.route);
        EventBus.emit('SIDEBAR_NAVIGATE', { route: item.route });
      });

      menuContainer.appendChild(li);
    });
  }

  function updateActiveItem() {
    const current = Router.getCurrentRoute();
    if (!current?.path) return;

    const sidebar = getSidebar();
    if (!sidebar) return;

    // Remove previous active
    const prevActive = sidebar.querySelector('.sidebar-item.active');
    if (prevActive) prevActive.classList.remove('active');

    // Highlight new active
    const item = sidebar.querySelector(`[data-route="${current.path}"]`);
    if (item) {
      item.classList.add('active');
      activeMenuItem = item;
    }
  }

  function toggleSidebar() {
    const sidebar = getSidebar();
    if (!sidebar) return;

    isCollapsed = !isCollapsed;

    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      EventBus.emit('SIDEBAR_COLLAPSED');
    } else {
      sidebar.classList.remove('collapsed');
      EventBus.emit('SIDEBAR_EXPANDED');
    }

    // Persist collapse state
    State.update('ui.sidebarCollapsed', isCollapsed);
  }

  function updateRankPanel() {
    const rank = RankEngine?.getCurrentRank() || {};
    const sidebar = getSidebar();
    if (!sidebar) return;

    const panel = sidebar.querySelector(`.${RANK_PANEL_CLASS}`);
    if (!panel) return;

    panel.innerHTML = `
      <div class="rank-icon" style="color: var(${rank.color || '--bt-color-text-primary'})">
        <i class="icon-${rank.icon || 'star'}"></i>
      </div>
      <div class="rank-name">${rank.name || 'Beginner'}</div>
      <div class="rank-progress">
        <div class="progress-bar" style="width: ${rank.progressToNext || 0}%"></div>
      </div>
      ${rank.nextRank ? `<div class="next-rank">Next: ${rank.nextRank}</div>` : ''}
    `;
  }

  function updateRiskIndicator() {
    const risk = RiskEngine?.getRiskMetrics() || {};
    const sidebar = getSidebar();
    if (!sidebar) return;

    const indicator = sidebar.querySelector(`.${RISK_INDICATOR_CLASS}`);
    if (!indicator) return;

    if (risk.riskIndex >= 60) {
      indicator.style.display = 'block';
      indicator.className = `sidebar-risk-indicator risk-${risk.severity.toLowerCase()}`;
      indicator.innerHTML = `<i class="icon-alert-triangle"></i>`;
      indicator.title = `Risk Level: ${risk.severity} (${risk.riskIndex})`;
    } else {
      indicator.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    EventBus.on('ROUTE_CHANGED', updateActiveItem);
    EventBus.on('THEME_UPDATED', () => {
      // Sidebar theme adjustments (if needed)
      const theme = ThemeEngine?.getActiveTheme?.();
      if (theme?.rankAccent) {
        document.documentElement.style.setProperty('--sidebar-accent', `var(${theme.rankAccent})`);
      }
    });

    EventBus.on('RISK_UPDATED', updateRiskIndicator);
    EventBus.on('RISK_WARNING_DETECTED', updateRiskIndicator);
    EventBus.on('RISK_CRITICAL_DETECTED', updateRiskIndicator);

    EventBus.on('RANK_UPDATED', updateRankPanel);
    EventBus.on('RANK_PROMOTED', updateRankPanel);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC SIDEBAR UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const SidebarUI = {

    init() {
      const sidebar = getSidebar();
      if (!sidebar) return;

      // Render menu
      renderMenuItems();

      // Collapse toggle
      const toggleBtn = sidebar.querySelector(`.${COLLAPSE_BTN_CLASS}`);
      if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSidebar);
      }

      // Load persisted collapse state
      const collapsed = State.getPath('ui.sidebarCollapsed');
      if (collapsed) {
        isCollapsed = true;
        sidebar.classList.add('collapsed');
      }

      // Initial active route highlight
      updateActiveItem();
      updateRankPanel();
      updateRiskIndicator();

      // Subscribe to events
      subscribeToEvents();

      EventBus.emit('SIDEBAR_INITIALIZED');
      console.log('[SidebarUI] Initialized – navigation control ready');
    },

    toggle() {
      toggleSidebar();
    },

    collapse() {
      if (!isCollapsed) toggleSidebar();
    },

    expand() {
      if (isCollapsed) toggleSidebar();
    },

    getState() {
      return {
        isCollapsed,
        activeRoute: Router.getCurrentRoute()?.path,
        rank: RankEngine?.getCurrentRank?.()?.name
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.SidebarUI = SidebarUI;

  // Auto-init after dashboard (sidebar usually rendered with dashboard view)
  function tryInit() {
    if (window.DashboardUI && window.Router && window.State && window.EventBus) {
      SidebarUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugSidebar = {
    toggle: () => SidebarUI.toggle(),
    state: () => SidebarUI.getState(),
    updateRank: () => updateRankPanel(),
    updateRisk: () => updateRiskIndicator()
  };

})();