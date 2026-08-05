
import {api,token,setToken,clearToken} from './core/api.js';

const app=document.getElementById('app');
let state={panel:'dashboard',data:null,search:'',loading:false,activeTrip:null};
const CACHE_KEY='ml_bootstrap_cache_v6';
const readCache=()=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{return null}};
const writeCache=data=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch{}};
const clearCache=()=>{try{localStorage.removeItem(CACHE_KEY)}catch{}};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);

function parseInvoiceNumber(value){
  const text=String(value||'').trim();
  const m=text.match(/^(.*?)(\d+)\s*$/);
  return m?{prefix:m[1],number:Number(m[2]),width:m[2].length,raw:text}:{prefix:text,number:-1,width:0,raw:text};
}
function sortInvoicesSeries(items,desc=true){
  return [...items].sort((a,b)=>{
    const A=parseInvoiceNumber(a.invoice_no),B=parseInvoiceNumber(b.invoice_no);
    if(A.prefix!==B.prefix)return A.prefix.localeCompare(B.prefix);
    return desc?B.number-A.number:A.number-B.number;
  });
}
function invoiceTypeLabel(i){return (i.invoice_type||'GST')==='NON_GST'?'NON-GST':'GST'}
function invoiceStatus(total,received){
  const t=Number(total||0),r=Number(received||0);
  if(r<=0)return 'PENDING';
  if(r+0.01>=t)return 'PAID';
  return 'PARTIAL';
}
function invoiceReceivedAmount(invoice){
  const linked=state.data.partyPayments.filter(p=>
    (p.trip_id && (invoice.items||[]).some(i=>String(i.trip_id||'')===String(p.trip_id))) ||
    (!p.trip_id && p.party_name===invoice.party_name && p.payment_date>=invoice.invoice_date)
  );
  return linked.reduce((a,x)=>a+Number(x.amount||0),0);
}

const invoiceDate=s=>{if(!s)return '';const p=String(s).split('-');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:s};
const number3=n=>Number(n||0).toFixed(3);
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

function masterSelectField(label,name,items,value='',masterType='',opts='',cls=''){
  const cleanItems=[...new Set(items.filter(Boolean))];
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}" data-master-type="${masterType}" ${opts}>
    <option value="">Select ${esc(label)}</option>
    ${selectOptions(cleanItems,value)}
    <option value="__ADD_NEW__">＋ Add New ${esc(label)}</option>
  </select></label>`;
}
function addOptionAndSelect(select,value){
  const cleanValue=norm(value);
  if(!cleanValue)return;
  let option=[...select.options].find(o=>norm(o.value)===cleanValue);
  if(!option){
    option=document.createElement('option');
    option.value=cleanValue;option.textContent=cleanValue;
    select.insertBefore(option,select.querySelector('option[value="__ADD_NEW__"]'));
  }
  select.value=cleanValue;
  select.dispatchEvent(new Event('change',{bubbles:true}));
}
function wireMasterSelects(host){
  host.querySelectorAll('select[data-master-type]').forEach(select=>{
    select.addEventListener('change',async()=>{
      if(select.value!=='__ADD_NEW__')return;
      const type=select.dataset.masterType;
      select.value='';
      await quickAddMaster(type,select,host);
    });
  });
}
async function quickAddMaster(type,target,parentHost){
  const d=state.data;
  if(type==='party'){
    const h=modal('Add New Party',`<form class="form-grid" id="quickPartyForm">
      ${field('Party Name','partyName','','text','required')}
      ${field('GST Number','gstNo','')}
      ${field('Mobile','mobile','','tel')}
      ${textarea('Address','address','','span2')}
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Add Party</button></div>
    </form>`,{small:true,onMount:h=>{
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickPartyForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        try{setBusy(btn,true);const res=await api('/parties',{method:'POST',body:JSON.stringify(body)});
          const item={id:res.id,party_name:norm(body.partyName),gst_no:norm(body.gstNo),mobile:body.mobile||'',address:body.address||'',ledger_no:''};
          d.parties.push(item);addOptionAndSelect(target,item.party_name);
          const gst=parentHost.querySelector('[name=partyGst]'),address=parentHost.querySelector('[name=partyAddress]');
          if(gst){gst.value=item.gst_no||'';gst.readOnly=true}
          if(address){address.value=item.address||'';address.readOnly=true}
          h.remove();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});return;
  }
  if(type==='truck'){
    const h=modal('Add New Truck',`<form class="form-grid" id="quickTruckForm">
      ${field('Truck Number','truckNo','','text','required')}
      ${field('Owner Name','ownerName','','text','required')}
      ${field('Owner Mobile','ownerMobile','','tel')}
      ${textarea('Bank Details','bankDetails','','span2')}
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Add Truck</button></div>
    </form>`,{small:true,onMount:h=>{
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickTruckForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        try{setBusy(btn,true);const res=await api('/trucks',{method:'POST',body:JSON.stringify(body)});
          const item={id:res.id,truck_no:norm(body.truckNo),owner_name:norm(body.ownerName),owner_mobile:body.ownerMobile||'',bank_details:body.bankDetails||''};
          d.trucks.push(item);addOptionAndSelect(target,item.truck_no);
          const owner=parentHost.querySelector('[name=ownerName]'),bank=parentHost.querySelector('[name=bankDetails]');
          if(owner)owner.value=item.owner_name;if(bank)bank.value=item.bank_details;
          h.remove();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});return;
  }
  if(type==='route-loading'||type==='route-unloading'){
    const existingLoading=parentHost.querySelector('[name=loadingPoint]')?.value||'';
    const existingUnloading=parentHost.querySelector('[name=unloadingPoint]')?.value||'';
    const h=modal('Add New Route',`<form class="form-grid" id="quickRouteForm">
      ${field('Loading Point','loadingPoint',type==='route-loading'?'':existingLoading,'text','required')}
      ${field('Unloading Point','unloadingPoint',type==='route-unloading'?'':existingUnloading,'text','required')}
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Add Route</button></div>
    </form>`,{small:true,onMount:h=>{
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickRouteForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        try{setBusy(btn,true);const res=await api('/routes',{method:'POST',body:JSON.stringify(body)});
          const item={id:res.id,loading_point:norm(body.loadingPoint),unloading_point:norm(body.unloadingPoint)};
          d.routes.push(item);
          const loadingSelect=parentHost.querySelector('[name=loadingPoint]'),unloadingSelect=parentHost.querySelector('[name=unloadingPoint]');
          if(loadingSelect)addOptionAndSelect(loadingSelect,item.loading_point);
          if(unloadingSelect)addOptionAndSelect(unloadingSelect,item.unloading_point);
          addOptionAndSelect(target,type==='route-loading'?item.loading_point:item.unloading_point);
          h.remove();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});return;
  }
  if(type==='material'){
    const h=modal('Add New Material',`<form class="form-grid" id="quickMaterialForm">
      ${field('Material Name','materialName','','text','required')}
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Add Material</button></div>
    </form>`,{small:true,onMount:h=>{
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickMaterialForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        try{setBusy(btn,true);const res=await api('/materials',{method:'POST',body:JSON.stringify(body)});
          const item={id:res.id,material_name:norm(body.materialName)};d.materials.push(item);addOptionAndSelect(target,item.material_name);h.remove();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});
  }
}
function selectField(label,name,items,value='',cls=''){
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}">${selectOptions(items,value)}</select></label>`;
}
function formDataObject(form){return Object.fromEntries(new FormData(form).entries())}

function getPartyDetails(name){
  const partyName=norm(name);
  const master=state.data.parties.find(p=>norm(p.party_name)===partyName)||{};
  const invoice=[...state.data.invoices]
    .filter(i=>norm(i.party_name)===partyName)
    .sort((a,b)=>String(b.invoice_date||'').localeCompare(String(a.invoice_date||'')))[0]||{};
  return {
    party_name:partyName,
    gst_no:master.gst_no||invoice.party_gst||'',
    address:master.address||invoice.party_address||'',
    mobile:master.mobile||'',
    email:master.email||''
  };
}

