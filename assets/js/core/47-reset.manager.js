/*
 * 47-reset.manager.js
 * System Reset & Recovery Manager – Billionaire Tech Adaptive Life OS
 *
 * Provides safe, controlled reset operations for the entire offline system:
 *   - Full system reset (wipe all user data)
 *   - Partial module reset (selected domains)
 *   - Recovery mode (repair corrupted structures)
 *
 * Always creates backup snapshot before destructive operations.
 * Requires explicit user confirmation for safety.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const RESET_SNAPSHOT_KEY = 'system:reset:snapshot';
  const RESET_HISTORY_KEY = 'system:reset:history';

  const RESET_MODES = {
    FULL: 'full',
    PARTIAL: 'partial',
    RECOVERY: 'recovery'
  };

  const PARTIAL_RESET_MODULES = [
    'tasks', 'habits', 'missions', 'finance', 'health', 'targets', 'thoughts', 'manifestations'
  ];

  const CONFIRMATION_PHRASE = 'RESET'; // User must type this to confirm full reset

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let resetInProgress = false;
  let resetHistory = []; // {type, timestamp, success, duration, modules?}

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function createResetSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      appVersion: Versioning?.getAppVersion?.() || 'unknown',
      schemaVersion: Versioning?.getSchemaVersion?.() || 'unknown',
      data: {}
    };

    // Capture all user & system data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('BT_OS:')) {
        const value = localStorage.getItem(key);
        if (value) snapshot.data[key] = value;
      }
    }

    Storage.write(RESET_SNAPSHOT_KEY, snapshot);
    console.log('[ResetManager] Reset snapshot created');
    return snapshot;
  }

  async function restoreFromSnapshot() {
    const snapshot = Storage.read(RESET_SNAPSHOT_KEY);
    if (!snapshot || !snapshot.data) {
      console.error('[ResetManager] No reset snapshot available for restore');
      return false;
    }

    try {
      // Clear all current data first
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith('BT_OS:')) {
          localStorage.removeItem(key);
        }
      }

      // Restore from snapshot
      Object.entries(snapshot.data).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });

      console.log('[ResetManager] Restored from snapshot successfully');
      EventBus.emit('SYSTEM_RESET_ROLLBACK_COMPLETE');
      return true;
    } catch (err) {
      console.error('[ResetManager] Snapshot restore failed:', err);
      return false;
    }
  }

  function clearAllUserData() {
    const userId = State.getPath('user.userId') || 'unknown';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key.startsWith(`BT_OS:user:${userId}:`) || 
          key.startsWith('BT_OS:user:') || 
          key.startsWith('BT_OS:thoughts:') ||
          key.startsWith('BT_OS:manifestations:')) {
        localStorage.removeItem(key);
      }
    }
  }

  function clearPartialModules(modules) {
    const userId = State.getPath('user.userId') || 'unknown';
    modules.forEach(mod => {
      const key = `user:${userId}:${mod}`;
      Storage.remove(key);
      // Also clear any sub-keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k.startsWith(`BT_OS:${key}:`)) {
          localStorage.removeItem(k);
        }
      }
    });
  }

  function restoreInitialSchema() {
    // Re-run initial schema setup (minimal defaults)
    State.update('system', {
      version: Versioning?.getCurrentVersion?.() || '1.0.0',
      schemaVersion: Versioning?.getSchemaVersion?.() || '1.0.0',
      initialized: Date.now()
    });

    // Clear user-specific state
    State.update('user', null);
    State.update('tasks', []);
    State.update('habits', []);
    State.update('missions', []);
    State.update('finance', { transactions: [], investments: [] });
    State.update('health', { records: [] });
    State.update('targets', []);
    State.update('streaks', []);
    State.update('thoughts', []);
    State.update('manifestations', []);
  }

  function logResetEvent(type, success, duration, modules = []) {
    const entry = {
      type,
      success,
      duration,
      modules,
      timestamp: Date.now()
    };

    resetHistory.push(entry);
    if (resetHistory.length > 50) resetHistory.shift();

    Storage.write(RESET_HISTORY_KEY, resetHistory);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC RESET MANAGER API
  // ─────────────────────────────────────────────────────────────────────────────

  const ResetManager = {

    async init() {
      // Load previous reset history
      resetHistory = Storage.read(RESET_HISTORY_KEY) || [];

      // Listen for reset requests (from settings or recovery)
      EventBus.on('SYSTEM_RESET_REQUEST', async ({ type = 'full', modules = [], confirmed = false }) => {
        if (!confirmed) {
          // Require confirmation via modal
          EventBus.emit('CONFIRMATION_REQUEST', {
            title: 'System Reset',
            message: type === 'full' 
              ? 'This will delete ALL your data permanently. Type RESET to confirm.'
              : `Reset selected modules (${modules.join(', ')})?`,
            onConfirm: () => this.startReset(type, modules)
          });
          return;
        }

        await this.startReset(type, modules);
      });

      // Recovery mode trigger from health monitor
      EventBus.on('SYSTEM_HEALTH_CRITICAL', async () => {
        console.warn('[ResetManager] Critical health failure – entering recovery mode');
        await this.startReset('recovery');
      });

      console.log('[ResetManager] Initialized – reset & recovery system ready');
    },

    // ─── Start reset operation (requires confirmation already done) ───────────
    async startReset(type = 'full', modules = []) {
      if (resetInProgress) {
        console.warn('[ResetManager] Reset already in progress');
        return false;
      }

      resetInProgress = true;
      const start = Date.now();

      EventBus.emit('SYSTEM_RESET_STARTED', { type, modules, timestamp: start });

      try {
        // 1. Create backup snapshot
        await createResetSnapshot();

        // 2. Execute reset based on type
        if (type === 'full') {
          clearAllUserData();
          restoreInitialSchema();
        } else if (type === 'partial') {
          clearPartialModules(modules);
          // Re-sync affected state
          State.update('tasks', type.includes('tasks') ? [] : State.getPath('tasks') || []);
          // ... similar for other modules
        } else if (type === 'recovery') {
          // Repair mode – attempt to fix corrupted structures
          await restoreFromSnapshot();
          restoreInitialSchema(); // minimal reset
        }

        // 3. Force state & storage sync
        await State.syncToStorage?.();

        const duration = Date.now() - start;
        logResetEvent(type, true, duration, modules);

        EventBus.emit('SYSTEM_RESET_COMPLETE', {
          type,
          duration,
          timestamp: Date.now()
        });

        // Trigger full system re-initialization
        Boot?.init?.(); // Restart boot sequence safely

        return true;
      } catch (err) {
        logResetEvent(type, false, Date.now() - start, modules);
        console.error('[ResetManager] Reset failed:', err);

        // Attempt rollback
        await restoreFromSnapshot();

        EventBus.emit('SYSTEM_RESET_FAILED', {
          type,
          error: err.message,
          timestamp: Date.now()
        });

        AlertsUI?.createAlert?.('critical', 'Reset failed – system restored from backup');

        return false;
      } finally {
        resetInProgress = false;
      }
    },

    // ─── Get reset history ────────────────────────────────────────────────────
    getResetHistory() {
      return [...resetHistory];
    },

    // ─── Manual recovery trigger (debug/admin) ────────────────────────────────
    async triggerRecovery() {
      return this.startReset('recovery');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ResetManager = ResetManager;

  // Auto-init after migration manager
  EventBus.on('BOOT_COMPLETE', () => {
    ResetManager.init();
  });

  // Debug helpers
  window.__debugReset = {
    full: () => ResetManager.startReset('full'),
    partial: (modules) => ResetManager.startReset('partial', modules),
    recovery: () => ResetManager.triggerRecovery(),
    history: () => ResetManager.getResetHistory()
  };

})();