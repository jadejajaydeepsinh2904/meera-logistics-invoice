const CACHE='meera-v43-shell';
const API_CACHE='meera-v43-api';
const SHELL=['/','/index.html','/manifest.webmanifest','/src/styles.css?v=35','/src/invoice-v36.css?v=39','/src/party-ledger-v40.css?v=40','/src/supplier-ledger-v41.css?v=41','/src/advanced-v43.css?v=43','/src/app.js?v=43','/src/invoice-v36.js?v=39','/src/party-ledger-v40.js?v=40','/src/supplier-ledger-v41.js?v=41','/src/advanced-v43.js?v=43','/assets/meera-logo.png'];
const DB='meera-offline-v43',STORE='queue';
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function queueRequest(req){const db=await openDb();const headers={};req.headers.forEach((v,k)=>headers[k]=v);const body=await req.clone().text();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).add({url:req.url,method:req.method,headers,body,createdAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function queuedItems(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
async function deleteQueued(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function syncQueue(){for(const item of await queuedItems()){try{const res=await fetch(item.url,{method:item.method,headers:item.headers,body:item.method==='GET'||item.method==='HEAD'?undefined:item.body});if(res.ok)await deleteQueued(item.id);else if(res.status>=400&&res.status<500)await deleteQueued(item.id)}catch{return}}}
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>![CACHE,API_CACHE].includes(k)).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method==='GET'){
    if(url.pathname.includes('/api/bootstrap')||url.pathname.includes('/api/advanced-data')||url.pathname.includes('/api/system-health')){
      e.respondWith((async()=>{const cache=await caches.open(API_CACHE);try{const res=await fetch(req);if(res.ok)cache.put(req,res.clone());return res}catch{const cached=await cache.match(req);return cached||new Response(JSON.stringify({error:'Offline data not available'}),{status:503,headers:{'content-type':'application/json'}})}})());return;
    }
    if(url.origin===self.location.origin){e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match('/index.html'))));return}
  }
  if(['POST','PUT','DELETE'].includes(req.method)&&url.pathname.includes('/api/')){
    e.respondWith((async()=>{try{const res=await fetch(req.clone());syncQueue();return res}catch{await queueRequest(req);if(self.registration.sync)self.registration.sync.register('meera-sync-v43').catch(()=>{});return new Response(JSON.stringify({ok:true,queued:true,offline:true,id:'OFFLINE-'+Date.now()}),{status:202,headers:{'content-type':'application/json','access-control-allow-origin':'*'}})}})());
  }
});
self.addEventListener('sync',e=>{if(e.tag==='meera-sync-v43')e.waitUntil(syncQueue())});
self.addEventListener('message',e=>{if(e.data?.type==='SYNC_QUEUE')e.waitUntil(syncQueue())});
