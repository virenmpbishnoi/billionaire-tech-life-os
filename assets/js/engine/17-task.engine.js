/*
 * 17-task.engine.js
 * Task Execution Management Engine – Billionaire Tech Adaptive Life OS
 *
 * Core engine for managing actionable tasks:
 *   - Creation, update, completion, deletion
 *   - Priority & deadline handling
 *   - Progress tracking
 *   - Completion analytics
 *   - Integration with discipline, score, rank, badge systems
 *
 * All task operations MUST go through this engine.
 * Direct storage/state mutation forbidden outside API.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const TASK_PRIORITY_LEVELS = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  const TASK_STATUS = {
    pending: 'pending',
    in_progress: 'in_progress',
    completed: 'completed',
    cancelled: 'cancelled'
  };

  const DEFAULT_TASK = {
    taskId: null,
    userId: null,
    title: '',
    description: '',
    status: TASK_STATUS.pending,
    priority: 'medium',
    progress: 0,              // 0–100
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    deadline: null,
    category: 'general',
    tags: [],
    recurring: false,
    recurrencePattern: null   // e.g. { type: 'daily', interval: 1 }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getTasksKey(userId) {
    if (!userId) throw new Error('User ID required');
    return `user:${userId}:tasks`;
  }

  function generateTaskId() {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function validateTask(task) {
    if (!task || typeof task !== 'object') {
      throw new Error('Invalid task object');
    }
    if (!task.taskId || !task.userId || !task.title?.trim()) {
      throw new Error('Task missing required fields: taskId, userId, title');
    }
    if (task.priority && !Object.keys(TASK_PRIORITY_LEVELS).includes(task.priority)) {
      throw new Error(`Invalid priority: ${task.priority}`);
    }
    if (task.status && !Object.values(TASK_STATUS).includes(task.status)) {
      throw new Error(`Invalid status: ${task.status}`);
    }
    if (task.progress !== undefined && (task.progress < 0 || task.progress > 100)) {
      throw new Error('Progress must be between 0 and 100');
    }
    // Deeper schema validation delegated to validation.engine
    // validation.engine.validate('task', task);
    return true;
  }

  function normalizeTask(task) {
    return {
      ...DEFAULT_TASK,
      ...task,
      createdAt: task.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC TASK ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const TaskEngine = {

    async init() {
      // Load tasks for current user on boot / login
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadTasks(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadTasks(userId);
      });

      // Listen for completion from UI/other sources
      EventBus.on('TASK_COMPLETE_REQUEST', ({ taskId }) => {
        this.completeTask(taskId);
      });

      // Initial load if user already authenticated
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadTasks(userId);
      }

      console.log('[TaskEngine] Initialized – ready to manage execution tasks');
    },

    // ─── Load all tasks for current user into state ───────────────────────────
    async loadTasks(userId) {
      const tasksKey = getTasksKey(userId);
      let tasks = Storage.read(tasksKey) || [];

      // Validate & normalize loaded tasks
      tasks = tasks.map(t => {
        try {
          validateTask(t);
          return normalizeTask(t);
        } catch (err) {
          console.warn('[TaskEngine] Invalid task filtered:', t.taskId, err.message);
          return null;
        }
      }).filter(Boolean);

      State.update('tasks', tasks);

      EventBus.emit('TASKS_LOADED', {
        userId,
        count: tasks.length,
        completed: tasks.filter(t => t.status === TASK_STATUS.completed).length
      });

      return tasks;
    },

    // ─── Get all current tasks (from state) ───────────────────────────────────
    getTasks() {
      return State.getPath('tasks') || [];
    },

    getTaskById(taskId) {
      const tasks = this.getTasks();
      return tasks.find(t => t.taskId === taskId) || null;
    },

    // ─── Create new task ──────────────────────────────────────────────────────
    async createTask(taskData) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const task = normalizeTask({
        ...taskData,
        taskId: generateTaskId(),
        userId: user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      validateTask(task);

      const tasks = this.getTasks();
      tasks.push(task);

      State.update('tasks', tasks);
      await this.saveTasks();

      EventBus.emit('TASK_CREATED', {
        taskId: task.taskId,
        title: task.title,
        priority: task.priority,
        deadline: task.deadline,
        timestamp: Date.now()
      });

      // Trigger recalculation immediately
      Recalculation?.trigger('TASK_CREATED');

      return task;
    },

    // ─── Update existing task ─────────────────────────────────────────────────
    async updateTask(taskId, updates) {
      const tasks = this.getTasks();
      const index = tasks.findIndex(t => t.taskId === taskId);

      if (index === -1) throw new Error(`Task not found: ${taskId}`);

      const updatedTask = {
        ...tasks[index],
        ...updates,
        updatedAt: Date.now()
      };

      validateTask(updatedTask);

      tasks[index] = updatedTask;
      State.update('tasks', tasks);
      await this.saveTasks();

      EventBus.emit('TASK_UPDATED', {
        taskId,
        changes: updates,
        timestamp: Date.now()
      });

      Recalculation?.trigger('TASK_UPDATED');

      return updatedTask;
    },

    // ─── Mark task as completed ───────────────────────────────────────────────
    async completeTask(taskId) {
      const task = this.getTaskById(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      if (task.status === TASK_STATUS.completed) return task;

      const now = Date.now();
      const updated = {
        status: TASK_STATUS.completed,
        completedAt: now,
        progress: 100,
        updatedAt: now
      };

      await this.updateTask(taskId, updated);

      EventBus.emit('TASK_COMPLETED', {
        taskId,
        userId: task.userId,
        completedAt: now,
        title: task.title,
        priority: task.priority
      });

      // Trigger full recalculation pipeline
      Recalculation?.trigger('TASK_COMPLETED');

      return { ...task, ...updated };
    },

    // ─── Delete task ──────────────────────────────────────────────────────────
    async deleteTask(taskId) {
      const tasks = this.getTasks();
      const filtered = tasks.filter(t => t.taskId !== taskId);

      if (filtered.length === tasks.length) {
        throw new Error(`Task not found for deletion: ${taskId}`);
      }

      State.update('tasks', filtered);
      await this.saveTasks();

      EventBus.emit('TASK_DELETED', {
        taskId,
        timestamp: Date.now()
      });

      Recalculation?.trigger('TASK_DELETED');

      return true;
    },

    // ─── Priority update helper ───────────────────────────────────────────────
    async updatePriority(taskId, priority) {
      if (!Object.keys(TASK_PRIORITY_LEVELS).includes(priority)) {
        throw new Error(`Invalid priority level: ${priority}`);
      }
      await this.updateTask(taskId, { priority });
      EventBus.emit('TASK_PRIORITY_CHANGED', { taskId, priority });
      return priority;
    },

    // ─── Deadline update helper ───────────────────────────────────────────────
    async updateDeadline(taskId, deadline) {
      let parsedDeadline = null;
      if (deadline) {
        parsedDeadline = new Date(deadline).getTime();
        if (isNaN(parsedDeadline)) throw new Error('Invalid deadline format');
      }
      await this.updateTask(taskId, { deadline: parsedDeadline });
      EventBus.emit('TASK_DEADLINE_UPDATED', { taskId, deadline: parsedDeadline });
      return parsedDeadline;
    },

    // ─── Persistence & sync ───────────────────────────────────────────────────
    async saveTasks() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const tasks = this.getTasks();
      const tasksKey = getTasksKey(user.userId);

      Storage.write(tasksKey, tasks);

      // Optional: update user statistics (completion count etc.)
      UserEngine?.incrementStat('tasksCompleted', tasks.filter(t => t.status === TASK_STATUS.completed).length);
    },

    // ─── Analytics helpers ────────────────────────────────────────────────────
    getTaskStats() {
      const tasks = this.getTasks();
      const completed = tasks.filter(t => t.status === TASK_STATUS.completed);
      const pending = tasks.filter(t => t.status === TASK_STATUS.pending);
      const overdue = tasks.filter(t => t.deadline && t.deadline < Date.now() && t.status !== TASK_STATUS.completed);

      return {
        total: tasks.length,
        completed: completed.length,
        pending: pending.length,
        overdue: overdue.length,
        completionRate: tasks.length > 0 ? (completed.length / tasks.length) * 100 : 0
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.TaskEngine = TaskEngine;

  // Auto-init after user engine (which provides user context)
  function tryInit() {
    if (window.UserEngine && window.Storage && window.State && window.EventBus) {
      TaskEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers (remove/gate in production)
  window.__debugTasks = {
    create: (data) => TaskEngine.createTask(data),
    complete: (id) => TaskEngine.completeTask(id),
    list: () => TaskEngine.getTasks(),
    stats: () => TaskEngine.getTaskStats()
  };

})();