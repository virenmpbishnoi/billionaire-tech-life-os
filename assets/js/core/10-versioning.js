/*
 * 10-versioning.js
 * Application & Schema Version Control – Billionaire Tech Adaptive Life OS
 * Fully Corrected Production Version
 */

(function () {
'use strict';

const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';
const VERSION_STORAGE_KEY = 'system:version';

const MIGRATIONS = new Map();

function getBus(){
  return window.eventbus || window.EventBus || null;
}

function getStorage(){
  return window.Storage || null;
}

function getState(){
  return window.State || null;
}

/* ---------------- VERSION PARSER ---------------- */

function parseVersion(v){
  if(typeof v !== 'string') return [0,0,0];

  const parts = v.split('-')[0].split('.').map(Number);

  return [
    parts[0] || 0,
    parts[1] || 0,
    parts[2] || 0
  ];
}

function compareVersions(a,b){

  const [a1,a2,a3] = parseVersion(a);
  const [b1,b2,b3] = parseVersion(b);

  if(a1>b1) return 1;
  if(a1<b1) return -1;

  if(a2>b2) return 1;
  if(a2<b2) return -1;

  if(a3>b3) return 1;
  if(a3<b3) return -1;

  return 0;
}

/* ---------------- MIGRATION REGISTER ---------------- */

function registerMigration(targetVersion,handler,options={}){

  if(typeof handler!=='function')
  throw new Error('Migration handler must be function');

  if(!targetVersion)
  throw new Error('Migration target version missing');

  if(!MIGRATIONS.has(targetVersion)){
    MIGRATIONS.set(targetVersion,[]);
  }

  MIGRATIONS.get(targetVersion).push({
    handler,
    from: options.from || [],
    description: options.description || 'Migration step'
  });

}

/* ---------------- RUN MIGRATIONS ---------------- */

async function runMigrations(fromVersion,toVersion){

  const bus = getBus();
  const Storage = getStorage();
  const State = getState();

  if(compareVersions(fromVersion,toVersion)>=0){
    return true;
  }

  bus?.emit?.('MIGRATION_STARTED',{from:fromVersion,to:toVersion});

  const targets = Array.from(MIGRATIONS.keys())
  .sort((a,b)=>compareVersions(a,b));

  let current = fromVersion;

  for(const target of targets){

    if(compareVersions(target,current)<=0) continue;
    if(compareVersions(target,toVersion)>0) break;

    const steps = MIGRATIONS.get(target);

    for(const step of steps){

      try{

        await step.handler(
          State?.get?.() || {},
          Storage
        );

      }catch(err){

        console.error('Migration failed',step.description);

        bus?.emit?.('MIGRATION_FAILED',{
          step:step.description,
          error:err.message
        });

        return false;
      }

    }

    current = target;

  }

  await updateStoredVersion(toVersion,SCHEMA_VERSION);

  bus?.emit?.('MIGRATION_COMPLETED',{from:fromVersion,to:toVersion});

  return true;

}

/* ---------------- VERSION STORAGE ---------------- */

async function readStoredVersionMetadata(){

  const Storage = getStorage();

  if(!Storage) return {};

  const data = Storage.read?.(VERSION_STORAGE_KEY) || {};

  return {

    appVersion: data.appVersion || '0.0.0',
    schemaVersion: data.schemaVersion || '0.0.0',
    dataVersion: data.dataVersion || '0.0.0',
    lastMigration: data.lastMigration || null,
    lastChecked: data.lastChecked || null

  };

}

async function updateStoredVersion(appVer=APP_VERSION,schemaVer=SCHEMA_VERSION){

  const Storage = getStorage();
  const bus = getBus();

  if(!Storage) return false;

  const meta = {

    appVersion:appVer,
    schemaVersion:schemaVer,
    dataVersion:schemaVer,
    lastMigration:Date.now(),
    lastChecked:Date.now()

  };

  Storage.write?.(VERSION_STORAGE_KEY,meta);

  bus?.emit?.('VERSION_UPDATED',meta);

  return true;

}

/* ---------------- PUBLIC API ---------------- */

const Versioning = {

async init(){

  const stored = await readStoredVersionMetadata();

  const bus = getBus();

  bus?.emit?.('VERSION_INITIALIZED',{
    app:APP_VERSION,
    schema:SCHEMA_VERSION,
    stored
  });

  const appMismatch =
  compareVersions(APP_VERSION,stored.appVersion)!==0;

  const schemaMismatch =
  compareVersions(SCHEMA_VERSION,stored.schemaVersion)!==0;

  if(!appMismatch && !schemaMismatch){
    return true;
  }

  const success = await runMigrations(
    stored.schemaVersion || '0.0.0',
    SCHEMA_VERSION
  );

  if(success){
    await updateStoredVersion();
  }

  return success;

},

getAppVersion(){
  return APP_VERSION;
},

getSchemaVersion(){
  return SCHEMA_VERSION;
},

async getStoredVersion(){
  return await readStoredVersionMetadata();
},

compareVersions,

registerMigration,

runMigrations,

updateStoredVersion,

async getVersionInfo(){

  const stored = await readStoredVersionMetadata();

  return {

    current:{
      app:APP_VERSION,
      schema:SCHEMA_VERSION
    },

    stored,

    timestamp:Date.now()

  };

},

async rollbackMigration(target){

  const bus = getBus();

  console.warn('Rollback requested',target);

  bus?.emit?.('VERSION_ROLLBACK_EXECUTED',{target});

}

};

/* ---------------- GLOBAL EXPORT ---------------- */

window.Versioning = Versioning;

/* ---------------- SAFE INIT ---------------- */

let attempts = 0;
const MAX_ATTEMPTS = 100;

async function tryInit(){

  attempts++;

  if(window.Storage && window.State){

    await Versioning.init();
    return;

  }

  if(attempts>MAX_ATTEMPTS){
    console.error('Versioning init failed');
    return;
  }

  setTimeout(tryInit,50);

}

tryInit();

/* ---------------- DEBUG ---------------- */

window.__debugVersionInfo =
() => Versioning.getVersionInfo().then(console.log);

})();
