/*
 * 37-header.ui.js
 * Header UI Controller – Billionaire Tech Adaptive Life OS
 *
 * Controls the top command bar (#header) across all views:
 *   - Logo & branding
 *   - Global search input
 *   - Notification bell with counter
 *   - Rank quick summary
 *   - Quick action buttons (add task/habit/etc.)
 *   - Profile menu (settings, theme, logout)
 *
 * Remains persistent, updates dynamically via events.
 * No business logic — only UI sync & interaction handling.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM REFERENCES & SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  const HEADER_ID = 'header';
  const SEARCH_INPUT_CLASS = 'header-search-input';
  const NOTIFICATION_BTN_CLASS = 'header-notifications';
  const RANK_SUMMARY_CLASS = 'header-rank-summary';
  const QUICK_ACTIONS_CLASS = 'header-quick-actions';
  const PROFILE_MENU_CLASS = 'header-profile-menu';
  const PROFILE_TOGGLE_CLASS = 'header-profile-toggle';

  let headerElement = null;
  let searchInput = null;
  let notificationBadge = null;
  let profileMenu = null;
  let isProfileOpen = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let notificationCount = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getHeader() {
    if (!headerElement) {
      headerElement = document.getElementById(HEADER_ID);
      if (!headerElement) {
        console.error('[HeaderUI] Header container not found: #header');
      }
    }
    return headerElement;
  }

  function updateNotificationIndicator() {
    if (!notificationBadge) return;

    notificationBadge.textContent = notificationCount > 99 ? '99+' : notificationCount;
    notificationBadge.style.display = notificationCount > 0 ? 'flex' : 'none';
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const query = searchInput?.value?.trim();
    if (!query) return;

    EventBus.emit('HEADER_SEARCH_PERFORMED', { query });
    console.log('[HeaderUI] Search performed:', query);

    // Clear input after search (optional)
    searchInput.value = '';
  }

  function toggleProfileMenu() {
    isProfileOpen = !isProfileOpen;

    if (profileMenu) {
      profileMenu.style.display = isProfileOpen ? 'block' : 'none';
    }

    EventBus.emit('HEADER_PROFILE_OPENED', { open: isProfileOpen });
  }

  function handleQuickAction(action) {
    EventBus.emit('HEADER_ACTION_TRIGGERED', { action });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  function onNotificationPush({ count = 1 }) {
    notificationCount += count;
    updateNotificationIndicator();
  }

  function onBadgeUnlocked() {
    notificationCount++;
    updateNotificationIndicator();
  }

  function onRiskWarning() {
    notificationCount++;
    updateNotificationIndicator();
  }

  function onBurnoutWarning() {
    notificationCount++;
    updateNotificationIndicator();
  }

  function onRankUpdated() {
    const rank = RankEngine?.getCurrentRank?.();
    if (!rank) return;

    const summary = document.querySelector(`.${RANK_SUMMARY_CLASS}`);
    if (summary) {
      summary.innerHTML = `
        <span class="rank-icon" style="color: var(${rank.color})">★</span>
        <span class="rank-name">${rank.name}</span>
        <span class="rank-progress">${rank.progressToNext}% to ${rank.nextRank || 'Max'}</span>
      `;
    }
  }

  function onThemeUpdated() {
    const theme = ThemeEngine?.getActiveTheme?.();
    if (!theme) return;

    // Apply theme-specific header adjustments
    const header = getHeader();
    if (header) {
      header.style.setProperty('--header-accent', `var(${theme.rankAccent || '--bt-color-primary'})`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC HEADER UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const HeaderUI = {

    init() {
      const header = getHeader();
      if (!header) return;

      // Initialize search
      searchInput = header.querySelector(`.${SEARCH_INPUT_CLASS}`);
      if (searchInput) {
        searchInput.addEventListener('submit', handleSearchSubmit);
      }

      // Notification badge
      notificationBadge = header.querySelector(`.${NOTIFICATION_BTN_CLASS} .badge`);
      updateNotificationIndicator();

      // Profile menu toggle
      const profileToggle = header.querySelector(`.${PROFILE_TOGGLE_CLASS}`);
      if (profileToggle) {
        profileToggle.addEventListener('click', toggleProfileMenu);
      }

      profileMenu = header.querySelector(`.${PROFILE_MENU_CLASS}`);

      // Quick actions
      const quickActions = header.querySelectorAll(`.${QUICK_ACTIONS_CLASS} button`);
      quickActions.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          if (action) handleQuickAction(action);
        });
      });

      // Subscribe to events
      EventBus.on('NOTIFICATION_PUSH', onNotificationPush);
      EventBus.on('BADGE_UNLOCKED', onBadgeUnlocked);
      EventBus.on('RISK_WARNING_DETECTED', onRiskWarning);
      EventBus.on('BURNOUT_WARNING_DETECTED', onBurnoutWarning);
      EventBus.on('RANK_UPDATED', onRankUpdated);
      EventBus.on('RANK_PROMOTED', onRankUpdated);
      EventBus.on('THEME_UPDATED', onThemeUpdated);

      // Initial rank display
      onRankUpdated();

      console.log('[HeaderUI] Initialized – top command bar ready');
    },

    // ─── Manually increment notification count ────────────────────────────────
    incrementNotifications(count = 1) {
      notificationCount += count;
      updateNotificationIndicator();
    },

    // ─── Clear notifications ──────────────────────────────────────────────────
    clearNotifications() {
      notificationCount = 0;
      updateNotificationIndicator();
    },

    // ─── Get header state ─────────────────────────────────────────────────────
    getState() {
      return {
        notificationCount,
        searchActive: document.activeElement === searchInput,
        profileOpen: isProfileOpen,
        currentRank: RankEngine?.getCurrentRank?.()?.name
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.HeaderUI = HeaderUI;

  // Auto-init after sidebar & dashboard
  function tryInit() {
    if (window.SidebarUI && window.DashboardUI && window.Router && window.State && window.EventBus) {
      HeaderUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugHeader = {
    notify: (count) => HeaderUI.incrementNotifications(count),
    clearNotify: () => HeaderUI.clearNotifications(),
    state: () => HeaderUI.getState()
  };

})();