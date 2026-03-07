/*
 * 25-discipline.engine.js
 * Behavioral Discipline Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Quantifies user's behavioral reliability and consistency across domains.
 * Analyzes signals from habits, streaks, tasks, health routines, and goal adherence.
 * Produces a Discipline Index (0–100) that reflects execution integrity.
 *
 * Drives rank progression, badge rewards, risk detection, and motivation analytics.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & WEIGHTING MODEL
  // ─────────────────────────────────────────────────────────────────────────────

  const DISCIPLINE_RANGES = {
    min: 0,
    max: 100,
    excellent: 90,
    strong: 75,
    moderate: 50,
    weak: 30,
    critical: 15
  };

  // Core component weights for Discipline Index (total = 1.0)
  const DISCIPLINE_WEIGHTS = {
    habitConsistency: 0.35,
    streakStability:  0.25,
    taskReliability:  0.20,
    routineAdherence: 0.20
  };

  // Sub-weights within each component (total = 1.0 per category)
  const HABIT_WEIGHTS = {
    completionRate: 0.50,
    streakContribution: 0.30,
    missPenalty: 0.20
  };

  const STREAK_WEIGHTS = {
    currentStreak: 0.40,
    longestStreak: 0.30,
    recoveryRate: 0.30
  };

  const TASK_WEIGHTS = {
    completionRate: 0.50,
    onTimeRate: 0.30,
    abandonmentRate: 0.20
  };

  const ROUTINE_WEIGHTS = {
    workoutFrequency: 0.40,
    sleepConsistency: 0.35,
    nutritionHydration: 0.25
  };

  const DISCIPLINE_HISTORY_LIMIT = 90; // Keep last 90 days

  const DECREASE_THRESHOLD = 10;       // % drop that triggers warning

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function clampScore(value) {
    return Math.max(DISCIPLINE_RANGES.min, Math.min(DISCIPLINE_RANGES.max, Math.round(value)));
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

  function normalizeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    // Remove old entries
    Object.keys(cleaned).sort().reverse().slice(DISCIPLINE_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    // Ensure today exists
    if (!cleaned[today]) {
      cleaned[today] = { disciplineIndex: 0, timestamp: Date.now() };
    }

    return cleaned;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC DISCIPLINE ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const DisciplineEngine = {

    async init() {
      // Recalculate on major behavioral events via recalculation orchestrator
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateDiscipline();
      });

      // Load history when user logs in
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadDisciplineHistory();
        this.recalculateDiscipline();
      });

      EventBus.on('SESSION_CREATED', async () => {
        await this.loadDisciplineHistory();
        this.recalculateDiscipline();
      });

      // Initial calculation if already authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadDisciplineHistory();
        this.recalculateDiscipline();
      }

      console.log('[DisciplineEngine] Initialized – measuring behavioral reliability');
    },

    // ─── Load discipline history from storage ─────────────────────────────────
    async loadDisciplineHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:discipline:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeHistory(history);

      State.update('disciplineHistory', history);
      State.update('discipline', history[getTodayKey()] || { disciplineIndex: 0 });

      EventBus.emit('DISCIPLINE_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current discipline metrics to history ───────────────────────────
    async saveDisciplineHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const current = State.getPath('discipline') || {};
      const history = State.getPath('disciplineHistory') || {};

      history[today] = {
        ...current,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeHistory(history);
      State.update('disciplineHistory', normalized);

      Storage.write(`user:${user.userId}:discipline:history`, normalized);
    },

    // ─── Core recalculation – aggregates behavioral signals ───────────────────
    recalculateDiscipline() {
      try {
        const habitScore = this.analyzeHabitConsistency();
        const streakScore = this.analyzeStreakStability();
        const taskScore = this.analyzeTaskReliability();
        const routineScore = this.analyzeRoutineAdherence();

        const disciplineIndex = clampScore(
          weightedAverage(
            {
              habitConsistency: habitScore,
              streakStability: streakScore,
              taskReliability: taskScore,
              routineAdherence: routineScore
            },
            DISCIPLINE_WEIGHTS
          )
        );

        const previousIndex = State.getPath('discipline.disciplineIndex') || disciplineIndex;
        const change = disciplineIndex - previousIndex;

        const metrics = {
          disciplineIndex,
          habitConsistency: clampScore(habitScore),
          streakStability: clampScore(streakScore),
          taskReliability: clampScore(taskScore),
          routineAdherence: clampScore(routineScore),
          change,
          trend: change > 0 ? 'improving' : change < 0 ? 'decreasing' : 'stable',
          updatedAt: Date.now()
        };

        State.update('discipline', metrics);

        // Save to history
        this.saveDisciplineHistory();

        EventBus.emit('DISCIPLINE_UPDATED', metrics);
        EventBus.emit('DISCIPLINE_INDEX_UPDATED', { index: disciplineIndex });

        // Degradation detection
        if (change <= -DECREASE_THRESHOLD) {
          EventBus.emit('DISCIPLINE_DECREASE_DETECTED', {
            previous: previousIndex,
            current: disciplineIndex,
            drop: Math.abs(change)
          });
        }

        // Milestone rewards (consistency streaks)
        if (disciplineIndex >= 90 && previousIndex < 90) {
          EventBus.emit('DISCIPLINE_STREAK_REWARDED', { level: 'excellent' });
        } else if (disciplineIndex >= 75 && previousIndex < 75) {
          EventBus.emit('DISCIPLINE_STREAK_REWARDED', { level: 'strong' });
        }

        return metrics;
      } catch (err) {
        console.error('[DisciplineEngine] Recalculation failed:', err);
        EventBus.emit('DISCIPLINE_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Behavioral analysis functions ────────────────────────────────────────

    analyzeHabitConsistency() {
      const habits = HabitEngine?.getHabits() || [];

      if (habits.length === 0) return 0;

      const completionRate = habits.reduce((sum, h) => {
        return sum + (h.completionHistory?.length || 0) / Math.max(1, (Date.now() - h.createdAt) / (24*60*60*1000));
      }, 0) / habits.length * 100;

      const streakContribution = habits.reduce((sum, h) => sum + h.currentStreak, 0) / habits.length / 30 * 100;
      const missPenalty = habits.reduce((sum, h) => sum + h.missedCount, 0) / habits.length * -5;

      return weightedAverage(
        { completionRate, streakContribution, missPenalty },
        HABIT_WEIGHTS
      );
    },

    analyzeStreakStability() {
      const streaks = StreakEngine?.getStreaks() || [];

      if (streaks.length === 0) return 0;

      const currentAvg = streaks.reduce((sum, s) => sum + s.currentStreak, 0) / streaks.length / 90 * 100;
      const longestAvg = streaks.reduce((sum, s) => sum + s.longestStreak, 0) / streaks.length / 365 * 100;
      const recoveryRate = streaks.reduce((sum, s) => {
        return sum + (s.currentStreak > 0 && s.lastResetDate ? 1 : 0);
      }, 0) / streaks.length * 100;

      return weightedAverage(
        { currentAvg, longestAvg, recoveryRate },
        STREAK_WEIGHTS
      );
    },

    analyzeTaskReliability() {
      const tasks = TaskEngine?.getTasks() || [];

      if (tasks.length === 0) return 50; // neutral if no tasks

      const completedRate = tasks.filter(t => t.status === 'completed').length / tasks.length * 100;
      const overdueRate = tasks.filter(t => t.deadline && t.deadline < Date.now() && t.status !== 'completed').length / tasks.length * -30;
      const abandonmentRate = tasks.filter(t => t.status === 'cancelled').length / tasks.length * -20;

      return weightedAverage(
        { completedRate, overdueRate, abandonmentRate },
        TASK_WEIGHTS
      );
    },

    analyzeRoutineAdherence() {
      const health = State.getPath('health') || {};
      const records = health.records || [];

      const workoutFreq = records.filter(r => r.type === 'workout').length / 7 * 100;
      const sleepConsistency = records.filter(r => r.type === 'sleep' && r.sleepQuality >= 3).length / 7 * 100;
      const nutritionHydration = records.filter(r => r.type === 'nutrition' || r.type === 'hydration').length / 7 * 100;

      return weightedAverage(
        { workoutFreq, sleepConsistency, nutritionHydration },
        ROUTINE_WEIGHTS
      );
    },

    // ─── Get current discipline metrics ───────────────────────────────────────
    getDisciplineMetrics() {
      return State.getPath('discipline') || {
        disciplineIndex: 0,
        habitConsistency: 0,
        streakStability: 0,
        taskReliability: 0,
        routineAdherence: 0,
        updatedAt: Date.now()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.DisciplineEngine = DisciplineEngine;

  // Auto-init after score engine
  function tryInit() {
    if (window.ScoreEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      DisciplineEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugDiscipline = {
    recalculate: () => DisciplineEngine.recalculateDiscipline(),
    metrics: () => DisciplineEngine.getDisciplineMetrics()
  };

})();