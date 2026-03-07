/*
 * 18-habit.engine.js
 * Habit Behavior Tracking Engine – Billionaire Tech Adaptive Life OS
 *
 * Manages repeatable daily/weekly habits that build long-term discipline:
 *   - Habit creation, editing, deletion
 *   - Daily completion tracking
 *   - Streak continuity & longest streak
 *   - Completion history & miss detection
 *   - Discipline & rank contribution signals
 *
 * Habits are the foundation of behavioral consistency in the system.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const HABIT_FREQUENCY = {
    daily: 'daily',
    weekly: 'weekly',
    custom: 'custom'
  };

  const DEFAULT_HABIT = {
    habitId: null,
    userId: null,
    title: '',
    description: '',
    frequency: HABIT_FREQUENCY.daily,
    category: 'general',
    reminderTime: null,           // e.g. "08:00"
    createdAt: null,
    status: 'active',
    completionHistory: [],        // [{ date: "2026-03-06", timestamp: ms }]
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedAt: null,
    lastMissedAt: null,
    missedCount: 0
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getHabitsKey(userId) {
    if (!userId) throw new Error('User ID required');
    return `user:${userId}:habits`;
  }

  function generateHabitId() {
    return 'habit_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function normalizeDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function isHabitCompletedToday(habit) {
    if (!habit.lastCompletedAt) return false;
    return normalizeDate(habit.lastCompletedAt) === normalizeDate(Date.now());
  }

  function validateHabit(habit) {
    if (!habit || typeof habit !== 'object') {
      throw new Error('Invalid habit object');
    }
    if (!habit.habitId || !habit.userId || !habit.title?.trim()) {
      throw new Error('Habit missing required fields: habitId, userId, title');
    }
    if (habit.frequency && !Object.values(HABIT_FREQUENCY).includes(habit.frequency)) {
      throw new Error(`Invalid frequency: ${habit.frequency}`);
    }
    // Deeper schema validation delegated to validation.engine
    // validation.engine.validate('habit', habit);
    return true;
  }

  function updateStreak(habit) {
    const today = normalizeDate(Date.now());
    const lastCompletion = habit.lastCompletedAt ? normalizeDate(habit.lastCompletedAt) : null;

    if (lastCompletion === today) {
      // Already completed today → no streak change
      return habit;
    }

    let newStreak = habit.currentStreak;
    let newLongest = habit.longestStreak;
    let missed = habit.missedCount;

    if (lastCompletion) {
      const daysSinceLast = Math.floor((Date.now() - habit.lastCompletedAt) / (24 * 60 * 60 * 1000));

      if (daysSinceLast === 1) {
        // Consecutive day → streak continues
        newStreak++;
        newLongest = Math.max(newLongest, newStreak);
      } else if (daysSinceLast > 1) {
        // Missed days → streak broken
        missed += daysSinceLast - 1;
        newStreak = 1;
        EventBus.emit('HABIT_MISSED', {
          habitId: habit.habitId,
          missedDays: daysSinceLast - 1
        });
      }
    } else {
      // First completion
      newStreak = 1;
    }

    return {
      ...habit,
      currentStreak: newStreak,
      longestStreak: newLongest,
      missedCount: missed,
      lastCompletedAt: Date.now()
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC HABIT ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const HabitEngine = {

    async init() {
      // Load habits when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadHabits(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadHabits(userId);
      });

      // Listen for completion requests from UI
      EventBus.on('HABIT_COMPLETE_REQUEST', ({ habitId }) => {
        this.completeHabit(habitId);
      });

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadHabits(userId);
      }

      console.log('[HabitEngine] Initialized – tracking behavioral consistency');
    },

    // ─── Load all habits for current user into state ──────────────────────────
    async loadHabits(userId) {
      const habitsKey = getHabitsKey(userId);
      let habits = Storage.read(habitsKey) || [];

      habits = habits.map(h => {
        try {
          validateHabit(h);
          return {
            ...DEFAULT_HABIT,
            ...h,
            completionHistory: h.completionHistory || []
          };
        } catch (err) {
          console.warn('[HabitEngine] Invalid habit filtered:', h.habitId, err.message);
          return null;
        }
      }).filter(Boolean);

      State.update('habits', habits);

      EventBus.emit('HABITS_LOADED', {
        userId,
        count: habits.length,
        active: habits.filter(h => h.status === 'active').length
      });

      return habits;
    },

    // ─── Get all current habits (from state) ──────────────────────────────────
    getHabits() {
      return State.getPath('habits') || [];
    },

    getHabitById(habitId) {
      const habits = this.getHabits();
      return habits.find(h => h.habitId === habitId) || null;
    },

    // ─── Create new habit ─────────────────────────────────────────────────────
    async createHabit(habitData) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const habit = {
        ...DEFAULT_HABIT,
        ...habitData,
        habitId: generateHabitId(),
        userId: user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      validateHabit(habit);

      const habits = this.getHabits();
      habits.push(habit);

      State.update('habits', habits);
      await this.saveHabits();

      EventBus.emit('HABIT_CREATED', {
        habitId: habit.habitId,
        title: habit.title,
        frequency: habit.frequency,
        timestamp: Date.now()
      });

      Recalculation?.trigger('HABIT_CREATED');

      return habit;
    },

    // ─── Update existing habit ────────────────────────────────────────────────
    async updateHabit(habitId, updates) {
      const habits = this.getHabits();
      const index = habits.findIndex(h => h.habitId === habitId);

      if (index === -1) throw new Error(`Habit not found: ${habitId}`);

      const updatedHabit = {
        ...habits[index],
        ...updates,
        updatedAt: Date.now()
      };

      validateHabit(updatedHabit);

      habits[index] = updatedHabit;
      State.update('habits', habits);
      await this.saveHabits();

      EventBus.emit('HABIT_UPDATED', {
        habitId,
        changes: updates,
        timestamp: Date.now()
      });

      Recalculation?.trigger('HABIT_UPDATED');

      return updatedHabit;
    },

    // ─── Mark habit as completed for today ────────────────────────────────────
    async completeHabit(habitId) {
      const habit = this.getHabitById(habitId);
      if (!habit) throw new Error(`Habit not found: ${habitId}`);

      if (isHabitCompletedToday(habit)) {
        console.warn('[HabitEngine] Habit already completed today:', habitId);
        return habit;
      }

      const now = Date.now();
      const updatedHabit = updateStreak({
        ...habit,
        completionHistory: [
          ...habit.completionHistory,
          { date: normalizeDate(now), timestamp: now }
        ],
        updatedAt: now
      });

      await this.updateHabit(habitId, updatedHabit);

      EventBus.emit('HABIT_COMPLETED', {
        habitId,
        userId: habit.userId,
        completedAt: now,
        currentStreak: updatedHabit.currentStreak,
        title: habit.title
      });

      EventBus.emit('HABIT_STREAK_UPDATED', {
        habitId,
        currentStreak: updatedHabit.currentStreak,
        longestStreak: updatedHabit.longestStreak
      });

      Recalculation?.trigger('HABIT_COMPLETED');

      return updatedHabit;
    },

    // ─── Delete habit ─────────────────────────────────────────────────────────
    async deleteHabit(habitId) {
      const habits = this.getHabits();
      const filtered = habits.filter(h => h.habitId !== habitId);

      if (filtered.length === habits.length) {
        throw new Error(`Habit not found for deletion: ${habitId}`);
      }

      State.update('habits', filtered);
      await this.saveHabits();

      EventBus.emit('HABIT_DELETED', {
        habitId,
        timestamp: Date.now()
      });

      Recalculation?.trigger('HABIT_DELETED');

      return true;
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveHabits() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const habits = this.getHabits();
      const habitsKey = getHabitsKey(user.userId);

      Storage.write(habitsKey, habits);

      // Update user stats
      UserEngine?.incrementStat('habitsCompleted', habits.reduce((sum, h) => {
        return sum + h.completionHistory.length;
      }, 0));
    },

    // ─── Habit statistics ─────────────────────────────────────────────────────
    calculateHabitStats() {
      const habits = this.getHabits();
      const active = habits.filter(h => h.status === 'active');
      const completedToday = habits.filter(h => isHabitCompletedToday(h));

      return {
        totalHabits: habits.length,
        activeHabits: active.length,
        completedToday: completedToday.length,
        averageStreak: active.length > 0
          ? active.reduce((sum, h) => sum + h.currentStreak, 0) / active.length
          : 0,
        totalCompletions: habits.reduce((sum, h) => sum + h.completionHistory.length, 0)
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.HabitEngine = HabitEngine;

  // Auto-init after user & task engines
  function tryInit() {
    if (window.UserEngine && window.TaskEngine && window.Storage && window.State && window.EventBus) {
      HabitEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugHabits = {
    create: (data) => HabitEngine.createHabit(data),
    complete: (id) => HabitEngine.completeHabit(id),
    list: () => HabitEngine.getHabits(),
    stats: () => HabitEngine.calculateHabitStats()
  };

})();