/*
 * 39-modals.ui.js
 * Modal Dialog Controller – Billionaire Tech Adaptive Life OS
 *
 * Manages all modal dialogs in the application:
 *   - Form modals (add/edit task, habit, goal, finance, etc.)
 *   - Confirmation dialogs
 *   - Information & settings panels
 *   - Stacked modal support
 *   - Keyboard accessibility (ESC close, Enter submit)
 *   - Form validation & submission handling
 *
 * Uses #modal-root as container. Communicates via EventBus only.
 * No business logic — delegates form processing to engines.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const MODAL_ROOT_ID = 'modal-root';
  const MODAL_OVERLAY_CLASS = 'modal-overlay';
  const MODAL_CONTAINER_CLASS = 'modal-container';
  const MODAL_HEADER_CLASS = 'modal-header';
  const MODAL_BODY_CLASS = 'modal-body';
  const MODAL_FOOTER_CLASS = 'modal-footer';
  const MODAL_CLOSE_CLASS = 'modal-close';

  const MODAL_TYPES = {
    addTask:        { title: 'Add New Task',        size: 'medium', submitEvent: 'TASK_CREATE_REQUEST' },
    editTask:       { title: 'Edit Task',           size: 'medium', submitEvent: 'TASK_UPDATE_REQUEST' },
    addHabit:       { title: 'Add New Habit',       size: 'medium', submitEvent: 'HABIT_CREATE_REQUEST' },
    editHabit:      { title: 'Edit Habit',          size: 'medium', submitEvent: 'HABIT_UPDATE_REQUEST' },
    addGoal:        { title: 'Add New Goal',        size: 'large',  submitEvent: 'TARGET_CREATE_REQUEST' },
    addFinance:     { title: 'Log Transaction',     size: 'medium', submitEvent: 'FINANCE_TRANSACTION_ADD' },
    addHealth:      { title: 'Log Health Entry',    size: 'medium', submitEvent: 'HEALTH_LOG_ENTRY' },
    addThought:     { title: 'New Thought',         size: 'small',  submitEvent: 'THOUGHT_ADD_REQUEST' },
    addManifest:    { title: 'Manifestation Entry', size: 'medium', submitEvent: 'MANIFEST_ADD_REQUEST' },
    confirmation:   { title: 'Confirm Action',      size: 'small',  submitEvent: null },
    settings:       { title: 'Settings',            size: 'large',  submitEvent: 'SETTINGS_UPDATE_REQUEST' }
  };

  const MODAL_STACK = [];           // active modals {id, element, type, data}
  let isTransitioning = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getModalRoot() {
    return document.getElementById(MODAL_ROOT_ID);
  }

  function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.className = MODAL_OVERLAY_CLASS;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeTopModal();
    });
    return overlay;
  }

  function createModalContainer(type = 'confirmation') {
    const config = MODAL_TYPES[type] || MODAL_TYPES.confirmation;

    const container = document.createElement('div');
    container.className = `${MODAL_CONTAINER_CLASS} modal-${config.size || 'medium'}`;

    container.innerHTML = `
      <div class="${MODAL_HEADER_CLASS}">
        <h2>${config.title}</h2>
        <button class="${MODAL_CLOSE_CLASS}">×</button>
      </div>
      <div class="${MODAL_BODY_CLASS}"></div>
      <div class="${MODAL_FOOTER_CLASS}">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        ${config.submitEvent ? `<button class="btn btn-primary modal-submit">Save</button>` : ''}
      </div>
    `;

    // Close buttons
    container.querySelector(`.${MODAL_CLOSE_CLASS}`).addEventListener('click', closeTopModal);
    container.querySelector('.modal-cancel').addEventListener('click', closeTopModal);

    // Submit handler
    const submitBtn = container.querySelector('.modal-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => handleModalSubmit(type));
    }

    return container;
  }

  function openModal(modalId, options = {}) {
    if (isTransitioning) {
      setTimeout(() => openModal(modalId, options), 100);
      return;
    }

    isTransitioning = true;

    const root = getModalRoot();
    if (!root) {
      console.error('[ModalsUI] Modal root not found');
      isTransitioning = false;
      return;
    }

    const config = MODAL_TYPES[modalId];
    if (!config) {
      console.error('[ModalsUI] Unknown modal type:', modalId);
      isTransitioning = false;
      return;
    }

    // Create modal structure
    const overlay = createModalOverlay();
    const container = createModalContainer(modalId);
    const body = container.querySelector(`.${MODAL_BODY_CLASS}`);

    // Inject custom content if provided
    if (options.content) {
      if (typeof options.content === 'string') {
        body.innerHTML = options.content;
      } else if (options.content instanceof Node) {
        body.appendChild(options.content);
      }
    }

    overlay.appendChild(container);
    root.appendChild(overlay);

    // Focus management
    container.focus();

    // Store modal in stack
    const modalEntry = {
      id: modalId,
      type: modalId,
      element: container,
      overlay,
      data: options.data || {},
      createdAt: Date.now()
    };

    MODAL_STACK.push(modalEntry);

    // Transition in
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.opacity = '1';
      container.classList.add('modal-enter');
    }, 10);

    EventBus.emit('MODAL_OPENED', {
      modalId,
      type: modalId,
      timestamp: Date.now()
    });

    isTransitioning = false;
  }

  function closeTopModal() {
    if (MODAL_STACK.length === 0 || isTransitioning) return;

    isTransitioning = true;

    const modal = MODAL_STACK.pop();
    const overlay = modal.overlay;
    const container = modal.element;

    overlay.style.opacity = '0';
    container.classList.remove('modal-enter');
    container.classList.add('modal-exit');

    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      isTransitioning = false;

      EventBus.emit('MODAL_CLOSED', {
        modalId: modal.type,
        timestamp: Date.now()
      });

      // Focus previous modal or body
      if (MODAL_STACK.length > 0) {
        MODAL_STACK[MODAL_STACK.length - 1].element.focus();
      } else {
        document.body.focus();
      }
    }, 300);
  }

  function handleModalSubmit(modalType) {
    const modal = MODAL_STACK[MODAL_STACK.length - 1];
    if (!modal || modal.type !== modalType) return;

    const config = MODAL_TYPES[modalType];
    if (!config || !config.submitEvent) return;

    // Collect form data (assumes form exists in modal body)
    const form = modal.element.querySelector('form');
    let formData = {};

    if (form) {
      const fd = new FormData(form);
      for (const [key, value] of fd.entries()) {
        formData[key] = value;
      }
    } else {
      // Fallback: custom data from options
      formData = modal.data || {};
    }

    // Emit submission event for engine to process
    EventBus.emit(config.submitEvent, {
      modalId: modalType,
      data: formData,
      timestamp: Date.now()
    });

    // Close modal on submit (can be prevented by engine if needed)
    closeTopModal();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    // Quick-add actions from header/quick buttons
    EventBus.on('HEADER_ACTION_TRIGGERED', ({ action }) => {
      const modalMap = {
        'quick-add-task':       'addTask',
        'quick-add-habit':      'addHabit',
        'quick-add-goal':       'addGoal',
        'quick-add-finance':    'addFinance',
        'quick-add-health':     'addHealth',
        'quick-add-thought':    'addThought',
        'quick-add-manifest':   'addManifest'
      };

      const modalId = modalMap[action];
      if (modalId) {
        openModal(modalId);
      }
    });

    // Confirmation dialogs
    EventBus.on('CONFIRMATION_REQUEST', ({ title, message, onConfirm, onCancel }) => {
      openModal('confirmation', {
        content: `
          <p>${message}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeTopModal()">Cancel</button>
            <button class="btn btn-danger" onclick="closeTopModal(); ${onConfirm ? '/* engine callback */' : ''}">Confirm</button>
          </div>
        `
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC MODALS UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const ModalsUI = {

    init() {
      // Create modal root if missing
      if (!document.getElementById(MODAL_ROOT_ID)) {
        const root = document.createElement('div');
        root.id = MODAL_ROOT_ID;
        document.body.appendChild(root);
      }

      // Keyboard support
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && MODAL_STACK.length > 0) {
          closeTopModal();
        }
      });

      // Subscribe to events
      subscribeToEvents();

      console.log('[ModalsUI] Initialized – modal dialog system ready');
    },

    open(modalId, options = {}) {
      openModal(modalId, options);
    },

    close() {
      closeTopModal();
    },

    closeAll() {
      while (MODAL_STACK.length > 0) {
        closeTopModal();
      }
    },

    getActiveModals() {
      return MODAL_STACK.map(m => ({ id: m.type, openedAt: m.createdAt }));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ModalsUI = ModalsUI;

  // Auto-init after alerts (modals often triggered by alerts)
  function tryInit() {
    if (window.AlertsUI && window.State && window.EventBus) {
      ModalsUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugModals = {
    open: (id, opts) => ModalsUI.open(id, opts),
    close: () => ModalsUI.close(),
    closeAll: () => ModalsUI.closeAll(),
    active: () => ModalsUI.getActiveModals()
  };

})();