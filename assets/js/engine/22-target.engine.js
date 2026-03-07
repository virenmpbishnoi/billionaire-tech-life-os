/*
 * 22-target.engine.js
 * Goal & Target Tracking Engine – Billionaire Tech Adaptive Life OS
 *
 * Manages quantifiable, measurable targets with deadlines and progress tracking:
 *   - Revenue goals, weight loss, savings targets, skill benchmarks, etc.
 *   - Progress updates & percentage completion
 *   - Deadline monitoring & overdue detection
 *   - Integration with score, rank, discipline, analytics
 *
 * Targets are the bridge between daily execution (tasks/habits) and long-term missions.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const TARGET_METRIC_TYPES = {
    numeric: 'numeric',           // e.g. 100 workouts
    percentage: 'percentage',     // e.g. 80% body fat reduction
    count: 'count',               // e.g. read 50 books
    currency: 'currency',         // e.g. save $50,000
    custom: 'custom'              // e.g. qualitative with manual progress
  };

  const TARGET_STATUS = {
    active: 'active',
    completed: 'completed',
    missed: 'missed',
    paused: 'paused'
  };

  const DEFAULT_TARGET = {
    targetId: null,
    userId: null,
    title: '',
    description: '',
    category: 'general',
    metricType: TARGET_METRIC_TYPES.numeric,
    targetValue: 0,
    currentValue: 0,
    progress: 0,                  // 0–100, derived
    createdAt: null,
    updatedAt: null,
    deadline: null,               // timestamp
    status: TARGET_STATUS.active,
    completedAt: null,
    reward: null,                 // { type: 'badge', id: '...' } or points
    linkedMissionId: null,        // optional link to mission
    notes: '',
    tags: []
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getTargetsKey(userId) {
    if (!userId) throw new Error('User ID required');
    return `user:${userId}:targets`;
  }

  function generateTargetId() {
    return 'target_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function validateTarget(target) {
    if (!target || typeof target !== 'object') {
      throw new Error('Invalid target object');
    }
    if (!target.targetId || !target.userId || !target.title?.trim()) {
      throw new Error('Target missing required fields: targetId, userId, title');
    }
    if (!Object.values(TARGET_METRIC_TYPES).includes(target.metricType)) {
      throw new Error(`Invalid metric type: ${target.metricType}`);
    }
    if (target.targetValue <= 0) {
      throw new Error('Target value must be positive');
    }
    if (target.currentValue < 0 || target.currentValue > target.targetValue) {
      throw new Error('Current value must be between 0 and target value');
    }
    if (target.progress !== undefined && (target.progress < 0 || target.progress > 100)) {
      throw new Error('Progress must be 0–100');
    }
    // Deeper schema validation via validation.engine
    // validation.engine.validate('target', target);
    return true;
  }

  function calculateProgress(target) {
    if (target.targetValue <= 0) return 0;
    return Math.min(100, Math.round((target.currentValue / target.targetValue) * 100));
  }

  function isTargetOverdue(target) {
    if (!target.deadline || target.status !== TARGET_STATUS.active) return false;
    return Date.now() > target.deadline && target.progress < 100;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC TARGET ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const TargetEngine = {

    async init() {
      // Load targets when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadTargets(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadTargets(userId);
      });

      // Listen for progress/completion requests from UI
      EventBus.on('TARGET_UPDATE_PROGRESS_REQUEST', ({ targetId, value }) => {
        this.updateProgress(targetId, value);
      });

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadTargets(userId);
      }

      // Periodic overdue check (every 6 hours)
      setInterval(() => this.detectOverdueTargets(), 6 * 60 * 60 * 1000);

      console.log('[TargetEngine] Initialized – tracking measurable performance objectives');
    },

    // ─── Load all targets for current user into state ─────────────────────────
    async loadTargets(userId) {
      const targetsKey = getTargetsKey(userId);
      let targets = Storage.read(targetsKey) || [];

      targets = targets.map(t => {
        try {
          validateTarget(t);
          return {
            ...DEFAULT_TARGET,
            ...t,
            progress: calculateProgress(t)
          };
        } catch (err) {
          console.warn('[TargetEngine] Invalid target filtered:', t.targetId, err.message);
          return null;
        }
      }).filter(Boolean);

      State.update('targets', targets);

      EventBus.emit('TARGETS_LOADED', {
        userId,
        count: targets.length,
        active: targets.filter(t => t.status === TARGET_STATUS.active).length
      });

      this.detectOverdueTargets();

      return targets;
    },

    // ─── Get all current targets (from state) ─────────────────────────────────
    getTargets() {
      return State.getPath('targets') || [];
    },

    getTargetById(targetId) {
      const targets = this.getTargets();
      return targets.find(t => t.targetId === targetId) || null;
    },

    // ─── Create new target ────────────────────────────────────────────────────
    async createTarget(targetData) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const target = {
        ...DEFAULT_TARGET,
        ...targetData,
        targetId: generateTargetId(),
        userId: user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: 0
      };

      validateTarget(target);

      const targets = this.getTargets();
      targets.push(target);

      State.update('targets', targets);
      await this.saveTargets();

      EventBus.emit('TARGET_CREATED', {
        targetId: target.targetId,
        title: target.title,
        metricType: target.metricType,
        targetValue: target.targetValue,
        deadline: target.deadline,
        timestamp: Date.now()
      });

      Recalculation?.trigger('TARGET_CREATED');

      return target;
    },

    // ─── Update existing target ───────────────────────────────────────────────
    async updateTarget(targetId, updates) {
      const targets = this.getTargets();
      const index = targets.findIndex(t => t.targetId === targetId);

      if (index === -1) throw new Error(`Target not found: ${targetId}`);

      const updatedTarget = {
        ...targets[index],
        ...updates,
        updatedAt: Date.now()
      };

      // Prevent changing targetId or userId
      delete updatedTarget.targetId;
      delete updatedTarget.userId;

      validateTarget(updatedTarget);

      // Recalculate progress if currentValue changed
      if (updates.currentValue !== undefined) {
        updatedTarget.progress = calculateProgress(updatedTarget);
      }

      targets[index] = updatedTarget;
      State.update('targets', targets);
      await this.saveTargets();

      EventBus.emit('TARGET_UPDATED', {
        targetId,
        changes: updates,
        progress: updatedTarget.progress,
        timestamp: Date.now()
      });

      EventBus.emit('TARGET_PROGRESS_UPDATED', {
        targetId,
        progress: updatedTarget.progress
      });

      Recalculation?.trigger('TARGET_UPDATED');

      return updatedTarget;
    },

    // ─── Update progress (specialized helper) ─────────────────────────────────
    async updateProgress(targetId, newValue) {
      const target = this.getTargetById(targetId);
      if (!target) throw new Error(`Target not found: ${targetId}`);

      if (newValue < 0 || newValue > target.targetValue) {
        throw new Error('Progress value out of range');
      }

      const progress = Math.round((newValue / target.targetValue) * 100);

      await this.updateTarget(targetId, {
        currentValue: newValue,
        progress
      });

      return progress;
    },

    // ─── Mark target as completed ─────────────────────────────────────────────
    async completeTarget(targetId) {
      const target = this.getTargetById(targetId);
      if (!target) throw new Error(`Target not found: ${targetId}`);

      if (target.status === TARGET_STATUS.completed) return target;

      const now = Date.now();
      const updated = {
        status: TARGET_STATUS.completed,
        completedAt: now,
        currentValue: target.targetValue,
        progress: 100,
        updatedAt: now
      };

      await this.updateTarget(targetId, updated);

      EventBus.emit('TARGET_COMPLETED', {
        targetId,
        userId: target.userId,
        completedAt: now,
        title: target.title,
        metricType: target.metricType
      });

      Recalculation?.trigger('TARGET_COMPLETED');

      return { ...target, ...updated };
    },

    // ─── Delete target ────────────────────────────────────────────────────────
    async deleteTarget(targetId) {
      const targets = this.getTargets();
      const filtered = targets.filter(t => t.targetId !== targetId);

      if (filtered.length === targets.length) {
        throw new Error(`Target not found for deletion: ${targetId}`);
      }

      State.update('targets', filtered);
      await this.saveTargets();

      EventBus.emit('TARGET_DELETED', {
        targetId,
        timestamp: Date.now()
      });

      Recalculation?.trigger('TARGET_DELETED');

      return true;
    },

    // ─── Overdue detection & signaling ────────────────────────────────────────
    detectOverdueTargets() {
      const targets = this.getTargets();
      const overdue = targets.filter(t => isTargetOverdue(t));

      if (overdue.length > 0) {
        overdue.forEach(t => {
          if (t.status === TARGET_STATUS.active) {
            EventBus.emit('TARGET_OVERDUE', {
              targetId: t.targetId,
              title: t.title,
              deadline: t.deadline,
              progress: t.progress
            });
          }
        });
      }

      return overdue;
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveTargets() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const targets = this.getTargets();
      const targetsKey = getTargetsKey(user.userId);

      Storage.write(targetsKey, targets);
    },

    // ─── Target statistics ────────────────────────────────────────────────────
    calculateTargetStats() {
      const targets = this.getTargets();
      const active = targets.filter(t => t.status === TARGET_STATUS.active);
      const completed = targets.filter(t => t.status === TARGET_STATUS.completed);

      return {
        totalTargets: targets.length,
        activeTargets: active.length,
        completedTargets: completed.length,
        completionRate: targets.length > 0 ? (completed.length / targets.length) * 100 : 0,
        averageProgress: active.length > 0
          ? active.reduce((sum, t) => sum + t.progress, 0) / active.length
          : 0,
        overdueCount: targets.filter(t => isTargetOverdue(t)).length
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.TargetEngine = TargetEngine;

  // Auto-init after health engine
  function tryInit() {
    if (window.HealthEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      TargetEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugTargets = {
    create: (data) => TargetEngine.createTarget(data),
    progress: (id, val) => TargetEngine.updateProgress(id, val),
    complete: (id) => TargetEngine.completeTarget(id),
    list: () => TargetEngine.getTargets(),
    stats: () => TargetEngine.calculateTargetStats(),
    overdue: () => TargetEngine.detectOverdueTargets()
  };

})();