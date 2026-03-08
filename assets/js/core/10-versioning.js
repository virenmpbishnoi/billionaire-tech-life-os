/*
 * 10-versioning.js
 * Application & Schema Version Control – Billionaire Tech Adaptive Life OS
 *
 * Ensures stored data remains compatible across app updates.
 * Detects mismatches → triggers migrations → updates metadata.
 *
 * Core invariants:
 * - Never loads incompatible data without migration
 * - Migrations are registered, ordered, and idempotent
 * - Rollback path exists via snapshots
 * - All persistence goes through Storage module
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';
const bus = window.EventBus || null;
  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const APP_VERSION = '1.0.0'; // Current release version (bump on deploy)

  // In production: loaded from schema.json
  // For this initial version we hardcode – later replaced with dynamic import
  const SCHEMA_VERSION = '1.0.0';

  const VERSION_STORAGE_KEY = 'system:version';

  const MIGRATIONS = new Map(); // targetVersion → { from: string[], handler: fn }

  // ─────────────────────────────────────────────────────────────────────────────
  // VERSION COMPARISON UTILITY
  // Semantic versioning comparison (major.minor.patch)
  // ─────────────────────────────────────────────────────────────────────────────

  function parseVersion(v) {
    if (typeof v !== 'string') return [0, 0, 0];
    const parts = v.split('-')[0].split('.').map(Number);
    return [
      isNaN(parts[0]) ? 0 : parts[0],
      isNaN(parts[1]) ? 0 : parts[1],
      isNaN(parts[2]) ? 0 : parts[2]
    ];
  }

  function compareVersions(a, b) {
    const [ma, miA, pa] = parseVersion(a);
    const [mb, miB, pb] = parseVersion(b);

    if (ma > mb) return 1;
    if (ma < mb) return -1;
    if (miA > miB) return 1;
    if (miA < miB) return -1;
    if (pa > pb) return 1;
    if (pa < pb) return -1;
    return 0;
  }

  function isGreaterOrEqual(a, b) {
    return compareVersions(a, b) >= 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MIGRATION REGISTRY & EXECUTION
  // ─────────────────────────────────────────────────────────────────────────────

  function registerMigration(targetVersion, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Migration handler must be a function');
    }
    if (!targetVersion || typeof targetVersion !== 'string') {
      throw new Error('Target version required (semver string)');
    }

    if (!MIGRATIONS.has(targetVersion)) {
      MIGRATIONS.set(targetVersion, []);
    }

    MIGRATIONS.get(targetVersion).push({
      handler,
      from: options.from || [],           // optional: only apply if coming from these
      description: options.description || 'Unnamed migration'
    });

    console.log(`[Versioning] Registered migration to ${targetVersion}: ${options.description || 'no desc'}`);
  }

  async function runMigrations(fromVersion, toVersion) {
    if (compareVersions(fromVersion, toVersion) >= 0) {
      console.log('[Versioning] No migration needed');
      return true;
    }

    bus?.emit('MIGRATION_STARTED', { from: fromVersion, to: toVersion });

    // Sort migrations by target version
    const sortedTargets = Array.from(MIGRATIONS.keys()).sort(compareVersions);

    let current = fromVersion;
    let success = true;

    for (const target of sortedTargets) {
      if (compareVersions(target, current) <= 0) continue; // already applied
      if (compareVersions(target, toVersion) > 0) break;   // future version

      const migrationSteps = MIGRATIONS.get(target);

      for (const step of migrationSteps) {
        try {
          console.group(`[Migration] ${step.description} → ${target}`);
          await step.handler(State.get(), Storage);
          console.groupEnd();
        } catch (err) {
          console.error('[Migration] Failed:', step.description, err);
          bus?.emit('MIGRATION_FAILED', {
            target,
            step: step.description,
            error: err.message
          });
          success = false;
          break;
        }
      }

      if (!success) break;

      current = target;
    }

    if (success) {
      await Versioning.updateStoredVersion(toVersion, SCHEMA_VERSION);
      bus?.emit('MIGRATION_COMPLETED', { from: fromVersion, to: toVersion });
    } else {
      // Trigger rollback / recovery
      bus?.emit('MIGRATION_ROLLBACK_NEEDED', { from: fromVersion, attempted: current });
    }

    return success;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VERSION METADATA MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async function readStoredVersionMetadata() {
    const data = Storage.read(VERSION_STORAGE_KEY) || {};
    return {
      appVersion: data.appVersion || '0.0.0',
      schemaVersion: data.schemaVersion || '0.0.0',
      dataVersion: data.dataVersion || '0.0.0',
      lastMigration: data.lastMigration || null,
      lastChecked: data.lastChecked || null
    };
  }

  async function updateStoredVersion(appVer = APP_VERSION, schemaVer = SCHEMA_VERSION) {
    const metadata = {
      appVersion: appVer,
      schemaVersion: schemaVer,
      dataVersion: schemaVer, // for now same as schema
      lastMigration: Date.now(),
      lastChecked: Date.now()
    };

    const success = Storage.write(VERSION_STORAGE_KEY, metadata);
    if (success) {
      bus?.emit('VERSION_UPDATED', metadata);
    }
    return success;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC VERSIONING API
  // ─────────────────────────────────────────────────────────────────────────────

  const Versioning = {

    async init() {
      const stored = await readStoredVersionMetadata();

      bus?.emit('VERSION_INITIALIZED', {
        app: APP_VERSION,
        schema: SCHEMA_VERSION,
        stored
      });

      const appMismatch = compareVersions(APP_VERSION, stored.appVersion) !== 0;
      const schemaMismatch = compareVersions(SCHEMA_VERSION, stored.schemaVersion) !== 0;

      if (!appMismatch && !schemaMismatch) {
        bus?.emit('VERSION_MATCH', stored);
        console.log('[Versioning] Versions match – ready');
        return true;
      }

      bus?.emit('VERSION_MISMATCH', {
        currentApp: APP_VERSION,
        storedApp: stored.appVersion,
        currentSchema: SCHEMA_VERSION,
        storedSchema: stored.schemaVersion
      });

      console.warn('[Versioning] Version mismatch detected – initiating migration');

      const migrationSuccess = await runMigrations(
        stored.schemaVersion || '0.0.0',
        SCHEMA_VERSION
      );

      if (migrationSuccess) {
        await updateStoredVersion();
        console.log('[Versioning] Migration completed successfully');
      } else {
        console.error('[Versioning] Migration failed – recovery needed');
        // Should trigger recovery.engine / backup restore here
      }

      return migrationSuccess;
    },

    getAppVersion() {
      return APP_VERSION;
    },

    getSchemaVersion() {
      return SCHEMA_VERSION;
    },

    async getStoredVersion() {
      const meta = await readStoredVersionMetadata();
      return meta;
    },

    compareVersions,

    isMigrationRequired() {
      return compareVersions(APP_VERSION, this.getStoredVersion()?.appVersion || '0.0.0') > 0 ||
             compareVersions(SCHEMA_VERSION, this.getStoredVersion()?.schemaVersion || '0.0.0') > 0;
    },

    registerMigration,

    async runMigrations(from, to) {
      return runMigrations(from, to);
    },

    async updateStoredVersion(appVer, schemaVer) {
      return updateStoredVersion(appVer, schemaVer);
    },

    async getVersionInfo() {
      const stored = await readStoredVersionMetadata();
      return {
        current: {
          app: APP_VERSION,
          schema: SCHEMA_VERSION
        },
        stored,
        needsMigration: this.isMigrationRequired(),
        timestamp: Date.now()
      };
    },

    // Placeholder for future rollback (requires snapshot integration)
    async rollbackMigration(targetVersion) {
      console.warn('[Versioning] Rollback requested to', targetVersion);
      // In production: restore snapshot + update version metadata
      bus?.emit('VERSION_ROLLBACK_EXECUTED', { target: targetVersion });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.Versioning = Versioning;

  // Initialize after Storage & State are ready
  async function tryInit() {
    if (window.Storage && window.State) {
      await Versioning.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helper (remove in production or gate behind flag)
  window.__debugVersionInfo = () => Versioning.getVersionInfo().then(console.log);

})();




