import {api} from './core/api.js';

const A43={overlay:null,data:null,bootstrap:null,month:new Date().toISOString().slice(0,7)};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate=v=>{if(!v)return '-';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:v};
const safeName=v=>String(v||'MEERA').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)};
const toast=(text,type='ok')=>{let t=document.querySelector('.a43-toast');if(!t){t=document.createElement('div');t.className='a43-toast';document.body.appendChild(t)}t.className=`a43-toast ${type}`;t.textContent=text;t.hidden=false;clearTimeout(t._timer);t._timer=setTimeout(()=>t.hidden=true,3200)};

async function loadAdvanced(force=false){
  if(!force&&A43.data)return A43.data;
  A43.data=await api('/advanced-data');
  return A43.data;
}
async function loadBootstrap(force=false){
  if(!force&&A43.bootstrap)return A43.bootstrap;
  A43.bootstrap=await api('/bootstrap');
  return A43.bootstrap;
}
function closeAdvanced(){A43.overlay?.remove();A43.overlay=null}
function modal(title,body,actions=''){
  closeAdvanced();
  const host=document.createElement('div');host.className='a43-overlay';
  host.innerHTML=`<section class="a43-modal"><header><div><b>${esc(title)}</b><small>Meera Logistics Smart Operations</small></div><div class="a43-head-actions">${actions}<button data-a43-close>Close</button></div></header><main>${body}</main></section>`;
  document.body.appendChild(host);A43.overlay=host;
  host.querySelector('[data-a43-close]').onclick=closeAdvanced;
  host.addEventListener('click',e=>{if(e.target===host)closeAdvanced()});
  return host;
}
function loading(title){return modal(title,'<div class="a43-loading">Loading…</div>')}
function statusBadge(v){const s=String(v||'').toUpperCase();return `<span class="a43-badge ${s.toLowerCase()}">${esc(s||'-')}</span>`}
function toolCard(icon,title,text,action){return `<button class="a43-tool-card" data-a43-tool="${action}"><span>${icon}</span><b>${esc(title)}</b><small>${esc(text)}</small></button>`}

function openTools(){
  const host=modal('Smart Tools',`<div class="a43-tools-grid">
    ${toolCard('📅','Calendar','Trips, bookings, invoices and expiry dates','calendar')}
    ${toolCard('🚚','Booking Workflow','Booking → Approval → Dispatch → Trip','workflow')}
    ${toolCard('✅','Approvals','Pending booking approvals','approvals')}
    ${toolCard('♻️','Recycle Bin','Restore deleted records safely','recycle')}
    ${toolCard('🩺','System Health','Database and ledger diagnostics','health')}
    ${toolCard('📊','Excel Center','Full export, import and monthly files','excel')}
    ${toolCard('☁️','Scheduled Backups','Daily Cloudflare backup snapshots','backups')}
    ${toolCard('🖼️','Truck Gallery','Multiple document images per truck','gallery')}
  </div><div class="a43-tip"><b>Command Palette:</b> keyboard par <kbd>Ctrl</kbd> + <kbd>K</kbd></div>`);
  host.querySelectorAll('[data-a43-tool]').forEach(b=>b.onclick=()=>openFeature(b.dataset.a43Tool));
}
async function openFeature(name){
  const map={calendar:openCalendar,workflow:openWorkflow,approvals:openApprovals,recycle:openRecycle,health:openHealth,excel:openExcel,backups:openBackups,gallery:openGallery};
  return map[name]?.();
}

