/*
 * 28-burnout.engine.js
 * Burnout Detection Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Continuously monitors fatigue and overload signals to detect emerging burnout risk.
 * Produces a Burnout Index (0–100) and actionable fatigue signals across domains.
 *
 * Monitored signals:
 *   - Sleep fatigue (duration, consistency, debt)
 *   - Workload pressure (task overload, completion pressure)
 *   - Discipline exhaustion (consistency drops, streak breaks)
 *   - Productivity overload (sustained high pressure, recovery deficit)
 *
 * Drives early warnings, recovery suggestions, notifications, and risk amplification.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────────

  const BURNOUT_RANGES = {
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

  // Core fatigue component weights for Burnout Index (total = 1.0)
  const BURNOUT_WEIGHTS = {
    sleepFatigue:        0.30,
    workloadPressure:    0.30,
    disciplineExhaustion:0.20,
    productivityOverload:0.20
  };

  // Sub-weights within each fatigue domain (total = 1.0 per category)
  const SLEEP_FATIGUE_WEIGHTS = {
    durationDeficit:   0.40,
    consistencyLoss:   0.35,
    qualityDecline:    0.25
  };

  const WORKLOAD_PRESSURE_WEIGHTS = {
    taskOverload:      0.45,
    completionPressure:0.30,
    recoveryDeficit:   0.25
  };

  const DISCIPLINE_EXHAUSTION_WEIGHTS = {
    habitDrop:         0.40,
    streakBreaks:      0.35,
    consistencyDecline:0.25
  };

  const PRODUCTIVITY_OVERLOAD_WEIGHTS = {
    sustainedPressure: 0.50,
    recoveryGap:       0.30,
    goalStagnation:    0.20
  };

  const BURNOUT_HISTORY_LIMIT = 90;          // Keep last 90 days
  const DECLINE_THRESHOLD = 15;              // % increase in burnout triggers warning
  const CRITICAL_THRESHOLD = 80;
  const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h cooldown per type

  let lastAlertTimestamps = {};              // {alertType: timestamp}

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function clampBurnout(value) {
    return Math.max(BURNOUT_RANGES.min, Math.min(BURNOUT_RANGES.max, Math.round(value)));
  }

  function getSeverity(index) {
    if (index <= BURNOUT_RANGES.low)      return SEVERITY_LEVELS.LOW;
    if (index <= BURNOUT_RANGES.medium)   return SEVERITY_LEVELS.MEDIUM;
    if (index <= BURNOUT_RANGES.high)     return SEVERITY_LEVELS.HIGH;
    return SEVERITY_LEVELS.CRITICAL;
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    Object.keys(cleaned).sort().reverse().slice(BURNOUT_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    if (!cleaned[today]) {
      cleaned[today] = { burnoutIndex: 0, timestamp: Date.now() };
    }

    return cleaned;
  }

  function shouldAlert(type) {
    const last = lastAlertTimestamps[type] || 0;
    return Date.now() - last > ALERT_COOLDOWN_MS;
  }

  function recordAlert(type) {
    lastAlertTimestamps[type] = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FATIGUE DOMAIN ANALYZERS
  // ─────────────────────────────────────────────────────────────────────────────

  function analyzeSleepFatigue() {
    const health = State.getPath('health') || {};
    const records = health.records || [];

    const today = new Date().toISOString().split('T')[0];
    const recentSleep = records
      .filter(r => r.type === 'sleep' && new Date(r.timestamp).toISOString().split('T')[0] >= today - 7)
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (recentSleep.length === 0) return 0;

    // Duration deficit (ideal 7–9h)
    const avgDuration = recentSleep.reduce((sum, s) => sum + s.durationHours, 0) / recentSleep.length;
    const durationDeficit = Math.max(0, 8 - avgDuration) * 12.5; // max 100 if 0h

    // Consistency loss (variance penalty)
    const durations = recentSleep.map(s => s.durationHours);
    const mean = durations.reduce((sum, v) => sum + v, 0) / durations.length;
    const variance = durations.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / durations.length;
    const consistencyLoss = Math.sqrt(variance) * 15;

    // Quality decline
    const avgQuality = recentSleep.reduce((sum, s) => sum + (s.sleepQuality || 3), 0) / recentSleep.length;
    const qualityDecline = (3 - avgQuality) * 20;

    return weightedAverage(
      { durationDeficit, consistencyLoss, qualityDecline },
      SLEEP_FATIGUE_WEIGHTS
    );
  }

  function analyzeWorkloadPressure() {
    const tasks = TaskEngine?.getTasks() || [];
    const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

    const overload = activeTasks.length > 15 ? 50 : activeTasks.length > 10 ? 30 : 0;

    const completionPressure = tasks.filter(t => t.deadline && t.deadline < Date.now()).length * 8;

    const recoveryDeficit = tasks.filter(t => t.status === 'in_progress').length > 5 ? 30 : 0;

    return clampBurnout(overload + completionPressure + recoveryDeficit);
  }

  function analyzeDisciplineExhaustion() {
    const disc = State.getPath('discipline') || {};
    const index = disc.disciplineIndex || 50;
    const change = disc.change || 0;

    const declinePenalty = change <= -20 ? 60 : change <= -10 ? 35 : 0;
    const lowBase = index < 40 ? 50 : index < 60 ? 25 : 0;

    return clampBurnout(declinePenalty + lowBase);
  }

  function analyzeProductivityOverload() {
    const score = State.getPath('scores.productivityScore') || 50;
    const trend = ScoreEngine?.calculateScoreTrend?.(7)?.change || 0;

    const pressurePenalty = trend >= 15 ? 40 : trend >= 8 ? 25 : 0;
    const lowRecovery = score > 85 && trend < 0 ? 30 : 0;

    return clampBurnout(pressurePenalty + lowRecovery);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC BURNOUT ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const BurnoutEngine = {

    async init() {
      // Recalculate on major fatigue events via recalc orchestrator
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateBurnout();
      });

      // React to specific fatigue signals
      EventBus.on('HEALTH_SLEEP_LOGGED', () => this.recalculateBurnout());
      EventBus.on('HEALTH_WORKOUT_LOGGED', () => this.recalculateBurnout());
      EventBus.on('DISCIPLINE_DECREASE_DETECTED', () => this.recalculateBurnout());

      // Load history on login
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadBurnoutHistory();
        this.recalculateBurnout();
      });

      // Initial run if authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadBurnoutHistory();
        this.recalculateBurnout();
      }

      console.log('[BurnoutEngine] Initialized – monitoring fatigue & overload signals');
    },

    // ─── Load burnout history from storage ────────────────────────────────────
    async loadBurnoutHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:burnout:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeHistory(history);

      State.update('burnoutHistory', history);
      State.update('burnout', history[getTodayKey()] || { burnoutIndex: 0 });

      EventBus.emit('BURNOUT_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current burnout metrics to history ──────────────────────────────
    async saveBurnoutHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const current = State.getPath('burnout') || {};
      const history = State.getPath('burnoutHistory') || {};

      history[today] = {
        ...current,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeHistory(history);
      State.update('burnoutHistory', () => normalized);

      Storage.write(`user:${user.userId}:burnout:history`, normalized);
    },// ─────────────────────
// Utility Functions
// ─────────────────────
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
// ─────────────────────
// Core burnout recalculation
// ─────────────────────
recalculateBurnout() {
  try {
    const sleepFatigue = analyzeSleepFatigue();
        const workloadPressure   = analyzeWorkloadPressure();
        const disciplineExhaustion = analyzeDisciplineExhaustion();
        const productivityOverload = analyzeProductivityOverload();

        const burnoutIndex = clampBurnout(
          weightedAverage(
            {
              sleepFatigue,
              workloadPressure,
              disciplineExhaustion,
              productivityOverload
            },
            BURNOUT_WEIGHTS
          )
        );

        const previousIndex = State.getPath('burnout.burnoutIndex') || burnoutIndex;
        const change = burnoutIndex - previousIndex;

        const severity = getSeverity(burnoutIndex);

        const metrics = {
          burnoutIndex,
          sleepFatigue: clampBurnout(sleepFatigue),
          workloadPressure: clampBurnout(workloadPressure),
          disciplineExhaustion: clampBurnout(disciplineExhaustion),
          productivityOverload: clampBurnout(productivityOverload),
          severity,
          change,
          trend: change > 0 ? 'worsening' : change < 0 ? 'improving' : 'stable',
          fatigueLevel: burnoutIndex > 75 ? 'severe' : burnoutIndex > 50 ? 'moderate' : 'low',
          updatedAt: Date.now()
        };

        State.update('burnout', metrics);
        this.saveBurnoutHistory();

        EventBus.emit('BURNOUT_UPDATED', metrics);
        EventBus.emit('BURNOUT_INDEX_UPDATED', { index: burnoutIndex, severity });

        // Warning & critical triggers
        if (burnoutIndex >= 60 && previousIndex < 60) {
          if (shouldAlert('warning')) {
            EventBus.emit('BURNOUT_WARNING_DETECTED', {
              burnoutIndex,
              severity,
              fatigueLevel: metrics.fatigueLevel,
              components: {
                sleep: sleepFatigue,
                workload: workloadPressure,
                discipline: disciplineExhaustion,
                productivity: productivityOverload
              }
            });
            recordAlert('warning');
          }
        }

        if (burnoutIndex >= 80 && previousIndex < 80) {
          if (shouldAlert('critical')) {
            EventBus.emit('BURNOUT_CRITICAL_DETECTED', {
              burnoutIndex,
              severity,
              fatigueLevel: metrics.fatigueLevel
            });
            recordAlert('critical');
          }
        }

        // Recovery suggestion when risk is high but trending down
        if (burnoutIndex > 60 && change < -5) {
          EventBus.emit('BURNOUT_RECOVERY_SUGGESTED', {
            burnoutIndex,
            improvement: Math.abs(change),
            suggestions: [
              'Consider rest day or lighter schedule',
              'Prioritize sleep consistency',
              'Reduce non-essential tasks'
            ]
          });
        }

        return metrics;
      } catch (err) {
        console.error('[BurnoutEngine] Recalculation failed:', err);
        EventBus.emit('BURNOUT_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Get current burnout metrics ──────────────────────────────────────────
    getBurnoutMetrics() {
      return State.getPath('burnout') || {
        burnoutIndex: 0,
        sleepFatigue: 0,
        workloadPressure: 0,
        disciplineExhaustion: 0,
        productivityOverload: 0,
        severity: SEVERITY_LEVELS.LOW,
        fatigueLevel: 'low',
        updatedAt: Date.now()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.BurnoutEngine = BurnoutEngine;

  // Auto-init after risk engine
  function tryInit() {
    if (window.RiskEngine && window.HealthEngine && window.DisciplineEngine && window.UserEngine && window.State && window.EventBus) {
      BurnoutEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugBurnout = {
    recalculate: () => BurnoutEngine.recalculateBurnout(),
    metrics: () => BurnoutEngine.getBurnoutMetrics()
  };


})();
