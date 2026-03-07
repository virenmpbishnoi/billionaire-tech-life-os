/*
 * 35-dashboard.ui.js
 * Main Dashboard UI Controller – Billionaire Tech Adaptive Life OS
 *
 * Controls the central command center view (#execution-panel when view=dashboard).
 * Coordinates rendering and real-time updates of:
 *   - Life performance scores
 *   - Rank progress & badges
 *   - Risk & burnout alerts
 *   - Analytics overview widgets
 *   - Thought ticker
 *   - Manifestation reminders
 *   - Daily progress cards
 *
 * Reacts to state changes and engine events via EventBus.
 * No business logic — only UI synchronization & widget orchestration.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM REFERENCES & SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  const PANEL_SELECTOR = '#execution-panel';
  const DASHBOARD_CONTAINER_CLASS = 'dashboard-container';

  // Widget containers (assumed IDs/classes in dashboard.html template)
  const SELECTORS = {
    lifeScore:      '#life-score-value',
    productivity:   '#productivity-score',
    discipline:     '#discipline-score',
    health:         '#health-score',
    wealth:         '#wealth-score',

    rankCurrent:    '#current-rank-name',
    rankProgress:   '#rank-progress-bar',
    nextRank:       '#next-rank-name',

    riskBanner:     '#risk-banner-container',
    burnoutAlert:   '#burnout-alert-container',

    analyticsSection: '#dashboard-analytics',
    thoughtTicker:    '#thought-ticker-container',
    manifestationBox: '#manifestation-reminder',

    progressCards:  '.progress-card-container'
  };

  let dashboardElement = null;
  let isInitialized = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getDashboardContainer() {
    if (!dashboardElement) {
      dashboardElement = document.querySelector(PANEL_SELECTOR);
      if (!dashboardElement) {
        console.error('[DashboardUI] Execution panel not found');
      }
    }
    return dashboardElement;
  }

  function ensureDashboardLoaded() {
    const container = getDashboardContainer();
    if (!container) return false;

    // Check if dashboard content is already rendered
    if (container.querySelector(`.${DASHBOARD_CONTAINER_CLASS}`)) {
      return true;
    }

    // If not, request reload from ViewManager
    EventBus.emit('VIEW_LOAD_REQUEST', { viewId: 'dashboard' });
    return false;
  }

  function updateScorePanels() {
    const scores = ScoreEngine?.getScores() || {};

    const els = {
      life:        document.querySelector(SELECTORS.lifeScore),
      productivity: document.querySelector(SELECTORS.productivity),
      discipline:   document.querySelector(SELECTORS.discipline),
      health:       document.querySelector(SELECTORS.health),
      wealth:       document.querySelector(SELECTORS.wealth)
    };

    if (els.life)        els.life.textContent        = scores.lifeScore        || 0;
    if (els.productivity) els.productivity.textContent = scores.productivityScore || 0;
    if (els.discipline)   els.discipline.textContent   = scores.disciplineScore   || 0;
    if (els.health)       els.health.textContent       = scores.healthScore       || 0;
    if (els.wealth)       els.wealth.textContent       = scores.wealthScore       || 0;
  }

  function updateRankPanel() {
    const rank = RankEngine?.getCurrentRank() || {};
    const els = {
      current:  document.querySelector(SELECTORS.rankCurrent),
      progress: document.querySelector(SELECTORS.rankProgress),
      next:     document.querySelector(SELECTORS.nextRank)
    };

    if (els.current) {
      els.current.textContent = rank.name || 'BEGINNER';
      els.current.style.color = `var(${rank.color || '--bt-color-text-primary'})`;
    }

    if (els.progress) {
      els.progress.style.width = `${rank.progressToNext || 0}%`;
    }

    if (els.next) {
      els.next.textContent = rank.nextRank ? `Next: ${rank.nextRank}` : 'Mastered';
    }
  }

  function updateRiskAndBurnoutAlerts() {
    const risk = RiskEngine?.getRiskMetrics() || {};
    const burnout = BurnoutEngine?.getBurnoutMetrics() || {};

    const riskBanner = document.querySelector(SELECTORS.riskBanner);
    const burnoutAlert = document.querySelector(SELECTORS.burnoutAlert);

    // Risk banner
    if (riskBanner) {
      if (risk.riskIndex >= 60) {
        riskBanner.style.display = 'block';
        riskBanner.className = `risk-banner risk-${risk.severity.toLowerCase()}`;
        riskBanner.innerHTML = `
          <strong>Risk Level: ${risk.severity}</strong><br>
          Current Risk Index: ${risk.riskIndex}
        `;
      } else {
        riskBanner.style.display = 'none';
      }
    }

    // Burnout alert
    if (burnoutAlert) {
      if (burnout.burnoutIndex >= 60) {
        burnoutAlert.style.display = 'block';
        burnoutAlert.className = `burnout-alert burnout-${burnout.severity.toLowerCase()}`;
        burnoutAlert.innerHTML = `
          <strong>Burnout Alert: ${burnout.severity}</strong><br>
          Fatigue Level: ${burnout.fatigueLevel}
        `;
      } else {
        burnoutAlert.style.display = 'none';
      }
    }
  }

  function initializeWidgets() {
    // Charts
    EventBus.emit('CHARTS_INIT_REQUEST', { container: '#dashboard-analytics' });

    // Thought ticker
    EventBus.emit('THOUGHT_TICKER_INIT', { container: SELECTORS.thoughtTicker });

    // Manifestation reminders
    EventBus.emit('MANIFESTATION_INIT', { container: SELECTORS.manifestationBox });

    // Progress cards (tasks, habits, etc.)
    updateProgressCards();
  }

  function updateProgressCards() {
    // Placeholder – real implementation would query engines
    const cardsContainer = document.querySelector(SELECTORS.progressCards);
    if (!cardsContainer) return;

    // Example card update
    const taskStats = TaskEngine?.getTaskStats?.() || {};
    const habitStats = HabitEngine?.calculateHabitStats?.() || {};

    // Update DOM (simplified)
    cardsContainer.innerHTML = `
      <div class="progress-card">
        <h3>Tasks Today</h3>
        <div class="progress-value">${taskStats.completed || 0}/${taskStats.total || 0}</div>
      </div>
      <div class="progress-card">
        <h3>Habits Today</h3>
        <div class="progress-value">${habitStats.completedToday || 0}</div>
      </div>
      <!-- Add more cards -->
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    EventBus.on('SCORE_UPDATED', updateScorePanels);
    EventBus.on('RANK_UPDATED', updateRankPanel);
    EventBus.on('RISK_UPDATED', updateRiskAndBurnoutAlerts);
    EventBus.on('BURNOUT_UPDATED', updateRiskAndBurnoutAlerts);
    EventBus.on('VIEW_RENDERED', ({ view }) => {
      if (view === 'dashboard') {
        initializeWidgets();
        EventBus.emit('DASHBOARD_RENDERED');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC DASHBOARD UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const DashboardUI = {

    init() {
      if (isInitialized) return;
      isInitialized = true;

      // Wait for dashboard view to be rendered by ViewManager
      EventBus.on('VIEW_RENDERED', ({ view }) => {
        if (view === 'dashboard') {
          this.onDashboardRendered();
        }
      });

      // Subscribe to core updates
      subscribeToEvents();

      // Initial check if dashboard is already loaded
      if (document.querySelector(PANEL_SELECTOR)?.querySelector('.dashboard-container')) {
        this.onDashboardRendered();
      }

      console.log('[DashboardUI] Initialized – command center ready');
    },

    onDashboardRendered() {
      // Dashboard is now in DOM – initialize widgets & update all panels
      initializeWidgets();
      updateScorePanels();
      updateRankPanel();
      updateRiskAndBurnoutAlerts();
      updateProgressCards();

      EventBus.emit('DASHBOARD_WIDGETS_INITIALIZED');
    },

    // Force refresh all dashboard panels
    refreshAll() {
      updateScorePanels();
      updateRankPanel();
      updateRiskAndBurnoutAlerts();
      updateProgressCards();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.DashboardUI = DashboardUI;

  // Auto-init after ViewManager
  function tryInit() {
    if (window.ViewManager && window.State && window.EventBus) {
      DashboardUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugDashboard = {
    refresh: () => DashboardUI.refreshAll(),
    initWidgets: () => initializeWidgets()
  };

})();