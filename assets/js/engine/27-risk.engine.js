/*
 * 27-risk.engine.js
 * Risk Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Continuously monitors instability signals across all life domains to detect emerging risks early.
 * Produces a composite Risk Index (0–100) and categorized risk signals.
 *
 * Risk domains monitored:
 *   - Productivity decline
 *   - Discipline degradation
 *   - Financial instability
 *   - Health deterioration
 *   - Behavioral inconsistency / goal stagnation
 *
 * Drives alerts, notifications, corrective recommendations, and dashboard warnings.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────────

  const RISK_RANGES = {
    min: 0,
    max: 100,
    low: 25,
    medium: 50,
    high: 75,
    critical: 90
  };

  const SEVERITY_LEVELS = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  };

  // Core domain risk weights for composite Risk Index (total = 1.0)
  const RISK_WEIGHTS = {
    productivity: 0.25,
    discipline:   0.25,
    financial:    0.20,
    health:       0.15,
    behavioral:   0.15
  };

  // Decline detection thresholds (% drop in 7 days)
  const DECLINE_THRESHOLD = {
    significant: 10,
    severe: 20
  };

  const RISK_HISTORY_LIMIT = 90;          // Keep last 90 days
  const RISK_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h between same-type alerts

  let lastAlertTimestamps = {};           // {riskType: timestamp}

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function clampRisk(value) {
    return Math.max(RISK_RANGES.min, Math.min(RISK_RANGES.max, Math.round(value)));
  }

  function getSeverity(index) {
    if (index <= RISK_RANGES.low)      return SEVERITY_LEVELS.LOW;
    if (index <= RISK_RANGES.medium)   return SEVERITY_LEVELS.MEDIUM;
    if (index <= RISK_RANGES.high)     return SEVERITY_LEVELS.HIGH;
    return SEVERITY_LEVELS.CRITICAL;
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    Object.keys(cleaned).sort().reverse().slice(RISK_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    if (!cleaned[today]) {
      cleaned[today] = { riskIndex: 0, timestamp: Date.now() };
    }

    return cleaned;
  }

  function shouldAlert(riskType) {
    const last = lastAlertTimestamps[riskType] || 0;
    return Date.now() - last > RISK_ALERT_COOLDOWN_MS;
  }

  function recordAlert(riskType) {
    lastAlertTimestamps[riskType] = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RISK DOMAIN ANALYZERS
  // ─────────────────────────────────────────────────────────────────────────────

  function detectProductivityRisk() {
    const score = State.getPath('score.productivityScore') || 50;
    const trend = ScoreEngine?.calculateScoreTrend?.(7)?.change || 0;

    // Recent sharp drop or sustained low performance
    const dropPenalty = trend <= -15 ? 40 : trend <= -8 ? 25 : 0;
    const lowBase = score < 40 ? 50 : score < 60 ? 30 : 0;

    return clampRisk(dropPenalty + lowBase);
  }

  function detectDisciplineRisk() {
    const disc = State.getPath('discipline.disciplineIndex') || 50;
    const change = State.getPath('discipline.change') || 0;

    const dropPenalty = change <= -DECLINE_THRESHOLD.severe ? 50 :
                       change <= -DECLINE_THRESHOLD.significant ? 30 : 0;

    const lowBase = disc < 40 ? 45 : disc < 60 ? 25 : 0;

    return clampRisk(dropPenalty + lowBase);
  }

  function detectFinancialRisk() {
    const wealth = State.getPath('wealth') || {};
    const index = wealth.wealthIndex || 50;
    const change = wealth.change || 0;

    const declinePenalty = change <= -DECLINE_THRESHOLD.severe ? 45 :
                          change <= -DECLINE_THRESHOLD.significant ? 25 : 0;

    const lowBase = index < 40 ? 50 : index < 60 ? 30 : 0;

    // Additional signals from finance
    const savingsRate = wealth.savingsRate || 0;
    const savingsPenalty = savingsRate < 10 ? 30 : savingsRate < 20 ? 15 : 0;

    return clampRisk(declinePenalty + lowBase + savingsPenalty);
  }

  function detectHealthRisk() {
    const health = State.getPath('health') || {};
    const dailyScore = health.dailyScore || 0;

    // Low daily score + trend
    const baseRisk = dailyScore < 4 ? 60 : dailyScore < 6 ? 35 : 0;

    // Burnout signal amplification
    const burnout = State.getPath('burnout.burnoutIndex') || 0;
    const burnoutPenalty = burnout > 20 ? 40 : burnout > 10 ? 20 : 0;

    return clampRisk(baseRisk + burnoutPenalty);
  }

  function detectBehavioralRisk() {
    const streaks = StreakEngine?.getStreaks() || [];
    const tasks = TaskEngine?.getTasks() || [];

    // Many broken streaks or high abandonment
    const brokenStreaks = streaks.filter(s => s.currentStreak === 0 && s.longestStreak > 5).length;
    const abandonedTasks = tasks.filter(t => t.status === 'cancelled').length;

    const streakRisk = brokenStreaks * 15;
    const taskRisk = abandonedTasks > 0 ? abandonedTasks * 8 : 0;

    return clampRisk(streakRisk + taskRisk);
  }
  function weightedAverage(values, weights) {
  let sum = 0;
  let weightSum = 0;

  for (const key in values) {
    const value = Number(values[key]) || 0;
    const weight = Number(weights[key]) || 0;

    sum += value * weight;
    weightSum += weight;
  }

  if (weightSum === 0) return 0;
  return sum / weightSum;
}
  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC RISK ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const RiskEngine = {

    async init() {
      // Recalculate on major system events via recalc orchestrator
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateRisk();
      });

      // Also react to specific decline signals
      EventBus.on('DISCIPLINE_DECREASE_DETECTED', () => this.recalculateRisk());
      EventBus.on('WEALTH_DECLINE_DETECTED', () => this.recalculateRisk());

      // Load history on login
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadRiskHistory();
        this.recalculateRisk();
      });

      // Initial run if authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadRiskHistory();
        this.recalculateRisk();
      }

      console.log('[RiskEngine] Initialized – monitoring system instability signals');
    },

    // ─── Load risk history from storage ───────────────────────────────────────
    async loadRiskHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:risk:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeHistory(history);

      State.update('riskHistory', history);
      State.update('risk', history[getTodayKey()] || { riskIndex: 0 });

      EventBus.emit('RISK_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current risk metrics to history ─────────────────────────────────
    async saveRiskHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const current = State.getPath('risk') || {};
      const history = State.getPath('riskHistory') || {};

      history[today] = {
        ...current,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeHistory(history);
      State.update('riskHistory', normalized);

      Storage.write(`user:${user.userId}:risk:history`, normalized);
    },

    // ─── Core risk recalculation – aggregates domain risks ────────────────────
    recalculateRisk() {
      try {
        const prodRisk    = detectProductivityRisk();
        const discRisk    = detectDisciplineRisk();
        const finRisk     = detectFinancialRisk();
        const healthRisk  = detectHealthRisk();
        const behavRisk   = detectBehavioralRisk();

        const riskIndex = clampRisk(
          weightedAverage(
            {
              productivity: prodRisk,
              discipline:   discRisk,
              financial:    finRisk,
              health:       healthRisk,
              behavioral:   behavRisk
            },
            RISK_WEIGHTS
          )
        );

        const previousIndex = State.getPath('risk.riskIndex') || riskIndex;
        const change = riskIndex - previousIndex;

        const severity = getSeverity(riskIndex);

        const metrics = {
          riskIndex,
          productivityRisk: clampRisk(prodRisk),
          disciplineRisk:   clampRisk(discRisk),
          financialRisk:    clampRisk(finRisk),
          healthRisk:       clampRisk(healthRisk),
          behavioralRisk:   clampRisk(behavRisk),
          severity,
          change,
          trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
          updatedAt: Date.now()
        };

        State.update('risk', metrics);
        this.saveRiskHistory();

        EventBus.emit('RISK_UPDATED', metrics);
        EventBus.emit('RISK_INDEX_UPDATED', { index: riskIndex, severity });

        // Alert triggers
        if (riskIndex >= 60 && previousIndex < 60) {
          if (shouldAlert('warning')) {
            EventBus.emit('RISK_WARNING_DETECTED', {
              riskIndex,
              severity,
              components: {
                productivity: prodRisk,
                discipline: discRisk,
                financial: finRisk,
                health: healthRisk,
                behavioral: behavRisk
              }
            });
            recordAlert('warning');
          }
        }

        if (riskIndex >= 80 && previousIndex < 80) {
          if (shouldAlert('critical')) {
            EventBus.emit('RISK_CRITICAL_DETECTED', {
              riskIndex,
              severity,
              components: {
                productivity: prodRisk,
                discipline: discRisk,
                financial: finRisk,
                health: healthRisk,
                behavioral: behavRisk
              }
            });
            recordAlert('critical');
          }
        }

        return metrics;
      } catch (err) {
        console.error('[RiskEngine] Recalculation failed:', err);
        EventBus.emit('RISK_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Get current risk metrics ─────────────────────────────────────────────
    getRiskMetrics() {
      return State.getPath('risk') || {
        riskIndex: 0,
        productivityRisk: 0,
        disciplineRisk: 0,
        financialRisk: 0,
        healthRisk: 0,
        behavioralRisk: 0,
        severity: SEVERITY_LEVELS.LOW,
        updatedAt: Date.now()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.RiskEngine = RiskEngine;

  // Auto-init after wealth engine
  function tryInit() {
    if (window.WealthEngine && window.DisciplineEngine && window.UserEngine && window.State && window.EventBus) {
      RiskEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugRisk = {
    recalculate: () => RiskEngine.recalculateRisk(),
    metrics: () => RiskEngine.getRiskMetrics()
  };

})();
