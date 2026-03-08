/*
 * 09-state.js
 * Central In-Memory State Manager – Billionaire Tech Adaptive Life OS
 * HARDENED PRODUCTION VERSION
 */

(function(){

'use strict';

/* ---------------------------------------------------------
STATE CONTAINER
--------------------------------------------------------- */

let currentState = null;
let previousState = null;

let isDirtyFlag = false;

const subscribers = new Set();

/* ---------------------------------------------------------
DEFAULT STRUCTURE
--------------------------------------------------------- */

const DEFAULT_STATE = {

user:null,

tasks:[],
habits:[],
missions:[],

finance:{
balance:0,
history:[]
},

health:{
energy:100,
stress:0
},

targets:[],

streak:{
current:0,
longest:0,
history:[]
},

score:{
total:0,
breakdown:{}
},

discipline:{
index:0,
history:[]
},

risk:{
level:'low',
factors:{}
},

burnout:{
risk:0,
lastCheck:null
},

rank:{
current:'beginner',
xp:0,
nextThreshold:1000
},

badges:[],

focus:{
sessions:[],
currentSession:null
},

thoughts:[],

notifications:[],

analytics:{
daily:{},
weekly:{},
monthly:{}
},

system:{
theme:'default',
lockdown:false,
lastSync:null
}

};

/* ---------------------------------------------------------
UTILS
--------------------------------------------------------- */

function deepClone(obj){

if(typeof structuredClone === 'function'){
return structuredClone(obj);
}

return JSON.parse(JSON.stringify(obj));

}

function getBus(){

return window.eventbus
|| window.EventBus
|| null;

}

function getByPath(obj,path){

if(!path) return obj;

return path.split('.')
.reduce((acc,key)=>{

if(acc===undefined) return undefined;
return acc[key];

},obj);

}

function setByPath(obj,path,value){

if(!path) return value;

const parts = path.split('.');

const root = deepClone(obj);

let cursor = root;

for(let i=0;i<parts.length-1;i++){

const p = parts[i];

if(typeof cursor[p]!=='object')
cursor[p]={};

cursor = cursor[p];

}

cursor[parts[parts.length-1]] = value;

return root;

}

/* ---------------------------------------------------------
DIFF
--------------------------------------------------------- */

function diff(oldObj,newObj){

const changes=[];

function walk(o,n,prefix=''){

if(o===n) return;

if(typeof o!=='object' || typeof n!=='object'){

changes.push({
path:prefix,
old:o,
new:n
});

return;

}

const keys = new Set([
...Object.keys(o||{}),
...Object.keys(n||{})
]);

for(const k of keys){

const path = prefix?`${prefix}.${k}`:k;

walk(o?.[k],n?.[k],path);

}

}

walk(oldObj,newObj);

return changes;

}

/* ---------------------------------------------------------
NOTIFY
--------------------------------------------------------- */

function notify(change){

for(const sub of subscribers){

try{

sub.callback(
currentState,
previousState,
change
);

}catch(err){

console.error('Subscriber error',err);

}

if(sub.options?.once){

subscribers.delete(sub);

}

}

}

/* ---------------------------------------------------------
API
--------------------------------------------------------- */

const State = {

/* ---------------- INIT ---------------- */

async init(){

if(currentState!==null) return;

let loaded =
window.Storage?.read?.('appState');

if(!loaded)
loaded = deepClone(DEFAULT_STATE);

currentState = loaded;

previousState = deepClone(loaded);

isDirtyFlag = false;

this.update(
'system.lastSync',
()=>Date.now(),
{silent:true}
);

getBus()?.emit?.(
'STATE_INITIALIZED',
{ts:Date.now()}
);

},

/* ---------------- GET ---------------- */

get(){

return deepClone(currentState);

},

getPath(path){

return deepClone(
getByPath(currentState,path)
);

},

/* ---------------- UPDATE ---------------- */

update(path,updater,options={}){

if(!currentState)
throw new Error('State not initialized');

const oldValue = getByPath(
currentState,
path
);

let newValue;

try{

if(typeof updater==='function')
newValue = updater(oldValue);
else
newValue = updater;

if(newValue===oldValue)
return false;

previousState = deepClone(currentState);

currentState =
setByPath(
currentState,
path,
newValue
);

if(!options.silent){

isDirtyFlag = true;

const d = diff(
previousState,
currentState
);

getBus()?.emit?.(
'STATE_UPDATED',
{
path,
previous:oldValue,
next:newValue,
diff:d,
timestamp:Date.now()
}
);

notify({
path,
diff:d
});

}

return true;

}catch(err){

console.error('State update failed',err);

currentState =
deepClone(previousState);

getBus()?.emit?.(
'STATE_ERROR',
{path,error:err.message}
);

return false;

}

},

/* ---------------- MERGE ---------------- */

merge(partial,options={}){

if(typeof partial!=='object')
return false;

previousState =
deepClone(currentState);

currentState = {
...currentState,
...partial
};

if(!options.silent){

isDirtyFlag = true;

const d = diff(
previousState,
currentState
);

getBus()?.emit?.(
'STATE_UPDATED',
{
type:'merge',
diff:d
}
);

notify({
type:'merge',
diff:d
});

}

return true;

},

/* ---------------- RESET ---------------- */

reset(){

previousState =
deepClone(currentState);

currentState =
deepClone(DEFAULT_STATE);

isDirtyFlag = true;

getBus()?.emit?.(
'STATE_RESET',
{ts:Date.now()}
);

notify({type:'reset'});

},

/* ---------------- DIRTY ---------------- */

markDirty(){

isDirtyFlag = true;

},

clearDirty(){

isDirtyFlag = false;

},

isDirty(){

return isDirtyFlag;

},

/* ---------------- SUBSCRIBE ---------------- */

subscribe(callback,options={}){

if(typeof callback!=='function')
throw new Error('Subscriber must be function');

const entry={
callback,
options
};

subscribers.add(entry);

if(options?.immediate!==false){

callback(
currentState,
previousState,
{type:'init'}
);

}

return ()=>{

subscribers.delete(entry);

};

},

unsubscribe(callback){

for(const s of subscribers){

if(s.callback===callback){

subscribers.delete(s);
break;

}

}

},

/* ---------------- DIFF ---------------- */

diff(){

return diff(
previousState,
currentState
);

},

/* ---------------- SYNC ---------------- */

async syncToStorage(){

if(!isDirtyFlag)
return true;

try{

const ok =
window.Storage?.write?.(
'appState',
currentState
);

if(ok){

isDirtyFlag = false;

getBus()?.emit?.(
'STATE_SYNCED',
{ts:Date.now()}
);

return true;

}

return false;

}catch(err){

console.error('State sync failed',err);

getBus()?.emit?.(
'STATE_SYNC_ERROR',
{error:err.message}
);

return false;

}

}

};

/* ---------------------------------------------------------
EXPORT
--------------------------------------------------------- */

window.State = State;

/* ---------------------------------------------------------
INIT
--------------------------------------------------------- */

function waitForStorage(){

if(window.Storage){

State.init();
return;

}

setTimeout(
waitForStorage,
100
);

}

waitForStorage();

/* ---------------------------------------------------------
AUTO SYNC
--------------------------------------------------------- */

setInterval(()=>{

if(State.isDirty()){

State.syncToStorage();

}

},30000);

})();
