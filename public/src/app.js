
import {api,token,setToken,clearToken} from './core/api.js';

const app=document.getElementById('app');
let state={panel:'dashboard',data:null,search:'',loading:false};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);
const norm=s=>String(s||'').trim().toUpperCase();
const download=(name,text,type='application/json')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
const statusBadge=s=>`<span class="badge ${String(s||'').toLowerCase().replaceAll('_','')}">${esc(s||'-')}</span>`;
const actionButtons=(type,id,extra='')=>`<div class="action-set"><button class="mini" data-action="edit-${type}" data-id="${esc(id)}">Edit</button>${extra}<button class="mini danger" data-action="delete-${type}" data-id="${esc(id)}">Delete</button></div>`;

function table(headers,rows,min='900px'){
  if(!rows.length)return `<div class="notice">No records found.</div>`;
  return `<div class="table-wrap responsive-table"><table style="min-width:${min}"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i===r.length-1?'action-cell':''}" data-label="${esc(headers[i])}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function selectOptions(items,value,labelFn=x=>x,valueFn=x=>x){
  return items.map(x=>`<option value="${esc(valueFn(x))}" ${String(valueFn(x))===String(value)?'selected':''}>${esc(labelFn(x))}</option>`).join('');
}
function field(label,name,value='',type='text',opts=''){
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${opts}></label>`;
}
function textarea(label,name,value='',cls=''){
  return `<label class="field ${cls}"><span>${label}</span><textarea name="${name}">${esc(value)}</textarea></label>`;
}
function datalistField(label,name,value,listId,items,opts=''){
  return `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" list="${listId}" ${opts}><datalist id="${listId}">${items.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></label>`;
}
function selectField(label,name,items,value='',cls=''){
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}">${selectOptions(items,value)}</select></label>`;
}
function formDataObject(form){return Object.fromEntries(new FormData(form).entries())}
function find(type,id){
  const d=state.data;
  const map={trip:d.trips,invoice:d.invoices,party:d.parties,'party-payment':d.partyPayments,truck:d.trucks,'truck-entry':d.truckEntries,'supplier-payment':d.supplierPayments,route:d.routes,expense:d.expenses};
  return (map[type]||[]).find(x=>String(x.id)===String(id));
}
function modal(title,content,{small=false,onMount}={}){
  const host=document.createElement('div');host.className='modal-bg';
  host.innerHTML=`<div class="modal ${small?'small':''}"><div class="modal-head"><h3>${esc(title)}</h3><button class="btn light" data-close>Close</button></div><div class="modal-body">${content}</div></div>`;
  document.body.appendChild(host);
  host.querySelector('[data-close]').onclick=()=>host.remove();
  host.onclick=e=>{if(e.target===host)host.remove()};
  onMount?.(host);
  return host;
}
function setBusy(button,busy,text='Saving...'){
  if(!button)return;button.disabled=busy;if(busy){button.dataset.old=button.textContent;button.textContent=text}else{button.textContent=button.dataset.old||'Save'}
}
async function mutate(path,method,body,button){
  try{setBusy(button,true);await api(path,{method,body:JSON.stringify(body)});await loadData();return true}
  catch(e){alert(e.message);return false}
  finally{setBusy(button,false)}
}
function loginView(message=''){
  app.innerHTML=`<div class="login-shell"><div class="login-art"><h1>Transport<br>made simple.</h1><p>Meera Logisticsનું online transport ERP — Trips, invoices, party khata, supplier khata, payments અને profit એક જ જગ્યાએ.</p></div><div class="login-side"><form class="login-card" id="loginForm"><div class="login-logo">ML</div><h2>Welcome back</h2><p>Sign in to Meera Logistics ERP</p>${message?`<div class="error-box">${esc(message)}</div>`:''}<label class="field"><span>Username</span><input name="username" autocomplete="username" value="admin" required></label><label class="field" style="margin-top:12px"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary full" style="margin-top:18px">Login</button></form></div></div>`;
  document.getElementById('loginForm').onsubmit=async e=>{
    e.preventDefault();const btn=e.submitter;setBusy(btn,true,'Logging in...');
    try{const res=await api('/login',{method:'POST',body:JSON.stringify(formDataObject(e.target))});setToken(res.token);await loadData()}
    catch(err){loginView(err.message)}
  };
}
async function loadData(){
  state.loading=true;if(!state.data)app.innerHTML='<div class="loading">Loading Meera Logistics ERP…</div>';
  try{state.data=await api('/bootstrap');render()}
  catch(e){clearToken();loginView(e.message)}
  finally{state.loading=false}
}
function navButton(id,label){return `<button class="${state.panel===id?'active':''}" data-panel="${id}"><span class="dot"></span>${label}</button>`}
function render(){
  const d=state.data;
  const titles={dashboard:'Dashboard',trips:'Transport Khata',invoices:'Invoice Desk',parties:'Party Khata',partyPayments:'Party Payments',suppliers:'Supplier Khata',truckEntries:'Truck / Supplier Entries',supplierPayments:'Supplier Payments',trucks:'Truck & Documents',masters:'Masters',expenses:'Office Expenses',reports:'Reports & Audit'};
  app.innerHTML=`<div class="erp">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">ML</div><div><b>MEERA LOGISTICS</b><small>TRANSPORT ERP</small></div></div>
      <div class="nav-group-title">Overview</div><div class="nav">${navButton('dashboard','Dashboard')}</div>
      <div class="nav-group-title">Transport</div><div class="nav">${navButton('trips','Transport Khata')}${navButton('invoices','Invoice Desk')}</div>
      <div class="nav-group-title">Accounts</div><div class="nav">${navButton('parties','Party Khata')}${navButton('partyPayments','Party Payments')}${navButton('suppliers','Supplier Khata')}${navButton('truckEntries','Truck / Supplier Entries')}${navButton('supplierPayments','Supplier Payments')}</div>
      <div class="nav-group-title">Office</div><div class="nav">${navButton('trucks','Truck & Documents')}${navButton('masters','Masters')}${navButton('expenses','Office Expenses')}${navButton('reports','Reports & Audit')}</div>
    </aside>
    <main class="main">
      <div class="topbar no-print"><div style="display:flex;gap:9px;align-items:center"><button class="btn light mobile-menu" id="menuBtn">☰</button><div class="top-title"><h1>${titles[state.panel]}</h1><p>Live online data · ${esc(d.user.username)} · ${esc(d.version)}</p></div></div>
      <div class="top-actions"><button class="btn light" id="refreshBtn">Refresh</button><button class="btn soft" id="backupBtn">Backup</button><button class="btn light" id="logoutBtn">Logout</button></div></div>
      ${panelHtml()}
    </main>
  </div>`;
  wireCommon();
}
function wireCommon(){
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{state.panel=b.dataset.panel;render();document.getElementById('sidebar').classList.remove('open')});
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action,b.dataset.id));
  document.getElementById('menuBtn').onclick=()=>document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('refreshBtn').onclick=loadData;
  document.getElementById('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}clearToken();loginView()};
  document.getElementById('backupBtn').onclick=async()=>download(`meera-logistics-backup-${today()}.json`,JSON.stringify(await api('/export'),null,2));
  document.querySelectorAll('[data-search]').forEach(input=>input.oninput=()=>{state.search=input.value.toLowerCase();render()});
}
function filterRows(items,fields){
  if(!state.search)return items;
  return items.filter(x=>fields.some(k=>String(x[k]??'').toLowerCase().includes(state.search)));
}
function panelHtml(){
  const d=state.data;
  if(state.panel==='dashboard')return dashboardPanel(d);
  if(state.panel==='trips')return tripsPanel(d);
  if(state.panel==='invoices')return invoicesPanel(d);
  if(state.panel==='parties')return partiesPanel(d);
  if(state.panel==='partyPayments')return partyPaymentsPanel(d);
  if(state.panel==='suppliers')return suppliersPanel(d);
  if(state.panel==='truckEntries')return truckEntriesPanel(d);
  if(state.panel==='supplierPayments')return supplierPaymentsPanel(d);
  if(state.panel==='trucks')return trucksPanel(d);
  if(state.panel==='masters')return mastersPanel(d);
  if(state.panel==='expenses')return expensesPanel(d);
  return reportsPanel(d);
}
function metric(label,value,sub=''){return `<div class="card metric"><small>${label}</small><b>${typeof value==='number'?money(value):esc(value)}</b>${sub?`<em>${esc(sub)}</em>`:''}</div>`}
function dashboardPanel(d){
  return `<section class="panel active">
    <div class="cards">${metric('Party Receivable',d.summary.partyOutstanding,'Outstanding from parties')}${metric('Supplier Payable',d.summary.supplierPending,'Pending to truck owners')}${metric('Total Billing',d.summary.totalBilling,`${d.summary.invoices} invoices`)}${metric('Party Received',d.summary.partyReceived,'Collection received')}${metric('Estimated Profit',d.summary.estimatedProfit,'Before income tax')}${metric('Total Trips',String(d.summary.trips),'All transport entries')}</div>
    <div class="quick-actions no-print">
      <button class="quick" data-action="new-trip"><b>+ New Trip</b><small>Create transport booking</small></button>
      <button class="quick" data-action="new-invoice"><b>+ New Invoice</b><small>Create GST invoice</small></button>
      <button class="quick" data-action="new-party-payment"><b>Receive Payment</b><small>Party collection entry</small></button>
      <button class="quick" data-action="new-supplier-payment"><b>Pay Supplier</b><small>Truck malik payment</small></button>
    </div>
    <div class="grid2" style="margin-top:12px"><div class="card"><div class="section-title"><h2>Recent Trips</h2><button class="btn soft" data-panel="trips">View all</button></div>${table(['Date','Party','Truck','Route','Status'],d.trips.slice(0,8).map(t=>[esc(t.trip_date),`<b>${esc(t.party_name)}</b>`,esc(t.truck_no),`${esc(t.loading_point)} → ${esc(t.unloading_point)}`,statusBadge(t.status)]),'700px')}</div>
    <div class="card"><div class="section-title"><h2>Party Outstanding</h2></div><div class="row-list">${d.partyLedger.slice(0,8).map(p=>`<button class="ledger-row" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}"><div><b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b><small>${p.invoices} invoices · ${p.payments} payments</small></div><div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div></button>`).join('')}</div></div></div>
  </section>`;
}
function tripsPanel(d){
  const rows=filterRows(d.trips,['trip_date','party_name','truck_no','material','loading_point','unloading_point','status']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Transport Khata</h2><small>Trip booking, status and POD</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search trips…"><button class="btn primary" data-action="new-trip">New Trip</button></div></div>${table(['Date','Trip ID','Party','Truck / Driver','Route','Material','Weight × Rate','Status','POD','Action'],rows.map(t=>[
    esc(t.trip_date),`<b>${esc(t.id)}</b>`,esc(t.party_name),`<b>${esc(t.truck_no)}</b><br><small>${esc(t.driver_name||'')}</small>`,`${esc(t.loading_point)} → ${esc(t.unloading_point)}`,esc(t.material),`${esc(t.weight)} × ${money(t.rate)}`,statusBadge(t.status),t.pod_file_name?`<span class="badge info">${esc(t.pod_file_name)}</span>`:'-',actionButtons('trip',t.id)
  ]),'1250px')}</div></section>`;
}
function invoicesPanel(d){
  const rows=filterRows(d.invoices,['invoice_no','invoice_date','party_name','lr_no','material']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Invoice Desk</h2><small>GST invoices linked with trips</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search invoices…"><button class="btn primary" data-action="new-invoice">New Invoice</button><button class="btn light" data-action="export-invoices">Excel CSV</button></div></div>${table(['Invoice','Date','Party','LR / Material','Trips','Subtotal','GST','Total','Action'],rows.map(i=>[
    `<b>${esc(i.invoice_no)}</b>`,esc(i.invoice_date),esc(i.party_name),`${esc(i.lr_no||'-')}<br><small>${esc(i.material)}</small>`,String(i.items.length),money(i.subtotal),money(i.gst_amount),`<b>${money(i.total)}</b>`,`<div class="action-set"><button class="mini green" data-action="view-invoice" data-id="${esc(i.id)}">View</button><button class="mini" data-action="edit-invoice" data-id="${esc(i.id)}">Edit</button><button class="mini gray" data-action="share-invoice" data-id="${esc(i.id)}">WhatsApp</button><button class="mini danger" data-action="delete-invoice" data-id="${esc(i.id)}">Delete</button></div>`
  ]),'1100px')}</div></section>`;
}
function partiesPanel(d){
  const rows=filterRows(d.partyLedger,['party_name','ledger_no']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Party Khata</h2><small>Billing, receipts and outstanding</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search party…"><button class="btn primary" data-action="new-party">New Party</button><button class="btn green" data-action="new-party-payment">Receive Payment</button></div></div><div class="row-list">${rows.map(p=>`<div class="ledger-row"><button style="all:unset;cursor:pointer;flex:1" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}"><b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b><small>Billed ${money(p.billed)} · Received ${money(p.received)} · ${p.invoices} invoices</small></button><div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div></div>`).join('')}</div></div></section>`;
}
function partyPaymentsPanel(d){
  const rows=filterRows(d.partyPayments,['receipt_no','party_name','payment_date','payment_mode','reference']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Party Payment History</h2><small>TransportBook-style receipt register</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search payments…"><button class="btn green" data-action="new-party-payment">Receive Payment</button></div></div>${table(['Receipt','Date','Party','Mode','Reference','Notes','Amount','Action'],rows.map(p=>[
    `<b>${esc(p.receipt_no||p.id)}</b>`,esc(p.payment_date),esc(p.party_name),statusBadge(p.payment_mode),esc(p.reference||'-'),esc(p.notes||'-'),`<b>${money(p.amount)}</b>`,actionButtons('party-payment',p.id)
  ]),'950px')}</div></section>`;
}
function suppliersPanel(d){
  const rows=filterRows(d.supplierLedger,['owner_name']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Supplier Khata</h2><small>Truck malik payable and payment ledger</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search supplier…"><button class="btn green" data-action="new-supplier-payment">Pay Supplier</button></div></div><div class="row-list">${rows.map(s=>`<button class="ledger-row" data-action="view-supplier-ledger" data-id="${encodeURIComponent(s.owner_name)}"><div><b>${esc(s.owner_name)}</b><small>${s.entries} freight entries · ${s.payments} payments · ${s.truck_count} trucks</small></div><div class="money-right"><b>${money(s.pending)}</b><small>Payable ${money(s.payable)}</small></div></button>`).join('')}</div></div></section>`;
}
function truckEntriesPanel(d){
  const rows=filterRows(d.truckEntries,['entry_date','truck_no','owner_name','loading_point','unloading_point']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Truck / Supplier Entries</h2><small>Freight payable per truck trip</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search entries…"><button class="btn primary" data-action="new-truck-entry">New Entry</button></div></div>${table(['Date','Trip','Truck','Owner','Route','Weight × Rate','Commission','Payable','Action'],rows.map(e=>[
    esc(e.entry_date),esc(e.trip_id||'-'),`<b>${esc(e.truck_no)}</b>`,esc(e.owner_name),`${esc(e.loading_point)} → ${esc(e.unloading_point)}`,`${esc(e.weight)} × ${money(e.rate)}`,money(e.commission),`<b>${money(e.payable)}</b>`,actionButtons('truck-entry',e.id)
  ]),'1100px')}</div></section>`;
}
function supplierPaymentsPanel(d){
  const rows=filterRows(d.supplierPayments,['receipt_no','owner_name','truck_no','payment_date','reference']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Supplier Payment History</h2><small>Truck malik payment register</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search supplier payments…"><button class="btn green" data-action="new-supplier-payment">Pay Supplier</button></div></div>${table(['Receipt','Date','Owner','Truck','Mode','Reference','Amount','Action'],rows.map(p=>[
    `<b>${esc(p.receipt_no||p.id)}</b>`,esc(p.payment_date),esc(p.owner_name),esc(p.truck_no||'-'),statusBadge(p.payment_mode),esc(p.reference||'-'),`<b>${money(p.amount)}</b>`,actionButtons('supplier-payment',p.id)
  ]),'900px')}</div></section>`;
}
function trucksPanel(d){
  const rows=filterRows(d.trucks,['truck_no','owner_name','owner_mobile','bank_details']);
  return `<section class="panel active"><div class="grid2"><div class="card"><div class="section-title"><div><h2>Truck Master</h2><small>Owner and bank details</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search truck…"><button class="btn primary" data-action="new-truck">Add Truck</button></div></div>${table(['Truck','Owner','Mobile','Bank Details','Documents','Action'],rows.map(t=>[
    `<b>${esc(t.truck_no)}</b>`,esc(t.owner_name||'-'),esc(t.owner_mobile||'-'),esc(t.bank_details||'-'),String(d.documents.filter(x=>x.truck_no===t.truck_no).length),actionButtons('truck',t.id,`<button class="mini green" data-action="new-document" data-id="${encodeURIComponent(t.truck_no)}">Document</button>`)
  ]),'850px')}</div><div class="card"><div class="section-title"><h2>Recent Documents</h2><button class="btn soft" data-action="new-document">Add</button></div>${d.documents.length?d.documents.slice(0,12).map(x=>`<div class="ledger-row"><button style="all:unset;cursor:pointer;flex:1" data-action="view-document" data-id="${esc(x.id)}"><b>${esc(x.truck_no)} · ${esc(x.kind)}</b><small>${esc(x.file_name||'Document')} ${x.expiry_date?'· Expiry '+esc(x.expiry_date):''}</small></button><button class="mini danger" data-action="delete-document" data-id="${esc(x.id)}">Delete</button></div>`).join(''):'<div class="notice">No documents.</div>'}</div></div></section>`;
}
function mastersPanel(d){
  return `<section class="panel active"><div class="grid3"><div class="card"><div class="section-title"><h3>Party Master</h3><button class="btn soft" data-action="new-party">Add</button></div>${d.parties.slice(0,30).map(p=>`<div class="ledger-row"><div><b>${esc(p.party_name)}</b><small>${esc(p.ledger_no||'No ledger number')} · ${esc(p.gst_no||'No GST')}</small></div><div class="action-set"><button class="mini" data-action="edit-party" data-id="${esc(p.id)}">Edit</button><button class="mini danger" data-action="delete-party" data-id="${esc(p.id)}">Delete</button></div></div>`).join('')}</div>
  <div class="card"><div class="section-title"><h3>Route Master</h3><button class="btn soft" data-action="new-route">Add</button></div>${d.routes.map(r=>`<div class="ledger-row"><div><b>${esc(r.loading_point)}</b><small>→ ${esc(r.unloading_point)}</small></div><div class="action-set"><button class="mini" data-action="edit-route" data-id="${esc(r.id)}">Edit</button><button class="mini danger" data-action="delete-route" data-id="${esc(r.id)}">Delete</button></div></div>`).join('')}</div>
  <div class="card"><div class="section-title"><h3>Material Master</h3><button class="btn soft" data-action="new-material">Add</button></div>${d.materials.map(m=>`<div class="ledger-row"><b>${esc(m.material_name)}</b><button class="mini danger" data-action="delete-material" data-id="${esc(m.id)}">Delete</button></div>`).join('')}</div></div></section>`;
}
function expensesPanel(d){
  const rows=filterRows(d.expenses,['expense_date','category','notes']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Office Expenses</h2><small>Expense register used in profit calculation</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search expenses…"><button class="btn primary" data-action="new-expense">New Expense</button></div></div>${table(['Date','Category','Notes','Amount','Action'],rows.map(e=>[
    esc(e.expense_date),esc(e.category),esc(e.notes||'-'),`<b>${money(e.amount)}</b>`,actionButtons('expense',e.id)
  ]),'700px')}</div></section>`;
}
function reportsPanel(d){
  return `<section class="panel active"><div class="cards">${metric('Invoice Subtotal',d.summary.invoiceSubtotal)}${metric('Supplier Payable',d.summary.supplierPayable)}${metric('Supplier Paid',d.summary.supplierPaid)}${metric('Office Expenses',d.summary.expenses)}${metric('Estimated Profit',d.summary.estimatedProfit)}${metric('Party Outstanding',d.summary.partyOutstanding)}</div>
  <div class="grid2"><div class="card"><div class="section-title"><h2>Audit Alerts</h2><button class="btn light" data-action="restore-backup">Restore Backup</button></div>${d.issues.length?d.issues.map(x=>`<div class="audit-item ${x.severity==='warning'?'warning':''}"><b>${esc(x.type)}</b><small>${esc(x.text)}</small></div>`).join(''):'<div class="notice">No detected ledger issues.</div>'}</div>
  <div class="card"><div class="section-title"><h2>Recent Changes</h2></div>${d.audits.slice(0,30).map(x=>`<div class="audit-item"><b>${esc(x.action)} · ${esc(x.entity)}</b><small>${esc(x.created_at)} · ${esc(x.entity_id||'')}</small></div>`).join('')}</div></div></section>`;
}

function handleAction(action,id){
  if(action==='new-trip'||action==='edit-trip')return tripForm(action==='edit-trip'?find('trip',id):null);
  if(action==='delete-trip')return remove(`/trips/${id}`,'Delete this trip?');
  if(action==='new-invoice'||action==='edit-invoice')return invoiceForm(action==='edit-invoice'?find('invoice',id):null);
  if(action==='delete-invoice')return remove(`/invoices/${id}`,'Delete this invoice?');
  if(action==='view-invoice')return viewInvoice(find('invoice',id));
  if(action==='share-invoice')return shareInvoice(find('invoice',id));
  if(action==='new-party'||action==='edit-party')return partyForm(action==='edit-party'?find('party',id):null);
  if(action==='delete-party')return remove(`/parties/${id}`,'Delete this party?');
  if(action==='view-party-ledger')return viewPartyLedger(decodeURIComponent(id));
  if(action==='new-party-payment'||action==='edit-party-payment')return partyPaymentForm(action==='edit-party-payment'?find('party-payment',id):null);
  if(action==='delete-party-payment')return remove(`/party-payments/${id}`,'Delete this party payment?');
  if(action==='view-supplier-ledger')return viewSupplierLedger(decodeURIComponent(id));
  if(action==='new-truck-entry'||action==='edit-truck-entry')return truckEntryForm(action==='edit-truck-entry'?find('truck-entry',id):null);
  if(action==='delete-truck-entry')return remove(`/truck-entries/${id}`,'Delete this supplier entry?');
  if(action==='new-supplier-payment'||action==='edit-supplier-payment')return supplierPaymentForm(action==='edit-supplier-payment'?find('supplier-payment',id):null);
  if(action==='delete-supplier-payment')return remove(`/supplier-payments/${id}`,'Delete this supplier payment?');
  if(action==='new-truck'||action==='edit-truck')return truckForm(action==='edit-truck'?find('truck',id):null);
  if(action==='delete-truck')return remove(`/trucks/${id}`,'Delete this truck?');
  if(action==='new-document')return documentForm(id?decodeURIComponent(id):'');
  if(action==='view-document')return viewDocument(id);
  if(action==='delete-document')return remove(`/documents/${id}`,'Delete this document?');
  if(action==='new-route'||action==='edit-route')return routeForm(action==='edit-route'?find('route',id):null);
  if(action==='delete-route')return remove(`/routes/${id}`,'Delete this route?');
  if(action==='new-material')return materialForm();
  if(action==='delete-material')return remove(`/materials/${id}`,'Delete this material?');
  if(action==='new-expense'||action==='edit-expense')return expenseForm(action==='edit-expense'?find('expense',id):null);
  if(action==='delete-expense')return remove(`/expenses/${id}`,'Delete this expense?');
  if(action==='restore-backup')return restoreBackup();
  if(action==='export-invoices')return exportInvoices();
}
async function remove(path,message){if(!confirm(message))return;try{await api(path,{method:'DELETE'});await loadData()}catch(e){alert(e.message)}}

function tripForm(x={}){
  const d=state.data,edit=!!x.id;
  const host=modal(edit?'Edit Trip':'New Trip',`<form class="form-grid" id="tripForm">
    ${field('Trip Date','tripDate',x.trip_date||today(),'date','required')}
    ${datalistField('Party','partyName',x.party_name||'','partyList',d.parties.map(p=>p.party_name),'required')}
    ${datalistField('Truck Number','truckNo',x.truck_no||'','truckList',d.trucks.map(t=>t.truck_no),'required')}
    ${field('Driver / Malik Name','driverName',x.driver_name||'')}
    ${field('Driver Mobile','driverMobile',x.driver_mobile||'','tel')}
    ${datalistField('Material','material',x.material||'','materialList',d.materials.map(m=>m.material_name),'required')}
    ${datalistField('Loading Point','loadingPoint',x.loading_point||'','loadList',[...new Set(d.routes.map(r=>r.loading_point))],'required')}
    ${datalistField('Unloading Point','unloadingPoint',x.unloading_point||'','unloadList',[...new Set(d.routes.map(r=>r.unloading_point))],'required')}
    ${field('Weight','weight',x.weight||0,'number','step="0.01" required')}
    ${field('Rate','rate',x.rate||0,'number','step="0.01" required')}
    ${selectField('Status','status',['BOOKED','LOADED','IN_TRANSIT','DELIVERED'],x.status||'BOOKED')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <label class="field span2"><span>POD Image (optional)</span><input id="podFile" type="file" accept="image/*"></label>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Trip</button></div>
  </form>`,{onMount:host=>{
    host.querySelector('[data-close-form]').onclick=()=>host.remove();
    host.querySelector('#tripForm').onsubmit=async e=>{
      e.preventDefault();const body=formDataObject(e.target),file=host.querySelector('#podFile').files[0];
      if(file){const compressed=await compressImage(file);body.podFileName=file.name;body.podData=compressed}
      else{body.podFileName=x.pod_file_name||'';body.podData=x.pod_data||''}
      if(await mutate('/trips'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove();
    };
  }});
}
function invoiceForm(x={}){
  const d=state.data,edit=!!x.id,items=(x.items&&x.items.length?x.items:[{trip_id:'',truck_no:'',description:'',weight:0,rate:0}]);
  const host=modal(edit?'Edit Invoice':'New Invoice',`<form class="form-grid" id="invoiceForm">
    ${field('Invoice Number','invoiceNo',x.invoice_no||d.nextInvoiceNo,'text','required')}
    ${field('Invoice Date','invoiceDate',x.invoice_date||today(),'date','required')}
    ${datalistField('Party','partyName',x.party_name||'','partyInvoiceList',d.parties.map(p=>p.party_name),'required')}
    ${field('Party GST','partyGst',x.party_gst||'')}
    ${textarea('Party Address','partyAddress',x.party_address||'','span2')}
    ${field('LR Number','lrNo',x.lr_no||'')}
    ${datalistField('Material','material',x.material||'','invoiceMaterialList',d.materials.map(m=>m.material_name))}
    ${field('Loading Date','loadingDate',x.loading_date||today(),'date')}
    ${field('Diesel','diesel',x.diesel||0,'number','step="0.01"')}
    ${field('Munshi','munshi',x.munshi||0,'number','step="0.01"')}
    ${field('SGST %','sgst',x.sgst??9,'number','step="0.01"')}
    ${field('CGST %','cgst',x.cgst??9,'number','step="0.01"')}
    <div class="span2"><div class="section-title"><h3>Invoice Lines</h3><button type="button" class="btn soft" id="addLine">+ Add Line</button></div><div class="invoice-lines" id="invoiceLines"></div></div>
    ${textarea('Comments / Payment Terms','comments',x.comments||'1. Payment due within 30 days.\\n2. Mention invoice number in payment reference.','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Invoice</button></div>
  </form>`,{onMount:host=>{
    const lines=host.querySelector('#invoiceLines');
    function addLine(item={}){
      const row=document.createElement('div');row.className='invoice-line';
      row.innerHTML=`<label class="field"><span>Trip</span><select name="tripId"><option value="">Manual</option>${d.trips.map(t=>`<option value="${esc(t.id)}" ${String(t.id)===String(item.trip_id||item.tripId||'')?'selected':''}>${esc(t.id+' · '+t.truck_no+' · '+t.party_name)}</option>`).join('')}</select></label>
      ${field('Truck','truckNo',item.truck_no||item.truckNo||'','','required')}
      ${field('Description','description',item.description||'','','required')}
      ${field('Weight','weight',item.weight||0,'number','step="0.01" required')}
      ${field('Rate','rate',item.rate||0,'number','step="0.01" required')}
      <button type="button" class="mini danger">Remove</button>`;
      row.querySelector('button').onclick=()=>row.remove();
      row.querySelector('select').onchange=e=>{
        const t=d.trips.find(t=>String(t.id)===String(e.target.value));if(!t)return;
        row.querySelector('[name=truckNo]').value=t.truck_no;
        row.querySelector('[name=description]').value=`${t.loading_point} TO ${t.unloading_point}`;
        row.querySelector('[name=weight]').value=t.weight;
        const party=host.querySelector('[name=partyName]');if(!party.value)party.value=t.party_name;
        const material=host.querySelector('[name=material]');if(!material.value)material.value=t.material;
      };
      lines.appendChild(row);
    }
    items.forEach(addLine);host.querySelector('#addLine').onclick=()=>addLine({});
    host.querySelector('[data-close-form]').onclick=()=>host.remove();
    host.querySelector('#invoiceForm').onsubmit=async e=>{
      e.preventDefault();const body=formDataObject(e.target);
      body.items=[...lines.querySelectorAll('.invoice-line')].map(r=>({
        tripId:r.querySelector('[name=tripId]').value,truckNo:r.querySelector('[name=truckNo]').value,
        description:r.querySelector('[name=description]').value,weight:r.querySelector('[name=weight]').value,rate:r.querySelector('[name=rate]').value
      }));
      if(await mutate('/invoices'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove();
    };
  }});
}
function partyForm(x={}){
  const edit=!!x.id,host=modal(edit?'Edit Party':'New Party',`<form class="form-grid" id="partyForm">
    ${field('Ledger Number','ledgerNo',x.ledger_no||'')}
    ${field('Party Name','partyName',x.party_name||'','text','required')}
    ${field('GST Number','gstNo',x.gst_no||'')}
    ${field('Mobile','mobile',x.mobile||'','tel')}
    ${field('Email','email',x.email||'','email')}
    ${textarea('Address','address',x.address||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Party</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#partyForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/parties'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function partyPaymentForm(x={}){
  const d=state.data,edit=!!x.id,host=modal(edit?'Edit Party Payment':'Receive Party Payment',`<form class="form-grid" id="partyPayForm">
    ${datalistField('Party','partyName',x.party_name||'','payPartyList',d.parties.map(p=>p.party_name),'required')}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Receipt</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#partyPayForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/party-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function truckEntryForm(x={}){
  const d=state.data,edit=!!x.id,host=modal(edit?'Edit Truck Entry':'New Truck / Supplier Entry',`<form class="form-grid" id="truckEntryForm">
    ${field('Entry Date','entryDate',x.entry_date||today(),'date','required')}
    ${selectField('Trip Link','tripId',['',...d.trips.map(t=>t.id)],x.trip_id||'')}
    ${datalistField('Truck Number','truckNo',x.truck_no||'','entryTruckList',d.trucks.map(t=>t.truck_no),'required')}
    ${datalistField('Owner / Supplier','ownerName',x.owner_name||'','ownerList',[...new Set(d.trucks.map(t=>t.owner_name).filter(Boolean))],'required')}
    ${field('Bank Details','bankDetails',x.bank_details||'')}
    ${datalistField('Loading Point','loadingPoint',x.loading_point||'','entryLoadList',[...new Set(d.routes.map(r=>r.loading_point))],'required')}
    ${datalistField('Unloading Point','unloadingPoint',x.unloading_point||'','entryUnloadList',[...new Set(d.routes.map(r=>r.unloading_point))],'required')}
    ${field('Weight','weight',x.weight||0,'number','step="0.01" required')}
    ${field('Rate','rate',x.rate||0,'number','step="0.01" required')}
    ${field('Commission','commission',x.commission||0,'number','step="0.01"')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Entry</button></div></form>`,{onMount:host=>{
      host.querySelector('[name=tripId]').onchange=e=>{const t=d.trips.find(t=>String(t.id)===String(e.target.value));if(!t)return;for(const [n,v] of Object.entries({truckNo:t.truck_no,loadingPoint:t.loading_point,unloadingPoint:t.unloading_point,weight:t.weight})){host.querySelector(`[name=${n}]`).value=v}};
      host.querySelector('[name=truckNo]').onchange=e=>{const t=d.trucks.find(t=>t.truck_no===norm(e.target.value));if(t){host.querySelector('[name=ownerName]').value=t.owner_name||'';host.querySelector('[name=bankDetails]').value=t.bank_details||''}};
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#truckEntryForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/truck-entries'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function supplierPaymentForm(x={}){
  const d=state.data,edit=!!x.id,owners=[...new Set([...d.trucks.map(t=>t.owner_name),...d.supplierLedger.map(s=>s.owner_name)].filter(Boolean))],host=modal(edit?'Edit Supplier Payment':'Pay Supplier',`<form class="form-grid" id="supplierPayForm">
    ${datalistField('Owner / Supplier','ownerName',x.owner_name||'','supplierOwnerList',owners,'required')}
    ${datalistField('Truck Number','truckNo',x.truck_no||'','supplierTruckList',d.trucks.map(t=>t.truck_no))}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Payment</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#supplierPayForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/supplier-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function truckForm(x={}){
  const edit=!!x.id,host=modal(edit?'Edit Truck':'Add Truck',`<form class="form-grid" id="truckForm">
    ${field('Truck Number','truckNo',x.truck_no||'','text','required')}
    ${field('Owner Name','ownerName',x.owner_name||'','text','required')}
    ${field('Owner Mobile','ownerMobile',x.owner_mobile||'','tel')}
    ${textarea('Bank Details','bankDetails',x.bank_details||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Truck</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#truckForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/trucks'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function routeForm(x={}){
  const edit=!!x.id,host=modal(edit?'Edit Route':'Add Route',`<form class="form-grid" id="routeForm">${field('Loading Point','loadingPoint',x.loading_point||'','text','required')}${field('Unloading Point','unloadingPoint',x.unloading_point||'','text','required')}<div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Route</button></div></form>`,{small:true,onMount:host=>{
    host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#routeForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/routes'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()}
  }});
}
function materialForm(){
  const host=modal('Add Material',`<form class="form-grid" id="materialForm">${field('Material Name','materialName','','text','required')}<div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Material</button></div></form>`,{small:true,onMount:host=>{
    host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#materialForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/materials','POST',formDataObject(e.target),e.submitter))host.remove()}
  }});
}
function expenseForm(x={}){
  const edit=!!x.id,host=modal(edit?'Edit Expense':'New Expense',`<form class="form-grid" id="expenseForm">
    ${field('Date','expenseDate',x.expense_date||today(),'date','required')}${field('Category','category',x.category||'OFFICE','text','required')}${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Expense</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#expenseForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/expenses'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()}
    }});
}
function documentForm(truckNo=''){
  const d=state.data,host=modal('Add Truck Document',`<form class="form-grid" id="documentForm">
    ${datalistField('Truck Number','truckNo',truckNo,'docTruckList',d.trucks.map(t=>t.truck_no),'required')}
    ${selectField('Document Type','kind',['RC FRONT','RC BACK','PAN','CHEQUE','BILTY','INSURANCE','PERMIT','PUC','OTHER'],'RC FRONT')}
    ${field('Expiry Date','expiryDate','','date')}
    ${textarea('Notes','notes','','span2')}
    <label class="field span2"><span>Image / PDF</span><input id="documentFile" type="file" accept="image/*,.pdf" required></label>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Upload Document</button></div></form>`,{onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#documentForm').onsubmit=async e=>{e.preventDefault();const file=host.querySelector('#documentFile').files[0],body=formDataObject(e.target);if(!file)return;
        body.fileName=file.name;body.fileType=file.type;
        if(file.type.startsWith('image/'))body.fileData=await compressImage(file);else body.fileData=await fileToDataUrl(file);
        if(await mutate('/documents','POST',body,e.submitter))host.remove();
      };
    }});
}
async function viewDocument(id){
  try{const d=await api('/documents/'+id);modal(`${d.truck_no} · ${d.kind}`,`<div style="text-align:center">${d.file_type==='application/pdf'?`<iframe src="${esc(d.file_data)}" style="width:100%;height:70vh;border:0"></iframe>`:`<img src="${esc(d.file_data)}" alt="${esc(d.file_name)}" style="max-width:100%;max-height:70vh;border-radius:10px">`}<p>${esc(d.file_name)}</p></div>`)}
  catch(e){alert(e.message)}
}
async function viewPartyLedger(name){
  try{const x=await api('/party-ledger/'+encodeURIComponent(name));modal(`Party Ledger · ${name}`,`<div class="cards">${metric('Total Billing',x.invoices.reduce((a,v)=>a+Number(v.total||0),0))}${metric('Received',x.payments.reduce((a,v)=>a+Number(v.amount||0),0))}${metric('Outstanding',x.balance)}</div>${table(['Date','Type','Reference','Debit','Credit','Balance','Notes'],x.lines.map(l=>[esc(l.date),statusBadge(l.type),esc(l.reference),l.debit?money(l.debit):'-',l.credit?money(l.credit):'-',`<b>${money(l.balance)}</b>`,esc(l.notes||'-')]),'850px')}`)}
  catch(e){alert(e.message)}
}
async function viewSupplierLedger(name){
  try{const x=await api('/supplier-ledger/'+encodeURIComponent(name));modal(`Supplier Ledger · ${name}`,`<div class="cards">${metric('Payable',x.entries.reduce((a,v)=>a+Number(v.payable||0),0))}${metric('Paid',x.payments.reduce((a,v)=>a+Number(v.amount||0),0))}${metric('Pending',x.balance)}</div>${table(['Date','Type','Reference','Debit','Credit','Balance','Notes'],x.lines.map(l=>[esc(l.date),statusBadge(l.type),esc(l.reference),l.debit?money(l.debit):'-',l.credit?money(l.credit):'-',`<b>${money(l.balance)}</b>`,esc(l.notes||'-')]),'850px')}`)}
  catch(e){alert(e.message)}
}
function viewInvoice(i){
  const html=`<div class="print-sheet" id="invoicePrint"><div class="invoice-header"><div class="invoice-company"><h1>MEERA LOGISTICS</h1><div>Transport & Logistics Services</div><div>Jamnagar, Gujarat</div></div><div class="invoice-meta"><b>TAX INVOICE</b><div>${esc(i.invoice_no)}</div><div>${esc(i.invoice_date)}</div></div></div>
  <div class="invoice-party"><div><b>Bill To</b><div>${esc(i.party_name)}</div><div>${esc(i.party_address||'')}</div><div>GST: ${esc(i.party_gst||'-')}</div></div><div><b>LR No:</b> ${esc(i.lr_no||'-')}<br><b>Material:</b> ${esc(i.material||'-')}<br><b>Loading Date:</b> ${esc(i.loading_date||'-')}</div></div>
  ${table(['Truck No','Description','Weight','Rate','Amount'],i.items.map(x=>[esc(x.truck_no),esc(x.description),esc(x.weight),money(x.rate),money(x.amount)]),'650px')}
  <div class="invoice-total"><div><span>Subtotal</span><b>${money(i.subtotal)}</b></div><div><span>Diesel</span><b>${money(i.diesel)}</b></div><div><span>Munshi</span><b>${money(i.munshi)}</b></div><div><span>SGST ${i.sgst}%</span><b>${money(i.subtotal*i.sgst/100)}</b></div><div><span>CGST ${i.cgst}%</span><b>${money(i.subtotal*i.cgst/100)}</b></div><div class="grand"><span>Total</span><span>${money(i.total)}</span></div></div><p style="white-space:pre-line">${esc(i.comments||'')}</p></div><div class="form-actions no-print"><button class="btn primary" onclick="window.print()">Print / Save PDF</button></div>`;
  modal(`Invoice ${i.invoice_no}`,html);
}
function shareInvoice(i){
  const text=`Meera Logistics\nInvoice: ${i.invoice_no}\nDate: ${i.invoice_date}\nParty: ${i.party_name}\nTotal: ${money(i.total)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
}
function exportInvoices(){
  const rows=[['Invoice No','Date','Party','GST','LR No','Material','Subtotal','GST Amount','Total']];
  for(const i of state.data.invoices)rows.push([i.invoice_no,i.invoice_date,i.party_name,i.party_gst,i.lr_no,i.material,i.subtotal,i.gst_amount,i.total]);
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  download('meera-invoices.csv',csv,'text/csv');
}
function restoreBackup(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=async()=>{try{const data=JSON.parse(await input.files[0].text());const mode=confirm('OK = Replace all current data. Cancel = Merge with current data.')?'replace':'merge';await api('/import',{method:'POST',body:JSON.stringify({data,mode})});await loadData();alert('Backup restored successfully.')}catch(e){alert(e.message)}};input.click();
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function compressImage(file){
  if(file.size<850000)return fileToDataUrl(file);
  const url=URL.createObjectURL(file),img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});
  const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);return canvas.toDataURL('image/jpeg',.72);
}

if(token())loadData();else loginView();