function find(type,id){
  const d=state.data;
  const map={trip:d.trips,invoice:d.invoices,'pm-bill':d.pmBills,party:d.parties,'party-payment':d.partyPayments,truck:d.trucks,'truck-entry':d.truckEntries,'supplier-payment':d.supplierPayments,route:d.routes,expense:d.expenses};
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
    try{const res=await api('/login',{method:'POST',body:JSON.stringify(formDataObject(e.target))});setToken(res.token);await loadData({background:true})}
    catch(err){loginView(err.message)}
  };
}
async function loadData({background=false}={}){
  state.loading=true;
  if(!state.data){
    const cached=readCache();
    if(cached?.data){
      state.data=cached.data;
      render();
    }else{
      app.innerHTML='<div class="loading"><div><b>Opening Meera Logistics ERP…</b><br><small>Connecting to online database</small></div></div>';
    }
  }
  try{
    const fresh=await api('/bootstrap');
    state.data=fresh;writeCache(fresh);render();
  }catch(e){
    if(state.data){
      if(!background)alert(e.message);
    }else{
      clearToken();clearCache();loginView(e.message);
    }
  }finally{state.loading=false}
}
function navButton(id,label){return `<button class="${state.panel===id?'active':''}" data-panel="${id}"><span class="dot"></span>${label}</button>`}
function render(){
  const d=state.data;
  const titles={dashboard:'Dashboard',trips:'Transport Khata',invoices:'Invoice Desk',parties:'Party Khata',partyPayments:'Party Payments',suppliers:'Supplier Khata',truckEntries:'Truck / Supplier Entries',supplierPayments:'Supplier Payments',trucks:'Truck & Documents',masters:'Masters',forms:'Forms',expenses:'Office Expenses',reports:'Reports & Audit'};
  app.innerHTML=`<div class="erp">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">ML</div><div><b>MEERA LOGISTICS</b><small>TRANSPORT ERP</small></div></div>
      <div class="nav-group-title">Overview</div><div class="nav">${navButton('dashboard','Dashboard')}</div>
      <div class="nav-group-title">Transport</div><div class="nav">${navButton('trips','Transport Khata')}${navButton('invoices','Invoice Desk')}</div>
      <div class="nav-group-title">Accounts</div><div class="nav">${navButton('parties','Party Khata')}${navButton('partyPayments','Party Payments')}${navButton('suppliers','Supplier Khata')}${navButton('truckEntries','Truck / Supplier Entries')}${navButton('supplierPayments','Supplier Payments')}</div>
      <div class="nav-group-title">Office</div><div class="nav">${navButton('trucks','Truck & Documents')}${navButton('masters','Masters')}${navButton('forms','Forms')}${navButton('expenses','Office Expenses')}${navButton('reports','Reports & Audit')}</div>
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
  // One delegated click handler makes dashboard cards, table buttons and
  // dynamically-created controls reliable on desktop and mobile.
  app.onclick=async event=>{
    const panelButton=event.target.closest('[data-panel]');
    if(panelButton){
      event.preventDefault();
      state.panel=panelButton.dataset.panel;
      render();
      document.getElementById('sidebar')?.classList.remove('open');
      return;
    }
    const actionButton=event.target.closest('[data-action]');
    if(actionButton){
      event.preventDefault();
      event.stopPropagation();
      try{
        await handleAction(actionButton.dataset.action,actionButton.dataset.id);
      }catch(error){
        console.error(error);
        alert(error?.message||String(error));
      }
    }
  };
  document.getElementById('menuBtn').onclick=()=>document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('refreshBtn').onclick=()=>loadData();
  const globalSearch=document.getElementById('globalSearch');
  if(globalSearch)globalSearch.onkeydown=e=>{
    if(e.key!=='Enter')return;
    const q=norm(globalSearch.value);
    if(!q)return;
    const invoice=state.data.invoices.find(x=>norm(x.invoice_no)===q);
    if(invoice)return viewInvoice(invoice);
    const trip=state.data.trips.find(x=>norm(x.trip_no)===q||norm(x.id)===q);
    if(trip)return universalTripScreen(trip);
    const supplier=state.data.supplierLedger.find(x=>norm(x.ledger_no)===q||norm(x.owner_name).includes(q));
    if(supplier)return viewSupplierLedger(supplier.owner_name);
    const party=state.data.parties.find(x=>norm(x.party_name).includes(q));
    if(party)return viewPartyLedger(party.party_name);
    const truck=state.data.trucks.find(x=>norm(x.truck_no).includes(q));
    if(truck){state.panel='trucks';state.search=truck.truck_no.toLowerCase();return render()}
    alert('No matching invoice, trip, party, supplier or truck found.');
  };
  document.getElementById('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}clearToken();clearCache();loginView()};
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
  if(state.panel==='forms')return formsPanel(d);
  if(state.panel==='expenses')return expensesPanel(d);
  return reportsPanel(d);
}
function metric(label,value,sub=''){return `<div class="card metric"><small>${label}</small><b>${typeof value==='number'?money(value):esc(value)}</b>${sub?`<em>${esc(sub)}</em>`:''}</div>`}
function dashboardPanel(d){
  return `<section class="panel active">
    <div class="cards">${metric('Party Receivable',d.summary.partyOutstanding,'Outstanding from parties')}${metric('Supplier Payable',d.summary.supplierPending,'Pending to truck owners')}${metric('Total Billing',d.summary.totalBilling,`${d.summary.invoices} invoices`)}${metric('Party Received',d.summary.partyReceived,'Collection received')}${metric('Estimated Profit',d.summary.estimatedProfit,'Before income tax')}${metric('Total Trips',String(d.summary.trips),'All transport entries')}</div>
    <div class="quick-actions no-print">
      <button type="button" class="quick" data-action="new-trip"><b>+ New Trip</b><small>Create transport booking</small></button>
      <button type="button" class="quick" data-action="new-invoice"><b>+ New Invoice</b><small>Create GST invoice</small></button>
      <button type="button" class="quick" data-action="new-party-payment"><b>Receive Payment</b><small>Party collection entry</small></button>
      <button type="button" class="quick" data-action="new-supplier-payment"><b>Pay Supplier</b><small>Truck malik payment</small></button>
    </div>
    <div class="grid2" style="margin-top:12px"><div class="card"><div class="section-title"><h2>Recent Trips</h2><button class="btn soft" data-panel="trips">View all</button></div>${table(['Date','Party','Truck','Route','Status'],d.trips.slice(0,8).map(t=>[esc(t.trip_date),`<b>${esc(t.party_name)}</b>`,esc(t.truck_no),`${esc(t.loading_point)} → ${esc(t.unloading_point)}`,statusBadge(t.status)]),'700px')}</div>
    <div class="card"><div class="section-title"><h2>Party Outstanding</h2></div><div class="row-list">${d.partyLedger.slice(0,8).map(p=>{
      const lastInvoice=sortInvoicesSeries(d.invoices.filter(i=>i.party_name===p.party_name),true)[0];
      return `<div class="ledger-row"><button style="all:unset;cursor:pointer;flex:1" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}"><b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b><small>${lastInvoice?`Last Invoice ${esc(lastInvoice.invoice_no)} · `:''}${p.invoices} invoices · ${p.payments} payments</small></button><div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div></div>`;
    }).join('')}</div></div></div>
  </section>`;
}
function tripsPanel(d){
  const rows=filterRows(d.trips,['trip_no','invoice_no','trip_date','party_name','truck_no','material','loading_point','unloading_point','status'])
    .sort((a,b)=>Number(String(b.trip_no||'').replace(/\D/g,''))-Number(String(a.trip_no||'').replace(/\D/g,'')));
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Transport Khata</h2><small>Trip booking, status and POD</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search trips…"><button class="btn primary" data-action="new-trip">New Trip</button></div></div>${table(['Trip No.','Invoice','Date','Party','Truck / Driver','Route','Material','Weight × Rate','Status','POD','Action'],rows.map(t=>[
    `<button class="link-btn" data-action="view-trip" data-id="${esc(t.id)}"><b>${esc(t.trip_no||t.id)}</b></button>`,
    t.invoice_no?`<button class="link-btn" data-action="view-linked-invoice" data-id="${esc(t.invoice_id)}">${esc(t.invoice_no)}</button>`:'-',
    esc(t.trip_date),esc(t.party_name),`<b>${esc(t.truck_no)}</b><br><small>${esc(t.driver_name||'')}</small>`,`${esc(t.loading_point)} → ${esc(t.unloading_point)}`,esc(t.material),`${esc(t.weight)} × ${money(t.rate)}`,statusBadge(t.status),t.pod_file_name?`<span class="badge info">${esc(t.pod_file_name)}</span>`:'-',`<div class="action-set"><button class="mini green" data-action="view-trip" data-id="${esc(t.id)}">Open Trip</button><button class="mini" data-action="edit-trip" data-id="${esc(t.id)}">Edit</button><button class="mini danger" data-action="delete-trip" data-id="${esc(t.id)}">Delete</button></div>`
  ]),'1250px')}</div></section>`;
}
function invoicesPanel(d){
  const rows=sortInvoicesSeries(filterRows(d.invoices,['invoice_no','invoice_date','party_name','lr_no','material']),true);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Invoice Desk</h2><small>GST invoices linked with trips</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search invoices…"><button class="btn primary" data-action="new-invoice">New Invoice</button><button class="btn light" data-action="export-invoices">Excel CSV</button></div></div>${table(['Invoice','Type','Date','Party','LR / Material','Trips','Subtotal','GST','Total','Action'],rows.map(i=>[
    `<b>${esc(i.invoice_no)}</b>`,statusBadge(invoiceTypeLabel(i)),esc(i.invoice_date),esc(i.party_name),`${esc(i.lr_no||'-')}<br><small>${esc(i.material)}</small>`,String(i.items.length),money(i.subtotal),money(i.gst_amount),`<b>${money(i.total)}</b>`,`<div class="action-set"><button class="mini green" data-action="view-invoice" data-id="${esc(i.id)}">View</button><button class="mini" data-action="edit-invoice" data-id="${esc(i.id)}">Edit</button><button class="mini gray" data-action="download-invoice" data-id="${esc(i.id)}">Download</button><button class="mini gray" data-action="share-invoice" data-id="${esc(i.id)}">WhatsApp</button><button class="mini danger" data-action="delete-invoice" data-id="${esc(i.id)}">Delete</button></div>`
  ]),'1100px')}</div></section>`;
}


function pmBillsPanel(d){
  const rows=filterRows(d.pmBills||[],['bill_no','bill_date','party_name','supplier_name']);
  return `<section class="panel active"><div class="card">
    <div class="section-title">
      <div><h2>PM Non-GST Bills</h2><small>Party, supplier, truck and profit history — GST વગર</small></div>
      <div class="toolbar">
        <input class="search" data-search value="${esc(state.search)}" placeholder="Search PM bills…">
        <button class="btn primary" data-action="new-pm-bill">New PM Bill</button>
      </div>
    </div>
    <div class="cards">
      ${metric('Total PM Billing',(d.pmBills||[]).reduce((a,x)=>a+Number(x.subtotal||0),0))}
      ${metric('Supplier Payable',(d.pmBills||[]).reduce((a,x)=>a+Number(x.supplier_total||0),0))}
      ${metric('PM Profit',(d.pmBills||[]).reduce((a,x)=>a+Number(x.profit||0),0))}
    </div>
    ${table(['Bill No.','Date','Party','Supplier','Trucks / Routes','Party Bill','Supplier','Profit','Action'],
      rows.map(b=>[
        `<b>${esc(b.bill_no)}</b>`,
        esc(b.bill_date),
        esc(b.party_name),
        esc(b.supplier_name||'-'),
        (b.items||[]).map(i=>`<b>${esc(i.truck_no)}</b><br><small>${esc(i.loading_point)} → ${esc(i.unloading_point)}</small>`).join('<hr>')||'-',
        `<b>${money(b.subtotal)}</b>`,
        money(b.supplier_total),
        `<b>${money(b.profit)}</b>`,
        `<div class="action-set">
          <button class="mini green" data-action="view-pm-bill" data-id="${esc(b.id)}">View</button>
          <button class="mini" data-action="edit-pm-bill" data-id="${esc(b.id)}">Edit</button>
          <button class="mini gray" data-action="download-pm-bill" data-id="${esc(b.id)}">Download</button>
          <button class="mini danger" data-action="delete-pm-bill" data-id="${esc(b.id)}">Delete</button>
        </div>`
      ]),'1250px')}
  </div></section>`;
}

function partiesPanel(d){
  const rows=filterRows(d.partyLedger,['party_name','ledger_no']);
  return `<section class="panel active">
    <div class="card">
      <div class="section-title">
        <div><h2>Party Khata</h2><small>Invoice-wise billing, receipts and outstanding</small></div>
        <div class="toolbar">
          <input class="search" data-search value="${esc(state.search)}" placeholder="Search party or invoice…">
          <button class="btn primary" data-action="new-party">New Party</button>
          <button class="btn green" data-action="new-party-payment">Receive Payment</button>
        </div>
      </div>
      <div class="row-list">
        ${rows.map(p=>{
          const invoices=sortInvoicesSeries(d.invoices.filter(i=>i.party_name===p.party_name),true);
          return `<div class="party-account-card">
            <div class="party-account-head">
              <button class="party-account-title" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}">
                <b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b>
                <small>Billed ${money(p.billed)} · Received ${money(p.received)} · ${invoices.length} invoices</small>
              </button>
              <div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div>
            </div>
            ${invoices.length?table(
              ['Invoice No.','Type','Date','Truck / Route','Bill','Received','Pending','Status','Action'],
              invoices.map(i=>{
                const received=invoiceReceivedAmount(i);
                const pending=Math.max(0,Number(i.total||0)-received);
                const trucks=(i.items||[]).map(x=>x.truck_no).filter(Boolean).join(', ')||'-';
                const route=(i.items||[])[0]?.description||i.material||'-';
                return [
                  `<b>${esc(i.invoice_no)}</b>`,
                  statusBadge(invoiceTypeLabel(i)),
                  esc(i.invoice_date),
                  `<b>${esc(trucks)}</b><br><small>${esc(route)}</small>`,
                  money(i.total),
                  money(received),
                  `<b>${money(pending)}</b>`,
                  statusBadge(invoiceStatus(i.total,received)),
                  `<div class="action-set">
                    <button class="mini green" data-action="view-invoice" data-id="${esc(i.id)}">View</button>
                    <button class="mini" data-action="edit-invoice" data-id="${esc(i.id)}">Edit</button>
                    <button class="mini gray" data-action="download-invoice" data-id="${esc(i.id)}">Download</button>
                    <button class="mini danger" data-action="delete-invoice" data-id="${esc(i.id)}">Delete</button>
                  </div>`
                ];
              }),
              '1050px'
            ):'<div class="notice">No invoices for this party.</div>'}
          </div>`;
        }).join('')}
      </div>
    </div>
  </section>`;
}

function partyPaymentsPanel(d){
  const rows=filterRows(d.partyPayments,['receipt_no','party_name','payment_date','payment_mode','reference']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Party Payment History</h2><small>TransportBook-style receipt register</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search payments…"><button class="btn green" data-action="new-party-payment">Receive Payment</button></div></div>${table(['Receipt','Date','Party','Mode','Reference','Notes','Amount','Action'],rows.map(p=>[
    `<b>${esc(p.receipt_no||p.id)}</b>`,esc(p.payment_date),esc(p.party_name),statusBadge(p.payment_mode),esc(p.reference||'-'),esc(p.notes||'-'),`<b>${money(p.amount)}</b>`,actionButtons('party-payment',p.id)
  ]),'950px')}</div></section>`;
}
function suppliersPanel(d){
  const rows=filterRows(d.supplierLedger,['owner_name']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Supplier Khata</h2><small>Truck malik payable and payment ledger</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search supplier…"><button class="btn green" data-action="new-supplier-payment">Pay Supplier</button></div></div><div class="row-list">${rows.map(s=>`<button class="ledger-row" data-action="view-supplier-ledger" data-id="${encodeURIComponent(s.owner_name)}"><div><b>${esc((s.ledger_no?s.ledger_no+' · ':'')+s.owner_name)}</b><small>${s.entries} freight entries · ${s.pm_bills||0} PM bills · ${s.payments} payments · ${s.truck_count} trucks</small></div><div class="money-right"><b>${money(s.pending)}</b><small>Payable ${money(s.payable)}</small></div></button>`).join('')}</div></div></section>`;
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

function formsPanel(d){
  return `<section class="panel active"><div class="grid3">
    <div class="card form-card">
      <div class="form-card-icon">📄</div>
      <h3>TDS Declaration</h3>
      <p>Transporter Declaration Format for Non-Deduction of TDS u/s 194C(6).</p>
      <button class="btn primary" data-action="new-tds-declaration">Create Form</button>
    </div>
    <div class="card form-card muted-card">
      <div class="form-card-icon">＋</div>
      <h3>More Forms</h3>
      <p>બીજા office forms અહીં આગળ add કરી શકાશે.</p>
    </div>
  </div></section>`;
}
function tdsDeclarationForm(){
  const d=state.data;
  const defaultDate=today();
  const y=Number(defaultDate.slice(0,4));
  const fy=(new Date(defaultDate).getMonth()+1)>=4?`${y}-${String(y+1).slice(-2)}`:`${y-1}-${String(y).slice(-2)}`;
  const host=modal('TDS Declaration Form',`<form class="form-grid" id="tdsForm">
    <div class="span2 universal-section-title"><b>PAYER DETAILS</b><small>Party dropdownથી name અને address automatic આવશે</small></div>
    ${masterSelectField('Payer / Party','partyName',d.parties.map(p=>p.party_name),'','party','required')}
    ${field('Date','declarationDate',defaultDate,'date','required')}
    <label class="field span2"><span>Payer Address</span><textarea name="payerAddress" readonly></textarea></label>

    <div class="span2 universal-section-title billing"><b>MEERA LOGISTICS DETAILS</b><small>બધી details editable છે</small></div>
    ${selectField('Entity Type','entityType',['PARTNERSHIP FIRM','PROPRIETORSHIP','COMPANY','LLP'],'PARTNERSHIP FIRM')}
    ${field('Firm Name','firmName','MEERA LOGISTICS','text','required')}
    ${field('Firm PAN','firmPan','ACFFM2544N','text','required')}
    ${field('Firm GST Number','firmGst','24ACFFM2544N1Z1','text')}
    ${field('Phone','firmPhone','9558959579','tel')}
    ${field('Email','firmEmail','meera.logistics99@gmail.com','email')}
    ${textarea('Firm Address','firmAddress','OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR','span2')}
    ${field('Authorized Partner Name','authorizedPartner','AUTHORIZED PARTNER','text','required')}
    ${field('Place','place','JAMNAGAR','text','required')}
    ${field('Financial Year','financialYear',fy,'text','required')}
    ${field('Maximum Goods Carriages','maxVehicles','10','number','min="1" required')}

    <div class="form-actions">
      <button type="button" class="btn light" data-close-form>Cancel</button>
      <button type="button" class="btn soft" id="previewTds">Preview</button>
      <button type="button" class="btn primary" id="downloadTds">Download</button>
    </div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);
    const party=host.querySelector('[name=partyName]');
    const address=host.querySelector('[name=payerAddress]');
    const sync=()=>{address.value=getPartyDetails(party.value).address||''};
    party.addEventListener('change',sync);
    host.querySelector('[data-close-form]').onclick=()=>host.remove();
    const data=()=>formDataObject(host.querySelector('#tdsForm'));
    host.querySelector('#previewTds').onclick=()=>viewTdsDeclaration(data());
    host.querySelector('#downloadTds').onclick=()=>downloadTdsDeclaration(data());
  }});
}
function tdsDeclarationHtml(x){
  const dateText=String(x.declarationDate||'').split('-').reverse().join('/');
  const fy=esc(x.financialYear||'');
  const startYear=String(x.financialYear||'').split('-')[0]||'';
  const endShort=String(x.financialYear||'').split('-')[1]||'';
  const endYear=endShort.length===2?`${String(startYear).slice(0,2)}${endShort}`:endShort;
  const entity=esc(x.entityType||'PARTNERSHIP FIRM');
  return `<div class="tds-sheet">
    <h1>Transporter Declaration Format For Non-Deduction of<br>TDS u/s 194C (6)</h1>
    <div class="tds-to">To,</div>
    <p><b>Name of the Payer:</b> ${esc(x.partyName||'')}</p>
    <p><b>Address of the Payer:</b> ${esc(x.payerAddress||'')}</p>

    <h2>Declaration u/s 194C (6) For Non-Deduction of TDS</h2>

    <p>We, <b>${esc(x.firmName||'MEERA LOGISTICS')}</b>, a ${entity}, having its office at ${esc(x.firmAddress||'')}, through its authorized partner <b>${esc(x.authorizedPartner||'')}</b>, hereby make the following declaration as required by sub-section (6) of section 194C of the Income Tax Act, 1961 for receiving payments from the payer without deduction of tax at source (TDS).</p>

    <ol>
      <li>That the person signing this declaration is duly authorized to make this declaration on behalf of the partnership firm.</li>
      <li>That the contractor is engaged by the payer for hiring or leasing of goods carriage for its business.</li>
      <li>That the firm has not owned more than ${esc(x.maxVehicles||'10')} goods carriage vehicles as on date.</li>
      <li>That if the number of goods carriages owned by the contractor exceeds ${esc(x.maxVehicles||'10')} at any time during the previous year ${fy} (01-04-${esc(startYear)} to 31-03-${esc(endYear)}), the contractor shall forthwith intimate the payer in writing.</li>
      <li>That the Permanent Account Number (PAN) of the contractor is <b>${esc(x.firmPan||'')}</b>. A self-attested photocopy of the same is furnished to the payer along with this declaration.</li>
    </ol>

    <div class="tds-firm-info">
      <div><b>Firm:</b> ${esc(x.firmName||'')}</div>
      <div><b>GST:</b> ${esc(x.firmGst||'-')}</div>
      <div><b>Phone:</b> ${esc(x.firmPhone||'-')}</div>
      <div><b>Email:</b> ${esc(x.firmEmail||'-')}</div>
    </div>

    <div class="tds-bottom">
      <div>
        <p><b>Place:</b> ${esc(x.place||'')}</p>
        <p><b>Date:</b> ${esc(dateText)}</p>
      </div>
      <div class="tds-sign">
        <div class="tds-digital-stamp"><b>MEERA</b><span>LOGISTICS</span><small>JAMNAGAR</small></div>
        <div class="tds-sign-line"></div>
        <b>Authorized Partner</b>
        <div>${esc(x.authorizedPartner||'')}</div>
        <div>For ${esc(x.firmName||'MEERA LOGISTICS')}</div>
      </div>
    </div>
  </div>`;
}
function viewTdsDeclaration(data){
  modal('TDS Declaration Preview',`${tdsDeclarationHtml(data)}<div class="form-actions no-print"><button class="btn primary" onclick="window.print()">Print / Save PDF</button></div>`);
}
function downloadTdsDeclaration(data){
  const w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><title>TDS Declaration</title><link rel="stylesheet" href="/src/styles.css?v=19"></head><body class="invoice-download-body">${tdsDeclarationHtml(data)}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  w.document.close();
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
  if(action==='new-trip'||action==='edit-trip')return tripForm(action==='edit-trip'?(find('trip',id)||{}):{});
  if(action==='view-trip')return universalTripScreen(find('trip',id));
  if(action==='view-linked-invoice')return viewInvoice(find('invoice',id));
  if(action==='trip-create-invoice'){const t=find('trip',id);return invoiceForm({},t||{});}
  if(action==='trip-party-payment'){const t=find('trip',id);return partyPaymentForm({},t||{});}
  if(action==='trip-supplier-payment'){
    const t=find('trip',id)||{};
    const owner=state.data.trucks.find(x=>x.truck_no===t.truck_no)?.owner_name||t.driver_name||'';
    return supplierPaymentForm({}, {...t,owner_name:owner});
  }
  if(action==='trip-expense'){const t=find('trip',id);return expenseForm({},t||{});}
  if(action==='delete-trip')return remove(`/trips/${id}`,'Delete this trip?');
  if(action==='new-invoice'||action==='edit-invoice')return invoiceForm(action==='edit-invoice'?(find('invoice',id)||{}):{});
  if(action==='new-pm-bill'||action==='edit-pm-bill')return pmBillForm(action==='edit-pm-bill'?(find('pm-bill',id)||{}):{});
  if(action==='view-pm-bill')return viewPmBill(find('pm-bill',id));
  if(action==='download-pm-bill')return downloadPmBill(find('pm-bill',id));
  if(action==='delete-pm-bill')return remove(`/pm-bills/${id}`,'Delete this PM bill?');
  if(action==='delete-invoice')return remove(`/invoices/${id}`,'Delete this invoice?');
  if(action==='view-invoice')return viewInvoice(find('invoice',id));
  if(action==='download-invoice')return downloadInvoicePdf(find('invoice',id));
  if(action==='share-invoice')return shareInvoice(find('invoice',id));
  if(action==='download-invoice')return downloadInvoice(find('invoice',id));
  if(action==='new-party'||action==='edit-party')return partyForm(action==='edit-party'?(find('party',id)||{}):{});
  if(action==='delete-party')return remove(`/parties/${id}`,'Delete this party?');
  if(action==='view-party-ledger')return viewPartyLedger(decodeURIComponent(id));
  if(action==='new-party-payment'||action==='edit-party-payment')return partyPaymentForm(action==='edit-party-payment'?(find('party-payment',id)||{}):{});
  if(action==='delete-party-payment')return remove(`/party-payments/${id}`,'Delete this party payment?');
  if(action==='view-supplier-ledger')return viewSupplierLedger(decodeURIComponent(id));
  if(action==='new-truck-entry'||action==='edit-truck-entry')return truckEntryForm(action==='edit-truck-entry'?(find('truck-entry',id)||{}):{});
  if(action==='delete-truck-entry')return remove(`/truck-entries/${id}`,'Delete this supplier entry?');
  if(action==='new-supplier-payment'||action==='edit-supplier-payment')return supplierPaymentForm(action==='edit-supplier-payment'?(find('supplier-payment',id)||{}):{});
  if(action==='delete-supplier-payment')return remove(`/supplier-payments/${id}`,'Delete this supplier payment?');
  if(action==='new-truck'||action==='edit-truck')return truckForm(action==='edit-truck'?(find('truck',id)||{}):{});
  if(action==='delete-truck')return remove(`/trucks/${id}`,'Delete this truck?');
  if(action==='new-document')return documentForm(id?decodeURIComponent(id):'');
  if(action==='view-document')return viewDocument(id);
  if(action==='delete-document')return remove(`/documents/${id}`,'Delete this document?');
  if(action==='new-route'||action==='edit-route')return routeForm(action==='edit-route'?(find('route',id)||{}):{});
  if(action==='delete-route')return remove(`/routes/${id}`,'Delete this route?');
  if(action==='new-material')return materialForm();
  if(action==='delete-material')return remove(`/materials/${id}`,'Delete this material?');
  if(action==='new-tds-declaration')return tdsDeclarationForm();
  if(action==='new-expense'||action==='edit-expense')return expenseForm(action==='edit-expense'?(find('expense',id)||{}):{});
  if(action==='delete-expense')return remove(`/expenses/${id}`,'Delete this expense?');
  if(action==='restore-backup')return restoreBackup();
  if(action==='export-invoices')return exportInvoices();
}
async function remove(path,message){if(!confirm(message))return;try{await api(path,{method:'DELETE'});await loadData()}catch(e){alert(e.message)}}



function tripFinancials(trip){
  const d=state.data;
  const invoiceItems=[];
  for(const invoice of d.invoices){
    for(const item of (invoice.items||[])){
      if(String(item.trip_id||'')===String(trip.id))invoiceItems.push({...item,invoice});
    }
  }
  const invoice=invoiceItems[0]?.invoice||null;
  const revenue=invoice?Number(invoice.total||0):invoiceItems.reduce((a,x)=>a+Number(x.amount||0),0);

  const partyPayments=d.partyPayments.filter(p=>String(p.trip_id||'')===String(trip.id));
  const partyPaid=partyPayments.reduce((a,x)=>a+Number(x.amount||0),0);

  const supplierEntries=d.truckEntries.filter(e=>
    String(e.trip_id||'')===String(trip.id) ||
    (!e.trip_id && e.truck_no===trip.truck_no && e.entry_date===trip.trip_date)
  );
  const supplierPayable=supplierEntries.reduce((a,x)=>a+Number(x.payable||0),0);
  const ownerNames=[...new Set(supplierEntries.map(x=>x.owner_name).filter(Boolean))];

  const supplierPays=d.supplierPayments.filter(p=>String(p.trip_id||'')===String(trip.id));
  const supplierPaid=supplierPays.reduce((a,x)=>a+Number(x.amount||0),0);

  const expenses=d.expenses.filter(e=>String(e.trip_id||'')===String(trip.id));
  const expenseTotal=expenses.reduce((a,x)=>a+Number(x.amount||0),0);

  return {
    invoiceItems,invoice,revenue,partyPayments,partyPaid,
    supplierEntries,supplierPayable,ownerNames,supplierPays,supplierPaid,
    expenses,expenseTotal,profit:revenue-supplierPayable-expenseTotal
  };
}
function tripProgress(status){
  const order=['BOOKED','LOADED','IN_TRANSIT','DELIVERED','SETTLED'];
  const current=Math.max(0,order.indexOf(status));
  const labels=['Started','Loaded','Transit','Delivered','Settled'];
  return `<div class="ut-progress">${labels.map((label,i)=>`
    <div class="${i<=current?'done':''}">
      <span>${i<=current?'✓':''}</span><small>${label}</small>
    </div>`).join('')}</div>`;
}
function universalTripScreen(trip){
  if(!trip)return;
  const f=tripFinancials(trip);
  const owner=f.ownerNames[0]||state.data.trucks.find(t=>t.truck_no===trip.truck_no)?.owner_name||trip.driver_name||'SUPPLIER';
  const partyPending=f.revenue-f.partyPaid;
  const supplierPending=f.supplierPayable-f.supplierPaid;

  const host=modal(`Trip Details · ${trip.trip_no||trip.id}`,`
    <div class="ut-shell">
      <div class="ut-top">
        <div class="ut-truck"><b>🚚 ${esc(trip.truck_no)}</b><span>${esc(trip.material||'MARKET')}</span></div>
        <div class="ut-owner">👤 ${esc(owner)}</div>
      </div>

      <div class="ut-route-card">
        <div>
          <small>PARTY</small>
          <h2>${esc(trip.party_name)}</h2>
          <div class="ut-route"><b>${esc(trip.loading_point)}</b><span>→</span><b>${esc(trip.unloading_point)}</b></div>
          <p>${esc(trip.trip_date)} · ${esc(trip.trip_no||trip.id)}</p>
        </div>
        <strong>${money(f.revenue)}</strong>
      </div>

      ${tripProgress(trip.status)}

      <div class="ut-tabs">
        <button class="active" data-ut-tab="party">Party</button>
        <button data-ut-tab="profit">Profit</button>
        <button data-ut-tab="supplier">Supplier</button>
        <button data-ut-tab="more">More</button>
      </div>

      <section class="ut-pane active" data-ut-pane="party">
        <div class="ut-card">
          <div class="ut-invoice-summary">
            <div><small>INVOICE NO.</small><b>${esc(f.invoice?.invoice_no||'Not Created')}</b></div>
            <div><small>INVOICE DATE</small><b>${esc(f.invoice?.invoice_date||'-')}</b></div>
            <div><small>PARTY GST</small><b>${esc(f.invoice?.party_gst||state.data.parties.find(p=>p.party_name===trip.party_name)?.gst_no||'-')}</b></div>
            <div><small>GST</small><b>${f.invoice?`${esc(f.invoice.sgst)}% + ${esc(f.invoice.cgst)}%`:'9% + 9%'}</b></div>
            <div><small>LR NO.</small><b>${esc(f.invoice?.lr_no||'-')}</b></div>
            <div><small>INVOICE TOTAL</small><b>${money(f.invoice?.total||0)}</b></div>
          </div>
          <div class="ut-actions">
            <button class="btn green" data-action="edit-trip" data-id="${esc(trip.id)}">Edit Universal Trip</button>
            ${f.invoice
              ? `<button class="btn primary" data-action="view-invoice" data-id="${esc(f.invoice.id)}">View Bill</button>`
              : `<button class="btn primary" data-action="trip-create-invoice" data-id="${esc(trip.id)}">Create Bill</button>`}
          </div>
          <div class="ut-money">
            <div><span>Freight Amount</span><b>${money(f.revenue)}</b></div>
            <div><span>(-) Party Payments</span><b>${money(f.partyPaid)}</b></div>
            <button class="ut-link" data-action="trip-party-payment" data-id="${esc(trip.id)}">+ Add Party Payment</button>
            <div class="ut-balance"><span>Pending Balance</span><b>${money(partyPending)}</b></div>
          </div>
        </div>
      </section>

      <section class="ut-pane" data-ut-pane="profit">
        <div class="ut-card">
          <div class="ut-money">
            <div><span>(+) Revenue</span><b>${money(f.revenue)}</b></div>
            <div class="ut-sub"><span>${esc(trip.party_name)}</span><b>${money(f.revenue)}</b></div>
            <div><span>(-) Truck Hire Cost</span><b>${money(f.supplierPayable)}</b></div>
            <div><span>(-) Other Expenses</span><b>${money(f.expenseTotal)}</b></div>
            <button class="ut-link" data-action="trip-expense" data-id="${esc(trip.id)}">+ Add Expense</button>
            <div class="ut-balance profit"><span>Profit</span><b>${money(f.profit)}</b></div>
          </div>
        </div>
      </section>

      <section class="ut-pane" data-ut-pane="supplier">
        <div class="ut-card">
          <h3>${esc(owner)}</h3>
          <div class="ut-money">
            <div><span>Truck Hire Cost</span><b>${money(f.supplierPayable)}</b></div>
            <div><span>(-) Supplier Payments</span><b>${money(f.supplierPaid)}</b></div>
            <button class="ut-link" data-action="trip-supplier-payment" data-id="${esc(trip.id)}">+ Add Supplier Payment</button>
            <div class="ut-balance"><span>Balance Pending</span><b>${money(supplierPending)}</b></div>
          </div>
          <div class="ut-actions one"><button class="btn primary" data-action="trip-supplier-payment" data-id="${esc(trip.id)}">₹ Pay Supplier</button></div>
        </div>
      </section>

      <section class="ut-pane" data-ut-pane="more">
        <div class="ut-list">
          <button data-action="new-document" data-id="${encodeURIComponent(trip.truck_no)}">
            <span>🧾</span><div><b>Online Bilty / LR</b><small>Add or view documents</small></div><i>›</i>
          </button>
          <button data-action="edit-trip" data-id="${esc(trip.id)}">
            <span>📝</span><div><b>POD Challan</b><small>${trip.pod_file_name?esc(trip.pod_file_name):'Add POD image'}</small></div><i>›</i>
          </button>
        </div>
      </section>
    </div>`,{onMount:host=>{
      host.querySelectorAll('[data-ut-tab]').forEach(btn=>btn.onclick=()=>{
        host.querySelectorAll('[data-ut-tab]').forEach(x=>x.classList.toggle('active',x===btn));
        host.querySelectorAll('[data-ut-pane]').forEach(x=>x.classList.toggle('active',x.dataset.utPane===btn.dataset.utTab));
      });
      host.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>{
        host.remove();
        handleAction(btn.dataset.action,btn.dataset.id);
      });
    }});
}

function tripForm(x={},afterSave=null){
  x=x||{};
  const d=state.data,edit=!!x.id;
  const linkedInvoice=d.invoices.find(inv=>(inv.items||[]).some(it=>String(it.trip_id||'')===String(x.id||'')))||null;
  const linkedItem=linkedInvoice?.items?.find(it=>String(it.trip_id||'')===String(x.id||''))||null;
  const initialType=linkedInvoice?.invoice_type||'GST';
  const partyMaster=getPartyDetails(x.party_name||'');
  const initialLoading=Number(x.loading_weight??linkedItem?.loading_weight??x.weight??0);
  const initialUnloading=Number(x.unloading_weight??linkedItem?.unloading_weight??x.weight??0);
  const initialBilling=Number(x.billing_weight??linkedItem?.weight??x.weight??initialUnloading);
  const initialShortage=Math.max(0,initialLoading-initialUnloading);

  const host=modal(edit?'Edit Universal Trip':'New Universal Trip',`<form class="form-grid" id="tripForm">
    <div class="span2 invoice-type-switch">
      <span>Trip Type</span>
      <div class="invoice-type-buttons">
        <button type="button" class="type-choice ${initialType==='GST'?'active':''}" data-trip-type="GST">GST Trip</button>
        <button type="button" class="type-choice ${initialType==='NON_GST'?'active':''}" data-trip-type="NON_GST">Non-GST Trip</button>
      </div>
      <input type="hidden" name="tripType" value="${esc(initialType)}">
    </div>

    <div class="span2 universal-section-title"><b>TRIP DETAILS</b><small>એક જ entryમાંથી Trip, Invoice, Party અને Supplier બધે લાગુ પડશે</small></div>
    ${field('Trip Date','tripDate',x.trip_date||today(),'date','required')}
    ${masterSelectField('Party','partyName',d.parties.map(p=>p.party_name),x.party_name||'','party','required')}
    ${masterSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),x.truck_no||'','truck','required')}
    ${field('Driver / Malik Name','driverName',x.driver_name||'')}
    ${field('Driver Mobile','driverMobile',x.driver_mobile||'','tel')}
    ${masterSelectField('Material','material',d.materials.map(m=>m.material_name),x.material||'','material','required')}
    ${masterSelectField('Loading Point','loadingPoint',[...new Set(d.routes.map(r=>r.loading_point))],x.loading_point||'','route-loading','required')}
    ${masterSelectField('Unloading Point','unloadingPoint',[...new Set(d.routes.map(r=>r.unloading_point))],x.unloading_point||'','route-unloading','required')}
    ${field('LR Number','lrNumber',x.lr_number||linkedItem?.lr_number||'','text','required')}
    ${field('Loading Weight','loadingWeight',initialLoading,'number','step="0.001" required')}
    ${field('Unloading Weight','unloadingWeight',initialUnloading,'number','step="0.001" required')}
    ${field('Difference / Shortage','shortage',initialShortage,'number','step="0.001" readonly')}
    ${field('Billing Weight','billingWeight',initialBilling,'number','step="0.001" required')}
    ${field('Party Billing Rate','rate',x.rate||0,'number','step="0.01" required')}
    ${selectField('Trip Status','status',['BOOKED','LOADED','IN_TRANSIT','DELIVERED'],x.status||'BOOKED')}

    <div class="span2 universal-section-title billing"><b>INVOICE DETAILS</b><small>Trip Type પ્રમાણે ML અથવા JAY series આવશે</small></div>
    <label class="field span2 universal-check">
      <span>Create / Update Invoice With This Trip</span>
      <input name="createInvoice" type="checkbox" ${linkedInvoice||!edit?'checked':''}>
    </label>
    ${field('Invoice Number','invoiceNo',linkedInvoice?.invoice_no||(initialType==='NON_GST'?d.nextNonGstInvoiceNo:d.nextInvoiceNo),'text','required')}
    ${field('Invoice Date','invoiceDate',linkedInvoice?.invoice_date||x.trip_date||today(),'date','required')}
    <div class="trip-gst-field">${field('Party GST Number','partyGst',linkedInvoice?.party_gst||partyMaster.gst_no||'','text','readonly')}</div>
    <div class="trip-gst-field">${field('SGST %','sgst',linkedInvoice?.sgst??9,'number','step="0.01"')}</div>
    <div class="trip-gst-field">${field('CGST %','cgst',linkedInvoice?.cgst??9,'number','step="0.01"')}</div>
    ${field('Diesel','diesel',linkedInvoice?.diesel||0,'number','step="0.01"')}
    ${field('Munshi Charges','munshi',linkedInvoice?.munshi||0,'number','step="0.01"')}
    <label class="field span2"><span>Party Address</span><textarea name="partyAddress" readonly>${esc(linkedInvoice?.party_address||partyMaster.address||'')}</textarea></label>
    ${textarea('Invoice Comments','comments',linkedInvoice?.comments||'1. Payment due within 30 days.\\n2. Mention invoice number in payment reference.','span2')}

    <div class="span2 universal-section-title supplier"><b>SUPPLIER / TRUCK MALIK</b><small>Supplier payable પણ આ Trip સાથે link થશે</small></div>
    ${field('Supplier Rate','supplierRate',0,'number','step="0.01"')}
    ${field('Commission','commission',0,'number','step="0.01"')}
    ${field('Supplier Advance','supplierAdvance',0,'number','step="0.01"')}

    ${textarea('Trip Notes','notes',x.notes||'','span2')}
    <label class="field span2"><span>POD Images (multiple allowed)</span><input id="podFiles" type="file" accept="image/*" multiple></label>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Universal Trip</button></div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);

    const tripTypeInput=host.querySelector('[name=tripType]');
    const invoiceNoInput=host.querySelector('[name=invoiceNo]');
    const partySelect=host.querySelector('[name=partyName]');

    const applyTripType=(type,forceNumber=true)=>{
      tripTypeInput.value=type;
      host.querySelectorAll('[data-trip-type]').forEach(b=>b.classList.toggle('active',b.dataset.tripType===type));
      const nonGst=type==='NON_GST';
      host.querySelectorAll('.trip-gst-field').forEach(el=>el.style.display=nonGst?'none':'');
      if(nonGst){
        host.querySelector('[name=sgst]').value=0;
        host.querySelector('[name=cgst]').value=0;
        host.querySelector('[name=partyGst]').value='';
        if(forceNumber && (!edit || !invoiceNoInput.value || /^ML/i.test(invoiceNoInput.value)))invoiceNoInput.value=d.nextNonGstInvoiceNo||'JAY 001';
      }else{
        const p=getPartyDetails(partySelect.value);
        host.querySelector('[name=partyGst]').value=p.gst_no||'';
        if(Number(host.querySelector('[name=sgst]').value||0)===0)host.querySelector('[name=sgst]').value=9;
        if(Number(host.querySelector('[name=cgst]').value||0)===0)host.querySelector('[name=cgst]').value=9;
        if(forceNumber && (!edit || !invoiceNoInput.value || /^JAY/i.test(invoiceNoInput.value)))invoiceNoInput.value=d.nextInvoiceNo||'ML - 1';
      }
    };

    host.querySelectorAll('[data-trip-type]').forEach(b=>b.onclick=()=>applyTripType(b.dataset.tripType,true));

    partySelect.addEventListener('change',()=>{
      const p=getPartyDetails(partySelect.value);
      const gst=host.querySelector('[name=partyGst]');
      const address=host.querySelector('[name=partyAddress]');
      if(tripTypeInput.value==='GST')gst.value=p.gst_no||'';
      address.value=p.address||'';
      gst.readOnly=true;
      address.readOnly=true;
    });

    const updateTripDifference=()=>{
      const loading=Number(host.querySelector('[name=loadingWeight]').value||0);
      const unloading=Number(host.querySelector('[name=unloadingWeight]').value||0);
      host.querySelector('[name=shortage]').value=Math.max(0,loading-unloading).toFixed(3);
      const billing=host.querySelector('[name=billingWeight]');
      if(!billing.dataset.edited)billing.value=(unloading||loading).toFixed(3);
    };
    host.querySelector('[name=loadingWeight]').addEventListener('input',updateTripDifference);
    host.querySelector('[name=unloadingWeight]').addEventListener('input',updateTripDifference);
    host.querySelector('[name=billingWeight]').addEventListener('input',e=>e.target.dataset.edited='1');

    applyTripType(initialType,false);
    updateTripDifference();
    if(partySelect.value)partySelect.dispatchEvent(new Event('change',{bubbles:true}));

    host.querySelector('[data-close-form]').onclick=()=>host.remove();
    host.querySelector('#tripForm').onsubmit=async e=>{
      e.preventDefault();
      const btn=e.submitter;
      const body=formDataObject(e.target);
      const loading=Number(body.loadingWeight||0);
      const unloading=Number(body.unloadingWeight||0);
      body.billingWeight=Number(body.billingWeight||unloading||loading);
      body.weight=body.billingWeight;

      const files=[...host.querySelector('#podFiles').files];
      if(files.length){
        const compressed=[];
        for(const file of files)compressed.push({name:file.name,data:await compressImage(file)});
        body.podFileName=compressed.map(x=>x.name).join(', ');
        body.podData=JSON.stringify(compressed);
      }else{
        body.podFileName=x.pod_file_name||'';
        body.podData=x.pod_data||'';
      }

      try{
        setBusy(btn,true);
        const tripResult=await api('/trips'+(edit?'/'+x.id:''),{
          method:edit?'PUT':'POST',
          body:JSON.stringify(body)
        });
        const tripId=tripResult.id||x.id;

        if(e.target.createInvoice.checked){
          const freshBeforeInvoice=await api('/bootstrap');
          const sameNumber=freshBeforeInvoice.invoices.find(inv=>String(inv.invoice_no)===String(body.invoiceNo));
          const targetInvoice=linkedInvoice||sameNumber||null;
          const existingItems=(targetInvoice?.items||[]).filter(it=>String(it.trip_id||'')!==String(tripId));
          existingItems.push({
            tripId,
            truckNo:body.truckNo,
            description:`${body.loadingPoint} TO ${body.unloadingPoint}`,
            lrNumber:body.lrNumber,
            loadingWeight:loading,
            unloadingWeight:unloading,
            weight:body.billingWeight,
            rate:Number(body.rate||0)
          });

          const invoiceBody={
            invoiceNo:body.invoiceNo,
            invoiceType:body.tripType,
            invoiceDate:body.invoiceDate,
            partyName:body.partyName,
            partyAddress:body.partyAddress||'',
            partyGst:body.tripType==='NON_GST'?'':body.partyGst||'',
            lrNo:body.lrNumber||'',
            material:body.material,
            loadingDate:body.tripDate,
            sgst:body.tripType==='NON_GST'?0:Number(body.sgst||0),
            cgst:body.tripType==='NON_GST'?0:Number(body.cgst||0),
            diesel:Number(body.diesel||0),
            munshi:Number(body.munshi||0),
            comments:body.comments||'',
            items:existingItems.map(it=>({
              tripId:it.trip_id||it.tripId||'',
              lrNumber:it.lr_number||it.lrNumber||'',
              truckNo:it.truck_no||it.truckNo||'',
              description:it.description||'',
              loadingWeight:it.loading_weight??it.loadingWeight??it.weight,
              unloadingWeight:it.unloading_weight??it.unloadingWeight??it.weight,
              weight:it.weight,
              rate:it.rate
            }))
          };

          await api('/invoices'+(targetInvoice?'/'+targetInvoice.id:''),{
            method:targetInvoice?'PUT':'POST',
            body:JSON.stringify(invoiceBody)
          });
        }

        const supplierRate=Number(body.supplierRate||0);
        if(supplierRate>0){
          const freshSupplier=await api('/bootstrap');
          const truck=freshSupplier.trucks.find(t=>t.truck_no===norm(body.truckNo))||{};
          const existingEntry=freshSupplier.truckEntries.find(te=>String(te.trip_id||'')===String(tripId));
          const entryBody={
            tripId,
            entryDate:body.tripDate,
            truckNo:body.truckNo,
            ownerName:truck.owner_name||body.driverName||'',
            bankDetails:truck.bank_details||'',
            loadingPoint:body.loadingPoint,
            unloadingPoint:body.unloadingPoint,
            weight:unloading||loading,
            rate:supplierRate,
            commission:Number(body.commission||0),
            notes:`Universal Trip ${tripId}`
          };
          await api('/truck-entries'+(existingEntry?'/'+existingEntry.id:''),{
            method:existingEntry?'PUT':'POST',
            body:JSON.stringify(entryBody)
          });

          const advance=Number(body.supplierAdvance||0);
          if(advance>0 && !edit){
            await api('/supplier-payments',{
              method:'POST',
              body:JSON.stringify({
                tripId,
                ownerName:entryBody.ownerName,
                truckNo:body.truckNo,
                paymentDate:body.tripDate,
                amount:advance,
                paymentMode:'BANK',
                reference:'TRIP ADVANCE',
                notes:`Advance for ${tripId}`
              })
            });
          }
        }

        const fresh=await api('/bootstrap');
        state.data=fresh;writeCache(fresh);
        host.remove();
        if(typeof afterSave==='function')afterSave(tripId,fresh);
        else universalTripScreen(fresh.trips.find(t=>String(t.id)===String(tripId)));
      }catch(err){
        alert(err.message);
      }finally{
        setBusy(btn,false);
      }
    };
  }});
}