// CREATIVE CALENDAR
function calendarEvents(data,month){
  const events=[];
  for(const b of data.bookings||[])if(String(b.booking_date||'').startsWith(month))events.push({date:b.booking_date,type:'BOOKING',title:`${b.booking_no} · ${b.party_name}`,sub:b.status});
  for(const t of data.trips||[])if(String(t.trip_date||'').startsWith(month))events.push({date:t.trip_date,type:'TRIP',title:`${t.trip_no} · ${t.truck_no}`,sub:`${t.loading_point} → ${t.unloading_point}`});
  for(const i of data.invoices||[])if(String(i.invoice_date||'').startsWith(month))events.push({date:i.invoice_date,type:'INVOICE',title:`${i.invoice_no} · ${i.party_name}`,sub:money(i.total)});
  for(const d of data.documents||[])if(String(d.expiry_date||'').startsWith(month))events.push({date:d.expiry_date,type:'EXPIRY',title:`${d.truck_no} · ${d.kind}`,sub:'Document expiry'});
  return events;
}
function calendarHtml(data,month){
  const [year,mon]=month.split('-').map(Number);const first=new Date(year,mon-1,1);const days=new Date(year,mon,0).getDate();const lead=first.getDay();
  const events=calendarEvents(data,month);const byDay={};for(const e of events)(byDay[Number(e.date.slice(-2))]??=[]).push(e);
  const cells=[];for(let i=0;i<lead;i++)cells.push('<div class="a43-day muted"></div>');
  for(let day=1;day<=days;day++)cells.push(`<div class="a43-day ${new Date().toISOString().slice(0,10)===`${month}-${String(day).padStart(2,'0')}`?'today':''}"><b>${day}</b><div>${(byDay[day]||[]).slice(0,5).map(e=>`<button class="a43-event ${e.type.toLowerCase()}" title="${esc(e.sub)}"><span>${esc(e.type)}</span>${esc(e.title)}</button>`).join('')}</div>${(byDay[day]||[]).length>5?`<small>+${(byDay[day]||[]).length-5} more</small>`:''}</div>`);
  return `<div class="a43-calendar-head"><button data-cal-prev>‹</button><h2>${first.toLocaleString('en-IN',{month:'long',year:'numeric'})}</h2><button data-cal-next>›</button></div><div class="a43-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<b>${x}</b>`).join('')}</div><div class="a43-calendar">${cells.join('')}</div><div class="a43-legend"><span class="booking">Booking</span><span class="trip">Trip</span><span class="invoice">Invoice</span><span class="expiry">Expiry</span></div>`;
}
async function openCalendar(){
  const host=loading('Professional Calendar');
  try{const data=await loadAdvanced(true);host.querySelector('main').innerHTML=calendarHtml(data,A43.month);wireCalendar(host,data)}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
function wireCalendar(host,data){
  const move=n=>{const [y,m]=A43.month.split('-').map(Number);A43.month=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);host.querySelector('main').innerHTML=calendarHtml(data,A43.month);wireCalendar(host,data)};
  host.querySelector('[data-cal-prev]').onclick=()=>move(-1);host.querySelector('[data-cal-next]').onclick=()=>move(1);
}

// BOOKING / APPROVAL / DISPATCH / TRIP
async function bookingForm(existing=null){
  const b=await loadBootstrap();
  const opt=(rows,key,val='')=>`<option value="">Select</option>`+rows.map(x=>`<option ${String(x[key])===String(val)?'selected':''}>${esc(x[key])}</option>`).join('');
  const x=existing||{};
  const host=modal(existing?'Edit Booking':'New Booking',`<form class="a43-form" id="a43BookingForm">
    <label><span>Booking Date</span><input type="date" name="bookingDate" value="${esc(x.booking_date||new Date().toISOString().slice(0,10))}" required></label>
    <label><span>Expected Delivery</span><input type="date" name="expectedDate" value="${esc(x.expected_date||'')}"></label>
    <label><span>Party</span><select name="partyName" required>${opt(b.parties,'party_name',x.party_name)}</select></label>
    <label><span>Truck</span><select name="truckNo" required>${opt(b.trucks,'truck_no',x.truck_no)}</select></label>
    <label><span>Material</span><select name="material" required>${opt(b.materials,'material_name',x.material)}</select></label>
    <label><span>Loading Point</span><select name="loadingPoint" required>${opt(b.routes,'loading_point',x.loading_point)}</select></label>
    <label><span>Unloading Point</span><select name="unloadingPoint" required>${opt(b.routes,'unloading_point',x.unloading_point)}</select></label>
    <label class="wide"><span>Notes</span><textarea name="notes">${esc(x.notes||'')}</textarea></label>
    <div class="a43-form-actions"><button type="button" data-a43-close-form>Cancel</button><button class="primary">Save Booking</button></div>
  </form>`);
  host.querySelector('[data-a43-close-form]').onclick=closeAdvanced;
  host.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));await api('/workflow-bookings'+(x.id?'/'+x.id:''),{method:x.id?'PUT':'POST',body:JSON.stringify(body)});A43.data=null;toast('Booking saved');openWorkflow()}catch(err){alert(err.message)}finally{btn.disabled=false}};
}
function bookingActions(b){
  const buttons=[];
  if(b.status==='DRAFT'||b.status==='REJECTED')buttons.push(`<button data-book-action="submit" data-id="${b.id}">Send Approval</button>`);
  if(b.approval_status==='APPROVED'&&b.status==='APPROVED')buttons.push(`<button data-book-action="dispatch" data-id="${b.id}">Dispatch</button>`);
  if(['DISPATCHED','APPROVED'].includes(b.status)&&b.approval_status==='APPROVED')buttons.push(`<button class="primary" data-book-action="convert" data-id="${b.id}">Create Trip</button>`);
  if(!['CONVERTED','COMPLETED'].includes(b.status))buttons.push(`<button data-edit-booking="${b.id}">Edit</button><button class="danger" data-trash-booking="${b.id}">Delete</button>`);
  if(b.status==='CONVERTED')buttons.push(`<button data-book-action="complete" data-id="${b.id}">Complete</button>`);
  return buttons.join('');
}
async function openWorkflow(){
  const host=loading('Booking → Dispatch → Trip');
  try{
    const data=await loadAdvanced(true);const bookings=data.bookings||[];
    host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-new-booking>+ New Booking</button>');
    host.querySelector('main').innerHTML=`<div class="a43-flow"><span>1. Booking</span><i>→</i><span>2. Approval</span><i>→</i><span>3. Dispatch</span><i>→</i><span>4. Trip</span></div><div class="a43-bookings">${bookings.length?bookings.map(b=>`<article><div><b>${esc(b.booking_no)}</b>${statusBadge(b.status)}${statusBadge(b.approval_status)}</div><h3>${esc(b.party_name)}</h3><p><b>${esc(b.truck_no||'-')}</b> · ${esc(b.material||'-')}</p><p>${esc(b.loading_point)} → ${esc(b.unloading_point)}</p><small>${fmtDate(b.booking_date)}${b.expected_date?' · Expected '+fmtDate(b.expected_date):''}${b.trip_id?' · Trip linked':''}</small><footer>${bookingActions(b)}</footer></article>`).join(''):'<div class="a43-empty">No bookings. Create the first booking.</div>'}</div>`;
    host.querySelector('[data-new-booking]').onclick=()=>bookingForm();
    host.querySelectorAll('[data-edit-booking]').forEach(x=>x.onclick=()=>bookingForm(bookings.find(b=>b.id===x.dataset.editBooking)));
    host.querySelectorAll('[data-trash-booking]').forEach(x=>x.onclick=()=>moveToRecycle('booking',x.dataset.trashBooking,openWorkflow));
    host.querySelectorAll('[data-book-action]').forEach(x=>x.onclick=async()=>{x.disabled=true;try{const res=await api(`/workflow-bookings/${x.dataset.id}/${x.dataset.bookAction}`,{method:'POST',body:'{}'});toast(res.tripNo?`Trip ${res.tripNo} created`:'Workflow updated');A43.data=null;openWorkflow()}catch(e){alert(e.message)}finally{x.disabled=false}});
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
async function openApprovals(){
  const host=loading('Approval System');
  try{const data=await loadAdvanced(true),rows=data.approvals||[];host.querySelector('main').innerHTML=`<div class="a43-approvals">${rows.length?rows.map(a=>`<article><div><b>${esc(a.action)}</b>${statusBadge(a.status)}</div><p>${esc(a.entity_type)} · ${esc(a.entity_id)}</p><small>Requested by ${esc(a.requested_by||'-')} · ${fmtDate(a.created_at)}</small>${a.status==='PENDING'?`<footer><button class="primary" data-approve="${a.id}">Approve</button><button class="danger" data-reject="${a.id}">Reject</button></footer>`:''}</article>`).join(''):'<div class="a43-empty">No approval requests.</div>'}</div>`;host.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approvalDecision(b.dataset.approve,'approve'));host.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>approvalDecision(b.dataset.reject,'reject'))}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
async function approvalDecision(id,action){try{await api(`/approvals/${id}/${action}`,{method:'POST',body:JSON.stringify({notes:''})});A43.data=null;toast(`Request ${action}d`);openApprovals()}catch(e){alert(e.message)}}

// RECYCLE BIN
async function moveToRecycle(entityType,entityId,after){
  if(!confirm('Delete karine Recycle Bin ma mukvu chhe? Pachhi restore kari sakase.'))return;
  try{await api('/recycle-bin',{method:'POST',body:JSON.stringify({entityType,entityId})});A43.data=null;A43.bootstrap=null;toast('Moved to Recycle Bin');after?.();document.getElementById('refreshBtn')?.click()}catch(e){alert(e.message)}
}
async function openRecycle(){
  const host=loading('Recycle Bin');
  try{const rows=await api('/recycle-bin');host.querySelector('main').innerHTML=`<div class="a43-recycle">${rows.length?rows.map(x=>`<article><div><b>${esc(x.label||x.entity_id)}</b>${statusBadge(x.entity_type)}</div><small>Deleted ${fmtDate(x.deleted_at)} by ${esc(x.deleted_by||'-')}</small><footer><button class="primary" data-restore="${x.id}">Restore</button><button class="danger" data-purge="${x.id}">Delete Forever</button></footer></article>`).join(''):'<div class="a43-empty">Recycle Bin is empty.</div>'}</div>`;host.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{await api(`/recycle-bin/${b.dataset.restore}/restore`,{method:'POST',body:'{}'});toast('Record restored');A43.data=null;A43.bootstrap=null;openRecycle();document.getElementById('refreshBtn')?.click()});host.querySelectorAll('[data-purge]').forEach(b=>b.onclick=async()=>{if(confirm('Permanent delete? Aa pachhi restore nahi thay.')){await api(`/recycle-bin/${b.dataset.purge}`,{method:'DELETE'});openRecycle()}})}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
const DELETE_MAP={'delete-trip':'trip','delete-invoice':'invoice','delete-pm-bill':'pm-bill','delete-party':'party','delete-party-payment':'party-payment','delete-truck':'truck','delete-truck-entry':'truck-entry','delete-supplier-payment':'supplier-payment','delete-route':'route','delete-material':'material','delete-expense':'expense','delete-document':'document'};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');const entity=DELETE_MAP[b?.dataset.action];if(!entity)return;e.preventDefault();e.stopImmediatePropagation();moveToRecycle(entity,b.dataset.id)},true);

// SYSTEM HEALTH
async function openHealth(){
  const host=loading('System Health Dashboard');
  try{const h=await api('/system-health');host.querySelector('main').innerHTML=`<div class="a43-health-score ${h.ok?'good':'warn'}"><strong>${h.ok?'HEALTHY':'ATTENTION'}</strong><span>${fmtDate(h.checkedAt)}</span></div><div class="a43-health-grid">${h.checks.map(c=>`<article class="${c.status.toLowerCase()}"><span>${c.status==='OK'?'✓':c.status==='WARNING'?'!':'i'}</span><div><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div></article>`).join('')}</div><h3>Database Records</h3><div class="a43-counts">${Object.entries(h.counts).map(([k,v])=>`<div><small>${esc(k.replaceAll('_',' '))}</small><b>${v}</b></div>`).join('')}</div>`}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// EXCEL XML (.xls) IMPORT / EXPORT
function xmlEsc(v){return String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[c]))}
function workbookXml(payload){
  const sheets=payload.sheets||payload;let body='';
  for(const [name,rows0] of Object.entries(sheets)){const rows=Array.isArray(rows0)?rows0:[];const headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];body+=`<Worksheet ss:Name="${xmlEsc(String(name).slice(0,31))}"><Table><Row>${headers.map(h=>`<Cell><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join('')}</Row>${rows.map(r=>`<Row>${headers.map(h=>{const value=r[h]??'';const numType=typeof value==='number'||(/^[-+]?\d+(\.\d+)?$/.test(String(value))&&String(value)!=='');return `<Cell><Data ss:Type="${numType?'Number':'String'}">${xmlEsc(value)}</Data></Cell>`}).join('')}</Row>`).join('')}</Table></Worksheet>`}
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}
function downloadWorkbook(payload,name){downloadBlob(new Blob([workbookXml(payload)],{type:'application/vnd.ms-excel;charset=utf-8'}),safeName(name)+'.xls')}
function parseWorkbookXml(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');const sheets={};
  [...doc.getElementsByTagNameNS('*','Worksheet')].forEach(ws=>{const name=ws.getAttribute('ss:Name')||ws.getAttribute('Name')||'Sheet';const rows=[...ws.getElementsByTagNameNS('*','Row')].map(row=>[...row.getElementsByTagNameNS('*','Cell')].map(cell=>cell.getElementsByTagNameNS('*','Data')[0]?.textContent||''));if(!rows.length)return;const heads=rows.shift();sheets[name]=rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(heads.map((h,i)=>[h,r[i]??''])))});return {sheets};
}
function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++}else if(c==='"')q=!q;else if(c===','&&!q){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x!==''))rows.push(row);const h=rows.shift()||[];return rows.map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])))}
async function openExcel(){
  const host=loading('Excel Import / Export Center');
  try{const data=await loadAdvanced(true);host.querySelector('main').innerHTML=`<div class="a43-excel-grid"><article><h3>Full Excel Export</h3><p>Party, Truck, Trip, Invoice, Payments, Expenses ane Booking badha sheets sathe.</p><button class="primary" data-export-all>Download Full Excel</button></article><article><h3>Full Excel Import</h3><p>V43 export kareli .xls, CSV athva JSON backup merge karo.</p><select data-import-sheet><option>Parties</option><option>Trucks</option><option>Routes</option><option>Materials</option><option>Bookings</option><option>Trips</option><option>Invoices</option><option>InvoiceItems</option><option>PartyPayments</option><option>SupplierPayments</option><option>TruckEntries</option><option>Expenses</option></select><input type="file" data-import-file accept=".xls,.xml,.csv,.json"><button data-import-btn>Import</button></article><article class="wide"><h3>Monthly Excel Generation</h3><div class="a43-month-controls"><input type="month" value="${new Date().toISOString().slice(0,7)}" data-month-key><button data-generate-month>Generate Month</button></div><div class="a43-month-list">${(data.monthly||[]).map(m=>{const s=JSON.parse(m.summary||'{}');return `<div><b>${m.month_key}</b><small>${s.invoices||0} invoices · ${s.trips||0} trips · ${money(s.billing||0)}</small><button data-month-download="${m.id}">Download</button></div>`}).join('')||'<p>No monthly files generated yet.</p>'}</div></article></div>`;
    host.querySelector('[data-export-all]').onclick=async()=>downloadWorkbook(await api('/excel-export'),'MEERA LOGISTICS FULL DATA '+new Date().toISOString().slice(0,10));
    host.querySelector('[data-import-btn]').onclick=async()=>{const file=host.querySelector('[data-import-file]').files[0];if(!file)return alert('Select Excel/CSV/JSON file.');const text=await file.text();let payload;if(file.name.toLowerCase().endsWith('.json'))payload=JSON.parse(text).payload||JSON.parse(text);else if(file.name.toLowerCase().endsWith('.csv'))payload={sheets:{[host.querySelector('[data-import-sheet]').value]:parseCsv(text)}};else payload=parseWorkbookXml(text);const res=await api('/excel-import',{method:'POST',body:JSON.stringify(payload)});toast('Excel import complete');alert(JSON.stringify(res.imported,null,2));A43.bootstrap=null};
    host.querySelector('[data-generate-month]').onclick=async()=>{const monthKey=host.querySelector('[data-month-key]').value;await api('/monthly-exports',{method:'POST',body:JSON.stringify({monthKey})});toast('Monthly Excel generated');A43.data=null;openExcel()};
    host.querySelectorAll('[data-month-download]').forEach(b=>b.onclick=async()=>{const x=await api(`/monthly-exports/${b.dataset.monthDownload}/download`);downloadWorkbook(x.payload,`MEERA LOGISTICS ${x.monthKey}`)});
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// SCHEDULED BACKUPS
async function openBackups(){
  const host=loading('Scheduled Backups');
  try{const rows=await api('/backups');host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-backup-now>Backup Now</button>');host.querySelector('main').innerHTML=`<div class="a43-backups"><div class="a43-backup-info"><b>Automatic daily backup</b><small>Cloudflare Cron: every day 20:00 UTC (01:30 AM India). Last 30 snapshots retained.</small></div>${rows.length?rows.map(x=>`<article><div><b>${esc(x.backup_type)} Backup</b><small>${esc(x.period_key||'')} · ${fmtDate(x.created_at)}</small></div><footer><button data-backup-download="${x.id}">Download JSON</button><button class="danger" data-backup-delete="${x.id}">Delete</button></footer></article>`).join(''):'<div class="a43-empty">No backup snapshot yet. Click Backup Now.</div>'}</div>`;host.querySelector('[data-backup-now]').onclick=async()=>{await api('/backups',{method:'POST',body:'{}'});toast('Backup created');openBackups()};host.querySelectorAll('[data-backup-download]').forEach(b=>b.onclick=async()=>{const x=await api(`/backups/${b.dataset.backupDownload}/download`);downloadBlob(new Blob([JSON.stringify(x.payload,null,2)],{type:'application/json'}),`MEERA LOGISTICS BACKUP ${x.createdAt.slice(0,10)}.json`)});host.querySelectorAll('[data-backup-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this backup?')){await api(`/backups/${b.dataset.backupDelete}`,{method:'DELETE'});openBackups()}})}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// MULTI IMAGE TRUCK DOCUMENT GALLERY
function readCompressed(file,max=1400,quality=.76){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{let w=img.width,h=img.height;if(Math.max(w,h)>max){const r=max/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality))};img.src=reader.result};reader.readAsDataURL(file)})}
async function openGallery(){
  const host=loading('Truck Documents Gallery');
  try{const [data,b]=await Promise.all([loadAdvanced(true),loadBootstrap(true)]);const docs=data.documents||[];host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-gallery-upload>+ Upload Images</button>');host.querySelector('main').innerHTML=`<div class="a43-gallery-filter"><select data-gallery-truck><option value="">All Trucks</option>${b.trucks.map(t=>`<option>${esc(t.truck_no)}</option>`).join('')}</select><input placeholder="Search document…" data-gallery-search></div><div class="a43-gallery">${docs.length?docs.map(d=>`<article data-truck="${esc(d.truck_no)}" data-text="${esc((d.file_name+' '+d.kind).toLowerCase())}"><div class="a43-doc-icon">🖼️</div><b>${esc(d.truck_no)}</b><span>${esc(d.kind)}</span><small>${esc(d.file_name||'Image')}${d.expiry_date?' · Exp '+fmtDate(d.expiry_date):''}</small><footer><button data-doc-view="${d.id}">View</button><button class="danger" data-doc-delete="${d.id}">Delete</button></footer></article>`).join(''):'<div class="a43-empty">No truck documents.</div>'}</div>`;
    const filter=()=>{const truck=host.querySelector('[data-gallery-truck]').value,q=host.querySelector('[data-gallery-search]').value.toLowerCase();host.querySelectorAll('.a43-gallery article').forEach(x=>x.hidden=!!((truck&&x.dataset.truck!==truck)||(q&&!x.dataset.text.includes(q))))};host.querySelector('[data-gallery-truck]').onchange=filter;host.querySelector('[data-gallery-search]').oninput=filter;
    host.querySelector('[data-gallery-upload]').onclick=()=>galleryUploadForm(b.trucks);
    host.querySelectorAll('[data-doc-view]').forEach(x=>x.onclick=async()=>{const d=await api('/documents/'+x.dataset.docView);modal(`${d.truck_no} · ${d.kind}`,d.file_data?`<img class="a43-full-image" src="${d.file_data}"><p>${esc(d.notes||'')}</p>`:'<div class="a43-empty">Image data not found.</div>')});
    host.querySelectorAll('[data-doc-delete]').forEach(x=>x.onclick=()=>moveToRecycle('document',x.dataset.docDelete,openGallery));
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
function galleryUploadForm(trucks){
  const host=modal('Upload Multiple Truck Images',`<form class="a43-form" id="galleryUpload"><label><span>Truck</span><select name="truckNo" required><option value="">Select Truck</option>${trucks.map(t=>`<option>${esc(t.truck_no)}</option>`).join('')}</select></label><label><span>Document Type</span><select name="kind"><option>RC</option><option>PAN</option><option>CHEQUE</option><option>BUILTY</option><option>POD</option><option>INSURANCE</option><option>FITNESS</option><option>PERMIT</option><option>OTHER</option></select></label><label><span>Expiry Date</span><input type="date" name="expiryDate"></label><label class="wide"><span>Images (multiple)</span><input type="file" name="files" accept="image/*" multiple required></label><label class="wide"><span>Notes</span><textarea name="notes"></textarea></label><div class="a43-form-actions"><button type="button" data-a43-close-form>Cancel</button><button class="primary">Upload All</button></div></form>`);host.querySelector('[data-a43-close-form]').onclick=closeAdvanced;host.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter,fd=new FormData(e.target),files=[...e.target.files.files];btn.disabled=true;btn.textContent=`Uploading 0/${files.length}`;try{let n=0;for(const file of files){const data=await readCompressed(file);await api('/documents',{method:'POST',body:JSON.stringify({truckNo:fd.get('truckNo'),kind:fd.get('kind'),fileName:file.name,fileType:'image/jpeg',fileData:data,expiryDate:fd.get('expiryDate'),notes:fd.get('notes')})});n++;btn.textContent=`Uploading ${n}/${files.length}`}toast(`${n} images uploaded`);A43.data=null;A43.bootstrap=null;openGallery()}catch(err){alert(err.message)}finally{btn.disabled=false}};
}

// COMMAND PALETTE
async function openCommandPalette(){
  const host=modal('Command Palette',`<div class="a43-command"><input autofocus placeholder="Type command, invoice, trip, party, truck…" data-cmd-input><div data-cmd-results></div></div>`);
  const input=host.querySelector('[data-cmd-input]'),results=host.querySelector('[data-cmd-results]');let b=null;
  const actions=[['Calendar','calendar'],['New Booking','new-booking'],['Booking Workflow','workflow'],['Approvals','approvals'],['Recycle Bin','recycle'],['System Health','health'],['Excel Center','excel'],['Scheduled Backups','backups'],['Truck Gallery','gallery'],['New Trip','new-trip'],['New Invoice','new-invoice']];
  const render=async()=>{const q=input.value.trim().toUpperCase();if(!b)b=await loadBootstrap();const rows=actions.filter(x=>!q||x[0].toUpperCase().includes(q)).map(x=>({label:x[0],kind:'COMMAND',action:x[1]}));if(q){for(const i of b.invoices.filter(x=>String(x.invoice_no).toUpperCase().includes(q)||String(x.party_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${i.invoice_no} · ${i.party_name}`,kind:'INVOICE',id:i.id});for(const t of b.trips.filter(x=>String(x.trip_no).toUpperCase().includes(q)||String(x.truck_no).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${t.trip_no} · ${t.truck_no}`,kind:'TRIP',id:t.id});for(const p of b.parties.filter(x=>String(x.party_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:p.party_name,kind:'PARTY'});for(const t of b.trucks.filter(x=>String(x.truck_no).toUpperCase().includes(q)||String(x.owner_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${t.truck_no} · ${t.owner_name}`,kind:'TRUCK'})}results.innerHTML=rows.slice(0,20).map((r,i)=>`<button data-cmd-i="${i}"><span>${esc(r.kind)}</span><b>${esc(r.label)}</b></button>`).join('')||'<p>No result</p>';results.querySelectorAll('button').forEach((el,i)=>el.onclick=()=>runCommand(rows[i]))};
  input.oninput=render;render();setTimeout(()=>input.focus(),50);
}
function triggerAction(action,id=''){closeAdvanced();const b=document.createElement('button');b.dataset.action=action;if(id)b.dataset.id=id;b.hidden=true;document.body.appendChild(b);b.click();b.remove()}
function runCommand(r){if(r.kind==='COMMAND'){if(r.action==='new-booking')return bookingForm();if(r.action==='new-trip')return triggerAction('new-trip');if(r.action==='new-invoice')return triggerAction('new-invoice');return openFeature(r.action)}if(r.kind==='INVOICE')return triggerAction('view-invoice',r.id);if(r.kind==='TRIP')return triggerAction('view-trip',r.id);if(r.kind==='PARTY'){closeAdvanced();document.querySelector('[data-panel="parties"]')?.click()}if(r.kind==='TRUCK'){closeAdvanced();document.querySelector('[data-panel="trucks"]')?.click()}}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandPalette()}if(e.key==='Escape')closeAdvanced()});

// UI DECORATION + PWA/OFFLINE
function decorate(){
  // Enforce the exact compact sidebar requested earlier, even if old browser cache is present.
  document.querySelectorAll('.sidebar [data-panel]').forEach(b=>{if(['partyPayments','truckEntries','supplierPayments','expenses'].includes(b.dataset.panel))b.remove()});
  const top=document.querySelector('.top-actions');if(top&&!top.querySelector('[data-a43-tools]'))top.insertAdjacentHTML('afterbegin','<button class="btn primary" data-a43-tools>Smart Tools</button>');
  const toolsBtn=document.querySelector('[data-a43-tools]');if(toolsBtn&&!toolsBtn.dataset.a43Bound){toolsBtn.dataset.a43Bound='1';toolsBtn.addEventListener('click',openTools)}
  const quick=document.querySelector('.quick-actions');if(quick&&!quick.querySelector('[data-a43-dashboard]'))quick.insertAdjacentHTML('beforeend','<button type="button" class="quick" data-a43-dashboard><b>📅 Smart Operations</b><small>Calendar, booking, approval, backup & health</small></button>');
  const dashBtn=document.querySelector('[data-a43-dashboard]');if(dashBtn&&!dashBtn.dataset.a43Bound){dashBtn.dataset.a43Bound='1';dashBtn.addEventListener('click',openTools)}
  if(!document.querySelector('.a43-online')){const s=document.createElement('button');s.className='a43-online';s.onclick=()=>navigator.serviceWorker?.controller?.postMessage({type:'SYNC_QUEUE'});document.body.appendChild(s)}
  const s=document.querySelector('.a43-online');if(s){s.textContent=navigator.onLine?'● Online':'● Offline · Changes queued';s.classList.toggle('offline',!navigator.onLine)}
}
new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.documentElement,{childList:true,subtree:true});decorate();
window.addEventListener('online',()=>{decorate();navigator.serviceWorker?.controller?.postMessage({type:'SYNC_QUEUE'});toast('Online — offline changes syncing')});window.addEventListener('offline',decorate);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw-v43.js?v=43').catch(()=>{});
