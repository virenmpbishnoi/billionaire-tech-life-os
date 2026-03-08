/*
 * 12-recalculation.js
 * System Recalculation Orchestrator – Billionaire Tech Adaptive Life OS
 *
 * Central coordinator for all derived metric recomputations.
 * Listens to change events → determines impact → runs ordered pipeline → updates state.
 *
 * Guarantees:
 * - Deterministic computation order
 * - No redundant recalculations
 * - No direct engine-to-engine calls
 * - Recursion loop protection
 * - Batched/debounced execution
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  const bus = window.EventBus;
  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const RECALC_DEBOUNCE_MS = 150;           // Wait before running pipeline
  const MAX_RECURSION_DEPTH = 8;            // Prevent infinite recalc loops
  const RECALC_PIPELINE_ORDER = [
    'score',
    'discipline',
    'wealth',
    'risk',
    'burnout',
    'rank',
    'badge',
    'analytics'
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  let recalcQueue = new Set();              // Events waiting to trigger pipeline
  let isRecalculating = false;              // Lock during execution
  let recalcDepth = 0;                      // Recursion guard
  let lastRecalcTime = 0;                   // Timestamp of last full run
  let recalcTimer = null;                   // Debounce timer

  const recalcMetrics = {
    totalRuns: 0,
    totalDuration: 0,
    lastDuration: 0,
    lastTrigger: null,
    failedAttempts: 0
  };

  // Event → affected pipeline stages (can be expanded dynamically)
  const TRIGGER_MAP = new Map([
    ['TASK_COMPLETED',      ['score', 'discipline', 'rank', 'badge']],
    ['TASK_UPDATED',        ['score', 'discipline']],
    ['HABIT_COMPLETED',     ['discipline', 'streak', 'rank', 'badge']],
    ['MISSION_COMPLETED',   ['score', 'rank', 'badge']],
    ['FINANCE_UPDATED',     ['wealth', 'score']],
    ['HEALTH_UPDATED',      ['burnout', 'risk']],
    ['TARGET_UPDATED',      ['score', 'discipline']],
    ['STREAK_UPDATED',      ['discipline', 'rank']],
    ['THOUGHT_ADDED',       ['analytics']],
    ['STATE_UPDATED',       RECALC_PIPELINE_ORDER], // full recalc
    ['STORAGE_WRITE_SUCCESS', []], // optional – can trigger analytics refresh
    ['FOCUS_MODE_ENDED',    ['score', 'discipline']]
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ENGINE REFERENCE MAP (late-bound)
  // Filled during init after engines are loaded
  // ─────────────────────────────────────────────────────────────────────────────

  const engines = {
    score: null,
    discipline: null,
    wealth: null,
    risk: null,
    burnout: null,
    rank: null,
    badge: null,
    analytics: null
  };

  function bindEngines() {
    engines.score      = window.ScoreEngine     || { recalculate: () => {} };
    engines.discipline = window.DisciplineEngine|| { recalculate: () => {} };
    engines.wealth     = window.WealthEngine    || { recalculate: () => {} };
    engines.risk       = window.RiskEngine      || { recalculate: () => {} };
    engines.burnout    = window.BurnoutEngine   || { check: () => {} };
    engines.rank       = window.RankEngine      || { evaluate: () => {} };
    engines.badge      = window.BadgeEngine     || { checkUnlocks: () => {} };
    engines.analytics  = window.AnalyticsEngine || { refresh: () => {} };

    console.log('[Recalc] Engine references bound');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE RECALCULATION LOGIC
  // ─────────────────────────────────────────────────────────────────────────────

  function scheduleRecalculation(triggerEvent) {
    recalcQueue.add(triggerEvent || 'unknown');
    if (recalcTimer) clearTimeout(recalcTimer);

    recalcTimer = setTimeout(() => {
      runPipeline();
      recalcTimer = null;
    }, RECALC_DEBOUNCE_MS);
  }

  async function runPipeline() {
    if (isRecalculating) return; // already running
    if (recalcQueue.size === 0) return;

    isRecalculating = true;
    recalcDepth++;
    const startTime = performance.now();

    if (recalcDepth > MAX_RECURSION_DEPTH) {
      console.error('[Recalc] Max recursion depth exceeded – aborting');
      EventBus.emit('RECALCULATION_FAILED', { reason: 'recursion_limit' });
      cleanup();
      return;
    }

    EventBus.emit('RECALCULATION_STARTED', {
      triggers: Array.from(recalcQueue),
      depth: recalcDepth,
      timestamp: Date.now()
    });

    try {
      // Collect unique affected stages from all queued triggers
      const affected = new Set();
      for (const trigger of recalcQueue) {
        const stages = TRIGGER_MAP.get(trigger) || RECALC_PIPELINE_ORDER;
        stages.forEach(s => affected.add(s));
      }

      // Execute in fixed deterministic order
      for (const stage of RECALC_PIPELINE_ORDER) {
        if (!affected.has(stage)) continue;

        const engine = engines[stage];
        if (!engine) {
          console.warn(`[Recalc] Engine missing for stage: ${stage}`);
          continue;
        }

        try {
          if (stage === 'score') {
            await engine.recalculate?.();
          } else if (stage === 'discipline') {
            await engine.recalculate?.();
          } else if (stage === 'wealth') {
            await engine.recalculate?.();
          } else if (stage === 'risk') {
            await engine.recalculate?.();
          } else if (stage === 'burnout') {
            await engine.check?.();
          } else if (stage === 'rank') {
            await engine.evaluate?.();
          } else if (stage === 'badge') {
            await engine.checkUnlocks?.();
          } else if (stage === 'analytics') {
            await engine.refresh?.();
          }

          // Update state with new derived values (engines should call State.update)
        } catch (err) {
          console.error(`[Recalc] Error in ${stage} engine:`, err);
          recalcMetrics.failedAttempts++;
        }
      }

      const duration = performance.now() - startTime;
      recalcMetrics.totalRuns++;
      recalcMetrics.totalDuration += duration;
      recalcMetrics.lastDuration = duration;
      recalcMetrics.lastTrigger = Date.now();

      lastRecalcTime = Date.now();

      EventBus.emit('RECALCULATION_COMPLETED', {
        duration,
        affectedStages: Array.from(affected),
        triggers: Array.from(recalcQueue),
        timestamp: Date.now()
      });

    } catch (fatal) {
      console.error('[Recalc] Fatal pipeline error:', fatal);
      EventBus.emit('RECALCULATION_FAILED', { reason: 'pipeline_error', error: fatal.message });
    } finally {
      cleanup();
    }
  }

  function cleanup() {
    recalcQueue.clear();
    isRecalculating = false;
    recalcDepth = Math.max(0, recalcDepth - 1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC RECALCULATION API
  // ─────────────────────────────────────────────────────────────────────────────

  const Recalculation = {

    init() {
      bindEngines();

      // Listen to all relevant change events
      const changeEvents = Array.from(TRIGGER_MAP.keys());
      changeEvents.forEach(event => {
        EventBus.on(event, (payload) => {
          scheduleRecalculation(event);
        });
      });

      // Full recalc on major state changes
      EventBus.on('STATE_UPDATED', () => scheduleRecalculation('STATE_UPDATED'));
      EventBus.on('STORAGE_WRITE_SUCCESS', () => scheduleRecalculation('STORAGE_WRITE_SUCCESS'));

      // Initial run after boot
      setTimeout(() => scheduleRecalculation('INIT'), 500);

      console.log('[Recalc] Initialized – listening for', changeEvents.length, 'trigger events');
    },

    trigger(eventName = 'manual') {
      scheduleRecalculation(eventName);
    },

    forceFullRecalc() {
      recalcQueue = new Set(['full']);
      runPipeline();
    },

    getMetrics() {
      return {
        ...recalcMetrics,
        averageDuration: recalcMetrics.totalRuns > 0
          ? (recalcMetrics.totalDuration / recalcMetrics.totalRuns).toFixed(2)
          : 0,
        lastRun: lastRecalcTime ? new Date(lastRecalcTime).toISOString() : null,
        pendingQueue: recalcQueue.size
      };
    },

    reset() {
      if (recalcTimer) clearTimeout(recalcTimer);
      recalcQueue.clear();
      isRecalculating = false;
      recalcDepth = 0;
      console.log('[Recalc] Reset complete');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.Recalculation = Recalculation;

  // Auto-init after EventBus is ready
  if (window.EventBus) {
    Recalculation.init();
  } else {
    console.warn('[Recalc] EventBus not found – delaying init');
    const initInterval = setInterval(() => {
      if (window.EventBus) {
        Recalculation.init();
        clearInterval(initInterval);
      }
    }, 100);
  }

  // Debug helper
  window.__debugRecalc = () => console.table(Recalculation.getMetrics());


})();
