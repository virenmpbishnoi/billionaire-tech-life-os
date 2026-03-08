/*
 * 11-eventbus.js
 * Central Event Communication Backbone
 * Billionaire Tech Adaptive Life OS
 * FULL REBUILD – Production Event Architecture
 */

(function(){

'use strict';

/* ---------------------------------------------------------
CONFIG
--------------------------------------------------------- */

const DEFAULT_PRIORITY = 50;

const MAX_RECURSION = 25;
const MAX_QUEUE = 500;

const EVENT_HISTORY_LIMIT = 500;

const DEBUG_PREFIX = '[EventBus]';

/* ---------------------------------------------------------
STATE
--------------------------------------------------------- */

const listeners = new Map();

const eventQueue = [];

const eventStack = [];

const eventHistory = [];

const eventMetrics = new Map();

let processing = false;

let debugEnabled = false;

/* ---------------------------------------------------------
UTILS
--------------------------------------------------------- */

function normalize(name){

if(typeof name!=='string' || !name.trim())
throw new Error('Invalid event name');

return name.trim();

}

function now(){

return Date.now();

}

function log(...args){

if(debugEnabled)
console.log(DEBUG_PREFIX,...args);

}

function updateMetrics(name,count){

if(!eventMetrics.has(name)){

eventMetrics.set(name,{
count:0,
last:0,
avgListeners:0
});

}

const m = eventMetrics.get(name);

m.count++;

m.last = now();

m.avgListeners =
((m.avgListeners*(m.count-1))+count)/m.count;

}

/* ---------------------------------------------------------
LISTENER MGMT
--------------------------------------------------------- */

function getList(name){

if(!listeners.has(name))
listeners.set(name,[]);

return listeners.get(name);

}

function sortListeners(list){

return list
.slice()
.sort((a,b)=>b.priority-a.priority);

}

/* ---------------------------------------------------------
RECURSION CHECK
--------------------------------------------------------- */

function detectLoop(name){

if(eventStack.includes(name)){

console.warn(
DEBUG_PREFIX,
'Loop detected',
eventStack,
'->',
name
);

return true;

}

if(eventStack.length>MAX_RECURSION){

console.error(
DEBUG_PREFIX,
'Max recursion reached'
);

return true;

}

return false;

}

/* ---------------------------------------------------------
QUEUE PROCESSOR
--------------------------------------------------------- */

async function processQueue(){

if(processing) return;

processing = true;

while(eventQueue.length){

const item = eventQueue.shift();

const {name,payload,async} = item;

await dispatch(name,payload,async);

}

processing = false;

}

/* ---------------------------------------------------------
DISPATCH
--------------------------------------------------------- */

async function dispatch(name,payload,isAsync){

if(detectLoop(name))
return false;

eventStack.push(name);

const list = listeners.get(name);

if(!list){

eventStack.pop();
return false;

}

const ordered = sortListeners(list);

updateMetrics(name,ordered.length);

const promises = [];

for(const entry of ordered){

const {fn,once} = entry;

try{

const result = fn(payload,name);

if(isAsync && result instanceof Promise)
promises.push(result);

if(once)
EventBus.off(name,fn);

}catch(err){

console.error(
DEBUG_PREFIX,
'Listener failed',
name,
err
);

}

}

if(isAsync && promises.length){

await Promise.allSettled(promises);

}

eventStack.pop();

eventHistory.push({
name,
timestamp:now(),
listeners:ordered.length
});

if(eventHistory.length>EVENT_HISTORY_LIMIT)
eventHistory.shift();

return true;

}

/* ---------------------------------------------------------
API
--------------------------------------------------------- */

const EventBus = {

/* ---------------- INIT ---------------- */

init(){

listeners.clear();

eventQueue.length = 0;

eventStack.length = 0;

eventMetrics.clear();

eventHistory.length = 0;

processing = false;

console.log('[EventBus] Ready');

},

/* ---------------- SUBSCRIBE ---------------- */

on(name,fn,options={}){

name = normalize(name);

if(typeof fn!=='function')
throw new Error('Listener must be function');

const priority =
Number(options.priority) || DEFAULT_PRIORITY;

const once = !!options.once;

const entry = {fn,priority,once};

getList(name).push(entry);

log('subscribe',name,priority);

return ()=>this.off(name,fn);

},

once(name,fn,opt={}){

return this.on(name,fn,{
...opt,
once:true
});

},

/* ---------------- UNSUBSCRIBE ---------------- */

off(name,fn){

if(!name){

listeners.clear();
return;

}

name = normalize(name);

if(!listeners.has(name))
return;

if(!fn){

listeners.delete(name);
return;

}

const list = listeners.get(name);

const filtered =
list.filter(e=>e.fn!==fn);

if(filtered.length)
listeners.set(name,filtered);
else
listeners.delete(name);

},

/* ---------------- EMIT ---------------- */

emit(name,payload={}){

name = normalize(name);

if(eventQueue.length>MAX_QUEUE){

console.warn(
DEBUG_PREFIX,
'Event flood protection triggered'
);

return false;

}

eventQueue.push({
name,
payload,
async:false
});

processQueue();

return true;

},

/* ---------------- EMIT ASYNC ---------------- */

emitAsync(name,payload={}){

name = normalize(name);

eventQueue.push({
name,
payload,
async:true
});

processQueue();

return true;

},

/* ---------------- INSPECT ---------------- */

hasListeners(name){

return listeners.has(normalize(name));

},

listeners(name){

return (listeners.get(normalize(name))||[])
.map(l=>({
priority:l.priority,
once:l.once
}));

},

events(){

return Array.from(listeners.keys());

},

metrics(){

return Object.fromEntries(eventMetrics);

},

history(){

return eventHistory.slice();

},

/* ---------------- DEBUG ---------------- */

enableDebug(){

debugEnabled = true;

console.log('[EventBus] Debug ON');

},

disableDebug(){

debugEnabled = false;

},

clear(){

listeners.clear();

eventQueue.length=0;

eventHistory.length=0;

eventMetrics.clear();

}

};

/* ---------------------------------------------------------
EXPORT
--------------------------------------------------------- */

window.EventBus = EventBus;

/* ---------------------------------------------------------
INIT
--------------------------------------------------------- */

EventBus.init();

/* ---------------------------------------------------------
DEBUG TOOL
--------------------------------------------------------- */

window.__eventbus = {

on:EventBus.on.bind(EventBus),
emit:EventBus.emit.bind(EventBus),

events:()=>EventBus.events(),

metrics:()=>EventBus.metrics(),

history:()=>EventBus.history()

};

/* ---------------------------------------------------------
DEBUG METRICS LOGGER
--------------------------------------------------------- */

setInterval(()=>{

if(!debugEnabled)
return;

console.group('[EventBus Metrics]');

console.table(EventBus.metrics());

console.groupEnd();

},300000);

})();
