/*
 * 45-system.health.js
 * System Health Monitor – Billionaire Tech Adaptive Life OS
 *
 * Continuously verifies operational integrity of the entire system at runtime.
 * Monitors:
 *   - Core infrastructure (storage, state, versioning, eventbus, recalc)
 *   - Engine layer availability
 *   - Intelligence engine responsiveness
 *   - UI module presence
 *   - Storage integrity & quota
 *   - Event bus latency
 *
 * Emits health status events for alerts, analytics, and recovery triggers.
 * Runs periodic checks (every 60s) + on-demand diagnostics.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────────

  const CHECK_INTERVAL_MS = 60000;      // every 60 seconds
  const CRITICAL_TIMEOUT_MS = 5000;     // max acceptable latency/response time
  const WARNING_THRESHOLD = 3000;       // warning if >3s
  const STORAGE_TEST_KEY = 'system:health:test';
  const MAX_STORAGE_QUOTA_WARNING = 4 * 1024 * 1024; // ~4MB warning

  const HEALTH_STATUSES = {
    OK: 'OK',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL'
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let lastCheckTime = 0;
  let checkInterval = null;
  let healthStatus = HEALTH_STATUSES.OK;
  let lastDiagnostics = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // HEALTH CHECK HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function checkCoreModules() {
    const core = {
      Storage: !!window.Storage?.read,
      State: !!window.State?.get,
      Versioning: !!window.Versioning?.getStoredVersion,
      EventBus: !!window.EventBus?.emit,
      Recalculation: !!window.Recalculation?.trigger
    };

    const missing = Object.entries(core).filter(([_, ok]) => !ok).map(([name]) => name);

    return {
      status: missing.length === 0 ? HEALTH_STATUSES.OK : HEALTH_STATUSES.CRITICAL,
      missing,
      message: missing.length === 0 ? 'All core modules present' : `Missing: ${missing.join(', ')}`
    };
  }

  function checkEngineLayer() {
    const engines = [
      'UserEngine', 'TaskEngine', 'HabitEngine', 'MissionEngine',
      'FinanceEngine', 'HealthEngine', 'TargetEngine', 'StreakEngine'
    ];

    const missing = engines.filter(name => !window[name]?.init);

    return {
      status: missing.length === 0 ? HEALTH_STATUSES.OK : HEALTH_STATUSES.WARNING,
      missing,
      message: missing.length === 0 ? 'All primary engines registered' : `Missing engines: ${missing.join(', ')}`
    };
  }

  function checkIntelligenceEngines() {
    const intel = [
      'ScoreEngine', 'DisciplineEngine', 'WealthEngine', 'RiskEngine',
      'BurnoutEngine', 'RankEngine', 'BadgeEngine', 'ThemeEngine'
    ];

    const missing = intel.filter(name => !window[name]?.recalculate);

    return {
      status: missing.length === 0 ? HEALTH_STATUSES.OK : HEALTH_STATUSES.WARNING,
      missing,
      message: missing.length === 0 ? 'All intelligence engines active' : `Missing: ${missing.join(', ')}`
    };
  }

  function checkUIModules() {
    const ui = [
      'Router', 'ViewManager', 'ComponentLoader', 'DashboardUI',
      'SidebarUI', 'HeaderUI', 'AlertsUI', 'ModalsUI', 'ChartsUI',
      'ThoughtsUI', 'ManifestUI'
    ];

    const missing = ui.filter(name => !window[name]?.init);

    return {
      status: missing.length === 0 ? HEALTH_STATUSES.OK : HEALTH_STATUSES.WARNING,
      missing,
      message: missing.length === 0 ? 'All UI modules initialized' : `Missing UI: ${missing.join(', ')}`
    };
  }

  async function checkStorageIntegrity() {
    try {
      // Test write/read/delete cycle
      const testValue = { test: 'health-check', timestamp: Date.now() };
      Storage.write(STORAGE_TEST_KEY, testValue);

      const readBack = Storage.read(STORAGE_TEST_KEY);
      if (!readBack || readBack.test !== 'health-check') {
        return { status: HEALTH_STATUSES.CRITICAL, message: 'Storage read/write mismatch' };
      }

      Storage.remove(STORAGE_TEST_KEY);

      // Check quota usage
      const usage = Storage.getStorageSize?.() || 0;
      if (usage > MAX_STORAGE_QUOTA_WARNING) {
        return {
          status: HEALTH_STATUSES.WARNING,
          message: `Storage usage high: ${(usage / 1024 / 1024).toFixed(2)}MB`
        };
      }

      return { status: HEALTH_STATUSES.OK, message: 'Storage integrity OK' };
    } catch (err) {
      return { status: HEALTH_STATUSES.CRITICAL, message: `Storage failure: ${err.message}` };
    }
  }

  async function checkEventBusResponsiveness() {
    return new Promise((resolve) => {
      const testEvent = 'SYSTEM_HEALTH_PING';
      const start = Date.now();

      const handler = () => {
        EventBus.off(testEvent, handler);
        const latency = Date.now() - start;
        resolve({
          status: latency < CRITICAL_TIMEOUT_MS ? HEALTH_STATUSES.OK : HEALTH_STATUSES.WARNING,
          message: `EventBus latency: ${latency}ms`,
          latency
        });
      };

      EventBus.on(testEvent, handler);
      EventBus.emit(testEvent);

      // Timeout if no response
      setTimeout(() => {
        EventBus.off(testEvent, handler);
        resolve({
          status: HEALTH_STATUSES.CRITICAL,
          message: 'EventBus unresponsive'
        });
      }, CRITICAL_TIMEOUT_MS);
    });
  }

  function evaluateOverallHealth(results) {
    const statuses = Object.values(results).map(r => r.status);

    if (statuses.includes(HEALTH_STATUSES.CRITICAL)) {
      return HEALTH_STATUSES.CRITICAL;
    }
    if (statuses.includes(HEALTH_STATUSES.WARNING)) {
      return HEALTH_STATUSES.WARNING;
    }
    return HEALTH_STATUSES.OK;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC SYSTEM HEALTH API
  // ─────────────────────────────────────────────────────────────────────────────

  const SystemHealth = {

    async init() {
      // Run initial health check after boot
      EventBus.on('BOOT_COMPLETE', async () => {
        await this.runHealthCheck();
      });

      // Periodic checks
      checkInterval = setInterval(async () => {
        await this.runHealthCheck();
      }, CHECK_INTERVAL_MS);

      // Immediate check
      await this.runHealthCheck();

      console.log('[SystemHealth] Initialized – runtime integrity monitoring active');
    },

    // ─── Run full system health check ─────────────────────────────────────────
    async runHealthCheck() {
      const start = Date.now();
      const results = {};

      try {
        results.core = checkCoreModules();
        results.engines = checkEngineLayer();
        results.intelligence = checkIntelligenceEngines();
        results.ui = checkUIModules();
        results.storage = await checkStorageIntegrity();
        results.eventbus = await checkEventBusResponsiveness();

        const overall = evaluateOverallHealth(results);

        if (overall !== healthStatus) {
          healthStatus = overall;
          EventBus.emit(`SYSTEM_HEALTH_${overall}`, { status: overall, results });
        }

        EventBus.emit('SYSTEM_HEALTH_CHECK_COMPLETE', {
          status: overall,
          duration: Date.now() - start,
          results
        });

        lastDiagnostics = { status: overall, results, timestamp: Date.now() };

        if (overall === HEALTH_STATUSES.CRITICAL) {
          // Critical failure → show persistent alert
          AlertsUI?.createAlert?.('critical', 'System critical health failure detected', { persistent: true });
        } else if (overall === HEALTH_STATUSES.WARNING) {
          AlertsUI?.createAlert?.('warning', 'System health warning – some components degraded');
        }

      } catch (err) {
        console.error('[SystemHealth] Health check failed:', err);
        EventBus.emit('SYSTEM_HEALTH_ERROR', { error: err.message });
      }
    },

    // ─── Get latest health diagnostics ────────────────────────────────────────
    getLatestDiagnostics() {
      return lastDiagnostics || { status: 'UNKNOWN', results: {}, timestamp: 0 };
    },

    // ─── Manual health check trigger ──────────────────────────────────────────
    async forceCheck() {
      await this.runHealthCheck();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.SystemHealth = SystemHealth;

  // Auto-init after boot
  EventBus.on('BOOT_COMPLETE', () => {
    SystemHealth.init();
  });

  // Debug helpers
  window.__debugHealth = {
    check: () => SystemHealth.forceCheck(),
    diagnostics: () => SystemHealth.getLatestDiagnostics()
  };

})();