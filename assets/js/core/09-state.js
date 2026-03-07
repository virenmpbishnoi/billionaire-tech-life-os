/*
 * 09-state.js
 * Central In-Memory State Manager – Billionaire Tech Adaptive Life OS
 *
 * Single source of truth for all runtime application state.
 * Loaded from persistent storage on init → mutated immutably → synced back.
 *
 * Philosophy:
 * - Immutable updates only
 * - Path-based partial updates
 * - Subscription-based reactivity
 * - Dirty tracking for sync optimization
 * - Safe deep cloning & diffing
 * - No direct mutations allowed outside API
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE STATE & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  let currentState = null;          // The live immutable state object
  let previousState = null;         // For diffing & rollback on error
  let isDirty = false;              // Flag: unsynced changes exist
  let subscribers = new Set();      // { callback, options }

  const DEFAULT_STATE_STRUCTURE = {
    user: null,                     // { id, name, email, preferences, ... }
    tasks: [],                      // Array<Task>
    habits: [],                     // Array<Habit>
    missions: [],                   // Array<Mission>
    finance: { balance: 0, history: [] },
    health: { energy: 100, stress: 0, },
    targets: [],                    // Array<Target>
    streak: { current: 0, longest: 0, history: [] },
    score: { total: 0, breakdown: {} },
    discipline: { index: 0, history: [] },
    risk: { level: 'low', factors: {} },
    burnout: { risk: 0, lastCheck: null },
    rank: { current: 'beginner', xp: 0, nextThreshold: 1000 },
    badges: [],                     // Array<Badge>
    focus: { sessions: [], currentSession: null },
    thoughts: [],                   // Array<ThoughtEntry>
    notifications: [],              // Array<Notification>
    analytics: { daily: {}, weekly: {}, monthly: {} },
    system: { theme: 'default', lockdown: false, lastSync: null }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, deepClone(v)])
    );
  }

  function getByPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => {
      return acc && acc[part] !== undefined ? acc[part] : undefined;
    }, obj);
  }

  function setByPath(obj, path, value) {
    if (!path) return { ...obj, ...value };
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((acc, part) => {
      if (!acc[part] || typeof acc[part] !== 'object') acc[part] = {};
      return acc[part];
    }, { ...obj }); // shallow copy root
    target[last] = value;
    return target;
  }

  function simpleDiff(oldObj, newObj) {
    const changes = [];
    function recurse(o, n, prefix = '') {
      if (o === n) return;
      if (typeof o !== 'object' || typeof n !== 'object' || o === null || n === null) {
        changes.push({ path: prefix, old: o, new: n });
        return;
      }
      const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
      for (const key of keys) {
        const newPath = prefix ? `${prefix}.${key}` : key;
        recurse(o[key], n[key], newPath);
      }
    }
    recurse(oldObj, newObj);
    return changes;
  }

  function notifySubscribers(changeInfo) {
    subscribers.forEach(({ callback, options }) => {
      if (options?.once && changeInfo.onceTriggered) return;
      try {
        callback(currentState, previousState, changeInfo);
      } catch (err) {
        console.error('[State] Subscriber error:', err);
      }
      if (options?.once) changeInfo.onceTriggered = true;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC STATE API
  // ─────────────────────────────────────────────────────────────────────────────

  const State = {

    // ─── Initialization ───────────────────────────────────────────────────────
    async init() {
      if (currentState !== null) {
        console.warn('[State] Already initialized');
        return;
      }

      // Load from storage
      let loaded = Storage.read('appState') || deepClone(DEFAULT_STATE_STRUCTURE);

      // Basic structure validation (full schema check in validation.engine)
      if (!loaded || typeof loaded !== 'object') {
        console.error('[State] Loaded state invalid – using default');
        loaded = deepClone(DEFAULT_STATE_STRUCTURE);
      }

      currentState = loaded;
      previousState = deepClone(loaded);
      isDirty = false;

      // Initial sync timestamp
      this.update('system.lastSync', () => Date.now(), { silent: true });

      eventbus?.emit('STATE_INITIALIZED', { timestamp: Date.now() });
      console.log('[State] Initialized – loaded', Object.keys(currentState).length, 'top-level keys');
    },

    // ─── Getters ──────────────────────────────────────────────────────────────
    get() {
      return deepClone(currentState);
    },

    getPath(path) {
      return deepClone(getByPath(currentState, path));
    },

    // ─── Immutable Updates ────────────────────────────────────────────────────
    update(path, updater, options = {}) {
      if (!currentState) throw new Error('[State] Not initialized');

      const oldValue = getByPath(currentState, path);
      let newValue;

      try {
        newValue = updater(oldValue);

        if (newValue === undefined || newValue === oldValue) {
          console.warn('[State] Update returned same/undefined – skipping');
          return false;
        }

        // Optional validation hook (delegated to validation.engine in production)
        // validation.engine.validatePath(path, newValue);

        previousState = deepClone(currentState);
        currentState = setByPath(currentState, path, newValue);

        if (!options.silent) {
          isDirty = true;
          const diff = simpleDiff(previousState, currentState);
          eventbus?.emit('STATE_UPDATED', {
            path,
            previous: oldValue,
            next: newValue,
            diff,
            timestamp: Date.now()
          });
          notifySubscribers({ path, diff });
        }

        return true;
      } catch (err) {
        console.error('[State] Update failed at path:', path, err);
        eventbus?.emit('STATE_ERROR', { path, error: err.message });
        // Revert on fatal error
        currentState = deepClone(previousState);
        return false;
      }
    },

    // ─── Merge partial state (top-level only) ─────────────────────────────────
    merge(partial, options = {}) {
      if (!partial || typeof partial !== 'object') return false;

      previousState = deepClone(currentState);
      currentState = { ...currentState, ...partial };

      if (!options.silent) {
        isDirty = true;
        const diff = simpleDiff(previousState, currentState);
        eventbus?.emit('STATE_UPDATED', {
          type: 'merge',
          diff,
          timestamp: Date.now()
        });
        notifySubscribers({ type: 'merge', diff });
      }

      return true;
    },

    // ─── Reset & Dirty Management ─────────────────────────────────────────────
    reset() {
      previousState = deepClone(currentState);
      currentState = deepClone(DEFAULT_STATE_STRUCTURE);
      isDirty = true;
      eventbus?.emit('STATE_RESET', { timestamp: Date.now() });
      notifySubscribers({ type: 'reset' });
    },

    markDirty() {
      isDirty = true;
      eventbus?.emit('STATE_DIRTY', { timestamp: Date.now() });
    },

    clearDirty() {
      isDirty = false;
      eventbus?.emit('STATE_SYNCED', { timestamp: Date.now() });
    },

    isDirty() {
      return isDirty;
    },

    // ─── Subscriptions ────────────────────────────────────────────────────────
    subscribe(callback, options = {}) {
      if (typeof callback !== 'function') throw new Error('Subscriber must be function');
      subscribers.add({ callback, options });
      // Immediate call with current state (common pattern)
      if (options?.immediate !== false) {
        callback(currentState, previousState, { type: 'init' });
      }
      return () => subscribers.delete({ callback, options });
    },

    unsubscribe(callback) {
      for (const sub of subscribers) {
        if (sub.callback === callback) {
          subscribers.delete(sub);
          break;
        }
      }
    },

    // ─── Utilities ────────────────────────────────────────────────────────────
    cloneState() {
      return deepClone(currentState);
    },

    diff() {
      return simpleDiff(previousState || {}, currentState);
    },

    // ─── Storage Sync (called by engines / background tasks) ──────────────────
    async syncToStorage() {
      if (!isDirty) return true;

      try {
        const success = Storage.write('appState', currentState);
        if (success) {
          this.clearDirty();
          eventbus?.emit('STATE_SYNCED', { timestamp: Date.now() });
          return true;
        }
        return false;
      } catch (err) {
        console.error('[State] Sync failed:', err);
        eventbus?.emit('STATE_SYNC_ERROR', { error: err.message });
        return false;
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE
  // ─────────────────────────────────────────────────────────────────────────────

  window.State = State;

  // Auto-init after Storage is ready
  if (window.Storage) {
    State.init();
  } else {
    console.warn('[State] Storage not found – delaying init');
    const interval = setInterval(() => {
      if (window.Storage) {
        State.init();
        clearInterval(interval);
      }
    }, 100);
  }

  // Periodic dirty check & auto-sync (every 30s if dirty)
  setInterval(() => {
    if (State.isDirty()) {
      State.syncToStorage();
    }
  }, 30000);


})();

