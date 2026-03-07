/*
 * 11-eventbus.js
 * Central Event Communication Backbone – Billionaire Tech Adaptive Life OS
 *
 * Single pub/sub system for the entire application.
 * All engines, UI modules, and core utilities MUST communicate ONLY through EventBus.
 * Direct function calls between modules are strictly forbidden.
 *
 * Features:
 * - Priority-based listener execution
 * - Once-only listeners
 * - Async event emission support
 * - Recursion loop protection
 * - Debug logging mode
 * - Event metrics & inspection
 * - Graceful error handling in listeners
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const DEFAULT_PRIORITY = 50;
  const MAX_RECURSION_DEPTH = 20;
  const DEBUG_PREFIX = '[EventBus]';

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  const listeners = new Map();          // eventName → [{listener, priority, once}]
  const eventStack = [];                // recursion detection
  let debugEnabled = false;
  let eventMetrics = new Map();         // eventName → {count, lastEmitted, avgListeners}

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function normalizeEventName(name) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Event name must be a non-empty string');
    }
    return name.trim();
  }

  function getOrCreateListeners(eventName) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    return listeners.get(eventName);
  }

  function sortListenersByPriority(list) {
    return list.slice().sort((a, b) => b.priority - a.priority); // descending priority
  }

  function updateMetrics(eventName, listenerCount) {
    if (!eventMetrics.has(eventName)) {
      eventMetrics.set(eventName, { count: 0, lastEmitted: 0, avgListeners: 0 });
    }
    const m = eventMetrics.get(eventName);
    m.count++;
    m.lastEmitted = Date.now();
    m.avgListeners = ((m.avgListeners * (m.count - 1)) + listenerCount) / m.count;
  }

  function logDebug(type, eventName, payload = null, extra = '') {
    if (!debugEnabled) return;
    const time = new Date().toISOString().slice(11, 23);
    let msg = `${DEBUG_PREFIX} ${time} ${type} "${eventName}"`;
    if (payload) msg += ` payload: ${JSON.stringify(payload, null, 2).slice(0, 100)}...`;
    if (extra) msg += ` ${extra}`;
    console.log(msg);
  }

  function detectRecursion(eventName) {
    if (eventStack.includes(eventName)) {
      const depth = eventStack.length;
      const cycleStart = eventStack.indexOf(eventName);
      const cycle = eventStack.slice(cycleStart);
      console.warn(`${DEBUG_PREFIX} Recursion detected (depth ${depth})`, cycle);
      return true;
    }
    if (eventStack.length >= MAX_RECURSION_DEPTH) {
      console.error(`${DEBUG_PREFIX} Max recursion depth exceeded`);
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC EVENTBUS API
  // ─────────────────────────────────────────────────────────────────────────────

  const EventBus = {

    // ─── Initialization ───────────────────────────────────────────────────────
    init() {
      listeners.clear();
      eventStack.length = 0;
      eventMetrics.clear();
      debugEnabled = false;
      console.log('[EventBus] Initialized');
    },

    // ─── Subscribe ────────────────────────────────────────────────────────────
    on(eventName, listener, options = {}) {
      eventName = normalizeEventName(eventName);

      if (typeof listener !== 'function') {
        throw new Error('Listener must be a function');
      }

      const priority = Number(options.priority) || DEFAULT_PRIORITY;
      const once = !!options.once;

      const entry = { listener, priority, once };
      getOrCreateListeners(eventName).push(entry);

      logDebug('SUBSCRIBE', eventName, null, `priority=${priority}${once ? ' (once)' : ''}`);

      return () => this.off(eventName, listener);
    },

    once(eventName, listener, options = {}) {
      return this.on(eventName, listener, { ...options, once: true });
    },

    // ─── Unsubscribe ──────────────────────────────────────────────────────────
    off(eventName, listener) {
      if (!eventName) {
        listeners.clear();
        logDebug('CLEAR', 'ALL');
        return;
      }

      eventName = normalizeEventName(eventName);

      if (!listeners.has(eventName)) return;

      if (!listener) {
        listeners.delete(eventName);
        logDebug('CLEAR', eventName);
        return;
      }

      const list = listeners.get(eventName);
      const filtered = list.filter(entry => entry.listener !== listener);

      if (filtered.length === 0) {
        listeners.delete(eventName);
      } else {
        listeners.set(eventName, filtered);
      }

      logDebug('UNSUBSCRIBE', eventName);
    },

    // ─── Emit (synchronous) ───────────────────────────────────────────────────
    emit(eventName, payload = {}) {
      eventName = normalizeEventName(eventName);

      if (detectRecursion(eventName)) return false;

      eventStack.push(eventName);
      logDebug('EMIT', eventName, payload);

      if (!listeners.has(eventName)) {
        eventStack.pop();
        return false;
      }

      const list = sortListenersByPriority(listeners.get(eventName));
      let success = true;

      updateMetrics(eventName, list.length);

      for (const { listener, once } of list) {
        try {
          listener(payload, eventName);
          if (once) {
            this.off(eventName, listener);
          }
        } catch (err) {
          console.error(`${DEBUG_PREFIX} Listener error on "${eventName}":`, err);
          success = false;
          // Continue to next listeners – do not crash system
        }
      }

      eventStack.pop();
      return success;
    },

    // ─── Emit Async (await all listeners) ─────────────────────────────────────
    async emitAsync(eventName, payload = {}) {
      eventName = normalizeEventName(eventName);

      if (detectRecursion(eventName)) return false;

      eventStack.push(eventName);
      logDebug('EMIT_ASYNC', eventName, payload);

      if (!listeners.has(eventName)) {
        eventStack.pop();
        return false;
      }

      const list = sortListenersByPriority(listeners.get(eventName));
      updateMetrics(eventName, list.length);

      const promises = [];

      for (const { listener, once } of list) {
        try {
          const result = listener(payload, eventName);
          if (result && typeof result.then === 'function') {
            promises.push(result);
          }
          if (once) {
            this.off(eventName, listener);
          }
        } catch (err) {
          console.error(`${DEBUG_PREFIX} Async listener error on "${eventName}":`, err);
        }
      }

      await Promise.allSettled(promises);

      eventStack.pop();
      return true;
    },

    // ─── Inspection & Debug ───────────────────────────────────────────────────
    hasListeners(eventName) {
      return listeners.has(normalizeEventName(eventName));
    },

    getListeners(eventName) {
      const list = listeners.get(normalizeEventName(eventName)) || [];
      return list.map(({ priority, once }) => ({ priority, once }));
    },

    getRegisteredEvents() {
      return Array.from(listeners.keys());
    },

    getEventMetrics() {
      return Object.fromEntries(eventMetrics);
    },

    enableDebug() {
      debugEnabled = true;
      console.log('[EventBus] Debug mode enabled');
    },

    disableDebug() {
      debugEnabled = false;
      console.log('[EventBus] Debug mode disabled');
    },

    clearAll() {
      listeners.clear();
      eventMetrics.clear();
      logDebug('CLEAR_ALL');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.EventBus = EventBus;

  // Auto-init
  EventBus.init();

  // Debug helpers (remove or gate in production)
  window.__debugEventBus = {
    on: EventBus.on.bind(EventBus),
    emit: EventBus.emit.bind(EventBus),
    metrics: () => EventBus.getEventMetrics(),
    events: () => EventBus.getRegisteredEvents()
  };

  // Periodic metrics log (every 5 minutes in debug)
  setInterval(() => {
    if (debugEnabled) {
      console.group('[EventBus] Metrics');
      console.table(EventBus.getEventMetrics());
      console.groupEnd();
    }
  }, 300_000);


})();
// expose globally
window.eventbus = EventBus;
