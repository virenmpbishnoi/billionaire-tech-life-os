/*
 * 38-alerts.ui.js
 * System Alerts & Notification Controller – Billionaire Tech Adaptive Life OS
 *
 * Manages all transient and persistent alert displays across the interface:
 *   - Top banner alerts (risk, burnout, critical system)
 *   - Toast notifications (badge unlocks, rank promotions, quick feedback)
 *   - Persistent warning panels (lockdown mode, high risk)
 *   - Alert queue with priority & auto-dismiss
 *
 * Reacts to intelligence engine events (risk, burnout, badges, ranks).
 * No business logic — only rendering & lifecycle management.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const ALERT_TYPES = {
    RISK_WARNING:    'risk-warning',
    RISK_CRITICAL:   'risk-critical',
    BURNOUT_WARNING: 'burnout-warning',
    BURNOUT_CRITICAL:'burnout-critical',
    BADGE_UNLOCK:    'badge-unlock',
    RANK_PROMOTION:  'rank-promotion',
    LOCKDOWN:        'lockdown',
    SUCCESS:         'success',
    INFO:            'info',
    ERROR:           'error'
  };

  const ALERT_PRIORITY = {
    CRITICAL: 100,
    HIGH:     80,
    MEDIUM:   50,
    LOW:      20
  };

  const TOAST_DURATION = 5000;      // ms
  const BANNER_DURATION = 8000;     // ms for non-critical
  const MAX_QUEUE_LENGTH = 5;
  const MAX_ACTIVE_TOASTS = 3;

  const CONTAINERS = {
    banner:  '#alert-banner',
    toasts:  '#alert-toast-container',
    panel:   '#alert-warning-panel'
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let alertQueue = [];              // pending alerts {id, type, message, priority, timeout}
  let activeToasts = new Set();     // currently visible toast IDs
  let bannerTimeout = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getBannerContainer() {
    return document.querySelector(CONTAINERS.banner);
  }

  function getToastContainer() {
    return document.querySelector(CONTAINERS.toasts);
  }

  function getPersistentPanel() {
    return document.querySelector(CONTAINERS.panel);
  }

  function createAlertElement(type, message) {
    const el = document.createElement('div');
    el.className = `alert alert-${type}`;
    el.innerHTML = `
      <div class="alert-icon"></div>
      <div class="alert-message">${message}</div>
      <button class="alert-dismiss">×</button>
    `;

    el.querySelector('.alert-dismiss').addEventListener('click', () => {
      dismissAlert(el.dataset.alertId);
    });

    return el;
  }

  function dismissAlert(alertId) {
    const alert = document.querySelector(`[data-alert-id="${alertId}"]`);
    if (alert) {
      alert.classList.add('alert-dismissed');
      setTimeout(() => alert.remove(), 300);

      // Remove from queue if still there
      alertQueue = alertQueue.filter(a => a.id !== alertId);
      activeToasts.delete(alertId);

      EventBus.emit('ALERT_DISMISSED', { alertId });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ALERT RENDERING LOGIC
  // ─────────────────────────────────────────────────────────────────────────────

  function showBannerAlert(type, message, duration = BANNER_DURATION) {
    const container = getBannerContainer();
    if (!container) return;

    // Clear existing banner
    if (bannerTimeout) clearTimeout(bannerTimeout);
    container.innerHTML = '';

    const banner = createAlertElement(type, message);
    banner.dataset.alertId = 'banner-' + Date.now();
    banner.classList.add('banner-alert');

    container.appendChild(banner);
    container.style.display = 'block';

    bannerTimeout = setTimeout(() => {
      banner.classList.add('alert-dismissed');
      setTimeout(() => {
        container.innerHTML = '';
        container.style.display = 'none';
      }, 300);
    }, duration);

    EventBus.emit('ALERT_DISPLAYED', { type, message, location: 'banner' });
  }

  function showToastAlert(type, message) {
    if (activeToasts.size >= MAX_ACTIVE_TOASTS) {
      // Queue or drop oldest
      return;
    }

    const container = getToastContainer();
    if (!container) return;

    const toast = createAlertElement(type, message);
    const id = 'toast-' + Date.now();
    toast.dataset.alertId = id;
    toast.classList.add('toast-alert');

    container.appendChild(toast);
    activeToasts.add(id);

    setTimeout(() => {
      toast.classList.add('toast-dismiss');
      setTimeout(() => {
        toast.remove();
        activeToasts.delete(id);
      }, 300);
    }, TOAST_DURATION);

    EventBus.emit('ALERT_DISPLAYED', { type, message, location: 'toast', id });
  }

  function showPersistentAlert(type, message) {
    const panel = getPersistentPanel();
    if (!panel) return;

    // Persistent alerts replace previous ones of same type
    const existing = panel.querySelector(`[data-alert-type="${type}"]`);
    if (existing) existing.remove();

    const alert = createAlertElement(type, message);
    alert.dataset.alertType = type;
    alert.classList.add('persistent-alert');

    panel.appendChild(alert);
    panel.style.display = 'block';

    EventBus.emit('ALERT_DISPLAYED', { type, message, location: 'persistent' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  function handleRiskWarning({ severity, riskIndex }) {
    const message = `Risk Level: ${severity} (${riskIndex}) – Review your system state.`;
    if (severity === 'CRITICAL') {
      showPersistentAlert(ALERT_TYPES.RISK_CRITICAL, message);
    } else if (severity === 'HIGH') {
      showBannerAlert(ALERT_TYPES.RISK_WARNING, message);
    } else {
      showToastAlert(ALERT_TYPES.RISK_WARNING, message);
    }
  }

  function handleBurnoutWarning({ severity, burnoutIndex }) {
    const message = `Burnout Alert: ${severity} (${burnoutIndex}) – Consider recovery actions.`;
    if (severity === 'CRITICAL') {
      showPersistentAlert(ALERT_TYPES.BURNOUT_CRITICAL, message);
    } else if (severity === 'HIGH') {
      showBannerAlert(ALERT_TYPES.BURNOUT_WARNING, message);
    } else {
      showToastAlert(ALERT_TYPES.BURNOUT_WARNING, message);
    }
  }

  function handleBadgeUnlocked({ badgeId, name, tier }) {
    const message = `Achievement Unlocked: ${name} (Tier ${tier})`;
    showToastAlert(ALERT_TYPES.BADGE_UNLOCK, message);
  }

  function handleRankPromoted({ newRank }) {
    const message = `Rank Up! You are now ${newRank}`;
    showBannerAlert(ALERT_TYPES.RANK_PROMOTION, message, 10000);
  }

  function handleLockdownActivated() {
    showPersistentAlert(ALERT_TYPES.LOCKDOWN, 'Lockdown Mode Activated – Focus Only');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC ALERTS UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const AlertsUI = {

    init() {
      // Subscribe to critical alert events
      EventBus.on('RISK_WARNING_DETECTED', handleRiskWarning);
      EventBus.on('RISK_CRITICAL_DETECTED', handleRiskWarning);
      EventBus.on('BURNOUT_WARNING_DETECTED', handleBurnoutWarning);
      EventBus.on('BURNOUT_CRITICAL_DETECTED', handleBurnoutWarning);
      EventBus.on('BADGE_UNLOCKED', handleBadgeUnlocked);
      EventBus.on('RANK_PROMOTED', handleRankPromoted);
      EventBus.on('THEME_LOCKDOWN_ACTIVATED', ({ active }) => {
        if (active) handleLockdownActivated();
      });

      console.log('[AlertsUI] Initialized – system alerts & notifications ready');
    },

    // ─── Manual alert creation (for testing or other modules) ─────────────────
    createAlert(type, message, options = {}) {
      const { priority = 'MEDIUM', duration = TOAST_DURATION, persistent = false } = options;

      if (persistent) {
        showPersistentAlert(type, message);
      } else if (priority === 'CRITICAL' || priority === 'HIGH') {
        showBannerAlert(type, message, duration * 1.5);
      } else {
        showToastAlert(type, message);
      }

      EventBus.emit('ALERT_DISPLAYED', { type, message, priority });
    },

    // ─── Clear all active alerts ──────────────────────────────────────────────
    clearAll() {
      const banner = document.querySelector(CONTAINERS.banner);
      if (banner) banner.innerHTML = '';

      const toasts = document.querySelector(CONTAINERS.toasts);
      if (toasts) toasts.innerHTML = '';

      const panel = document.querySelector(CONTAINERS.panel);
      if (panel) panel.innerHTML = '';

      alertQueue = [];
      activeToasts.clear();

      EventBus.emit('ALERT_QUEUE_UPDATED', { queueLength: 0 });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.AlertsUI = AlertsUI;

  // Auto-init after header (notifications appear there)
  function tryInit() {
    if (window.HeaderUI && window.State && window.EventBus) {
      AlertsUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugAlerts = {
    show: (type, msg) => AlertsUI.createAlert(type, msg),
    clear: () => AlertsUI.clearAll(),
    toast: (msg) => AlertsUI.createAlert('info', msg, { priority: 'LOW' })
  };

})();