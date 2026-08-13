const CACHE='transportbahi-v180-shell';
const API_CACHE='transportbahi-v180-api';
const SHELL=['/','/index.html','/manifest.webmanifest','/src/styles.css?v=700','/src/invoice-v36.css?v=705','/src/party-ledger-v40.css?v=40','/src/supplier-ledger-v41.css?v=44','/src/advanced-v44.css?v=180','/src/app.js?v=180','/src/fleet-v69.js?v=703','/src/invoice-import-v691.js?v=691','/src/fleet-v69.css?v=691','/src/branding-v703.css?v=711','/vendor/xlsx.full.min.js?v=690','/src/invoice-v36.js?v=705','/src/invoice-pdf-v39.js?v=691','/src/party-ledger-v40.js?v=671','/src/supplier-ledger-v41.js?v=671','/src/advanced-v44.js?v=180','/src/android-v63.js?v=180','/src/language-v683.js?v=700','/src/language-v683.css?v=692','/assets/meera-logo.png','/assets/transportbahi-icon-192.png','/assets/transportbahi-icon-512.png','/assets/transportbahi-app-icon.png','/assets/transportbahi-web-logo.png','/assets/transportbahi-dark-logo.png','/assets/transportbahi-light-logo.png','/assets/transportbahi-favicon-32.png','/src/mobile-v64.css?v=705','/src/desktop-v66.css?v=664','/src/mobile-v68.css?v=702'];
const DB='transport-offline-v664',STORE='queue';
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
    if(req.mode==='navigate'){
      e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const res=await fetch(req,{cache:'no-store'});if(res.ok)cache.put('/index.html',res.clone());return res}catch{return (await cache.match('/index.html'))||new Response('Offline',{status:503})}})());return;
    }
    if(url.pathname.includes('/api/bootstrap')||url.pathname.includes('/api/advanced-data')||url.pathname.includes('/api/system-health')||url.pathname.includes('/api/settings')){
      e.respondWith((async()=>{const cache=await caches.open(API_CACHE);try{const res=await fetch(req);if(res.ok)cache.put(req,res.clone());return res}catch{const cached=await cache.match(req);return cached||new Response(JSON.stringify({error:'Offline data not available'}),{status:503,headers:{'content-type':'application/json'}})}})());return;
    }
    if(url.origin===self.location.origin&&['script','style'].includes(req.destination)){
      e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const res=await fetch(req,{cache:'no-store'});if(res.ok)cache.put(req,res.clone());return res}catch{return (await cache.match(req))||new Response('Offline asset unavailable',{status:503})}})());return;
    }
    if(url.origin===self.location.origin){e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match('/index.html'))));return}
  }
  if(['POST','PUT','DELETE'].includes(req.method)&&url.pathname.includes('/api/')){
    e.respondWith((async()=>{try{const res=await fetch(req.clone());syncQueue();return res}catch{
      if(url.pathname.includes('/api/play-subscription/'))return new Response(JSON.stringify({error:'Internet is required to verify a Google Play subscription.'}),{status:503,headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
      await queueRequest(req);if(self.registration.sync)self.registration.sync.register('transport-sync-v664').catch(()=>{});return new Response(JSON.stringify({ok:true,queued:true,offline:true,id:'OFFLINE-'+Date.now()}),{status:202,headers:{'content-type':'application/json','access-control-allow-origin':'*'}}
    )}})());
  }
});
self.addEventListener('sync',e=>{if(e.tag==='transport-sync-v664')e.waitUntil(syncQueue())});
self.addEventListener('message',e=>{if(e.data?.type==='SYNC_QUEUE')e.waitUntil(syncQueue())});

self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json?.()||{body:event.data?.text?.()||''}}catch{data={body:event.data?.text?.()||''}}
  event.waitUntil(self.registration.showNotification(data.title||'TransportBahi Alert',{
    body:data.body||'Open TransportBahi for details.',tag:data.tag||'transport-push',data:{url:data.url||'/'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification?.data?.url||'/';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus'in client)return client.focus()}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});