function invoiceForm(x={},tripContext=null){
  x=x||{};
  const d=state.data,edit=!!x.id;
  const initialType=x.invoice_type||'GST';
  const items=(x.items&&x.items.length?x.items:(tripContext?[{
    trip_id:tripContext.id,tripId:tripContext.id,truck_no:tripContext.truck_no,truckNo:tripContext.truck_no,
    description:`${tripContext.loading_point} TO ${tripContext.unloading_point}`,
    lr_number:tripContext.lr_number||'',loading_weight:tripContext.loading_weight??tripContext.weight,
    unloading_weight:tripContext.unloading_weight??tripContext.weight,
    shortage:tripContext.shortage||0,weight:tripContext.billing_weight??tripContext.weight,rate:tripContext.rate
  }]:[{trip_id:'',lr_number:'',truck_no:'',description:'',loading_weight:0,unloading_weight:0,shortage:0,weight:0,rate:0}]));

  const host=modal(edit?'Edit Invoice':'New Invoice',`<form class="form-grid" id="invoiceForm">
    <div class="span2 invoice-type-switch">
      <span>Invoice Type</span>
      <div class="invoice-type-buttons">
        <button type="button" class="type-choice ${initialType==='GST'?'active':''}" data-type-choice="GST">GST Invoice</button>
        <button type="button" class="type-choice ${initialType==='NON_GST'?'active':''}" data-type-choice="NON_GST">Non-GST Invoice</button>
      </div>
      <input type="hidden" name="invoiceType" value="${esc(initialType)}">
    </div>

    <label class="field"><span>Invoice Number (Auto, Editable)</span><input name="invoiceNo" type="text" value="${esc(x.invoice_no||(initialType==='NON_GST'?d.nextNonGstInvoiceNo:d.nextInvoiceNo))}" required></label>
    ${field('Invoice Date','invoiceDate',x.invoice_date||today(),'date','required')}
    ${masterSelectField('Party','partyName',d.parties.map(p=>p.party_name),x.party_name||tripContext?.party_name||'','party','required')}
    <div class="gst-field">${field('Party GST','partyGst',x.party_gst||getPartyDetails(tripContext?.party_name||x.party_name).gst_no||'','text','readonly')}</div>
    <label class="field span2"><span>Party Address</span><textarea name="partyAddress" readonly>${esc(x.party_address||getPartyDetails(tripContext?.party_name||x.party_name).address||'')}</textarea></label>
    ${masterSelectField('Material','material',d.materials.map(m=>m.material_name),x.material||tripContext?.material||'','material')}
    ${field('Loading Date','loadingDate',x.loading_date||today(),'date')}
    ${field('Diesel','diesel',x.diesel||0,'number','step="0.01"')}
    ${field('Munshi','munshi',x.munshi||0,'number','step="0.01"')}
    <div class="gst-field">${field('SGST %','sgst',x.sgst??9,'number','step="0.01"')}</div>
    <div class="gst-field">${field('CGST %','cgst',x.cgst??9,'number','step="0.01"')}</div>

    <div class="span2"><div class="section-title"><div><h3>Truck Details</h3><small>એક invoiceમાં જેટલી truck જોઈએ એટલી add કરો</small></div><div class="toolbar"><button type="button" class="btn green" id="addTripFromInvoice">+ New Trip</button><button type="button" class="btn soft" id="addLine">+ Add Another Truck</button></div></div><div class="invoice-lines" id="invoiceLines"></div></div>

    <div class="span2 invoice-live-summary">
      <div><small>Subtotal</small><b id="sumSubtotal">₹0.00</b></div>
      <div class="gst-summary"><small>GST</small><b id="sumGst">₹0.00</b></div>
      <div><small>Total</small><b id="sumTotal">₹0.00</b></div>
    </div>

    ${textarea('Comments / Payment Terms','comments',x.comments||'1. Payment due within 30 days.\\n2. Mention invoice number in payment reference.','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Invoice</button></div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);
    const lines=host.querySelector('#invoiceLines');
    const typeInput=host.querySelector('[name=invoiceType]');
    const numberInput=host.querySelector('[name=invoiceNo]');

    function addLine(item={}){
      const linkedTrip=d.trips.find(t=>String(t.id)===String(item.trip_id||item.tripId||''));
      const row=document.createElement('div');
      row.className='invoice-line';
      row.innerHTML=`
        <label class="field"><span>Trip No.</span>
          <input name="tripNoDisplay" value="${esc(linkedTrip?.trip_no||'AUTO')}" readonly>
          <input name="tripId" type="hidden" value="${esc(item.trip_id||item.tripId||'')}">
        </label>
        ${field('LR Number','lrNumber',item.lr_number||item.lrNumber||linkedTrip?.lr_number||'','','required')}
        ${masterSelectField('Truck No.','truckNo',d.trucks.map(t=>t.truck_no),item.truck_no||item.truckNo||linkedTrip?.truck_no||'','truck','required')}
        ${field('Description / Route','description',item.description||(linkedTrip?`${linkedTrip.loading_point} TO ${linkedTrip.unloading_point}`:''),'','required')}
        ${field('Loading Weight','loadingWeight',item.loading_weight??item.loadingWeight??linkedTrip?.loading_weight??item.weight??0,'number','step="0.001" required')}
        ${field('Unloading Weight','unloadingWeight',item.unloading_weight??item.unloadingWeight??linkedTrip?.unloading_weight??item.weight??0,'number','step="0.001" required')}
        ${field('Difference','shortage',item.shortage??linkedTrip?.shortage??0,'number','step="0.001" readonly')}
        ${field('Billing Weight','weight',item.weight??item.billingWeight??linkedTrip?.billing_weight??0,'number','step="0.001" required')}
        ${field('Rate','rate',item.rate||linkedTrip?.rate||0,'number','step="0.01" required')}
        ${field('Amount','amount',Number(item.amount||0).toFixed(2),'number','step="0.01" readonly')}
        <button type="button" class="mini danger">Remove</button>`;

      const updateLine=()=>{
        const loading=Number(row.querySelector('[name=loadingWeight]').value||0);
        const unloading=Number(row.querySelector('[name=unloadingWeight]').value||0);
        const shortage=Math.max(0,loading-unloading);
        row.querySelector('[name=shortage]').value=shortage.toFixed(3);
        const weight=Number(row.querySelector('[name=weight]').value||0);
        const rate=Number(row.querySelector('[name=rate]').value||0);
        row.querySelector('[name=amount]').value=(weight*rate).toFixed(2);
        recalcInvoice();
      };
      const autoBilling=()=>{
        const billing=row.querySelector('[name=weight]');
        if(!billing.dataset.edited){
          const loading=Number(row.querySelector('[name=loadingWeight]').value||0);
          const unloading=Number(row.querySelector('[name=unloadingWeight]').value||0);
          billing.value=(unloading||loading).toFixed(3);
        }
        updateLine();
      };

      row.querySelector('button.mini').onclick=()=>{row.remove();recalcInvoice()};
      row.querySelector('[name=loadingWeight]').addEventListener('input',autoBilling);
      row.querySelector('[name=unloadingWeight]').addEventListener('input',autoBilling);
      row.querySelector('[name=weight]').addEventListener('input',e=>{e.target.dataset.edited='1';updateLine()});
      row.querySelector('[name=rate]').addEventListener('input',updateLine);
      lines.appendChild(row);
      wireMasterSelects(row);
      updateLine();
    }

    function recalcInvoice(){
      const subtotal=[...lines.querySelectorAll('.invoice-line')].reduce((a,r)=>a+Number(r.querySelector('[name=weight]').value||0)*Number(r.querySelector('[name=rate]').value||0),0)+Number(host.querySelector('[name=diesel]').value||0)+Number(host.querySelector('[name=munshi]').value||0);
      const nonGst=typeInput.value==='NON_GST';
      const gst=nonGst?0:subtotal*(Number(host.querySelector('[name=sgst]').value||0)+Number(host.querySelector('[name=cgst]').value||0))/100;
      host.querySelector('#sumSubtotal').textContent=money(subtotal);
      host.querySelector('#sumGst').textContent=money(gst);
      host.querySelector('#sumTotal').textContent=money(subtotal+gst);
    }

    function applyType(type,forceNumber=true){
      typeInput.value=type;
      host.querySelectorAll('[data-type-choice]').forEach(b=>b.classList.toggle('active',b.dataset.typeChoice===type));
      const nonGst=type==='NON_GST';
      host.querySelectorAll('.gst-field').forEach(el=>el.style.display=nonGst?'none':'');
      host.querySelectorAll('.gst-summary').forEach(el=>el.style.display=nonGst?'none':'');
      if(nonGst){
        host.querySelector('[name=sgst]').value=0;
        host.querySelector('[name=cgst]').value=0;
        if(forceNumber && (!edit || !numberInput.value || /^ML/i.test(numberInput.value)))numberInput.value=d.nextNonGstInvoiceNo||'JAY 001';
      }else{
        if(Number(host.querySelector('[name=sgst]').value||0)===0)host.querySelector('[name=sgst]').value=9;
        if(Number(host.querySelector('[name=cgst]').value||0)===0)host.querySelector('[name=cgst]').value=9;
        if(forceNumber && (!edit || !numberInput.value || /^JAY/i.test(numberInput.value)))numberInput.value=d.nextInvoiceNo||'ML - 1';
      }
      recalcInvoice();
    }

    host.querySelectorAll('[data-type-choice]').forEach(b=>b.onclick=()=>applyType(b.dataset.typeChoice,true));
    items.forEach(addLine);
    host.querySelector('#addLine').onclick=()=>addLine({});
    host.querySelector('#addTripFromInvoice').onclick=()=>tripForm({},(newTripId,fresh)=>{
      const trip=fresh.trips.find(t=>String(t.id)===String(newTripId));
      if(!trip)return;
      addLine({tripId:trip.id,lrNumber:trip.lr_number||'',truckNo:trip.truck_no,description:`${trip.loading_point} TO ${trip.unloading_point}`,loadingWeight:trip.loading_weight??trip.weight,unloadingWeight:trip.unloading_weight??trip.weight,weight:trip.billing_weight??trip.weight,rate:trip.rate});
    });

    host.querySelector('[name=partyName]').addEventListener('change',e=>{
      const p=getPartyDetails(e.target.value);
      host.querySelector('[name=partyGst]').value=p.gst_no||'';
      host.querySelector('[name=partyAddress]').value=p.address||'';
    });
    ['diesel','munshi','sgst','cgst'].forEach(n=>host.querySelector(`[name=${n}]`).addEventListener('input',recalcInvoice));
    applyType(initialType,false);

    host.querySelector('[data-close-form]').onclick=()=>host.remove();
    host.querySelector('#invoiceForm').onsubmit=async e=>{
      e.preventDefault();const body=formDataObject(e.target);
      body.items=[...lines.querySelectorAll('.invoice-line')].map(r=>({
        tripId:r.querySelector('[name=tripId]').value,
        lrNumber:r.querySelector('[name=lrNumber]').value,
        truckNo:r.querySelector('[name=truckNo]').value,
        description:r.querySelector('[name=description]').value,
        loadingWeight:r.querySelector('[name=loadingWeight]').value,
        unloadingWeight:r.querySelector('[name=unloadingWeight]').value,
        billingWeight:r.querySelector('[name=weight]').value,
        weight:r.querySelector('[name=weight]').value,
        rate:r.querySelector('[name=rate]').value
      }));
      if(await mutate('/invoices'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove();
    };
  }});
}

function partyForm(x={}){
  x=x||{};
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
function partyPaymentForm(x={},tripContext=null){
  x=x||{};
  const d=state.data,edit=!!x.id,host=modal(edit?'Edit Party Payment':'Receive Party Payment',`<form class="form-grid" id="partyPayForm">
    ${masterSelectField('Party','partyName',d.parties.map(p=>p.party_name),x.party_name||'','party','required')}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Receipt</button></div></form>`,{small:true,onMount:host=>{
      wireMasterSelects(host);
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#partyPayForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/party-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function truckEntryForm(x={}){
  x=x||{};
  const d=state.data,edit=!!x.id,host=modal(edit?'Edit Truck Entry':'New Truck / Supplier Entry',`<form class="form-grid" id="truckEntryForm">
    ${field('Entry Date','entryDate',x.entry_date||today(),'date','required')}
    ${selectField('Trip Link','tripId',['',...d.trips.map(t=>t.id)],x.trip_id||'')}
    ${masterSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),x.truck_no||'','truck','required')}
    ${datalistField('Owner / Supplier','ownerName',x.owner_name||'','ownerList',[...new Set(d.trucks.map(t=>t.owner_name).filter(Boolean))],'required')}
    ${field('Bank Details','bankDetails',x.bank_details||'')}
    ${masterSelectField('Loading Point','loadingPoint',[...new Set(d.routes.map(r=>r.loading_point))],x.loading_point||'','route-loading','required')}
    ${masterSelectField('Unloading Point','unloadingPoint',[...new Set(d.routes.map(r=>r.unloading_point))],x.unloading_point||'','route-unloading','required')}
    ${field('Weight','weight',x.weight||0,'number','step="0.01" required')}
    ${field('Rate','rate',x.rate||0,'number','step="0.01" required')}
    ${field('Commission','commission',x.commission||0,'number','step="0.01"')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Entry</button></div></form>`,{onMount:host=>{
      wireMasterSelects(host);
      host.querySelector('[name=tripId]').onchange=e=>{const t=d.trips.find(t=>String(t.id)===String(e.target.value));if(!t)return;for(const [n,v] of Object.entries({truckNo:t.truck_no,loadingPoint:t.loading_point,unloadingPoint:t.unloading_point,weight:t.weight})){host.querySelector(`[name=${n}]`).value=v}};
      host.querySelector('[name=truckNo]').onchange=e=>{const t=d.trucks.find(t=>t.truck_no===norm(e.target.value));if(t){host.querySelector('[name=ownerName]').value=t.owner_name||'';host.querySelector('[name=bankDetails]').value=t.bank_details||''}};
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#truckEntryForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/truck-entries'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function supplierPaymentForm(x={},tripContext=null){
  x=x||{};
  const d=state.data,edit=!!x.id,owners=[...new Set([...d.trucks.map(t=>t.owner_name),...d.supplierLedger.map(s=>s.owner_name)].filter(Boolean))],host=modal(edit?'Edit Supplier Payment':'Pay Supplier',`<form class="form-grid" id="supplierPayForm">
    ${datalistField('Owner / Supplier','ownerName',x.owner_name||tripContext?.owner_name||'','supplierOwnerList',owners,'required')}
    ${field('Trip ID','tripId',x.trip_id||tripContext?.id||'','text','readonly')}
    ${masterSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),x.truck_no||'','truck')}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Payment</button></div></form>`,{small:true,onMount:host=>{
      wireMasterSelects(host);
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#supplierPayForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/supplier-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()};
    }});
}
function truckForm(x={}){
  x=x||{};
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
  x=x||{};
  const edit=!!x.id,host=modal(edit?'Edit Route':'Add Route',`<form class="form-grid" id="routeForm">${field('Loading Point','loadingPoint',x.loading_point||'','text','required')}${field('Unloading Point','unloadingPoint',x.unloading_point||'','text','required')}<div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Route</button></div></form>`,{small:true,onMount:host=>{
    host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#routeForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/routes'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()}
  }});
}
function materialForm(){
  const host=modal('Add Material',`<form class="form-grid" id="materialForm">${field('Material Name','materialName','','text','required')}<div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Material</button></div></form>`,{small:true,onMount:host=>{
    host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#materialForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/materials','POST',formDataObject(e.target),e.submitter))host.remove()}
  }});
}
function expenseForm(x={},tripContext=null){
  x=x||{};
  const edit=!!x.id,host=modal(edit?'Edit Expense':'New Expense',`<form class="form-grid" id="expenseForm">
    ${field('Trip ID','tripId',x.trip_id||tripContext?.id||'','text','readonly')}${field('Date','expenseDate',x.expense_date||today(),'date','required')}${field('Category','category',x.category||'OFFICE','text','required')}${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}${textarea('Notes','notes',x.notes||'','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Expense</button></div></form>`,{small:true,onMount:host=>{
      host.querySelector('[data-close-form]').onclick=()=>host.remove();host.querySelector('#expenseForm').onsubmit=async e=>{e.preventDefault();if(await mutate('/expenses'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()}
    }});
}
function documentForm(truckNo=''){
  const d=state.data,host=modal('Add Truck Document',`<form class="form-grid" id="documentForm">
    ${masterSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),truckNo,'truck','required')}
    ${selectField('Document Type','kind',['RC FRONT','RC BACK','PAN','CHEQUE','BILTY','INSURANCE','PERMIT','PUC','OTHER'],'RC FRONT')}
    ${field('Expiry Date','expiryDate','','date')}
    ${textarea('Notes','notes','','span2')}
    <label class="field span2"><span>Image / PDF</span><input id="documentFile" type="file" accept="image/*,.pdf" required></label>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Upload Document</button></div></form>`,{onMount:host=>{
      wireMasterSelects(host);
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

function safeFileName(value){return String(value||'LEDGER').replace(/[\\/:*?"<>|]+/g,' ').trim()}
function downloadTextFile(name,text,type='text/csv;charset=utf-8'){
  const blob=new Blob([text],{type});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
function ledgerExcelHtml(title,headers,rows){
  return `<html><head><meta charset="utf-8"></head><body><h2>${esc(title)}</h2><table border="1"><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${String(c??'')}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
}
function openLedgerPrint(title,content){
  const w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><link rel="stylesheet" href="/src/styles.css?v=30"></head><body>${content}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  w.document.close();
}
function manualWhatsApp(message){
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,'_blank');
}

async function viewPartyLedger(name){
  try{
    const x=await api('/party-ledger/'+encodeURIComponent(name));
    const party=getPartyDetails(name);
    const rows=x.lines.map(l=>[
      l.date,l.type,l.reference,l.debit||'',l.credit||'',l.balance,l.notes||''
    ]);
    const content=`<div class="ledger-print">
      <h1>${esc(name)}</h1>
      <div>${esc(party.address||'')}</div>
      <div>GST NO.: ${esc(party.gst_no||'-')}</div>
      <h2>Meera Logistics — Party Ledger</h2>
      <div class="cards">${metric('Total Billing',x.invoices.reduce((a,v)=>a+Number(v.total||0),0))}${metric('Received',x.payments.reduce((a,v)=>a+Number(v.amount||0),0))}${metric('Outstanding',x.balance)}</div>
      ${table(['Date','Type','Invoice / Ref','Debit','Credit','Balance','Notes'],rows.map(r=>[
        esc(r[0]),statusBadge(r[1]),esc(r[2]),r[3]?money(r[3]):'-',r[4]?money(r[4]):'-',`<b>${money(r[5])}</b>`,esc(r[6])
      ]),'950px')}
    </div>`;
    modal(`Party Ledger · ${name}`,`
      <div class="toolbar no-print">
        <button class="btn primary" id="partyPdf">PDF / Print</button>
        <button class="btn green" id="partyExcel">Excel</button>
        <button class="btn soft" id="partyWhatsApp">WhatsApp</button>
      </div>${content}
    `,{onMount:host=>{
      host.querySelector('#partyPdf').onclick=()=>openLedgerPrint(`${name} PARTY LEDGER`,content);
      host.querySelector('#partyExcel').onclick=()=>downloadTextFile(
        `${safeFileName(name)} PARTY LEDGER.xls`,
        ledgerExcelHtml(`${name} PARTY LEDGER`,['Date','Type','Reference','Debit','Credit','Balance','Notes'],rows),
        'application/vnd.ms-excel'
      );
      host.querySelector('#partyWhatsApp').onclick=()=>manualWhatsApp(`MEERA LOGISTICS\nPARTY LEDGER\n${name}\nOutstanding: ${money(x.balance)}\nPDF/Excel can be attached manually.`);
    }});
  }catch(e){alert(e.message)}
}

async function viewSupplierLedger(name){
  try{
    const x=await api('/supplier-ledger/'+encodeURIComponent(name));
    const summary=state.data.supplierLedger.find(s=>s.owner_name===name)||{};
    const ledgerTitle=`${summary.ledger_no||'PML'} ${name} SUPPLIER LEDGER`;
    const rows=x.lines.map(l=>[l.date,l.type,l.reference,l.debit||'',l.credit||'',l.balance,l.notes||'']);
    const content=`<div class="ledger-print">
      <h1>${esc(summary.ledger_no||'')} ${esc(name)}</h1>
      <h2>Meera Logistics — Supplier Ledger</h2>
      <div class="cards">${metric('Payable',x.entries.reduce((a,v)=>a+Number(v.payable||0),0))}${metric('Paid',x.payments.reduce((a,v)=>a+Number(v.amount||0),0))}${metric('Pending',x.balance)}</div>
      ${table(['Date','Type','Trip / Reference','Debit','Credit','Balance','Notes'],rows.map(r=>[
        esc(r[0]),statusBadge(r[1]),esc(r[2]),r[3]?money(r[3]):'-',r[4]?money(r[4]):'-',`<b>${money(r[5])}</b>`,esc(r[6])
      ]),'950px')}
    </div>`;
    modal(`Supplier Ledger · ${summary.ledger_no||''} ${name}`,`
      <div class="toolbar no-print">
        <button class="btn primary" id="supplierPdf">PDF / Print</button>
        <button class="btn green" id="supplierExcel">Excel</button>
        <button class="btn soft" id="supplierWhatsApp">WhatsApp</button>
      </div>${content}
    `,{onMount:host=>{
      host.querySelector('#supplierPdf').onclick=()=>openLedgerPrint(ledgerTitle,content);
      host.querySelector('#supplierExcel').onclick=()=>downloadTextFile(
        `${safeFileName(ledgerTitle)}.xls`,
        ledgerExcelHtml(ledgerTitle,['Date','Type','Reference','Debit','Credit','Balance','Notes'],rows),
        'application/vnd.ms-excel'
      );
      host.querySelector('#supplierWhatsApp').onclick=()=>manualWhatsApp(`MEERA LOGISTICS\nSUPPLIER LEDGER\n${summary.ledger_no||''} ${name}\nAmount Due: ${money(x.balance)}\nPDF/Excel can be attached manually.`);
    }});
  }catch(e){alert(e.message)}
}

function invoiceTemplate(i){return invoicePrintHtml(i)}
function viewInvoice(i){
  if(!i)return;
  const host=modal(`Invoice ${i.invoice_no}`,`${invoiceTemplate(i)}<div class="form-actions no-print"><button class="btn light" id="editInvoiceFromView">Edit Invoice</button><button class="btn primary" id="downloadInvoiceFromView">Download</button></div>`,{onMount:host=>{host.querySelector('.modal').classList.add('invoice-modal');host.querySelector('#editInvoiceFromView').onclick=()=>{host.remove();invoiceForm(i)};host.querySelector('#downloadInvoiceFromView').onclick=()=>downloadInvoicePdf(i)}});
}
function downloadInvoicePdf(i){
  if(!i)return;
  const win=window.open('','_blank','width=1280,height=900');
  if(!win){alert('Please allow pop-ups to download invoice PDF.');return}
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(i.invoice_no)}</title><link rel="stylesheet" href="${location.origin}/src/styles.css"></head><body class="invoice-download-body">${invoiceTemplate(i)}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);win.document.close();
}

function downloadInvoice(i){
  if(!i)return;
  const w=window.open('','_blank');
  w.document.write(`<!doctype html><html><head><title>${esc(i.invoice_no)}</title><link rel="stylesheet" href="/src/styles.css?v=20"></head><body class="invoice-download-body">${invoicePrintHtml(i)}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  w.document.close();
}
function invoicePrintHtml(i){
  return `<div class="print-sheet"><div class="invoice-header"><div class="invoice-company"><h1>MEERA LOGISTICS</h1><div>Transport & Logistics Services</div><div>Jamnagar, Gujarat</div></div><div class="invoice-meta"><b>${invoiceTypeLabel(i)==='NON-GST'?'NON-GST INVOICE':'TAX INVOICE'}</b><div>${esc(i.invoice_no)}</div><div>${esc(i.invoice_date)}</div></div></div>
  <div class="invoice-party"><div><b>Bill To</b><div>${esc(i.party_name)}</div><div>${esc(i.party_address||'')}</div><div>${invoiceTypeLabel(i)==='NON-GST'?'GST: Not Applicable':`GST: ${esc(i.party_gst||'-')}`}</div></div><div><b>Material:</b> ${esc(i.material||'-')}<br><b>Loading Date:</b> ${esc(i.loading_date||'-')}</div></div>
  ${table(['Trip','LR No','Truck No','Description','Loading Wt.','Unloading Wt.','Difference','Billing Wt.','Rate','Amount'],(i.items||[]).map(x=>{
    const trip=state.data?.trips?.find(t=>String(t.id)===String(x.trip_id));
    return [esc(trip?.trip_no||'-'),esc(x.lr_number||'-'),esc(x.truck_no),esc(x.description),number3(x.loading_weight??x.weight),number3(x.unloading_weight??x.weight),number3(x.shortage||0),number3(x.weight),money(x.rate),money(x.amount)];
  }),'1050px')}
  <div class="invoice-total"><div><span>Subtotal</span><b>${money(i.subtotal)}</b></div><div><span>Diesel</span><b>${money(i.diesel)}</b></div><div><span>Munshi</span><b>${money(i.munshi)}</b></div><div><span>SGST ${i.sgst}%</span><b>${money(i.subtotal*i.sgst/100)}</b></div><div><span>CGST ${i.cgst}%</span><b>${money(i.subtotal*i.cgst/100)}</b></div><div class="grand"><span>Total</span><span>${money(i.total)}</span></div></div><p style="white-space:pre-line">${esc(i.comments||'')}</p></div>`;
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

if(token()){
  const cached=readCache();
  if(cached?.data){state.data=cached.data;render();loadData({background:true})}
  else loadData();
}else loginView();
