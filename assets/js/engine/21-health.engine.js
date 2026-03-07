/*
 * 21-health.engine.js
 * Health Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Tracks and analyzes biological performance metrics:
 *   - Workouts (type, duration, intensity, calories)
 *   - Sleep (duration, quality rating)
 *   - Nutrition (calories, macros)
 *   - Hydration (daily intake)
 *   - Derived health scores & burnout/risk signals
 *
 * Feeds discipline, burnout, risk, analytics, and dashboard visualization.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const HEALTH_RECORD_TYPES = {
    workout: 'workout',
    sleep: 'sleep',
    nutrition: 'nutrition',
    hydration: 'hydration'
  };

  const WORKOUT_TYPES = [
    'strength', 'cardio', 'hiit', 'yoga', 'mobility', 'sport', 'other'
  ];

  const DEFAULT_WORKOUT = {
    recordId: null,
    userId: null,
    type: 'workout',
    workoutType: 'strength',
    durationMinutes: 0,
    caloriesBurned: 0,
    intensity: 'medium',          // low / medium / high
    notes: '',
    timestamp: null
  };

  const DEFAULT_SLEEP = {
    recordId: null,
    userId: null,
    type: 'sleep',
    durationHours: 0,
    sleepQuality: 3,              // 1–5 scale
    timestamp: null               // bedtime or wake-up time
  };

  const DEFAULT_NUTRITION = {
    recordId: null,
    userId: null,
    type: 'nutrition',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    timestamp: null
  };

  const DEFAULT_HYDRATION = {
    recordId: null,
    userId: null,
    type: 'hydration',
    amountMl: 0,
    timestamp: null
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getHealthRecordsKey(userId) {
    return `user:${userId}:health:records`;
  }

  function generateRecordId() {
    return 'health_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function validateHealthRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Invalid health record');
    }
    if (!record.recordId || !record.userId || !record.type) {
      throw new Error('Record missing required fields: recordId, userId, type');
    }
    if (!Object.values(HEALTH_RECORD_TYPES).includes(record.type)) {
      throw new Error(`Invalid health record type: ${record.type}`);
    }

    if (record.type === HEALTH_RECORD_TYPES.workout) {
      if (!record.durationMinutes || record.durationMinutes <= 0) {
        throw new Error('Workout duration must be positive');
      }
    } else if (record.type === HEALTH_RECORD_TYPES.sleep) {
      if (!record.durationHours || record.durationHours <= 0) {
        throw new Error('Sleep duration must be positive');
      }
      if (record.sleepQuality < 1 || record.sleepQuality > 5) {
        throw new Error('Sleep quality must be 1–5');
      }
    } else if (record.type === HEALTH_RECORD_TYPES.nutrition) {
      if (record.calories < 0) {
        throw new Error('Calories cannot be negative');
      }
    } else if (record.type === HEALTH_RECORD_TYPES.hydration) {
      if (record.amountMl < 0) {
        throw new Error('Hydration amount cannot be negative');
      }
    }

    // Deeper schema validation via validation.engine
    // validation.engine.validate('healthRecord', record);
    return true;
  }

  function calculateDailyHealthScore(records) {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = records.filter(r => new Date(r.timestamp).toISOString().split('T')[0] === today);

    let score = 0;
    let weight = 0;

    // Sleep (40%)
    const sleep = todayRecords.find(r => r.type === 'sleep');
    if (sleep) {
      const sleepScore = Math.min(10, sleep.durationHours * 1.5) * 4; // max 10 points
      score += sleepScore * 0.4;
      weight += 0.4;
    }

    // Workout/activity (30%)
    const workouts = todayRecords.filter(r => r.type === 'workout');
    const workoutScore = workouts.reduce((sum, w) => sum + (w.durationMinutes / 60) * 3, 0); // 3 pts/hour
    score += Math.min(10, workoutScore) * 0.3;
    weight += 0.3;

    // Nutrition/hydration (30%)
    const nutrition = todayRecords.filter(r => r.type === 'nutrition');
    const hydration = todayRecords.filter(r => r.type === 'hydration');
    const nutritionScore = nutrition.reduce((sum, n) => sum + (n.calories > 1500 ? 5 : 2), 0);
    const hydrationScore = hydration.reduce((sum, h) => sum + (h.amountMl > 2000 ? 5 : 2), 0);
    score += ((nutritionScore + hydrationScore) / 2) * 0.3;
    weight += 0.3;

    return weight > 0 ? Math.round(score / weight) : 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC HEALTH ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const HealthEngine = {

    async init() {
      // Load health records when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadHealthRecords(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadHealthRecords(userId);
      });

      // Listen for logging requests from UI
      EventBus.on('HEALTH_LOG_WORKOUT', (data) => this.addWorkout(data));
      EventBus.on('HEALTH_LOG_SLEEP', (data) => this.logSleep(data));
      EventBus.on('HEALTH_LOG_NUTRITION', (data) => this.logNutrition(data));
      EventBus.on('HEALTH_LOG_HYDRATION', (data) => this.logHydration(data));

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadHealthRecords(userId);
      }

      console.log('[HealthEngine] Initialized – tracking biological performance');
    },

    // ─── Load all health records for current user ─────────────────────────────
    async loadHealthRecords(userId) {
      const recordsKey = getHealthRecordsKey(userId);
      let records = Storage.read(recordsKey) || [];

      records = records.filter(r => {
        try {
          validateHealthRecord(r);
          return true;
        } catch {
          return false;
        }
      });

      State.update('health', {
        records,
        dailyScore: calculateDailyHealthScore(records),
        lastUpdated: Date.now()
      });

      EventBus.emit('HEALTH_RECORDS_LOADED', {
        userId,
        recordCount: records.length,
        dailyScore: State.getPath('health.dailyScore')
      });

      Recalculation?.trigger('HEALTH_RECORDS_LOADED');

      return records;
    },

    // ─── Add workout record ───────────────────────────────────────────────────
    async addWorkout(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const record = {
        ...DEFAULT_WORKOUT,
        ...data,
        recordId: generateRecordId(),
        userId: user.userId,
        timestamp: Date.now()
      };

      validateHealthRecord(record);

      const health = State.getPath('health') || { records: [] };
      health.records.push(record);

      State.update('health', {
        ...health,
        records: health.records,
        dailyScore: calculateDailyHealthScore(health.records)
      });

      await this.saveHealthRecords();

      EventBus.emit('HEALTH_WORKOUT_LOGGED', {
        recordId: record.recordId,
        workoutType: record.workoutType,
        durationMinutes: record.durationMinutes,
        caloriesBurned: record.caloriesBurned,
        timestamp: record.timestamp
      });

      Recalculation?.trigger('HEALTH_WORKOUT_LOGGED');

      return record;
    },

    // ─── Log sleep record ─────────────────────────────────────────────────────
    async logSleep(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const record = {
        ...DEFAULT_SLEEP,
        ...data,
        recordId: generateRecordId(),
        userId: user.userId,
        timestamp: Date.now()
      };

      validateHealthRecord(record);

      const health = State.getPath('health') || { records: [] };
      health.records.push(record);

      State.update('health', {
        ...health,
        records: health.records,
        dailyScore: calculateDailyHealthScore(health.records)
      });

      await this.saveHealthRecords();

      EventBus.emit('HEALTH_SLEEP_LOGGED', {
        recordId: record.recordId,
        durationHours: record.durationHours,
        sleepQuality: record.sleepQuality,
        timestamp: record.timestamp
      });

      Recalculation?.trigger('HEALTH_SLEEP_LOGGED');

      return record;
    },

    // ─── Log nutrition record ─────────────────────────────────────────────────
    async logNutrition(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const record = {
        ...DEFAULT_NUTRITION,
        ...data,
        recordId: generateRecordId(),
        userId: user.userId,
        timestamp: Date.now()
      };

      validateHealthRecord(record);

      const health = State.getPath('health') || { records: [] };
      health.records.push(record);

      State.update('health', {
        ...health,
        records: health.records,
        dailyScore: calculateDailyHealthScore(health.records)
      });

      await this.saveHealthRecords();

      EventBus.emit('HEALTH_NUTRITION_LOGGED', {
        recordId: record.recordId,
        calories: record.calories,
        protein: record.protein,
        carbs: record.carbs,
        fat: record.fat,
        timestamp: record.timestamp
      });

      Recalculation?.trigger('HEALTH_NUTRITION_LOGGED');

      return record;
    },

    // ─── Log hydration record ─────────────────────────────────────────────────
    async logHydration(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const record = {
        ...DEFAULT_HYDRATION,
        ...data,
        recordId: generateRecordId(),
        userId: user.userId,
        timestamp: Date.now()
      };

      validateHealthRecord(record);

      const health = State.getPath('health') || { records: [] };
      health.records.push(record);

      State.update('health', {
        ...health,
        records: health.records,
        dailyScore: calculateDailyHealthScore(health.records)
      });

      await this.saveHealthRecords();

      EventBus.emit('HEALTH_HYDRATION_LOGGED', {
        recordId: record.recordId,
        amountMl: record.amountMl,
        timestamp: record.timestamp
      });

      Recalculation?.trigger('HEALTH_HYDRATION_LOGGED');

      return record;
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveHealthRecords() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const records = State.getPath('health.records') || [];
      const recordsKey = getHealthRecordsKey(user.userId);

      Storage.write(recordsKey, records);
    },

    // ─── Health analytics & burnout signals ───────────────────────────────────
    calculateHealthMetrics() {
      const health = State.getPath('health') || {};
      const records = health.records || [];

      const today = new Date().toISOString().split('T')[0];
      const todayRecords = records.filter(r => new Date(r.timestamp).toISOString().split('T')[0] === today);

      const sleep = todayRecords.find(r => r.type === 'sleep');
      const workouts = todayRecords.filter(r => r.type === 'workout');
      const nutrition = todayRecords.filter(r => r.type === 'nutrition');
      const hydration = todayRecords.filter(r => r.type === 'hydration');

      const metrics = {
        dailyScore: calculateDailyHealthScore(records),
        sleepHours: sleep?.durationHours || 0,
        sleepQuality: sleep?.sleepQuality || 0,
        workoutCount: workouts.length,
        totalWorkoutMinutes: workouts.reduce((sum, w) => sum + w.durationMinutes, 0),
        caloriesBurned: workouts.reduce((sum, w) => sum + w.caloriesBurned, 0),
        totalCalories: nutrition.reduce((sum, n) => sum + n.calories, 0),
        totalProtein: nutrition.reduce((sum, n) => sum + n.protein, 0),
        totalHydrationMl: hydration.reduce((sum, h) => sum + h.amountMl, 0)
      };

      // Burnout risk signals (0–10 scale, higher = worse)
      const burnoutSignals = {
        sleepDeficit: Math.max(0, 8 - metrics.sleepHours) * 2,
        activityLow: workouts.length === 0 ? 4 : 0,
        nutritionImbalance: metrics.totalCalories < 1500 ? 3 : 0,
        hydrationLow: metrics.totalHydrationMl < 2000 ? 3 : 0
      };

      const burnoutScore = Object.values(burnoutSignals).reduce((sum, v) => sum + v, 0);

      EventBus.emit('HEALTH_METRICS_UPDATED', {
        dailyScore: metrics.dailyScore,
        burnoutScore,
        signals: burnoutSignals
      });

      return { metrics, burnoutSignals, burnoutScore };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.HealthEngine = HealthEngine;

  // Auto-init after finance engine
  function tryInit() {
    if (window.FinanceEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      HealthEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugHealth = {
    workout: (data) => HealthEngine.addWorkout(data),
    sleep: (data) => HealthEngine.logSleep(data),
    nutrition: (data) => HealthEngine.logNutrition(data),
    hydration: (data) => HealthEngine.logHydration(data),
    metrics: () => HealthEngine.calculateHealthMetrics()
  };

})();