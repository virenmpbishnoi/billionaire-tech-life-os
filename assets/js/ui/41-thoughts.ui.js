/*
 * 41-thoughts.ui.js
 * Daily Thought System UI Controller – Billionaire Tech Adaptive Life OS
 *
 * Manages the thought ticker, daily thought entry form, affirmation display,
 * and thought history viewer within the dashboard and sidebar.
 *
 * Core features:
 *   - Rotating thought ticker (sidebar/dashboard)
 *   - Quick thought entry form (modal or inline)
 *   - Rotating affirmations/manifestations
 *   - Thought history list with category filtering
 *
 * Integrates with thought.engine.js for persistence and analytics.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM REFERENCES & SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  const TICKER_CONTAINER_ID = 'thought-ticker-container';
  const ENTRY_PANEL_CLASS = 'thought-entry-panel';
  const HISTORY_PANEL_CLASS = 'thought-history-panel';
  const AFFIRMATION_CONTAINER_CLASS = 'affirmation-display';

  let tickerElement = null;
  let entryForm = null;
  let historyList = null;
  let affirmationContainer = null;

  let tickerInterval = null;
  let currentThoughtIndex = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // THOUGHT CATEGORIES & AFFIRMATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const THOUGHT_CATEGORIES = [
    { id: 'daily',        label: 'Daily Thoughts',     color: '--bt-manifest-thought' },
    { id: 'goal',         label: 'Goal Affirmations',  color: '--bt-manifest-goal' },
    { id: 'success',      label: 'Success Visualization', color: '--bt-manifest-success' },
    { id: 'morning',      label: 'Morning Manifestation', color: '--bt-manifest-morning' },
    { id: 'night',        label: 'Night Reflection',   color: '--bt-manifest-night' }
  ];

  // Rotating affirmations – can be extended or pulled from engine
  const AFFIRMATIONS = [
    "I execute with relentless discipline.",
    "Every action builds my empire.",
    "My mind is clear, focused, and powerful.",
    "I attract wealth through consistent effort.",
    "Health is my foundation — I protect it daily.",
    "I turn thoughts into reality.",
    "Progress compounds — I stay consistent.",
    "I am the architect of my future."
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getTicker() {
    if (!tickerElement) {
      tickerElement = document.getElementById(TICKER_CONTAINER_ID);
    }
    return tickerElement;
  }

  function getEntryForm() {
    if (!entryForm) {
      entryForm = document.querySelector(`.${ENTRY_PANEL_CLASS} form`);
    }
    return entryForm;
  }

  function getHistoryList() {
    if (!historyList) {
      historyList = document.querySelector(`.${HISTORY_PANEL_CLASS}`);
    }
    return historyList;
  }

  function getAffirmationContainer() {
    if (!affirmationContainer) {
      affirmationContainer = document.querySelector(`.${AFFIRMATION_CONTAINER_CLASS}`);
    }
    return affirmationContainer;
  }

  function renderThoughtTicker() {
    const ticker = getTicker();
    if (!ticker) return;

    const thoughts = State.getPath('thoughts') || [];
    if (thoughts.length === 0) {
      ticker.innerHTML = '<div class="ticker-empty">No thoughts yet today</div>';
      return;
    }

    ticker.innerHTML = '';

    thoughts.forEach(thought => {
      const item = document.createElement('div');
      item.className = 'ticker-item';
      item.style.setProperty('--thought-color', `var(${thought.categoryColor || '--bt-manifest-thought'})`);

      item.innerHTML = `
        <span class="ticker-text">${thought.content}</span>
        <span class="ticker-meta">${new Date(thought.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      `;

      ticker.appendChild(item);
    });

    // Start auto-scroll if more than 3 thoughts
    if (thoughts.length > 3) {
      startTickerAnimation();
    }
  }

  function startTickerAnimation() {
    if (tickerInterval) clearInterval(tickerInterval);

    tickerInterval = setInterval(() => {
      const ticker = getTicker();
      if (!ticker) return;

      const firstItem = ticker.firstElementChild;
      if (firstItem) {
        ticker.removeChild(firstItem);
        ticker.appendChild(firstItem);
      }
    }, 8000); // Rotate every 8 seconds
  }

  function renderAffirmations() {
    const container = getAffirmationContainer();
    if (!container) return;

    // Rotate affirmations every 12 seconds
    let index = Math.floor(Math.random() * AFFIRMATIONS.length);

    const render = () => {
      container.innerHTML = `
        <div class="affirmation-text">
          "${AFFIRMATIONS[index]}"
        </div>
      `;
      index = (index + 1) % AFFIRMATIONS.length;
    };

    render();
    setInterval(render, 12000);
  }

  function renderThoughtHistory() {
    const list = getHistoryList();
    if (!list) return;

    const thoughts = State.getPath('thoughts') || [];
    list.innerHTML = '';

    if (thoughts.length === 0) {
      list.innerHTML = '<div class="history-empty">No thoughts recorded yet</div>';
      return;
    }

    thoughts.forEach(thought => {
      const item = document.createElement('div');
      item.className = 'thought-history-item';
      item.style.borderLeftColor = `var(${thought.categoryColor || '--bt-manifest-thought'})`;

      item.innerHTML = `
        <div class="thought-content">${thought.content}</div>
        <div class="thought-meta">
          <span class="thought-category">${thought.category || 'Daily'}</span>
          <span class="thought-time">${new Date(thought.timestamp).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}</span>
        </div>
      `;

      list.appendChild(item);
    });
  }

  function handleThoughtSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const content = form.querySelector('textarea')?.value?.trim();
    const category = form.querySelector('select')?.value;

    if (!content) {
      EventBus.emit('THOUGHT_UI_ERROR', { message: 'Thought content required' });
      return;
    }

    EventBus.emit('THOUGHT_CREATE_REQUEST', {
      content,
      category,
      timestamp: Date.now()
    });

    form.reset();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    EventBus.on('THOUGHT_CREATED', () => {
      renderThoughtTicker();
      renderThoughtHistory();
    });

    EventBus.on('THOUGHT_UPDATED', () => {
      renderThoughtTicker();
      renderThoughtHistory();
    });

    EventBus.on('THEME_UPDATED', () => {
      // Re-render ticker to apply new colors
      renderThoughtTicker();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC THOUGHTS UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const ThoughtsUI = {

    init() {
      // Initial render
      renderThoughtTicker();
      renderAffirmations();
      renderThoughtHistory();

      // Setup entry form
      const form = getEntryForm();
      if (form) {
        form.addEventListener('submit', handleThoughtSubmit);
      }

      // Subscribe to events
      subscribeToEvents();

      EventBus.emit('THOUGHTS_UI_INITIALIZED');
      console.log('[ThoughtsUI] Initialized – mindset tracking active');
    },

    // ─── Manual refresh ───────────────────────────────────────────────────────
    refresh() {
      renderThoughtTicker();
      renderThoughtHistory();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ThoughtsUI = ThoughtsUI;

  // Auto-init after dashboard & modals
  function tryInit() {
    if (window.DashboardUI && window.ModalsUI && window.State && window.EventBus) {
      ThoughtsUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugThoughts = {
    refresh: () => ThoughtsUI.refresh(),
    add: (content, cat) => {
      EventBus.emit('THOUGHT_CREATE_REQUEST', { content, category: cat });
    }
  };

})();