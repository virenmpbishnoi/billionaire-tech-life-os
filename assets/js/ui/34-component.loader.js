/*
 * 34-component.loader.js
 * JS-Driven UI Loader – Billionaire Tech Adaptive Life OS
 *
 * This version disables HTML template loading.
 * UI is rendered directly by JS modules (DashboardUI, SidebarUI, etc).
 */

(function () {
'use strict';

const ComponentLoader = {

async init() {

  // Listen for view load requests from Router/ViewManager
  EventBus.on('VIEW_LOAD_REQUEST', ({ viewId }) => {

    // Directly emit ready event (no HTML loading)
    EventBus.emit('COMPONENT_READY_FOR_MOUNT', {
      viewId
    });

  });

  console.log('[ComponentLoader] JS rendering mode active – HTML templates disabled');

},

// Dummy method kept for compatibility
async loadComponent(name) {

  console.warn('[ComponentLoader] HTML loading disabled:', name);

  return document.createDocumentFragment();

}

};

window.ComponentLoader = ComponentLoader;


// Auto-init
function tryInit() {

if (window.ViewManager && window.State && window.EventBus) {

ComponentLoader.init();

} else {

setTimeout(tryInit, 50);

}

}

tryInit();

})();
