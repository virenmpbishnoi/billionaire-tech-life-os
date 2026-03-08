/*
 * 08-storage.js
 * Persistent Storage Backbone – Billionaire Tech Adaptive Life OS
 * FULL PRODUCTION VERSION – Corrected & Hardened
 */

(function(){

'use strict';

/* ---------------------------------------------------------
CONFIG
--------------------------------------------------------- */

const PREFIX = 'BT_OS';
const SEP = ':';

const GLOBAL_NS = 'system';

const CURRENT_SCHEMA_VERSION = '1.0.0';
const CURRENT_APP_VERSION = '1.0.0';

const CACHE_TTL = 30000;

const STORAGE_KEYS = {

SCHEMA_VERSION:`${PREFIX}${SEP}schemaVersion`,
APP_VERSION:`${PREFIX}${SEP}appVersion`,
LAST_SNAPSHOT:`${PREFIX}${SEP}lastSnapshot`,
LAST_BACKUP:`${PREFIX}${SEP}lastBackupTs`

};

let readCache = new Map();

/* ---------------------------------------------------------
SAFE EVENT BUS
--------------------------------------------------------- */

function getBus(){

return window.eventbus
|| window.EventBus
|| null;

}

/* ---------------------------------------------------------
UTILITIES
--------------------------------------------------------- */

function buildKey(key,userId=null){

if(!key)
throw new Error('Storage key required');

if(userId){

return `${PREFIX}${SEP}user${SEP}${userId}${SEP}${key}`;

}

return `${PREFIX}${SEP}${key}`;

}

function isValidJSON(str){

if(typeof str!=='string')
return false;

try{

JSON.parse(str);
return true;

}catch{

return false;

}

}

function safeParse(str,fallback=null){

if(!str)
return fallback;

try{

return JSON.parse(str);

}catch(err){

console.error('[Storage] JSON parse error',err);

getBus()?.emit?.('STORAGE_CORRUPTION_DETECTED',{
reason:'parse_failure'
});

return fallback;

}

}

function clearCache(){

readCache.clear();

}

/* ---------------------------------------------------------
USER CONTEXT
--------------------------------------------------------- */

function getCurrentUserId(){

const id = localStorage.getItem(
`${PREFIX}${SEP}currentUser`
);

return id || null;

}

/* ---------------------------------------------------------
VALIDATION
--------------------------------------------------------- */

function validateData(key,data){

if(data===undefined)
throw new Error('Undefined write');

if(typeof data==='function')
throw new Error('Invalid type');

return true;

}

function validateAfterRead(key,data){

if(key.includes('tasks') && !Array.isArray(data))
return false;

if(key.includes('habits') && !Array.isArray(data))
return false;

return true;

}

/* ---------------------------------------------------------
CORE API
--------------------------------------------------------- */

const Storage = {

/* ---------------- INIT ---------------- */

init(){

if(!localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION))
localStorage.setItem(
STORAGE_KEYS.SCHEMA_VERSION,
CURRENT_SCHEMA_VERSION
);

if(!localStorage.getItem(STORAGE_KEYS.APP_VERSION))
localStorage.setItem(
STORAGE_KEYS.APP_VERSION,
CURRENT_APP_VERSION
);

clearCache();

console.log('[Storage] Ready');

},

/* ---------------- READ ---------------- */

read(key,userId=null,options={useCache:true}){

const fullKey = buildKey(key,userId);

const now = Date.now();

if(options.useCache){

const cached = readCache.get(fullKey);

if(cached && now-cached.ts<CACHE_TTL){

return cached.data;

}

}

try{

const raw = localStorage.getItem(fullKey);

if(raw===null)
return null;

if(!isValidJSON(raw)){

getBus()?.emit?.('STORAGE_CORRUPTION_DETECTED',{
key:fullKey
});

return null;

}

const parsed = safeParse(raw,null);

if(parsed===null)
return null;

if(!validateAfterRead(key,parsed)){

console.warn('Validation failed',key);

return null;

}

readCache.set(fullKey,{
data:parsed,
ts:now
});

return parsed;

}catch(err){

console.error('Read error',err);

getBus()?.emit?.('STORAGE_READ_FAILURE',{
key:fullKey
});

return null;

}

},

/* ---------------- WRITE ---------------- */

write(key,data,userId=null){

const fullKey = buildKey(key,userId);

try{

validateData(key,data);

const json = JSON.stringify(data);

localStorage.setItem(fullKey,json);

readCache.set(fullKey,{
data,
ts:Date.now()
});

getBus()?.emit?.('STORAGE_WRITE_SUCCESS',{
key:fullKey,
size:json.length
});

return true;

}catch(err){

console.error('Write failed',err);

getBus()?.emit?.('STORAGE_WRITE_FAILURE',{
key:fullKey
});

return false;

}

},

/* ---------------- UPDATE ---------------- */

update(key,fn,userId=null){

if(typeof fn!=='function')
throw new Error('Updater must be function');

const current =
this.read(key,userId,{useCache:false}) || {};

let next;

try{

next = fn(
JSON.parse(JSON.stringify(current))
);

if(!next)
return false;

return this.write(key,next,userId);

}catch(err){

console.error('Update error',err);

return false;

}

},

/* ---------------- REMOVE ---------------- */

remove(key,userId=null){

const fullKey = buildKey(key,userId);

localStorage.removeItem(fullKey);

readCache.delete(fullKey);

getBus()?.emit?.('STORAGE_KEY_REMOVED',{
key:fullKey
});

},

exists(key,userId=null){

return localStorage.getItem(
buildKey(key,userId)
)!==null;

},

/* ---------------- USER CLEAR ---------------- */

clearUser(userId){

const prefix =
`${PREFIX}${SEP}user${SEP}${userId}${SEP}`;

for(let i=localStorage.length-1;i>=0;i--){

const k = localStorage.key(i);

if(k?.startsWith(prefix)){

localStorage.removeItem(k);
readCache.delete(k);

}

}

getBus()?.emit?.('STORAGE_USER_CLEARED',{
userId
});

},

/* ---------------- SNAPSHOT ---------------- */

createSnapshot(){

const snapshot={

timestamp:Date.now(),
schemaVersion:CURRENT_SCHEMA_VERSION,
appVersion:CURRENT_APP_VERSION,
data:{}

};

for(let i=0;i<localStorage.length;i++){

const key = localStorage.key(i);

if(key?.startsWith(PREFIX)){

const val = localStorage.getItem(key);

if(isValidJSON(val)){

snapshot.data[key]=val;

}

}

}

localStorage.setItem(
STORAGE_KEYS.LAST_SNAPSHOT,
JSON.stringify(snapshot)
);

getBus()?.emit?.('STORAGE_BACKUP_CREATED',{
size:Object.keys(snapshot.data).length
});

return snapshot;

},

restoreSnapshot(snapshot){

if(!snapshot || !snapshot.data)
throw new Error('Invalid snapshot');

clearCache();

Object.entries(snapshot.data)
.forEach(([k,v])=>{

if(isValidJSON(v))
localStorage.setItem(k,v);

});

getBus()?.emit?.('STORAGE_RESTORE_SUCCESS',{
timestamp:snapshot.timestamp
});

},

/* ---------------- STORAGE SIZE ---------------- */

getStorageSize(){

let total=0;

for(let i=0;i<localStorage.length;i++){

const key = localStorage.key(i);

if(key?.startsWith(PREFIX)){

const value = localStorage.getItem(key);

total += value ? value.length : 0;

}

}

return total;

},

/* ---------------- LIST KEYS ---------------- */

listKeys(userId=null){

const prefix = userId
? `${PREFIX}${SEP}user${SEP}${userId}${SEP}`
: PREFIX;

const keys=[];

for(let i=0;i<localStorage.length;i++){

const k = localStorage.key(i);

if(k?.startsWith(prefix))
keys.push(k);

}

return keys;

},

/* ---------------- CORRUPTION CHECK ---------------- */

detectCorruption(){

const issues=[];

for(let i=0;i<localStorage.length;i++){

const key = localStorage.key(i);

if(key?.startsWith(PREFIX)){

const val = localStorage.getItem(key);

if(!isValidJSON(val)){

issues.push({
key,
reason:'invalid_json'
});

}

}

}

if(issues.length){

getBus()?.emit?.(
'STORAGE_CORRUPTION_DETECTED',
{issues}
);

}

return issues;

}

};

/* ---------------------------------------------------------
EXPORT
--------------------------------------------------------- */

window.Storage = Storage;

/* ---------------------------------------------------------
INIT
--------------------------------------------------------- */

Storage.init();

/* ---------------------------------------------------------
HEALTH CHECK
--------------------------------------------------------- */

setInterval(()=>{

Storage.detectCorruption();

const size = Storage.getStorageSize();

if(size>4_000_000){

getBus()?.emit?.(
'STORAGE_QUOTA_WARNING',
{size}
);

}

},300000);

})();
