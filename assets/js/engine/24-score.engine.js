/*
 * 24-score.engine.js
 * Life Performance Scoring Engine – Billionaire Tech Adaptive Life OS
 *
 * Aggregates cross-domain performance signals into composite scores:
 *   - Overall Life Score (0–100)
 *   - Productivity Score
 *   - Discipline Score
 *   - Health Score
 *   - Wealth Score
 *
 * Drives rank progression, badge unlocks, analytics, and motivation UI.
 * Recalculates on major activity events via Recalculation orchestrator.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & WEIGHTING MODEL
  // ─────────────────────────────────────────────────────────────────────────────

  const SCORE_RANGES = {
    min: 0,
    max: 100,
    excellent: 90,
    good: 75,
    fair: 50,
    poor: 30
  };

  // Domain weightings for Life Score (total = 1.0)
  const LIFE_SCORE_WEIGHTS = {
    productivity: 0.30,
    discipline:   0.25,
    health:       0.20,
    wealth:       0.25
  };

  // Sub-component weights within each domain (total = 1.0 per domain)
  const PRODUCTIVITY_WEIGHTS = {
    taskCompletion: 0.40,
    missionProgress: 0.30,
    targetProgress: 0.30
  };

  const DISCIPLINE_WEIGHTS = {
    habitConsistency: 0.40,
    streakStrength:   0.35,
    taskDiscipline:   0.25
  };

  const HEALTH_WEIGHTS = {
    sleepQuality:     0.35,
    workoutFrequency: 0.30,
    nutritionBalance: 0.20,
    hydration:        0.15
  };

  const WEALTH_WEIGHTS = {
    netWorthGrowth:   0.40,
    savingsRate:      0.30,
    incomeStability:  0.20,
    expenseControl:   0.10
  };

  const SCORE_HISTORY_LIMIT = 90; // Keep last 90 days of daily scores

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function clampScore(value) {
    return Math.max(SCORE_RANGES.min, Math.min(SCORE_RANGES.max, Math.round(value)));
  }

  function weightedAverage(components, weights) {
    let total = 0;
    let weightSum = 0;

    Object.keys(components).forEach(key => {
      const value = components[key];
      const weight = weights[key] || 0;
      if (weight > 0 && typeof value === 'number' && !isNaN(value)) {
        total += value * weight;
        weightSum += weight;
      }
    });

    return weightSum > 0 ? total / weightSum : 0;
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeScoreHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    // Remove entries older than limit
    Object.keys(cleaned).sort().reverse().slice(SCORE_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    // Ensure today's entry exists
    if (!cleaned[today]) {
      cleaned[today] = { lifeScore: 0, timestamp: Date.now() };
    }

    return cleaned;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC SCORE ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const ScoreEngine = {

    async init() {
      // Listen for recalculation triggers
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateScores();
      });

      // Load historical scores on user login
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadScoreHistory();
        this.recalculateScores();
      });

      EventBus.on('SESSION_CREATED', async () => {
        await this.loadScoreHistory();
        this.recalculateScores();
      });

      // Initial calculation if already authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadScoreHistory();
        this.recalculateScores();
      }

      console.log('[ScoreEngine] Initialized – aggregating life performance metrics');
    },

    // ─── Load score history from storage ──────────────────────────────────────
    async loadScoreHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:scores:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeScoreHistory(history);

      State.update('scoreHistory', history);
      State.update('scores', history[getTodayKey()] || { lifeScore: 0 });

      EventBus.emit('SCORE_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current scores to history ───────────────────────────────────────
    async saveScoreHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const currentScores = State.getPath('scores') || {};
      const history = State.getPath('scoreHistory') || {};

      history[today] = {
        ...currentScores,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeScoreHistory(history);
      State.update('scoreHistory', normalized);

      Storage.write(`user:${user.userId}:scores:history`, normalized);
    },

    // ─── Core recalculation – aggregates all domain scores ────────────────────
    recalculateScores() {
      try {
        const productivity = this.calculateProductivityScore();
        const discipline   = this.calculateDisciplineScore();
        const health       = this.calculateHealthScore();
        const wealth       = this.calculateWealthScore();

        const lifeScore = clampScore(
          weightedAverage(
            { productivity, discipline, health, wealth },
            LIFE_SCORE_WEIGHTS
          )
        );

        const scores = {
          lifeScore,
          productivityScore: clampScore(productivity),
          disciplineScore: clampScore(discipline),
          healthScore: clampScore(health),
          wealthScore: clampScore(wealth),
          updatedAt: Date.now()
        };

        State.update('scores', scores);

        // Save to history
        this.saveScoreHistory();

        EventBus.emit('SCORE_UPDATED', scores);

        EventBus.emit('LIFE_SCORE_UPDATED', { score: lifeScore });
        EventBus.emit('PRODUCTIVITY_SCORE_UPDATED', { score: scores.productivityScore });
        EventBus.emit('DISCIPLINE_SCORE_UPDATED', { score: scores.disciplineScore });
        EventBus.emit('HEALTH_SCORE_UPDATED', { score: scores.healthScore });
        EventBus.emit('WEALTH_SCORE_UPDATED', { score: scores.wealthScore });

        return scores;
      } catch (err) {
        console.error('[ScoreEngine] Recalculation failed:', err);
        EventBus.emit('SCORE_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Domain-specific score calculations ───────────────────────────────────

    calculateProductivityScore() {
      const tasks = TaskEngine?.getTasks() || [];
      const missions = MissionEngine?.getMissions() || [];
      const targets = TargetEngine?.getTargets() || [];

      const taskCompletion = tasks.length > 0
        ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100
        : 0;

      const missionProgress = missions.length > 0
        ? missions.reduce((sum, m) => sum + m.progress, 0) / missions.length
        : 0;

      const targetProgress = targets.length > 0
        ? targets.reduce((sum, t) => sum + t.progress, 0) / targets.length
        : 0;

      return weightedAverage(
        {
          taskCompletion,
          missionProgress,
          targetProgress
        },
        PRODUCTIVITY_WEIGHTS
      );
    },

    calculateDisciplineScore() {
      const habits = HabitEngine?.getHabits() || [];
      const streaks = StreakEngine?.getStreaks() || [];
      const tasks = TaskEngine?.getTasks() || [];

      const habitConsistency = habits.length > 0
        ? habits.reduce((sum, h) => sum + h.currentStreak, 0) / habits.length / 30 * 100
        : 0;

      const streakStrength = streaks.length > 0
        ? streaks.reduce((sum, s) => sum + s.currentStreak, 0) / streaks.length / 90 * 100
        : 0;

      const taskDiscipline = tasks.length > 0
        ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100
        : 0;

      return weightedAverage(
        { habitConsistency, streakStrength, taskDiscipline },
        DISCIPLINE_WEIGHTS
      );
    },

    calculateHealthScore() {
      const health = State.getPath('health') || {};
      const metrics = health.dailyScore || 0;
      return clampScore(metrics * 10); // dailyScore 0–10 → 0–100
    },

    calculateWealthScore() {
      const finance = State.getPath('finance') || {};
      const wealthIndex = FinanceEngine?.calculateWealthIndex?.() || 0;
      return clampScore(wealthIndex / 10); // assuming 0–1000 index → 0–100 score
    },

    // ─── Trend analysis (simple moving average over history) ──────────────────
    calculateScoreTrend(days = 7) {
      const history = State.getPath('scoreHistory') || {};
      const dates = Object.keys(history).sort().slice(-days);

      if (dates.length === 0) return { trend: 0, direction: 'stable' };

      const scores = dates.map(date => history[date].lifeScore || 0);
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

      const previousAvg = scores.slice(0, -1).reduce((sum, s) => sum + s, 0) / (scores.length - 1 || 1);
      const change = avg - previousAvg;

      return {
        average: Math.round(avg),
        change: Math.round(change),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
      };
    },

    // ─── Get current scores snapshot ──────────────────────────────────────────
    getScores() {
      return State.getPath('scores') || {
        lifeScore: 0,
        productivityScore: 0,
        disciplineScore: 0,
        healthScore: 0,
        wealthScore: 0,
        updatedAt: Date.now()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ScoreEngine = ScoreEngine;

  // Auto-init after streak engine
  function tryInit() {
    if (window.StreakEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      ScoreEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugScores = {
    recalculate: () => ScoreEngine.recalculateScores(),
    get: () => ScoreEngine.getScores(),
    trend: (days) => ScoreEngine.calculateScoreTrend(days),
    history: () => State.getPath('scoreHistory')
  };

})();