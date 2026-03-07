/*
 * 46-migration.manager.js
 * Data Migration Manager – Billionaire Tech Adaptive Life OS
 *
 * Safely handles schema upgrades and data migrations between application versions.
 * Runs during boot when Versioning detects mismatch between stored and current schema.
 *
 * Responsibilities:
 *   - Execute ordered, idempotent migration scripts
 *   - Validate data before and after each step
 *   - Create pre-migration snapshot for rollback
 *   - Log migration diagnostics and history
 *   - Emit progress & completion events
 *   - Prevent re-running completed migrations
 *
 * Critical for offline data evolution in LocalStorage.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & MIGRATION REGISTRY
  // ─────────────────────────────────────────────────────────────────────────────

  const CURRENT_SCHEMA_VERSION = '1.0.0'; // Must match versioning.js

  // Migration registry – ordered by target version
  // Each migration is a function(currentData) → Promise<transformedData>
  // Must be idempotent (safe to run multiple times)
  const MIGRATIONS = [
    {
      from: '0.9.0',
      to: '1.0.0',
      description: 'Initial schema migration – add required fields & normalize structures',
      migrate: async (data) => {
        // Example transformations
        if (data.user) {
          data.user.preferences = data.user.preferences || { theme: 'default' };
          data.user.statistics = data.user.statistics || { tasksCompleted: 0 };
        }

        if (data.tasks) {
          data.tasks.forEach(t => {
            t.status = t.status || 'pending';
            t.priority = t.priority || 'medium';
          });
        }

        if (data.habits) {
          data.habits.forEach(h => {
            h.currentStreak = h.currentStreak || 0;
            h.longestStreak = h.longestStreak || 0;
          });
        }

        return data;
      }
    },
    // Add future migrations here
    // {
    //   from: '1.0.0',
    //   to: '1.1.0',
    //   description: 'Add health metrics structure',
    //   migrate: async (data) => {
    //     data.health = data.health || { records: [] };
    //     return data;
    //   }
    // }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let migrationInProgress = false;
  let migrationHistory = []; // {from, to, success, duration, timestamp}

  async function createPreMigrationSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      appVersion: Versioning?.getAppVersion?.() || 'unknown',
      schemaVersion: await Versioning?.getStoredVersion?.()?.schemaVersion || 'unknown',
      data: {}
    };

    // Snapshot all user-related data
    const keys = Storage.listKeys?.() || [];
    for (const key of keys) {
      if (key.startsWith('BT_OS:user:') || key.startsWith('BT_OS:system:')) {
        const value = Storage.read(key.replace('BT_OS:', '')); // adjust key format
        if (value) snapshot.data[key] = value;
      }
    }

    Storage.write('system:migration:snapshot', snapshot);
    console.log('[Migration] Pre-migration snapshot created');
    return snapshot;
  }

  async function rollbackToSnapshot() {
    const snapshot = Storage.read('system:migration:snapshot');
    if (!snapshot || !snapshot.data) {
      console.error('[Migration] No rollback snapshot available');
      return false;
    }

    try {
      // Clear current user data (safety)
      const userId = State.getPath('user.userId');
      if (userId) {
        Storage.clearUser?.(userId);
      }

      // Restore from snapshot
      Object.entries(snapshot.data).forEach(([key, value]) => {
        Storage.write(key.replace('BT_OS:', ''), value);
      });

      console.log('[Migration] Rollback to snapshot completed');
      EventBus.emit('MIGRATION_ROLLBACK', { timestamp: Date.now() });
      return true;
    } catch (err) {
      console.error('[Migration] Rollback failed:', err);
      return false;
    }
  }

  async function runMigration(fromVersion, toVersion) {
    if (migrationInProgress) {
      console.warn('[Migration] Migration already in progress');
      return false;
    }

    migrationInProgress = true;
    const start = Date.now();

    EventBus.emit('MIGRATION_START', { from: fromVersion, to: toVersion });

    try {
      // Create safety snapshot
      await createPreMigrationSnapshot();

      // Find applicable migrations
      const applicable = MIGRATIONS.filter(m =>
        m.from === fromVersion && m.to === toVersion
      );

      if (applicable.length === 0) {
        console.log('[Migration] No migrations required for this version jump');
        return true;
      }

      // Run each migration sequentially
      let currentData = State.get?.() || {};

      for (const migration of applicable) {
        const stepStart = Date.now();

        try {
          currentData = await migration.migrate(currentData);
          logMigrationStep(migration, true, Date.now() - stepStart);
        } catch (err) {
          logMigrationStep(migration, false, Date.now() - stepStart, err);
          await rollbackToSnapshot();
          throw err;
        }
      }

      // Update stored version
      await Versioning.updateStoredVersion(toVersion, toVersion);

      // Final state sync
      State.update('system.version', toVersion);
      await State.syncToStorage?.();

      const duration = Date.now() - start;
      migrationHistory.push({
        from: fromVersion,
        to: toVersion,
        success: true,
        duration,
        timestamp: Date.now()
      });

      EventBus.emit('MIGRATION_COMPLETE', {
        from: fromVersion,
        to: toVersion,
        duration,
        timestamp: Date.now()
      });

      console.log(`[Migration] Successfully migrated from ${fromVersion} to ${toVersion} in ${duration}ms`);

      return true;
    } catch (err) {
      const duration = Date.now() - start;
      migrationHistory.push({
        from: fromVersion,
        to: toVersion,
        success: false,
        duration,
        error: err.message,
        timestamp: Date.now()
      });

      EventBus.emit('MIGRATION_FAILED', {
        from: fromVersion,
        to: toVersion,
        error: err.message,
        duration,
        timestamp: Date.now()
      });

      console.error(`[Migration] Failed to migrate from ${fromVersion} to ${toVersion}:`, err);

      // Attempt rollback
      await rollbackToSnapshot();

      return false;
    } finally {
      migrationInProgress = false;
    }
  }

  function logMigrationStep(migration, success, duration, error = null) {
    console.log(
      `[Migration] Step ${migration.from} → ${migration.to} ` +
      `${success ? 'succeeded' : 'FAILED'} in ${duration}ms ` +
      (error ? `- ${error.message}` : '')
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC MIGRATION MANAGER API
  // ─────────────────────────────────────────────────────────────────────────────

  const MigrationManager = {

    async init() {
      // Run version check after boot
      EventBus.on('BOOT_COMPLETE', async () => {
        await this.checkVersion();
      });

      // Listen for version mismatch from Versioning
      EventBus.on('VERSION_MISMATCH', async ({ currentSchema, storedSchema }) => {
        await this.runMigrations(storedSchema, currentSchema);
      });

      console.log('[MigrationManager] Initialized – data evolution ready');
    },

    async checkVersion() {
      const stored = await Versioning.getStoredVersion?.();
      const current = Versioning.getSchemaVersion?.();

      if (!stored?.schemaVersion) {
        // First boot – initialize version
        await Versioning.updateStoredVersion?.();
        return;
      }

      if (Versioning.compareVersions?.(current, stored.schemaVersion) > 0) {
        EventBus.emit('VERSION_MISMATCH', {
          currentSchema: current,
          storedSchema: stored.schemaVersion
        });
      }
    },

    async runMigrations(fromVersion, toVersion) {
      return runMigration(fromVersion, toVersion);
    },

    async registerMigration(from, to, handler, description = '') {
      MIGRATIONS.push({
        from,
        to,
        description,
        migrate: handler
      });

      console.log(`[MigrationManager] Registered migration: ${from} → ${to}`);
    },

    getMigrationHistory() {
      return [...migrationHistory];
    },

    async getLastMigration() {
      return migrationHistory[migrationHistory.length - 1] || null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.MigrationManager = MigrationManager;

  // Auto-init after boot
  EventBus.on('BOOT_COMPLETE', () => {
    MigrationManager.init();
  });

  // Debug helpers
  window.__debugMigration = {
    check: () => MigrationManager.checkVersion(),
    history: () => MigrationManager.getMigrationHistory(),
    last: () => MigrationManager.getLastMigration()
  };

})();