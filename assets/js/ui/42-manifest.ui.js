/*
 * 42-manifest.ui.js
 * Manifestation & Visualization UI Controller – Billionaire Tech Adaptive Life OS
 *
 * Manages the Manifestation System interface for mental alignment and future-visioning:
 *   - Morning Manifestation panel (intentions & focus)
 *   - Night Manifestation panel (reflection & gratitude)
 *   - Goal Affirmation entry
 *   - Success Visualization writing
 *   - Manifestation history viewer
 *   - Daily reminders & rotation
 *
 * Integrates with manifest.engine.js for persistence and analytics.
 * Uses modals for entry forms when needed.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM REFERENCES & SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  const MORNING_PANEL_ID = 'manifest-morning-panel';
  const NIGHT_PANEL_ID   = 'manifest-night-panel';
  const AFFIRMATION_PANEL_CLASS = 'manifest-affirmation-panel';
  const VISUALIZATION_PANEL_CLASS = 'manifest-visualization-panel';
  const HISTORY_PANEL_CLASS = 'manifest-history-panel';

  let morningPanel = null;
  let nightPanel = null;
  let affirmationPanel = null;
  let visualizationPanel = null;
  let historyPanel = null;

  let affirmationRotationInterval = null;
  let currentAffirmationIndex = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // MANIFESTATION CATEGORIES & AFFIRMATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const MANIFEST_CATEGORIES = [
    { id: 'morning',   label: 'Morning Manifestation', color: '--bt-manifest-morning',   icon: 'sun' },
    { id: 'night',     label: 'Night Manifestation',   color: '--bt-manifest-night',     icon: 'moon' },
    { id: 'thought',   label: 'Daily Thoughts',       color: '--bt-manifest-thought',   icon: 'brain' },
    { id: 'goal',      label: 'Goal Affirmations',    color: '--bt-manifest-goal',      icon: 'target' },
    { id: 'success',   label: 'Success Visualization',color: '--bt-manifest-success',   icon: 'star' }
  ];

  // Core rotating affirmations – reinforce identity & vision
  const AFFIRMATIONS = [
    "I am the architect of my extraordinary future.",
    "Every action I take compounds into massive success.",
    "My discipline is unbreakable and my focus is laser-sharp.",
    "Wealth flows to me effortlessly through value creation.",
    "My body is strong, my mind is clear, my energy is limitless.",
    "I turn vision into reality with consistent execution.",
    "I am worthy of everything I desire and more.",
    "Challenges are opportunities for growth and mastery."
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getMorningPanel() {
    if (!morningPanel) morningPanel = document.getElementById(MORNING_PANEL_ID);
    return morningPanel;
  }

  function getNightPanel() {
    if (!nightPanel) nightPanel = document.getElementById(NIGHT_PANEL_ID);
    return nightPanel;
  }

  function getAffirmationPanel() {
    if (!affirmationPanel) affirmationPanel = document.querySelector(`.${AFFIRMATION_PANEL_CLASS}`);
    return affirmationPanel;
  }

  function getVisualizationPanel() {
    if (!visualizationPanel) visualizationPanel = document.querySelector(`.${VISUALIZATION_PANEL_CLASS}`);
    return visualizationPanel;
  }

  function getHistoryPanel() {
    if (!historyPanel) historyPanel = document.querySelector(`.${HISTORY_PANEL_CLASS}`);
    return historyPanel;
  }

  function renderMorningPanel() {
    const panel = getMorningPanel();
    if (!panel) return;

    // Check if already rendered
    if (panel.querySelector('.manifest-entry-form')) return;

    panel.innerHTML = `
      <div class="manifest-header">
        <h2>Morning Manifestation</h2>
        <p>Set powerful intentions for the day ahead</p>
      </div>
      <form class="manifest-entry-form" id="morning-manifest-form">
        <textarea name="content" placeholder="Today I manifest..." rows="6" required></textarea>
        <div class="manifest-actions">
          <button type="submit" class="btn btn-primary">Manifest</button>
        </div>
      </form>
    `;

    const form = panel.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => handleManifestSubmit(e, 'morning'));
    }
  }

  function renderNightPanel() {
    const panel = getNightPanel();
    if (!panel) return;

    if (panel.querySelector('.manifest-entry-form')) return;

    panel.innerHTML = `
      <div class="manifest-header">
        <h2>Night Manifestation</h2>
        <p>Reflect & visualize tomorrow's success</p>
      </div>
      <form class="manifest-entry-form" id="night-manifest-form">
        <textarea name="content" placeholder="Tonight I reflect..." rows="6" required></textarea>
        <div class="manifest-actions">
          <button type="submit" class="btn btn-primary">Complete Day</button>
        </div>
      </form>
    `;

    const form = panel.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => handleManifestSubmit(e, 'night'));
    }
  }

  function renderAffirmationPanel() {
    const container = getAffirmationPanel();
    if (!container) return;

    // Rotate affirmations
    const render = () => {
      container.innerHTML = `
        <div class="affirmation-card">
          <p class="affirmation-text">"${AFFIRMATIONS[currentAffirmationIndex]}"</p>
        </div>
      `;
      currentAffirmationIndex = (currentAffirmationIndex + 1) % AFFIRMATIONS.length;
    };

    render();
    affirmationRotationInterval = setInterval(render, 12000);
  }

  function renderVisualizationPanel() {
    const panel = getVisualizationPanel();
    if (!panel) return;

    if (panel.querySelector('.manifest-entry-form')) return;

    panel.innerHTML = `
      <div class="manifest-header">
        <h2>Success Visualization</h2>
        <p>Paint your future success in vivid detail</p>
      </div>
      <form class="manifest-entry-form" id="visualization-form">
        <textarea name="vision" placeholder="I see myself..." rows="8" required></textarea>
        <input type="date" name="targetDate" placeholder="Target realization date">
        <div class="manifest-actions">
          <button type="submit" class="btn btn-primary">Visualize</button>
        </div>
      </form>
    `;

    const form = panel.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => handleManifestSubmit(e, 'success'));
    }
  }

  function renderManifestHistory() {
    const panel = getHistoryPanel();
    if (!panel) return;

    const manifests = State.getPath('manifestations') || [];
    panel.innerHTML = '';

    if (manifests.length === 0) {
      panel.innerHTML = '<div class="history-empty">No manifestations recorded yet</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'manifest-history-list';

    manifests.forEach(m => {
      const item = document.createElement('div');
      item.className = 'manifest-history-item';
      item.style.borderLeftColor = `var(${m.categoryColor || '--bt-manifest-thought'})`;

      item.innerHTML = `
        <div class="manifest-content">${m.content}</div>
        <div class="manifest-meta">
          <span class="manifest-category">${m.category || 'Daily'}</span>
          <span class="manifest-time">${new Date(m.timestamp).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}</span>
        </div>
      `;

      list.appendChild(item);
    });

    panel.appendChild(list);
  }

  function handleManifestSubmit(e, category) {
    e.preventDefault();

    const form = e.target;
    const content = form.querySelector('textarea')?.value?.trim();
    const targetDate = form.querySelector('input[type="date"]')?.value;

    if (!content) {
      EventBus.emit('MANIFEST_UI_ERROR', { message: 'Manifestation content required' });
      return;
    }

    EventBus.emit('MANIFEST_CREATE_REQUEST', {
      content,
      category,
      targetDate: targetDate ? new Date(targetDate).getTime() : null,
      timestamp: Date.now()
    });

    form.reset();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    EventBus.on('MANIFEST_CREATED', () => {
      renderManifestHistory();
      // Refresh panels if visible
      renderMorningPanel();
      renderNightPanel();
      renderVisualizationPanel();
    });

    EventBus.on('MANIFEST_UPDATED', () => renderManifestHistory());

    EventBus.on('THEME_UPDATED', () => {
      renderThoughtTicker(); // in case colors changed
      renderManifestHistory();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC MANIFEST UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const ManifestUI = {

    init() {
      // Initial render
      renderMorningPanel();
      renderNightPanel();
      renderAffirmationPanel();
      renderVisualizationPanel();
      renderManifestHistory();

      // Setup form listeners (if inline forms exist)
      const forms = document.querySelectorAll('.manifest-entry-form');
      forms.forEach(form => {
        const category = form.id?.split('-')[0] || 'daily';
        form.addEventListener('submit', e => handleManifestSubmit(e, category));
      });

      // Subscribe to events
      subscribeToEvents();

      EventBus.emit('MANIFEST_UI_INITIALIZED');
      console.log('[ManifestUI] Initialized – future-vision alignment active');
    },

    // ─── Manual refresh all manifestation panels ──────────────────────────────
    refresh() {
      renderMorningPanel();
      renderNightPanel();
      renderVisualizationPanel();
      renderManifestHistory();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ManifestUI = ManifestUI;

  // Auto-init after thoughts UI
  function tryInit() {
    if (window.ThoughtsUI && window.State && window.EventBus) {
      ManifestUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugManifest = {
    refresh: () => ManifestUI.refresh(),
    add: (content, cat, date) => {
      EventBus.emit('MANIFEST_CREATE_REQUEST', { content, category: cat, targetDate: date });
    }
  };

})();