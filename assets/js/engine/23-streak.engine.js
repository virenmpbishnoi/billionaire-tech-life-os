/*
 * 23-streak.engine.js
 * Streak Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Tracks daily/continuous consistency across behaviors:
 *   - Habit streaks
 *   - Task execution streaks
 *   - Workout/health streaks
 *   - Goal/target activity streaks
 *
 * Provides streak length, longest streak, milestone detection, and risk warnings.
 * Feeds discipline score, rank progression, badges, and notifications.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const STREAK_TYPES = {
    habit: 'habit',
    task: 'task',
    workout: 'workout',
    goal: 'goal',
    custom: 'custom'
  };

  const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

  const DEFAULT_STREAK = {
    streakId: null,
    userId: null,
    streakType: null,             // habit, task, workout, goal, custom
    currentStreak: 0,
    longestStreak: 0,
    startedAt: null,
    lastActivityDate: null,
    lastResetDate: null,
    milestoneReached: null,       // last milestone achieved
    history: []                   // [{ date, length, action }]
  };

  const STREAK_STORAGE_KEY = 'user:{userId}:streaks';

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getStreakKey(userId) {
    if (!userId) throw new Error('User ID required');
    return STREAK_STORAGE_KEY.replace('{userId}', userId);
  }

  function generateStreakId(type) {
    return `streak_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeDate(date) {
    return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function daysBetween(d1, d2) {
    const diffMs = Math.abs(new Date(d2) - new Date(d1));
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  function validateStreak(streak) {
    if (!streak || typeof streak !== 'object') {
      throw new Error('Invalid streak object');
    }
    if (!streak.streakId || !streak.userId || !streak.streakType) {
      throw new Error('Streak missing required fields: streakId, userId, streakType');
    }
    if (!Object.keys(STREAK_TYPES).includes(streak.streakType)) {
      throw new Error(`Invalid streak type: ${streak.streakType}`);
    }
    if (streak.currentStreak < 0 || streak.longestStreak < streak.currentStreak) {
      throw new Error('Invalid streak length values');
    }
    // Deeper validation via validation.engine
    return true;
  }

  function updateStreakRecord(streak, activityDate = Date.now()) {
    const today = normalizeDate(activityDate);
    const lastActivity = streak.lastActivityDate ? normalizeDate(streak.lastActivityDate) : null;

    let newCurrent = streak.currentStreak;
    let newLongest = streak.longestStreak;
    let milestone = streak.milestoneReached;
    let action = 'extended';

    if (!lastActivity) {
      // First activity
      newCurrent = 1;
      newLongest = 1;
      streak.startedAt = activityDate;
    } else {
      const daysSinceLast = daysBetween(lastActivity, today);

      if (daysSinceLast === 0) {
        // Same day → no change
        action = 'same_day';
      } else if (daysSinceLast === 1) {
        // Consecutive day → extend
        newCurrent++;
        newLongest = Math.max(newLongest, newCurrent);
      } else {
        // Break detected
        action = 'broken';
        newCurrent = 1;
        EventBus.emit('STREAK_BROKEN', {
          streakId: streak.streakId,
          streakType: streak.streakType,
          previousLength: streak.currentStreak,
          daysMissed: daysSinceLast - 1
        });
      }
    }

    // Check for new milestones
    if (newCurrent > (milestone || 0)) {
      const nextMilestone = STREAK_MILESTONES.find(m => m === newCurrent);
      if (nextMilestone) {
        milestone = nextMilestone;
        EventBus.emit('STREAK_MILESTONE_REACHED', {
          streakId: streak.streakId,
          streakType: streak.streakType,
          milestone: nextMilestone,
          currentStreak: newCurrent
        });
      }
    }

    // Risk warning: streak at risk if close to break
    if (newCurrent >= 3 && daysSinceLast === 1) {
      EventBus.emit('STREAK_RISK_WARNING', {
        streakId: streak.streakId,
        streakType: streak.streakType,
        currentStreak: newCurrent,
        daysSinceLastActivity: daysSinceLast
      });
    }

    return {
      ...streak,
      currentStreak: newCurrent,
      longestStreak: newLongest,
      milestoneReached: milestone,
      lastActivityDate: activityDate,
      history: [
        ...(streak.history || []),
        { date: today, length: newCurrent, action, timestamp: activityDate }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC STREAK ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const StreakEngine = {

    async init() {
      // Load streaks when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadStreaks(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadStreaks(userId);
      });

      // Listen for activity events that can extend streaks
      EventBus.on('HABIT_COMPLETED', ({ habitId, completedAt }) => {
        this.updateStreak(STREAK_TYPES.habit, completedAt);
      });

      EventBus.on('TASK_COMPLETED', ({ taskId, completedAt }) => {
        this.updateStreak(STREAK_TYPES.task, completedAt);
      });

      EventBus.on('HEALTH_WORKOUT_LOGGED', ({ recordId, timestamp }) => {
        this.updateStreak(STREAK_TYPES.workout, timestamp);
      });

      EventBus.on('TARGET_COMPLETED', ({ targetId, completedAt }) => {
        this.updateStreak(STREAK_TYPES.goal, completedAt);
      });

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadStreaks(userId);
      }

      // Daily reset/check at midnight (approx)
      setInterval(() => this.detectDailyBreaks(), 6 * 60 * 60 * 1000);

      console.log('[StreakEngine] Initialized – tracking consistency signals');
    },

    // ─── Load all streaks for current user into state ─────────────────────────
    async loadStreaks(userId) {
      const streaksKey = getStreakKey(userId);
      let streaks = Storage.read(streaksKey) || [];

      streaks = streaks.map(s => {
        try {
          validateStreak(s);
          return s;
        } catch (err) {
          console.warn('[StreakEngine] Invalid streak filtered:', s.streakId, err.message);
          return null;
        }
      }).filter(Boolean);

      State.update('streaks', streaks);

      EventBus.emit('STREAKS_LOADED', {
        userId,
        count: streaks.length,
        activeStreaks: streaks.filter(s => s.currentStreak > 0).length
      });

      return streaks;
    },

    // ─── Get all current streaks (from state) ─────────────────────────────────
    getStreaks() {
      return State.getPath('streaks') || [];
    },

    getStreakByType(streakType) {
      const streaks = this.getStreaks();
      return streaks.find(s => s.streakType === streakType) || null;
    },

    // ─── Update or create streak for a given type ─────────────────────────────
    async updateStreak(streakType, activityDate = Date.now()) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      let streak = this.getStreakByType(streakType);

      if (!streak) {
        // Create new streak record
        streak = {
          ...DEFAULT_STREAK,
          streakId: generateStreakId(streakType),
          userId: user.userId,
          streakType,
          startedAt: activityDate
        };
      }

      const updatedStreak = updateStreakRecord(streak, activityDate);

      const streaks = this.getStreaks();
      const index = streaks.findIndex(s => s.streakId === updatedStreak.streakId);

      if (index === -1) {
        streaks.push(updatedStreak);
      } else {
        streaks[index] = updatedStreak;
      }

      State.update('streaks', streaks);
      await this.saveStreaks();

      EventBus.emit('STREAK_UPDATED', {
        streakId: updatedStreak.streakId,
        streakType,
        currentStreak: updatedStreak.currentStreak,
        longestStreak: updatedStreak.longestStreak,
        milestone: updatedStreak.milestoneReached,
        timestamp: activityDate
      });

      if (updatedStreak.currentStreak > 0 && updatedStreak.currentStreak !== streak.currentStreak) {
        EventBus.emit('STREAK_EXTENDED', {
          streakId: updatedStreak.streakId,
          streakType,
          newLength: updatedStreak.currentStreak
        });
      }

      Recalculation?.trigger('STREAK_UPDATED');

      return updatedStreak;
    },

    // ─── Daily break detection (runs periodically) ────────────────────────────
    detectDailyBreaks() {
      const streaks = this.getStreaks();
      const today = normalizeDate(Date.now());

      streaks.forEach(streak => {
        if (streak.currentStreak === 0) return;

        const lastActivity = normalizeDate(streak.lastActivityDate);
        const daysSince = daysBetween(lastActivity, today);

        if (daysSince > 1) {
          // Streak should have been broken
          const updated = {
            ...streak,
            currentStreak: 0,
            lastResetDate: Date.now(),
            history: [
              ...(streak.history || []),
              { date: today, length: 0, action: 'broken_auto', timestamp: Date.now() }
            ]
          };

          this.updateStreakRecord(updated);
          EventBus.emit('STREAK_BROKEN', {
            streakId: streak.streakId,
            streakType: streak.streakType,
            previousLength: streak.currentStreak,
            daysMissed: daysSince - 1,
            autoDetected: true
          });
        }
      });
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveStreaks() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const streaks = this.getStreaks();
      const streaksKey = getStreakKey(user.userId);

      Storage.write(streaksKey, streaks);
    },

    // ─── Streak statistics ────────────────────────────────────────────────────
    calculateStreakStats() {
      const streaks = this.getStreaks();

      return {
        totalStreaks: streaks.length,
        activeStreaks: streaks.filter(s => s.currentStreak > 0).length,
        totalStreakDays: streaks.reduce((sum, s) => sum + s.longestStreak, 0),
        longestStreakOverall: Math.max(...streaks.map(s => s.longestStreak), 0),
        averageStreak: streaks.length > 0
          ? streaks.reduce((sum, s) => sum + s.currentStreak, 0) / streaks.length
          : 0,
        milestoneCount: streaks.reduce((sum, s) => sum + (s.milestoneReached ? 1 : 0), 0)
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.StreakEngine = StreakEngine;

  // Auto-init after target engine
  function tryInit() {
    if (window.TargetEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      StreakEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugStreaks = {
    update: (type, date) => StreakEngine.updateStreak(type, date),
    list: () => StreakEngine.getStreaks(),
    stats: () => StreakEngine.calculateStreakStats(),
    breaks: () => StreakEngine.detectDailyBreaks()
  };

})();