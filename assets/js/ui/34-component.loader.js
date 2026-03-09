/*
 * 34-component.loader.js
 * UI Component Template Loader – Billionaire Tech Adaptive Life OS
 *
 * Dynamically loads, parses, caches, and delivers HTML component templates for views.
 * Core infrastructure for SPA-style rendering in this offline GitHub Pages deployment.
 *
 * Features:
 *   - Async fetch of component HTML files
 *   - In-memory caching (no repeated network requests)
 *   - DOMParser-based template parsing → DocumentFragment
 *   - Cache hit/miss tracking & analytics
 *   - Error handling with fallback
 *   - History & performance logging
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_BASE_PATH =
(window.location.pathname.includes('billionaire-tech-life-os')
 ? '/billionaire-tech-life-os'
 : '') + '/';
  const COMPONENT_EXTENSION = '.html';

  const COMPONENT_REGISTRY = {
    dashboard:  { path: 'dashboard',  cache: true },
    sidebar:    { path: 'sidebar',    cache: true },
    header:     { path: 'header',     cache: true },
    alerts:     { path: 'alerts',     cache: true },
    modals:     { path: 'modals',     cache: true },
    charts:     { path: 'charts',     cache: true },
    thoughts:   { path: 'thoughts',   cache: true },
    manifest:   { path: 'manifest',   cache: true },
    tasks:      { path: 'tasks',      cache: true },
    habits:     { path: 'habits',     cache: true },
    missions:   { path: 'missions',   cache: true },
    health:     { path: 'health',     cache: true },
    finance:    { path: 'finance',    cache: true },
    targets: { path: 'goals', cache: true },
    analytics:  { path: 'analytics',  cache: true },
    badges:     { path: 'badges',     cache: true },
    settings:   { path: 'settings',   cache: true }
  };

  const CACHE = new Map();                  // componentName → DocumentFragment
  const LOAD_TIMES = new Map();             // componentName → { loadTimeMs, cacheHit }
  const HISTORY = [];                       // load history entries

  const HISTORY_LIMIT = 100;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getComponentPath(name) {
  const config = COMPONENT_REGISTRY[name];
  if (!config) throw new Error(`Unknown component: ${name}`);

  const base = COMPONENT_BASE_PATH.replace(/\/+$/, '');
  return `${base}/${config.path}${COMPONENT_EXTENSION}`;
}

  function recordHistory(entry) {
    HISTORY.push(entry);
    if (HISTORY.length > HISTORY_LIMIT) HISTORY.shift();
  }

  function getCacheStats() {
    let hits = 0, misses = 0, totalTime = 0;

    LOAD_TIMES.forEach(stat => {
      if (stat.cacheHit) hits++;
      else misses++;
      totalTime += stat.loadTimeMs;
    });

    const totalRequests = hits + misses;

    return {
      totalRequests,
      hits,
      misses,
      hitRate: totalRequests > 0 ? (hits / totalRequests * 100).toFixed(1) + '%' : '0%',
      averageLoadTime: totalRequests > 0 ? (totalTime / totalRequests).toFixed(2) + 'ms' : '0ms'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC COMPONENT LOADER API
  // ─────────────────────────────────────────────────────────────────────────────

  const ComponentLoader = {

    async init() {
      // Preload critical components (optional – can improve perceived performance)
      const critical = ['dashboard', 'sidebar', 'header'];
      for (const name of critical) {
        await this.loadComponent(name, { preload: true });
      }

      // Listen for view requests from ViewManager
      EventBus.on('VIEW_LOAD_REQUEST', async ({ viewId }) => {
        try {
          const template = await this.loadComponent(viewId);
          EventBus.emit('COMPONENT_READY_FOR_MOUNT', { viewId, template });
        } catch (err) {
          EventBus.emit('VIEW_ERROR', { viewId, error: err.message });
        }
      });

      console.log('[ComponentLoader] Initialized – template loading & caching ready');
    },

    // ─── Load (or get from cache) a component template ────────────────────────
    async loadComponent(componentName, options = {}) {
      if (!COMPONENT_REGISTRY[componentName]) {
        throw new Error(`Component not registered: ${componentName}`);
      }

      const startTime = performance.now();

      // Cache hit
      if (CACHE.has(componentName)) {
        const cached = CACHE.get(componentName);
        const duration = performance.now() - startTime;

        LOAD_TIMES.set(componentName, { loadTimeMs: duration, cacheHit: true });
        recordHistory({ component: componentName, cacheHit: true, duration });

        EventBus.emit('COMPONENT_CACHE_HIT', { component: componentName, duration });

        return cached.cloneNode(true); // return fresh clone
      }

      // Cache miss – fetch
      EventBus.emit('COMPONENT_LOADING', { component: componentName });

      try {
        const path = getComponentPath(componentName);
        const response = await fetch(path);

        if (!response.ok) {
          throw new Error(`Failed to load component ${componentName}: ${response.status}`);
        }

        const html = await response.text();

        // Parse into DocumentFragment
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const fragment = document.createDocumentFragment();

        while (doc.body.firstChild) {
          fragment.appendChild(doc.body.firstChild);
        }

        // Cache the parsed fragment
        CACHE.set(componentName, fragment);

        const duration = performance.now() - startTime;

        LOAD_TIMES.set(componentName, { loadTimeMs: duration, cacheHit: false });
        recordHistory({ component: componentName, cacheHit: false, duration });

        EventBus.emit('COMPONENT_CACHE_MISS', { component: componentName, duration });
        EventBus.emit('COMPONENT_LOADED', { component: componentName, duration });

        return fragment.cloneNode(true);

      } catch (err) {
        console.error('[ComponentLoader] Load failed:', componentName, err);
        EventBus.emit('COMPONENT_ERROR', { component: componentName, error: err.message });

        // Optional fallback template (simple error state)
        const errorFragment = document.createDocumentFragment();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'component-error';
        errorDiv.innerHTML = `<h2>Error loading ${componentName}</h2><p>${err.message}</p>`;
        errorFragment.appendChild(errorDiv);

        return errorFragment;
      }
    },

    // ─── Invalidate / clear cache ─────────────────────────────────────────────
    invalidateCache(componentName) {
      if (componentName) {
        CACHE.delete(componentName);
        LOAD_TIMES.delete(componentName);
        EventBus.emit('COMPONENT_CACHE_INVALIDATED', { component: componentName });
      } else {
        CACHE.clear();
        LOAD_TIMES.clear();
        EventBus.emit('COMPONENT_CACHE_CLEARED');
      }
    },

    // ─── Get cache statistics ─────────────────────────────────────────────────
    getCacheStats() {
      return getCacheStats();
    },

    // ─── Get load history ─────────────────────────────────────────────────────
    getComponentHistory() {
      return [...HISTORY];
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ComponentLoader = ComponentLoader;

  // Auto-init after ViewManager
  function tryInit() {
    if (window.ViewManager && window.State && window.EventBus) {
      ComponentLoader.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugLoader = {
    load: (name) => ComponentLoader.loadComponent(name),
    stats: () => ComponentLoader.getCacheStats(),
    history: () => ComponentLoader.getComponentHistory(),
    invalidate: (name) => ComponentLoader.invalidateCache(name)
  };

})();
