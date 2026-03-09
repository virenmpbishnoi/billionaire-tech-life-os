(function () {
'use strict';

const ComponentLoader = {

init() {

EventBus.on('VIEW_LOAD_REQUEST', ({ viewId }) => {

EventBus.emit('COMPONENT_READY_FOR_MOUNT', { viewId });

});

console.log('[ComponentLoader] JS rendering mode active');

},

async loadComponent() {

return document.createDocumentFragment();

}

};

window.ComponentLoader = ComponentLoader;

function tryInit(){

if(window.ViewManager && window.EventBus){

ComponentLoader.init();

}else{

setTimeout(tryInit,50);

}

}

tryInit();

})();
