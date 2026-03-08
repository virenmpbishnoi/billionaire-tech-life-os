/*
 * 08-storage.js
 * Persistent Storage Backbone – Billionaire Tech Adaptive Life OS
 *
 * Single source of truth for all browser persistent data.
 * NO OTHER FILE may call localStorage / sessionStorage directly.
 *
 * Features:
 * - Per-user namespaced storage
 * - Schema-aware validation
 * - Atomic updates
 * - Corruption detection & recovery hooks
 * - Snapshots & backups
 * - Size monitoring
 * - Version tagging
 * - Event emission on major operations
 *
 * Version: 1.0.0 – March 2026
 * Deployment: GitHub Pages compatible (localStorage only)
 */
(function () {
'use strict';

const bus = window.EventBus;

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const PREFIX = 'BT_OS';
  const NAMESPACE_SEPARATOR = ':';
  const GLOBAL_NS = 'system';
  const CURRENT_SCHEMA_VERSION = '1.0.0';
  const CURRENT_APP_VERSION = '1.0.0';

  const STORAGE_KEYS = {
    SCHEMA_VERSION: `${PREFIX}${NAMESPACE_SEPARATOR}schemaVersion`,
    APP_VERSION: `${PREFIX}${NAMESPACE_SEPARATOR}appVersion`,
    LAST_SNAPSHOT: `${PREFIX}${NAMESPACE_SEPARATOR}lastSnapshot`,
    LAST_BACKUP_TIMESTAMP: `${PREFIX}${NAMESPACE_SEPARATOR}lastBackupTs`,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let readCache = new Map(); // key → {data, timestamp}

  const CACHE_TTL_MS = 30000; // 30 seconds – short-lived optimistic cache

  function getFullKey(key, userId = null) {
    if (!key) throw new Error('Storage key is required');

    if (userId) {
      return `${PREFIX}${NAMESPACE_SEPARATOR}user${NAMESPACE_SEPARATOR}${userId}${NAMESPACE_SEPARATOR}${key}`;
    }
    return `${PREFIX}${NAMESPACE_SEPARATOR}${key}`;
  }

  function isValidJSON(str) {
    if (typeof str !== 'string') return false;
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  function safeParse(jsonString, fallback = null) {
    if (!jsonString || typeof jsonString !== 'string') return fallback;
    try {
      return JSON.parse(jsonString);
    } catch (err) {
      console.error('[Storage] Parse failure:', err.message);
      bus?.emit('STORAGE_CORRUPTION_DETECTED', {
        reason: 'invalid_json',
        key: 'unknown',
        error: err.message
      });
      return fallback;
    }
  }

  function getCurrentUserId() {
    // Placeholder – real implementation should come from auth / user.engine
    return localStorage.getItem(getFullKey('currentUserId')) || 'anonymous';
  }

  function clearCache() {
    readCache.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VALIDATION & SCHEMA INTEGRATION STUBS
  // (Real implementation depends on validation.engine.js & schema.json)
  // ─────────────────────────────────────────────────────────────────────────────

  function validateData(key, data) {
    // Placeholder – called before every write
    // In production: validation.engine.validate(key, data)
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid data type for key "${key}"`);
    }
    return true;
  }

  function validateAfterRead(key, parsed) {
    // Basic structure check
    if (key.includes('tasks') && !Array.isArray(parsed)) return false;
    if (key.includes('habits') && !Array.isArray(parsed)) return false;
    // ... more rules delegated to validation.engine
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE STORAGE API
  // ─────────────────────────────────────────────────────────────────────────────

  const Storage = {

    // ─── Initialization ───────────────────────────────────────────────────────
    init() {
      // Ensure schema & version tags exist
      if (!localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION)) {
        localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
      }
      if (!localStorage.getItem(STORAGE_KEYS.APP_VERSION)) {
        localStorage.setItem(STORAGE_KEYS.APP_VERSION, CURRENT_APP_VERSION);
      }

      // Optional: run migration if versions differ
      const storedSchema = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
      if (storedSchema !== CURRENT_SCHEMA_VERSION) {
        console.warn('[Storage] Schema version mismatch – migration needed');
        // eventbus.emit('SCHEMA_MIGRATION_NEEDED', { from: storedSchema, to: CURRENT_SCHEMA_VERSION });
      }

      clearCache();
      console.log('[Storage] Initialized – schema v' + CURRENT_SCHEMA_VERSION);
    },

    // ─── Namespace Helpers ────────────────────────────────────────────────────
    getNamespace(userId = getCurrentUserId()) {
      return {
        prefix: `${PREFIX}${NAMESPACE_SEPARATOR}user${NAMESPACE_SEPARATOR}${userId}${NAMESPACE_SEPARATOR}`,
        userId
      };
    },

    // ─── Basic Read ───────────────────────────────────────────────────────────
    read(key, userId = null, options = { useCache: true }) {
      const fullKey = getFullKey(key, userId);
      const now = Date.now();

      // Cache hit check
      if (options.useCache) {
        const cached = readCache.get(fullKey);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          return cached.data;
        }
      }

      try {
        const raw = localStorage.getItem(fullKey);
        if (raw === null) return null;

        const parsed = safeParse(raw, null);
        if (parsed === null) {
          bus?.emit('STORAGE_CORRUPTION_DETECTED', { key: fullKey, reason: 'parse_failed' });
          return null;
        }

        // Post-read validation hook
        if (!validateAfterRead(key, parsed)) {
          console.warn('[Storage] Post-read validation failed for', fullKey);
          return null;
        }

        // Cache result
        readCache.set(fullKey, { data: parsed, timestamp: now });
        return parsed;
      } catch (err) {
        console.error('[Storage] Read error:', fullKey, err);
        bus?.emit('STORAGE_READ_FAILURE', { key: fullKey, error: err.message });
        return null;
      }
    },

    // ─── Safe Write ───────────────────────────────────────────────────────────
    write(key, data, userId = null) {
      const fullKey = getFullKey(key, userId);

      try {
        if (!validateData(key, data)) {
          throw new Error('Data validation failed');
        }

        const json = JSON.stringify(data);
        localStorage.setItem(fullKey, json);

        // Update cache
        readCache.set(fullKey, { data, timestamp: Date.now() });

        bus?.emit('STORAGE_WRITE_SUCCESS', {
          key: fullKey,
          size: json.length,
          timestamp: Date.now()
        });

        return true;
      } catch (err) {
        console.error('[Storage] Write failed:', fullKey, err);
        bus?.emit('STORAGE_WRITE_FAILURE', {
          key: fullKey,
          error: err.message,
          quotaExceeded: err.name === 'QuotaExceededError'
        });

        if (err.name === 'QuotaExceededError') {
          // Trigger cleanup / warning in system.health.engine
        }

        return false;
      }
    },

    // ─── Atomic Update (recommended pattern) ──────────────────────────────────
    update(key, updaterFn, userId = null) {
      const current = this.read(key, userId, { useCache: false }) || {};
      let next;

      try {
        next = updaterFn(current);

        if (next === undefined || next === current) {
          console.warn('[Storage] Update returned same/undefined value – skipping write');
          return false;
        }

        return this.write(key, next, userId);
      } catch (err) {
        console.error('[Storage] Update failed:', key, err);
        bus?.emit('STORAGE_UPDATE_FAILURE', { key, error: err.message });
        return false;
      }
    },

    // ─── Remove & Exists ──────────────────────────────────────────────────────
    remove(key, userId = null) {
      const fullKey = getFullKey(key, userId);
      localStorage.removeItem(fullKey);
      readCache.delete(fullKey);
      bus?.emit('STORAGE_KEY_REMOVED', { key: fullKey });
    },

    exists(key, userId = null) {
      return localStorage.getItem(getFullKey(key, userId)) !== null;
    },

    // ─── Bulk / User Management ───────────────────────────────────────────────
    clearUser(userId) {
      const prefix = `${PREFIX}${NAMESPACE_SEPARATOR}user${NAMESPACE_SEPARATOR}${userId}${NAMESPACE_SEPARATOR}`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          localStorage.removeItem(key);
          readCache.delete(key);
        }
      }
      bus?.emit('STORAGE_USER_CLEARED', { userId });
    },

    // ─── Snapshots & Backup ───────────────────────────────────────────────────
    createSnapshot() {
      const snapshot = {
        timestamp: Date.now(),
        appVersion: CURRENT_APP_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {}
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) {
          const value = localStorage.getItem(key);
          if (isValidJSON(value)) {
            snapshot.data[key] = value;
          }
        }
      }

      const snapshotKey = `${PREFIX}${NAMESPACE_SEPARATOR}snapshots${NAMESPACE_SEPARATOR}${Date.now()}`;
      this.write('lastSnapshot', snapshot);
      localStorage.setItem(snapshotKey, JSON.stringify(snapshot));

      bus?.emit('STORAGE_BACKUP_CREATED', {
        timestamp: snapshot.timestamp,
        size: JSON.stringify(snapshot).length
      });

      return snapshot;
    },

    restoreSnapshot(snapshotOrTimestamp) {
      let snapshot;

      if (typeof snapshotOrTimestamp === 'number') {
        // timestamp lookup – stub
        snapshot = this.read('lastSnapshot');
      } else {
        snapshot = snapshotOrTimestamp;
      }

      if (!snapshot || !snapshot.data) {
        throw new Error('Invalid snapshot');
      }

      // Clear current user data first (safety)
      this.clearUser(getCurrentUserId());

      Object.entries(snapshot.data).forEach(([key, value]) => {
        if (isValidJSON(value)) {
          localStorage.setItem(key, value);
        }
      });

      bus?.emit('STORAGE_RESTORE_SUCCESS', {
        timestamp: snapshot.timestamp,
        keysRestored: Object.keys(snapshot.data).length
      });

      clearCache();
    },

    // ─── Utilities ────────────────────────────────────────────────────────────
    getStorageSize() {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) {
          total += (localStorage.getItem(key)?.length || 0) * 2; // UTF-16 approx
        }
      }
      return total; // bytes
    },

    listKeys(userId = null) {
      const prefix = userId
        ? `${PREFIX}${NAMESPACE_SEPARATOR}user${NAMESPACE_SEPARATOR}${userId}${NAMESPACE_SEPARATOR}`
        : PREFIX;

      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    },

    detectCorruption() {
      let issues = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) {
          const value = localStorage.getItem(key);
          if (!isValidJSON(value)) {
            issues.push({ key, reason: 'invalid_json' });
          }
        }
      }
      if (issues.length > 0) {
        bus?.emit('STORAGE_CORRUPTION_DETECTED', { issues });
      }
      return issues;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE
  // ─────────────────────────────────────────────────────────────────────────────

  window.Storage = Storage;

  // Auto-init on load
  Storage.init();

  // Periodic health check (every 5 minutes)
  setInterval(() => {
    Storage.detectCorruption();
    const size = Storage.getStorageSize();
    if (size > 4_000_000) { // ~4MB warning
      bus?.emit('STORAGE_QUOTA_WARNING', { size });
    }
  }, 300_000);

})();


