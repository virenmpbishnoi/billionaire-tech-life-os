/*
 * 43-boot.js
 * Application Boot Loader – Billionaire Tech Adaptive Life OS
 *
 * Orchestrates the entire system startup sequence in strict dependency order.
 * Ensures safe, deterministic initialization across all layers:
 *   - Core infrastructure (storage, state, versioning, eventbus, recalc)
 *   - Authentication layer
 *   - Primary engines
 *   - Intelligence engines
 *   - UI system
 *   - Router activation
 *
 * Emits lifecycle events for UI progress indicators and error recovery.
 * Logs boot diagnostics for system health monitoring.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const BOOT_STAGES = [
    { name: 'core-infrastructure',   modules: ['Storage', 'State', 'Versioning', 'EventBus', 'Recalculation'] },
    { name: 'authentication',        modules: ['AuthGuard', 'AuthSession', 'AuthCrypto'] },
    { name: 'engine-layer',          modules: [
      'UserEngine', 'TaskEngine', 'HabitEngine', 'MissionEngine', 'FinanceEngine',
      'HealthEngine', 'TargetEngine', 'StreakEngine'
    ]},
    { name: 'intelligence-engines',  modules: [
      'ScoreEngine', 'DisciplineEngine', 'WealthEngine', 'RiskEngine', 'BurnoutEngine',
      'RankEngine', 'BadgeEngine', 'ThemeEngine'
    ]},
    { name: 'ui-system',             modules: [
      'Router', 'ViewManager', 'ComponentLoader', 'DashboardUI', 'SidebarUI',
      'HeaderUI', 'AlertsUI', 'ModalsUI', 'ChartsUI', 'ThoughtsUI', 'ManifestUI'
    ]},
    { name: 'router-activation',     modules: [] } // final router start
  ];

  const BOOT_TIMEOUT_MS = 10000; // 10s max boot time before error
  const STAGE_TIMEOUT_MS = 3000; // 3s per stage

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let bootStarted = false;
  let bootCompleted = false;
  let bootStartTime = 0;
  let currentStageIndex = -1;
  let stageStartTime = 0;

  const bootDiagnostics = {
    startTime: 0,
    endTime: 0,
    totalDuration: 0,
    stages: [],
    errors: []
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function logStage(stageName, success = true, duration = 0) {
    bootDiagnostics.stages.push({
      stage: stageName,
      success,
      duration,
      timestamp: Date.now()
    });

    console.log(`[Boot] Stage "${stageName}" ${success ? 'completed' : 'FAILED'} in ${duration.toFixed(1)}ms`);
  }

  function logError(err, stageName) {
    bootDiagnostics.errors.push({
      stage: stageName,
      error: err.message,
      stack: err.stack,
      timestamp: Date.now()
    });

    console.error(`[Boot] Error in stage "${stageName}":`, err);
    EventBus.emit('BOOT_ERROR', { stage: stageName, error: err.message });
  }

  function checkModuleAvailability(modules) {
    return modules.every(mod => {
      const name = mod.replace(/Engine$/, ''); // e.g. UserEngine → User
      return !!window[name] || !!window[mod];
    });
  }

  async function waitForModules(modules, timeoutMs = STAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        if (checkModuleAvailability(modules)) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for modules: ${modules.join(', ')}`));
        } else {
          setTimeout(check, 50);
        }
      };

      check();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOT STAGE EXECUTORS
  // ─────────────────────────────────────────────────────────────────────────────

  async function initializeCore() {
    const stageName = 'core-infrastructure';
    const start = Date.now();

    try {
      // Storage must be first
      if (window.Storage) await Storage.init?.();

      // Then state
      if (window.State) await State.init?.();

      // Versioning (migrations)
      if (window.Versioning) await Versioning.init?.();

      // EventBus
      if (window.EventBus) EventBus.init?.();

      // Recalculation
      if (window.Recalculation) Recalculation.init?.();

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  async function initializeAuth() {
    const stageName = 'authentication';
    const start = Date.now();

    try {
      await waitForModules(['AuthGuard', 'AuthSession', 'AuthCrypto']);

      if (window.AuthGuard) AuthGuard.init?.();
      if (window.AuthSession) AuthSession.init?.();
      if (window.AuthCrypto) AuthCrypto.init?.();

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  async function initializeEngines() {
    const stageName = 'engine-layer';
    const start = Date.now();

    try {
      await waitForModules([
        'UserEngine', 'TaskEngine', 'HabitEngine', 'MissionEngine',
        'FinanceEngine', 'HealthEngine', 'TargetEngine', 'StreakEngine'
      ]);

      // Order matters: user first, then dependents
      await UserEngine.init?.();
      await TaskEngine.init?.();
      await HabitEngine.init?.();
      await MissionEngine.init?.();
      await FinanceEngine.init?.();
      await HealthEngine.init?.();
      await TargetEngine.init?.();
      await StreakEngine.init?.();

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  async function initializeIntelligenceEngines() {
    const stageName = 'intelligence-engines';
    const start = Date.now();

    try {
      await waitForModules([
        'ScoreEngine', 'DisciplineEngine', 'WealthEngine', 'RiskEngine',
        'BurnoutEngine', 'RankEngine', 'BadgeEngine', 'ThemeEngine'
      ]);

      await ScoreEngine.init?.();
      await DisciplineEngine.init?.();
      await WealthEngine.init?.();
      await RiskEngine.init?.();
      await BurnoutEngine.init?.();
      await RankEngine.init?.();
      await BadgeEngine.init?.();
      await ThemeEngine.init?.();

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  async function initializeUI() {
    const stageName = 'ui-system';
    const start = Date.now();

    try {
      await waitForModules([
        'Router', 'ViewManager', 'ComponentLoader', 'DashboardUI', 'SidebarUI',
        'HeaderUI', 'AlertsUI', 'ModalsUI', 'ChartsUI', 'ThoughtsUI', 'ManifestUI'
      ]);

      await Router.init?.();
      await ViewManager.init?.();
      await ComponentLoader.init?.();
      await DashboardUI.init?.();
      await SidebarUI.init?.();
      await HeaderUI.init?.();
      await AlertsUI.init?.();
      await ModalsUI.init?.();
      await ChartsUI.init?.();
      await ThoughtsUI.init?.();
      await ManifestUI.init?.();

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  function activateRouter() {
    const stageName = 'router-activation';
    const start = Date.now();

    try {
      // Final router activation (after all UI ready)
      Router.navigate(window.location.pathname || '/dashboard', { replace: true });

      logStage(stageName, true, Date.now() - start);
      EventBus.emit('BOOT_STAGE_COMPLETE', { stage: stageName, duration: Date.now() - start });
    } catch (err) {
      logError(err, stageName);
      throw err;
    }
  }

  async function verifySystemHealth() {
    // Final sanity check
    const checks = [
      { name: 'State',      ok: !!State?.get?.() },
      { name: 'EventBus',   ok: !!EventBus?.emit },
      { name: 'Router',     ok: !!Router?.getCurrentRoute?.() },
      { name: 'User',       ok: !!UserEngine?.getCurrentUser?.() },
      { name: 'Dashboard',  ok: !!document.querySelector('#execution-panel') }
    ];

    const failed = checks.filter(c => !c.ok);
    if (failed.length > 0) {
      console.warn('[Boot] System health warning – failed checks:', failed.map(c => c.name));
      EventBus.emit('BOOT_HEALTH_WARNING', { failed: failed.map(c => c.name) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC BOOT API
  // ─────────────────────────────────────────────────────────────────────────────

  const Boot = {

    async init() {
      if (this.started === true) {
  return;
}

      bootStarted = true;
      bootStartTime = Date.now();

      EventBus.emit('BOOT_START', { timestamp: bootStartTime });

      try {
        const bootTimeout = setTimeout(() => {
          console.error('[Boot] System boot timeout after', (Date.now() - bootStartTime)/1000, 'seconds');
          EventBus.emit('BOOT_ERROR', { reason: 'timeout' });
        }, BOOT_TIMEOUT_MS);

        // Sequential stages
        await initializeCore();
        await initializeAuth();
        await initializeEngines();
        await initializeIntelligenceEngines();
        await initializeUI();
        await activateRouter();

        clearTimeout(bootTimeout);

        bootCompleted = true;
        const duration = Date.now() - bootStartTime;

        bootDiagnostics.endTime = Date.now();
        bootDiagnostics.totalDuration = duration;

        EventBus.emit('BOOT_COMPLETE', {
          duration,
          timestamp: Date.now(),
          diagnostics: bootDiagnostics
        });

        await verifySystemHealth();

        console.log(`[Boot] System fully initialized in ${duration}ms`);
      } catch (err) {
        logError(err, 'boot-fatal');
        EventBus.emit('BOOT_ERROR', { error: err.message, stage: currentStageIndex >= 0 ? BOOT_STAGES[currentStageIndex].name : 'unknown' });

        // Fallback UI (minimal safe mode)
        document.body.innerHTML = `
          <div style="padding: 40px; text-align: center; font-family: system-ui;">
            <h1>Life OS Boot Failed</h1>
            <p>${err.message}</p>
            <button onclick="location.reload()">Reload Application</button>
          </div>
        `;
      }
    },

    getBootState() {
      return {
        started: bootStarted,
        completed: bootCompleted,
        duration: bootCompleted ? Date.now() - bootStartTime : 0,
        currentStage: currentStageIndex >= 0 ? BOOT_STAGES[currentStageIndex].name : 'not-started',
        diagnostics: { ...bootDiagnostics }
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-BOOT
  // ─────────────────────────────────────────────────────────────────────────────

  window.Boot = Boot;

  // Trigger boot when core dependencies are ready
  function tryBoot() {
    if (window.Storage && window.State && window.Versioning && window.EventBus) {
      Boot.init();
    } else {
      setTimeout(tryBoot, 50);
    }
  }

  tryBoot();

  // Debug helpers
  window.__debugBoot = {
    state: () => Boot.getBootState(),
    restart: () => Boot.init()
  };


})();
