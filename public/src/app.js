
import {api,apiBlob,token,setToken,clearToken} from './core/api.js';
import {renderV69Panel} from './fleet-v69.js?v=703';

const app=document.getElementById('app');
let state={panel:'dashboard',data:null,search:'',loading:false,activeTrip:null};
const panelTrail=[];
const validPanels=new Set(['dashboard','khata','trips','invoices','parties','partyPayments','suppliers','truckEntries','supplierPayments','trucks','drivers','myTrucks','truckExpenses','invoiceImport','masters','forms','expenses','reports']);
const CACHE_KEY='ml_bootstrap_cache_v6';
const readCache=()=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{return null}};
const writeCache=data=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch{}};
const clearCache=()=>{try{localStorage.removeItem(CACHE_KEY)}catch{}};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const tenantCompanyName=(data=state.data)=>String(data?.saas?.company?.company_name||'TRANSPORT COMPANY').trim()||'TRANSPORT COMPANY';
const today=()=>new Date().toISOString().slice(0,10);

function parseInvoiceNumber(value){
  const text=String(value||'').trim().normalize('NFKC');
  const m=text.match(/^(.*?)(\d+)\s*$/);
  const rawPrefix=m?m[1]:text;
  const series=rawPrefix.toUpperCase().replace(/[^A-Z0-9]+/g,'');
  return m
    ?{series,number:Number(m[2]),width:m[2].length,raw:text.toUpperCase(),hasNumber:true}
    :{series,number:-1,width:0,raw:text.toUpperCase(),hasNumber:false};
}
function sortNumberedRows(items,field,desc=true,dateField=''){
  return [...items].sort((a,b)=>{
    const A=parseInvoiceNumber(a[field]),B=parseInvoiceNumber(b[field]);
    if(A.hasNumber!==B.hasNumber)return A.hasNumber?-1:1;
    const seriesOrder=A.series.localeCompare(B.series,undefined,{numeric:true,sensitivity:'base'});
    if(seriesOrder)return seriesOrder;
    if(A.number!==B.number)return desc?B.number-A.number:A.number-B.number;
    const rawOrder=A.raw.localeCompare(B.raw,undefined,{numeric:true,sensitivity:'base'});
    if(rawOrder)return rawOrder;
    if(dateField){
      const dateOrder=String(a[dateField]||'').localeCompare(String(b[dateField]||''));
      if(dateOrder)return desc?-dateOrder:dateOrder;
    }
    const createdOrder=String(a.created_at||'').localeCompare(String(b.created_at||''));
    if(createdOrder)return desc?-createdOrder:createdOrder;
    return String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true});
  });
}
function sortInvoicesSeries(items,desc=true){return sortNumberedRows(items,'invoice_no',desc,'invoice_date')}
function invoiceTypeLabel(i){const type=i.invoice_type||'GST';return type==='NON_GST'?'NON-GST':type==='IGST'?'IGST':'GST'}
function invoiceStatus(total,received){
  const t=Number(total||0),r=Number(received||0);
  if(r<=0)return 'PENDING';
  if(r+1>=t)return 'PAID';
  return 'PARTIAL';
}
function invoiceReceivedAmount(invoice){
  if(invoice&&invoice.received_amount!==undefined&&invoice.received_amount!==null)return Number(invoice.received_amount||0);
  const linked=state.data.partyPayments.filter(p=>
    (p.invoice_id&&String(p.invoice_id)===String(invoice.id)) ||
    (p.trip_id&&(invoice.items||[]).some(i=>String(i.trip_id||'')===String(p.trip_id)))
  );
  return linked.reduce((a,x)=>a+Number(x.amount||0),0);
}
function invoicePendingAmount(invoice){
  if(invoice&&invoice.pending_amount!==undefined&&invoice.pending_amount!==null)return Math.max(0,Number(invoice.pending_amount||0));
  const pending=Math.max(0,Number(invoice?.total||0)-invoiceReceivedAmount(invoice));
  return pending<=1?0:pending;
}

const invoiceDate=s=>{if(!s)return '';const p=String(s).split('-');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:s};
const number3=n=>Number(n||0).toFixed(3);
const norm=s=>String(s||'').trim().toUpperCase();
const accountKey=s=>norm(s).replace(/[^A-Z0-9]/g,'');
const download=(name,text,type='application/json')=>{const blob=new Blob([text],{type});if(window.TransportNative?.saveBlob){window.TransportNative.saveBlob(blob,name).catch(error=>alert(error.message||'Unable to save file.'));return}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)};
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

function searchableMasterField(label,name,items,value='',listId='',masterType='',opts='',cls=''){
  const cleanItems=[...new Set([value,...items].filter(Boolean).map(norm))];
  const addText=masterType==='truck'?'+ New Truck':`+ New ${label}`;
  return `<label class="field ${cls}"><span>${label}</span><div class="v667-search-master">
    <input name="${name}" value="${esc(value)}" list="${esc(listId)}" data-searchable-master="${esc(masterType)}" placeholder="Search ${esc(label)}..." autocomplete="off" ${opts}>
    <datalist id="${esc(listId)}">${cleanItems.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>
    <button type="button" class="mini v667-search-master-add" data-searchable-master-add="${esc(masterType)}">${esc(addText)}</button>
  </div></label>`;
}

function searchableMasterValueIsValid(input){
  const value=norm(input?.value);
  if(!value)return !input?.required;
  const options=[...(input?.list?.options||[])];
  return options.some(option=>norm(option.value)===value);
}

function validateSearchableMaster(input){
  if(!input)return true;
  const valid=searchableMasterValueIsValid(input);
  input.setCustomValidity(valid?'':`Select ${input.name==='truckNo'?'a Truck Number':'a value'} from the list or use New Add.`);
  return valid;
}

function wireSearchableMasterFields(host){
  host.querySelectorAll('input[data-searchable-master]').forEach(input=>{
    if(input.dataset.searchableMasterWired==='1')return;
    input.dataset.searchableMasterWired='1';
    input.addEventListener('input',()=>input.setCustomValidity(''));
    input.addEventListener('change',()=>validateSearchableMaster(input));
    input.addEventListener('blur',()=>validateSearchableMaster(input));
  });
  host.querySelectorAll('[data-searchable-master-add]').forEach(button=>{
    if(button.dataset.searchableMasterWired==='1')return;
    button.dataset.searchableMasterWired='1';
    button.addEventListener('click',async()=>{
      const input=button.parentElement?.querySelector('input[data-searchable-master]');
      if(!input)return;
      input.setCustomValidity('');
      await quickAddMaster(button.dataset.searchableMasterAdd,input,host);
    });
  });
}

function masterSelectField(label,name,items,value='',masterType='',opts='',cls=''){
  const cleanItems=[...new Set([value,...items].filter(Boolean))];
  const addText=masterType==='truck'?'＋ New Truck Add':masterType==='supplier'?'＋ New Supplier Add':`＋ Add New ${label}`;
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}" data-master-type="${masterType}" ${opts}>
    <option value="">Select ${esc(label)}</option>
    ${selectOptions(cleanItems,value)}
    <option value="__ADD_NEW__">${esc(addText)}</option>
  </select></label>`;
}
function supplierMasterNames(d=state.data){
  return [...new Set([
    ...(d?.supplierLedger||[]).map(x=>x.owner_name),
    ...(d?.trucks||[]).map(x=>x.owner_name),
    ...(d?.truckEntries||[]).map(x=>x.owner_name),
    ...(d?.supplierPayments||[]).map(x=>x.owner_name),
    ...(d?.trips||[]).map(x=>x.supplier_name)
  ].filter(Boolean).map(norm))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function supplierSelectField(label,name,value='',opts='',cls=''){
  return masterSelectField(label,name,supplierMasterNames(),value,'supplier',opts,cls);
}
function newValueSelectField(label,name,items,value='',addLabel='＋ Add New',opts='',cls=''){
  const cleanItems=[...new Set([value,...items].filter(Boolean))];
  return `<label class="field ${cls}"><span>${label}</span><select name="${name}" data-new-value-label="${esc(label)}" data-new-value-add="${esc(addLabel)}" ${opts}>
    <option value="">Select ${esc(label)}</option>
    ${selectOptions(cleanItems,value)}
    <option value="__ADD_VALUE__">${esc(addLabel)}</option>
  </select></label>`;
}
function wireNewValueSelects(host){
  host.querySelectorAll('select[data-new-value-label]').forEach(select=>{
    select.addEventListener('change',()=>{
      if(select.value!=='__ADD_VALUE__')return;
      const label=select.dataset.newValueLabel||'Value';
      const value=prompt(`Enter new ${label}`,'');
      if(!value){select.value='';return}
      addOptionAndSelect(select,value);
    });
  });
}
function addOptionAndSelect(select,value){
  const cleanValue=norm(value);
  if(!cleanValue)return;
  if(select instanceof HTMLInputElement){
    const list=select.list;
    if(list&&![...list.options].some(option=>norm(option.value)===cleanValue)){
      const option=document.createElement('option');
      option.value=cleanValue;
      list.appendChild(option);
    }
    select.value=cleanValue;
    select.setCustomValidity('');
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return;
  }
  let option=[...select.options].find(o=>norm(o.value)===cleanValue);
  if(!option){
    option=document.createElement('option');
    option.value=cleanValue;option.textContent=cleanValue;
    select.insertBefore(option,select.querySelector('option[value="__ADD_NEW__"],option[value="__ADD_VALUE__"]'));
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
window.ML_WIRE_MASTER_SELECTS=wireMasterSelects;
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
    let activeTruckId='';
    const h=modal('Add New Truck',`<form class="form-grid" id="quickTruckForm">
      ${newValueSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),'','＋ New Truck Add','required')}
      ${supplierSelectField('Owner Name','ownerName','','required')}
      ${field('Owner Mobile','ownerMobile','','tel')}
      ${textarea('Bank Details','bankDetails','','span2')}
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary" data-save-truck>Add Truck</button></div>
    </form>`,{small:true,onMount:h=>{
      wireNewValueSelects(h);wireMasterSelects(h);
      const truckSelect=h.querySelector('[name=truckNo]'),ownerSelect=h.querySelector('[name=ownerName]'),save=h.querySelector('[data-save-truck]');
      const preferredSupplier=norm(parentHost?.dataset?.preferredSupplier||'');
      if(preferredSupplier)addOptionAndSelect(ownerSelect,preferredSupplier);
      const loadExisting=()=>{
        const t=d.trucks.find(x=>norm(x.truck_no)===norm(truckSelect.value));
        activeTruckId=t?.id||'';
        if(t){
          if(t.owner_name)addOptionAndSelect(ownerSelect,t.owner_name);
          h.querySelector('[name=ownerMobile]').value=t.owner_mobile||'';
          h.querySelector('[name=bankDetails]').value=t.bank_details||'';
          save.textContent='Update Truck';
        }else save.textContent='Add Truck';
      };
      truckSelect.addEventListener('change',loadExisting);
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickTruckForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        if(!body.truckNo||body.truckNo==='__ADD_VALUE__')return alert('Truck Number required.');
        if(!body.ownerName||body.ownerName==='__ADD_NEW__')return alert('Owner / Supplier required.');
        try{
          setBusy(btn,true);
          const path=activeTruckId?`/trucks/${activeTruckId}`:'/trucks';
          const res=await api(path,{method:activeTruckId?'PUT':'POST',body:JSON.stringify(body)});
          const item={id:activeTruckId||res.id,truck_no:norm(body.truckNo),owner_name:norm(body.ownerName),owner_mobile:body.ownerMobile||'',bank_details:body.bankDetails||''};
          const ix=d.trucks.findIndex(x=>String(x.id)===String(item.id));if(ix>=0)d.trucks[ix]=item;else d.trucks.push(item);
          addOptionAndSelect(target,item.truck_no);
          const owner=parentHost.querySelector('[name=ownerName], [name=supplierName]'),bank=parentHost.querySelector('[name=bankDetails]');
          if(owner)addOptionAndSelect(owner,item.owner_name);if(bank)bank.value=item.bank_details;
          h.remove();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});return;
  }
  if(type==='supplier'){
    const h=modal('Add New Supplier',`<form class="form-grid" id="quickSupplierForm">
      ${field('Supplier / Truck Malik Name','supplierName','','text','required')}
      <div class="span2 notice">Supplier save thaya pachhi aa naam badha Supplier dropdown ma available thashe. Truck pachi pan link kari shako.</div>
      <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Add Supplier</button></div>
    </form>`,{small:true,onMount:h=>{
      h.querySelector('[data-cancel]').onclick=()=>h.remove();
      h.querySelector('#quickSupplierForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        try{
          setBusy(btn,true);const res=await api('/suppliers',{method:'POST',body:JSON.stringify(body)});
          const name=norm(body.supplierName);
          if(!d.supplierLedger.some(x=>norm(x.owner_name)===name))d.supplierLedger.push({id:res.id||'',ledger_no:res.ledgerNo||'',owner_name:name,payable:0,paid:0,pending:0,entries:0,payments:0,pm_bills:0,truck_count:0});
          addOptionAndSelect(target,name);h.remove();
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
      const routeForm=h.querySelector('#quickRouteForm');
      routeForm.onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target),btn=e.submitter;
        if(routeForm.dataset.saving==='1')return;
        routeForm.dataset.saving='1';
        try{setBusy(btn,true);const res=await api('/routes',{method:'POST',body:JSON.stringify(body)});
          const item={id:res.id,loading_point:norm(body.loadingPoint),unloading_point:norm(body.unloadingPoint)};
          const existingIndex=d.routes.findIndex(route=>norm(route.loading_point)===item.loading_point&&norm(route.unloading_point)===item.unloading_point);
          if(existingIndex>=0)d.routes[existingIndex]={...d.routes[existingIndex],...item};else d.routes.push(item);
          const loadingSelect=parentHost.querySelector('[name=loadingPoint]'),unloadingSelect=parentHost.querySelector('[name=unloadingPoint]');
          if(loadingSelect)addOptionAndSelect(loadingSelect,item.loading_point);
          if(unloadingSelect)addOptionAndSelect(unloadingSelect,item.unloading_point);
          addOptionAndSelect(target,type==='route-loading'?item.loading_point:item.unloading_point);
          if(res.existing)toast(res.message||'Route already exists and is selected.');
          h.remove();
        }catch(err){alert(err.message)}finally{delete routeForm.dataset.saving;setBusy(btn,false)}
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
  const partyAccountKey=accountKey(partyName);
  const master=state.data.parties.find(p=>accountKey(p.party_name)===partyAccountKey)||{};
  const invoice=[...state.data.invoices]
    .filter(i=>accountKey(i.party_name)===partyAccountKey)
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
async function syncMobileNotificationsV181({prompt=true}={}){
  const alerts=window.TransportNative?.notifications,authToken=token();
  if(!alerts||!authToken)return {enabled:false};
  try{return prompt?await alerts.enable(authToken):await alerts.sync(authToken)}
  catch(error){console.warn('Mobile notification sync unavailable',error);return {enabled:false,error:error?.message||String(error)}}
}
function loginView(message=''){
  state.panel='dashboard';
  state.search='';
  panelTrail.length=0;
  document.title='TransportBahi – Trip, Bill & Khata';
  app.innerHTML=`<div class="login-shell">
    <div class="login-art"><h1>Trip થી<br>Profit સુધી.</h1><p>Trips, invoices, party khata, supplier khata, payments, documents અને profit — બધું TransportBahiમાં.</p>
      <div class="v59-login-points"><span>✓ 14-day Free Trial</span><span>✓ Your company data stays isolated</span><span>✓ No card required for trial</span></div>
    </div>
    <div class="login-side">
      <form class="login-card" id="loginForm">
        <div class="v184-login-brand" aria-label="TransportBahi">
          <img src="/assets/transportbahi-app-icon.png" alt="">
          <div class="v184-login-brand-copy"><b>Transport<em>Bahi</em></b><small>Trip થી Profit સુધી</small></div>
        </div>
        ${message?`<div class="error-box">${esc(message)}</div>`:''}
        <label class="field"><span>Username</span><input name="username" autocomplete="username" required></label>
        <label class="field" style="margin-top:12px"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary full" style="margin-top:18px">Login</button>
        <div class="v59-login-divider"><span>OR</span></div>
        <button class="btn soft full" type="button" data-v59-create-company>Create Transport Company · 14 Day Trial</button>
      </form>
    </div>
  </div>`;
  document.getElementById('loginForm').onsubmit=async e=>{
    e.preventDefault();const btn=e.submitter;
    if(btn?.type==='button')return;
    setBusy(btn,true,'Logging in...');
    try{const res=await api('/login',{method:'POST',body:JSON.stringify(formDataObject(e.target))});setToken(res.token);await loadData({background:true});await syncMobileNotificationsV181()}
    catch(err){loginView(err.message)}
  };
  document.querySelector('[data-v59-create-company]').onclick=openCompanyRegistration;
}
async function loadData({background=false}={}){
  state.loading=true;
  if(!state.data){
    const cached=readCache();
    if(cached?.data){
      state.data=cached.data;
      render();
    }else{
      app.innerHTML='<div class="loading"><div><b>Opening TransportBahi…</b><br><small>Connecting to online database</small></div></div>';
    }
  }
  try{
    const fresh=await api('/bootstrap');
    state.data=fresh;writeCache(fresh);render();
  }catch(e){
    if(state.data){
      if(!background)alert(e.message);
    }else{
      await window.TransportNative?.notifications?.disable?.().catch(()=>{});clearToken();clearCache();loginView(e.message);
    }
  }finally{state.loading=false}
}
function navButton(id,label){return `<button class="${state.panel===id?'active':''}" data-panel="${id}"><span class="dot"></span>${label}</button>`}

function navigatePanel(panel,{search=''}={}){
  const target=validPanels.has(panel)?panel:'dashboard';
  if(target===state.panel){
    document.getElementById('sidebar')?.classList.remove('open');
    return false;
  }
  if(target==='dashboard')panelTrail.length=0;
  else{
    const previous=validPanels.has(state.panel)?state.panel:'dashboard';
    if(panelTrail.at(-1)!==previous)panelTrail.push(previous);
    if(panelTrail.length>30)panelTrail.shift();
  }
  state.panel=target;
  state.search=search;
  render();
  document.getElementById('sidebar')?.classList.remove('open');
  return true;
}

function appGoBack(){
  const sidebar=document.getElementById('sidebar');
  if(sidebar?.classList.contains('open')){
    sidebar.classList.remove('open');
    return true;
  }
  if(state.panel==='dashboard')return false;
  const previous=panelTrail.pop();
  state.panel=validPanels.has(previous)&&previous!==state.panel?previous:'dashboard';
  state.search='';
  render();
  return true;
}
window.TransportERPBack=appGoBack;

function openCompanyRegistration(){
  document.querySelector('.v59-register-bg')?.remove();
  const host=document.createElement('div');host.className='modal-bg v59-register-bg';
  host.innerHTML=`<div class="modal v59-register-modal">
    <header><div><b>Create Transport Company</b><small>14-day free trial · No card required</small></div><button type="button" data-v59-close>✕</button></header>
    <form id="v59RegisterForm" class="form-grid">
      <div class="v59-register-section span2"><b>1 · Company Details</b><small>Your company gets its own isolated workspace.</small></div>
      ${field('Company Name','companyName','','text','required')}
      ${field('Owner Name','fullName','','text','required')}
      ${field('Mobile','mobile','','tel','required')}
      ${field('Email','email','','email')}
      ${field('GST Number (optional)','gstNo','')}
      ${field('PAN Number (optional)','panNo','')}
      ${textarea('Company Address','address','','span2')}
      <div class="v59-register-section span2"><b>2 · Secure Login</b><small>This becomes the OWNER account.</small></div>
      ${field('Login Username','username','','text','required autocomplete="username"')}
      ${field('Password','password','','password','minlength="6" required autocomplete="new-password"')}
      <label class="span2 v59-consent"><input type="checkbox" required> <span>I understand the trial is limited by plan usage and becomes read-only after expiry until subscription is renewed.</span></label>
      <div class="span2 v59-trial-summary"><b>Free Trial includes</b><span>1 User · 50 Trips/month · 25 Invoices/month · Ledgers · Reports · Documents · Excel</span></div>
    </form>
    <div class="form-actions v59-register-actions"><button type="button" class="btn light" data-v59-close2>Cancel</button><button type="submit" form="v59RegisterForm" class="btn primary">Confirm & Save</button></div>
  </div>`;
  document.body.appendChild(host);
  host.querySelector('[data-v59-close]').onclick=()=>host.remove();
  host.querySelector('[data-v59-close2]').onclick=()=>host.remove();
  host.querySelector('#v59RegisterForm').onsubmit=async e=>{
    e.preventDefault();const button=e.submitter;setBusy(button,true,'Creating company...');
    try{
      const result=await api('/register-company',{method:'POST',auth:false,body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});
      setToken(result.token);
      host.remove();
      clearCache();
      await loadData({background:true});
      await syncMobileNotificationsV181();
      alert(`Welcome! Your 14-day trial is active until ${result.trialEndsAt}.`);
    }catch(error){alert(error.message||'Unable to create company')}
    finally{setBusy(button,false,'Confirm & Save')}
  };
}

function subscriptionBannerV59(d){
  const s=d.saas||{},sub=s.subscription||{},u=s.usage||{},days=s.daysRemaining;
  if(sub.status==='GRANDFATHERED')return '';
  const expired=!!s.readOnly;
  const trial=sub.status==='TRIAL';
  const warning=trial&&Number(days)<=3;
  const cls=expired?'expired':warning?'warning':'trial';
  const main=expired?'Subscription expired — Read Only Mode':trial?`${days??0} day(s) left in Free Trial`:`${sub.plan_name||sub.plan_id||'Plan'} · ${sub.status||''}`;
  const usage=`${u.trips||0}/${sub.max_trips_month||0} Trips · ${u.invoices||0}/${sub.max_invoices_month||0} Invoices · ${u.users||0}/${sub.max_users||0} Users`;
  return `<div class="v59-sub-banner ${cls}"><div><b>${esc(main)}</b><span>${esc(usage)}</span></div><button type="button" class="btn ${expired?'primary':'soft'}" data-v59-open-plan>View Plan</button></div>`;
}
function v64TodayText(){
  return new Date().toLocaleDateString(window.TransportLanguage?.dateLocale?.()||'en-IN',{weekday:'long',day:'numeric',month:'short'});
}
function v64TodayTrips(d){
  const day=today();
  return (d.trips||[]).filter(t=>String(t.trip_date||'').slice(0,10)===day);
}
function v64TripAmount(t){
  return Number(t.weight||0)*Number(t.rate||0);
}
let _supplierTripAllocCache={data:null,map:null};
function supplierTripBasePayable(d,t){
  const entries=(d.truckEntries||[]).filter(e=>
    String(e.trip_id||'')===String(t.id) ||
    (!e.trip_id && norm(e.truck_no)===norm(t.truck_no) && String(e.entry_date||'')===String(t.trip_date||''))
  );
  return entries.reduce((sum,e)=>sum+Number(e.payable||0),0);
}
function supplierTripPaymentAllocations(d){
  if(_supplierTripAllocCache.data===d&&_supplierTripAllocCache.map)return _supplierTripAllocCache.map;

  const rows=(d.trips||[]).map(t=>({
    id:String(t.id),
    trip:t,
    owner:norm(tripSupplierName(t)),
    truck:norm(t.truck_no),
    date:String(t.trip_date||''),
    created:String(t.created_at||''),
    payable:Math.max(0,supplierTripBasePayable(d,t)),
    paid:0
  }));

  const byId=new Map(rows.map(r=>[r.id,r]));

  // Exact Trip-linked payments always belong to that Trip first.
  for(const p of (d.supplierPayments||[])){
    const tripId=String(p.trip_id||'');
    if(!tripId)continue;
    const row=byId.get(tripId);
    if(row)row.paid+=Math.max(0,Number(p.amount||0));
  }

  // Older supplier payments without Trip ID are allocated FIFO to the
  // matching Supplier / Truck pending Trips. This also keeps legacy entries correct.
  const loose=(d.supplierPayments||[])
    .filter(p=>!String(p.trip_id||''))
    .slice()
    .sort((a,b)=>{
      const da=String(a.payment_date||''),db=String(b.payment_date||'');
      if(da!==db)return da.localeCompare(db);
      return String(a.created_at||'').localeCompare(String(b.created_at||''));
    });

  for(const p of loose){
    const owner=norm(p.owner_name),truck=norm(p.truck_no);
    let remaining=Math.max(0,Number(p.amount||0));
    if(remaining<=0)continue;

    const candidates=rows
      .filter(r=>r.owner===owner&&(!truck||r.truck===truck)&&r.payable>0)
      .sort((a,b)=>{
        if(a.date!==b.date)return a.date.localeCompare(b.date);
        if(a.created!==b.created)return a.created.localeCompare(b.created);
        return a.id.localeCompare(b.id,undefined,{numeric:true});
      });

    for(const row of candidates){
      if(remaining<=0.01)break;
      const pending=Math.max(0,row.payable-row.paid);
      if(pending<=0.01)continue;
      const applied=Math.min(pending,remaining);
      row.paid+=applied;
      remaining-=applied;
    }
  }

  const map={};
  for(const row of rows){
    map[row.id]={
      payable:row.payable,
      paid:Math.max(0,row.paid),
      pending:Math.max(0,row.payable-row.paid)
    };
  }
  _supplierTripAllocCache={data:d,map};
  return map;
}
function supplierTripPaidAmount(d,t){
  return Number(supplierTripPaymentAllocations(d)[String(t.id)]?.paid||0);
}
function v64TripPaymentState(d,t){
  const x=supplierTripPaymentAllocations(d)[String(t.id)]||{payable:0,paid:0,pending:0};
  if(Number(x.payable||0)<=0.01)return {label:'PENDING',paid:false,pending:Number(x.pending||0)};
  return Number(x.pending||0)<=0.01
    ?{label:'PAID',paid:true,pending:0}
    :{label:'PENDING',paid:false,pending:Number(x.pending||0)};
}
function v64MobileHeader(d,title){
  const company=esc(tenantCompanyName(d));
  const todayTrips=v64TodayTrips(d);
  const todayFreight=todayTrips.reduce((a,t)=>a+v64TripAmount(t),0);
  const isHome=state.panel==='dashboard';
  return `<header class="v64-mobile-header no-print">
    <div class="v64-brand-row">
      <div class="v64-mobile-brand v704-mobile-brand">
        <img class="v704-mobile-icon" src="/assets/transportbahi-app-icon.png" alt="">
        <div class="v704-mobile-brand-copy"><b>Transport<em>Bahi</em></b><small class="v184-tenant-name" title="${company}">${company}</small></div>
      </div>
      <div class="v683-header-actions"><button type="button" class="v683-language-button v683-mobile-language" data-language-open data-language-label aria-label="Choose App Language">${window.TransportLanguage?.buttonLabel?.()||'🌐 EN'}</button><button type="button" class="v64-bell" data-v64-alerts aria-label="Alerts">🔔<span></span></button></div>
    </div>
    <div class="v64-date-line ${isHome?'':'has-back'}">
      ${isHome?'':`<button type="button" class="v682-back" data-nav-back aria-label="Go back"><span aria-hidden="true">←</span> Back</button>`}
      <span class="v682-date-title">${esc(v64TodayText())} · ${esc(title||'Dashboard')} <small class="v709-build-badge">v1.8.4</small></span>
      <span class="v68-network-status" data-v68-network>● Online</span>
    </div>
    ${isHome?`<div class="v64-summary-strip">
      <div class="v64-sum-card"><small>Today Freight</small><b>${money(todayFreight)} <em>${todayTrips.length} Trips</em></b></div>
      <div class="v64-sum-card due"><small>Party Due</small><b>${money(d.summary.partyOutstanding)} <em>${d.partyLedger.filter(x=>Number(x.outstanding||0)>0).length} Parties</em></b></div>
    </div>`:''}
  </header>`;
}
function v64BottomNav(){
  const active=state.panel;
  const tab=(panel,icon,label,activePanels=[panel])=>`<button type="button" class="v64-tab ${activePanels.includes(active)?'active':''}" data-panel="${panel}"><i>${icon}</i><span>${label}</span></button>`;
  return `<nav class="v64-tabbar no-print">
    ${tab('dashboard','⌂','Home')}
    ${tab('trips','🚛','Trips',['trips','invoices'])}
    ${tab('khata','▤','Khata',['khata','parties','suppliers','drivers'])}
    <button type="button" class="v64-tab" id="v64MoreBtn"><i>☰</i><span>More</span></button>
  </nav>`;
}
function render(){
  const d=state.data;
  const rawCompanyName=tenantCompanyName(d);
  const companyName=esc(rawCompanyName);
  document.title=`${rawCompanyName} · TransportBahi`;
  // Share the already-loaded dashboard snapshot with lightweight app features.
  // Notifications can render from this immediately instead of blocking on a
  // second network request.
  window.ML_APP_DATA=d;
  window.ML_PLATFORM_ADMIN=!!d.user?.platform_admin;
  const titles={dashboard:'Dashboard',trips:'Trip History',invoices:'Invoice History',parties:'Party Khata',partyPayments:'Party Payments',suppliers:'Supplier Khata',truckEntries:'Truck / Supplier Entries',supplierPayments:'Supplier Payments',trucks:'Truck & Document',drivers:'Driver Khata',myTrucks:'My Trucks',truckExpenses:'Truck Expenses',invoiceImport:'Excel Invoice Import',masters:'Master',forms:'Forms',expenses:'Office Expenses',reports:'Reports & Audit',khata:'Khata'};
  app.innerHTML=`<div class="erp">
    <aside class="sidebar" id="sidebar">
      <div class="brand v706-sidebar-brand">
        <img class="v706-sidebar-icon" src="/assets/transportbahi-app-icon.png" alt="">
        <div class="v706-sidebar-copy"><b>Transport<em>Bahi</em></b><small class="v184-tenant-name" title="${companyName}">${companyName}</small></div>
      </div>
      <div class="nav-group-title">Dashboard</div><div class="nav">${navButton('dashboard','Dashboard')}${navButton('trips','Trip History')}${navButton('invoices','Invoice History')}</div>
      <div class="nav-group-title">Account</div><div class="nav">${navButton('parties','Party Khata')}${navButton('suppliers','Supplier Khata')}${navButton('drivers','Driver Khata')}</div>
      <div class="nav-group-title">Fleet & Office</div><div class="nav">${navButton('myTrucks','My Trucks')}${navButton('truckExpenses','Truck Expenses')}${navButton('trucks','Truck & Document')}${navButton('invoiceImport','Old Excel Invoice Import')}${navButton('masters','Master')}${navButton('forms','Forms')}${navButton('reports','Reports & Audit')}</div>
    </aside>
    <main class="main">
      ${v64MobileHeader(d,titles[state.panel])}
      ${subscriptionBannerV59(d)}
      <div class="topbar no-print"><div style="display:flex;gap:9px;align-items:center"><button class="btn light mobile-menu" id="menuBtn">☰</button>${state.panel==='dashboard'?'':`<button type="button" class="btn light v682-desktop-back" data-nav-back>← Back</button>`}<div class="top-title"><h1>${titles[state.panel]}</h1><p>Live online data · ${companyName} · ${esc(d.user.username)} (${esc(d.saas?.role||d.user.role||'')}) · ${esc(d.saas?.subscription?.plan_name||'')}</p></div></div>
      <div class="top-actions"><button type="button" class="v683-language-button" data-language-open data-language-label aria-label="Choose App Language">🌐 Language</button><button class="btn light" id="refreshBtn">Refresh</button><button class="btn soft" id="backupBtn">Backup</button><button class="btn light" id="logoutBtn">Logout</button></div></div>
      ${panelHtml()}
      ${v64BottomNav()}
    </main>
  </div>`;
  wireCommon();
  window.TransportLanguage?.apply?.();
}

document.addEventListener('ml-language-changed',()=>{
  if(state.data)render();
  else if(document.querySelector('.login-shell'))loginView();
});
document.addEventListener('ml-v69-data-changed',()=>loadData());
function wireCommon(){
  // One delegated click handler makes dashboard cards, table buttons and
  // dynamically-created controls reliable on desktop and mobile.
  app.onclick=async event=>{
    const backButton=event.target.closest('[data-nav-back]');
    if(backButton){
      event.preventDefault();
      appGoBack();
      return;
    }
    const panelButton=event.target.closest('[data-panel]');
    if(panelButton){
      event.preventDefault();
      navigatePanel(panelButton.dataset.panel);
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
  const moreBtn=document.getElementById('v64MoreBtn');
  if(moreBtn)moreBtn.onclick=()=>document.getElementById('sidebar')?.classList.toggle('open');
  const mobileBell=document.querySelector('[data-v64-alerts]');
  if(mobileBell)mobileBell.onclick=()=>document.dispatchEvent(new CustomEvent('ml-open-notifications-v64'));
  document.getElementById('refreshBtn').onclick=()=>loadData();
  const planBtn=document.querySelector('[data-v59-open-plan]');
  if(planBtn)planBtn.onclick=()=>{
    const side=document.querySelector('[data-v49-saas-side]');
    if(side)side.click();
    else document.dispatchEvent(new CustomEvent('ml-open-saas-v59'));
  };
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
    if(truck)return navigatePanel('trucks',{search:truck.truck_no.toLowerCase()});
    alert('No matching invoice, trip, party, supplier or truck found.');
  };
  document.getElementById('logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}try{await window.TransportNative?.notifications?.disable?.()}catch{}clearToken();clearCache();loginView()};
  document.getElementById('backupBtn').onclick=async()=>download(`meera-logistics-backup-${today()}.json`,JSON.stringify(await api('/export'),null,2));
  document.querySelectorAll('[data-search]').forEach((input,index)=>input.oninput=()=>{
    const typed=input.value;
    const start=input.selectionStart??typed.length;
    const end=input.selectionEnd??start;
    state.search=typed.toLowerCase();
    render();

    // render() rebuilds the panel. Restore focus/caret immediately so the user
    // can type the full search continuously (e.g. 5002) without clicking again.
    const searches=[...document.querySelectorAll('[data-search]')];
    const next=searches[index]||searches[0];
    if(next){
      try{next.focus({preventScroll:true})}catch{next.focus()}
      try{next.setSelectionRange(start,end)}catch{}
    }
  });
}
function filterRows(items,fields){
  if(!state.search)return items;
  return items.filter(x=>fields.some(k=>String(x[k]??'').toLowerCase().includes(state.search)));
}
function panelHtml(){
  const d=state.data;
  const v69Panel=renderV69Panel(state.panel,d);
  if(v69Panel)return v69Panel;
  if(state.panel==='dashboard')return dashboardPanel(d);
  if(state.panel==='khata')return khataPanelV64(d);
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
function v64TripCard(d,t,showActions=false){
  const pay=v64TripPaymentState(d,t),supplier=tripSupplierName(t);
  return `<article class="v64-bilty" data-action="view-trip" data-id="${esc(t.id)}">
    <div class="v64-bilty-top">
      <span class="v64-plate">${esc(t.truck_no||'-')}</span>
      <span class="v64-route" data-route-text>${esc(t.loading_point||'-')} <b>→</b> ${esc(t.unloading_point||'-')}</span>
      <span class="v64-stamp ${pay.paid?'paid':'pending'}">${pay.label}</span>
    </div>
    <div class="v64-perforation"></div>
    <div class="v64-bilty-bottom">
      <span><small>Party</small><b>${esc(t.party_name||'-')}</b><em>${supplier?`Supplier: ${esc(supplier)}`:''}</em></span>
      <strong>${money(v64TripAmount(t))}</strong>
    </div>
    ${showActions?`<div class="v705-trip-actions">
      <button type="button" data-action="edit-trip" data-id="${esc(t.id)}"><span aria-hidden="true">✎</span> Edit</button>
      <button type="button" class="danger" data-action="delete-trip" data-id="${esc(t.id)}"><span aria-hidden="true">⌫</span> Delete</button>
    </div>`:''}
  </article>`;
}

function v66DesktopTripCard(d,t){
  const pay=v64TripPaymentState(d,t);
  return `<article class="v66-trip-card" data-action="view-trip" data-id="${esc(t.id)}">
    <div class="v66-trip-card-top">
      <span class="v66-trip-plate">${esc(t.truck_no||'-')}</span>
      <span class="v66-trip-route" data-route-text>${esc(t.loading_point||'-')} <b>→</b> ${esc(t.unloading_point||'-')}</span>
      <span class="v66-trip-status ${pay.paid?'paid':'pending'}">${pay.label}</span>
    </div>
    <div class="v66-trip-cut"></div>
    <div class="v66-trip-card-bottom">
      <span><small>${esc(t.trip_no||'Trip')} · ${esc(t.trip_date||'')}</small><b>${esc(t.party_name||'-')}</b></span>
      <strong>${money(v64TripAmount(t))}</strong>
    </div>
  </article>`;
}
function dashboardPanel(d){
  const recent=[...(d.trips||[])].sort((a,b)=>String(b.trip_date||'').localeCompare(String(a.trip_date||''))).slice(0,5);
  const partyDue=[...(d.partyLedger||[])].filter(x=>Number(x.outstanding||0)>0).sort((a,b)=>Number(b.outstanding||0)-Number(a.outstanding||0)).slice(0,4);
  return `<section class="panel active">
    <div class="v64-mobile-dashboard">
      <div class="v64-quick-row">
        <button class="v64-quick" data-action="new-trip"><i>🚛</i><span>New Trip</span></button>
        <button class="v64-quick" data-action="new-invoice"><i>🧾</i><span>New Invoice</span></button>
        <button class="v64-quick" data-action="new-party-payment"><i>₹</i><span>Receive</span></button>
        <button class="v64-quick" data-action="new-supplier-payment"><i>↗</i><span>Pay Supplier</span></button>
      </div>

      <div class="v64-section-title"><h3>Recent Trips <span>· Bilty</span></h3><button data-panel="trips">View all ›</button></div>
      <div>${recent.length?recent.map(t=>v64TripCard(d,t)).join(''):'<div class="v64-empty">No trips yet.</div>'}</div>

      <div class="v64-section-title"><h3>Party Outstanding <span>· Khata</span></h3><button data-panel="parties">View all ›</button></div>
      <div class="v64-list">${partyDue.length?partyDue.map(p=>`<button class="v64-simple-row" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}">
        <span class="v64-avatar">${esc(String(p.party_name||'P').slice(0,2))}</span>
        <span class="v64-row-copy"><b>${esc(p.party_name)}</b><small>${p.invoices||0} invoices · ${p.payments||0} payments</small></span>
        <strong>${money(p.outstanding)}</strong>
      </button>`).join(''):'<div class="v64-empty">No party outstanding.</div>'}</div>
    </div>

    <div class="v64-desktop-dashboard">
      <div class="cards">${metric('Party Receivable',d.summary.partyOutstanding,'Outstanding from parties')}${metric('Supplier Payable',d.summary.supplierPending,'Pending to truck owners')}${metric('Total Billing',d.summary.totalBilling,`${d.summary.invoices} invoices`)}${metric('Party Received',d.summary.partyReceived,'Collection received')}${metric('Estimated Profit',d.summary.estimatedProfit,'Before income tax')}${metric('Total Trips',String(d.summary.trips),'All transport entries')}</div>
      <div class="quick-actions no-print">
        <button type="button" class="quick" data-action="new-trip"><b>+ New Trip</b><small>Create transport booking</small></button>
        <button type="button" class="quick" data-action="new-invoice"><b>+ New Invoice</b><small>Create GST invoice</small></button>
        <button type="button" class="quick" data-action="new-party-payment"><b>Receive Payment</b><small>Party collection entry</small></button>
        <button type="button" class="quick" data-action="new-supplier-payment"><b>Pay Supplier</b><small>Truck malik payment</small></button>
      </div>
      <div class="v66-dashboard-grid">
        <div class="card">
          <div class="section-title"><div><h2>Recent Trips <span class="v66-web-badge">BILTY VIEW</span></h2><small>Latest transport movements</small></div><button class="btn soft" data-panel="trips">View all</button></div>
          <div class="v66-trip-board">${[...(d.trips||[])].sort((a,b)=>String(b.trip_date||'').localeCompare(String(a.trip_date||''))).slice(0,6).map(t=>v66DesktopTripCard(d,t)).join('')||'<div class="notice">No trips.</div>'}</div>
        </div>
        <div class="card">
          <div class="section-title"><div><h2>Party Outstanding</h2><small>Highest pending accounts</small></div><button class="btn soft" data-panel="parties">Khata</button></div>
          <div class="v66-party-due">${[...(d.partyLedger||[])].sort((a,b)=>Number(b.outstanding||0)-Number(a.outstanding||0)).slice(0,7).map(p=>`<div class="ledger-row"><button style="all:unset;cursor:pointer;flex:1" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}"><b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b><small>${p.invoices||0} invoices · ${p.payments||0} payments</small></button><div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div></div>`).join('')||'<div class="notice">No outstanding.</div>'}</div>
        </div>
      </div>
    </div>
  </section>`;
}
function tripsPanel(d){
  const rows=filterRows(d.trips,['trip_no','invoice_no','trip_date','party_name','truck_no','material','loading_point','unloading_point','status'])
    .sort((a,b)=>Number(String(b.trip_no||'').replace(/\D/g,''))-Number(String(a.trip_no||'').replace(/\D/g,'')));
  return `<section class="panel active">
    <div class="v64-mobile-list-screen">
      <div class="v64-mobile-screen-head">
        <div><b>Trip History</b><small>${rows.length} transport trips</small></div>
        <button class="v64-round-add" data-action="new-trip">＋</button>
      </div>
      <label class="v64-search-wrap"><span>⌕</span><input class="search" data-search value="${esc(state.search)}" placeholder="Search trip, party, truck…"></label>
      <div class="v64-trip-list">${rows.length?rows.map(t=>v64TripCard(d,t,!!window.Capacitor?.isNativePlatform?.())).join(''):'<div class="v64-empty">No trips found.</div>'}</div>
    </div>
    <div class="v64-desktop-list">
      <div class="card"><div class="section-title"><div><h2>Trip History</h2><small>Trip booking, status and POD</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search trips…"><button class="btn primary" data-action="new-trip">New Trip</button></div></div>${table(['Trip No.','Invoice','Date','Party','Truck / Supplier','Route','Material','Weight × Rate','Status','POD','Action'],rows.map(t=>[
        `<button class="link-btn" data-action="view-trip" data-id="${esc(t.id)}"><b>${esc(t.trip_no||t.id)}</b></button>`,
        t.invoice_no?`<button class="link-btn" data-action="view-linked-invoice" data-id="${esc(t.invoice_id)}">${esc(t.invoice_no)}</button>`:'-',
        esc(t.trip_date),esc(t.party_name),`<b>${esc(t.truck_no)}</b><br><small><b>Supplier:</b> ${esc(tripSupplierName(t))}</small>${t.driver_name?`<br><small>Driver: ${esc(t.driver_name)}</small>`:''}`,`<span data-route-text>${esc(t.loading_point)} → ${esc(t.unloading_point)}</span>`,esc(t.material),`${esc(t.weight)} × ${money(t.rate)}`,statusBadge(t.status),t.pod_file_name?`<span class="badge info">${esc(t.pod_file_name)}</span>`:'-',`<div class="action-set"><button class="mini green" data-action="view-trip" data-id="${esc(t.id)}">Open Trip</button><button class="mini" data-action="edit-trip" data-id="${esc(t.id)}">Edit</button><button class="mini danger" data-action="delete-trip" data-id="${esc(t.id)}">Delete</button></div>`
      ]),'1250px')}</div>
    </div>
  </section>`;
}
function invoicesPanel(d){
  const rows=sortInvoicesSeries(filterRows(d.invoices,['invoice_no','invoice_date','party_name','lr_no','material']),true);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Invoice Desk</h2><small>GST invoices linked with trips</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search invoices…"><button class="btn primary" data-action="new-invoice">New Invoice</button><button class="btn light" data-action="export-invoices">Excel CSV</button></div></div>${table(['Invoice','Type','Date','Party','LR / Material','Trips','Subtotal','GST','Total','Action'],rows.map(i=>[
    `<b>${esc(i.invoice_no)}</b>`,statusBadge(invoiceTypeLabel(i)),esc(i.invoice_date),esc(i.party_name),`${esc(i.lr_no||'-')}<br><small>${esc(i.material)}</small>`,String(i.items.length),money(i.subtotal),money(i.gst_amount),`<b>${money(i.total)}</b>`,`<div class="action-set"><button class="mini green" data-action="view-invoice" data-id="${esc(i.id)}">View</button><button class="mini" data-action="edit-invoice" data-id="${esc(i.id)}">Edit</button><button class="mini gray" data-action="print-invoice" data-id="${esc(i.id)}">Print</button><button class="mini gray" data-action="download-invoice" data-id="${esc(i.id)}">Download</button><button class="mini gray" data-action="share-invoice" data-id="${esc(i.id)}">WhatsApp</button><button class="mini danger" data-action="delete-invoice" data-id="${esc(i.id)}">Delete</button></div>`
  ]),'1100px')}</div></section>`;
}


function pmBillsPanel(d){
  const rows=sortNumberedRows(filterRows(d.pmBills||[],['bill_no','bill_date','party_name','supplier_name']),'bill_no',true,'bill_date');
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
        (b.items||[]).map(i=>`<b>${esc(i.truck_no)}</b><br><small data-route-text>${esc(i.loading_point)} → ${esc(i.unloading_point)}</small>`).join('<hr>')||'-',
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
        </div>
      </div>
      <div class="row-list">
        ${rows.map(p=>{
          const invoices=sortInvoicesSeries(d.invoices.filter(i=>i.party_name===p.party_name),true);
          return `<div class="party-account-card">
            <div class="party-account-head">
              <button class="party-account-title" data-action="view-party-ledger" data-id="${encodeURIComponent(p.party_name)}">
                <b>${esc((p.ledger_no?p.ledger_no+' · ':'')+p.party_name)}</b>
                <small>Billed ${money(p.billed)} · Received ${money(p.received)}${Number(p.credit||0)>0?` · Advance/Credit ${money(p.credit)}`:''} · ${invoices.length} invoices</small>
              </button>
              <div class="v57-party-head-actions">
                <div class="money-right"><b>${money(p.outstanding)}</b><small>Outstanding</small></div>
                <button class="btn green" data-action="receive-party-owner" data-id="${encodeURIComponent(JSON.stringify({partyName:p.party_name,amount:Math.max(0,Number(p.outstanding||0))}))}">₹ Receive Payment</button>
              </div>
            </div>
            ${invoices.length?table(
              ['Invoice No.','Type','Date','Truck / Route','Bill','Received','Pending','Status','Action'],
              invoices.map(i=>{
                const received=invoiceReceivedAmount(i);
                const pending=invoicePendingAmount(i);
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
                    <button class="mini gray" data-action="print-invoice" data-id="${esc(i.id)}">Print</button>
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

function khataPanelV64(d){
  const transactions=[
    ...(d.partyPayments||[]).map(x=>({date:x.payment_date,type:'IN',name:x.party_name,amount:Number(x.amount||0),note:'Party Receipt'})),
    ...(d.supplierPayments||[]).map(x=>({date:x.payment_date,type:'OUT',name:x.owner_name,amount:Number(x.amount||0),note:'Supplier Payment'})),
    ...(d.expenses||[]).map(x=>({date:x.expense_date,type:'OUT',name:x.category||'Expense',amount:Number(x.amount||0),note:x.notes||'Office Expense'}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,8);
  return `<section class="panel active">
    <div class="v64-khata-screen">
      <div class="v64-khata-total">
        <small>Estimated Profit</small><b>${money(d.summary.estimatedProfit)}</b>
        <div><span><small>Party Receivable</small><strong>${money(d.summary.partyOutstanding)}</strong></span><span><small>Supplier Pending</small><strong>${money(d.summary.supplierPending)}</strong></span></div>
      </div>
      <div class="v64-khata-switch">
        <button data-panel="parties"><i>₹</i><span><b>Party Khata</b><small>Receive & invoice ledger</small></span><strong>${money(d.summary.partyOutstanding)}</strong></button>
        <button data-panel="suppliers"><i>🚛</i><span><b>Supplier Khata</b><small>Payable & truck ledger</small></span><strong>${money(d.summary.supplierPending)}</strong></button>
        <button data-panel="drivers"><i>🧑‍✈️</i><span><b>Driver Khata</b><small>Driver Gave / Driver Got</small></span><strong>${money(d.summary.driverBalance||0)}</strong></button>
        <button data-panel="myTrucks"><i>🚚</i><span><b>My Trucks</b><small>Documents & truck expenses</small></span><strong>${money(d.summary.truckExpenses||0)}</strong></button>
      </div>
      <div class="v64-section-title"><h3>Recent Entries</h3><button data-panel="reports">Reports ›</button></div>
      <div class="v64-list">${transactions.length?transactions.map(x=>`<div class="v64-simple-row">
        <span class="v64-avatar ${x.type==='IN'?'green':'red'}">₹</span>
        <span class="v64-row-copy"><b>${esc(x.name||'-')}</b><small>${esc(x.note)} · ${esc(x.date||'')}</small></span>
        <strong class="${x.type==='IN'?'v64-in':'v64-out'}">${x.type==='IN'?'+':'-'}${money(x.amount)}</strong>
      </div>`).join(''):'<div class="v64-empty">No recent payment entries.</div>'}</div>
    </div>
    <div class="v64-desktop-khata">
      <div class="cards">${metric('Party Receivable',d.summary.partyOutstanding)}${metric('Supplier Pending',d.summary.supplierPending)}${metric('Party Received',d.summary.partyReceived)}${metric('Supplier Paid',d.summary.supplierPaid)}${metric('Office Expenses',d.summary.expenses)}${metric('Estimated Profit',d.summary.estimatedProfit)}</div>
      <div class="grid2"><button class="card" data-panel="parties"><h2>Party Khata</h2><p>Invoice, receipt and outstanding ledger</p></button><button class="card" data-panel="suppliers"><h2>Supplier Khata</h2><p>Supplier payable, payments and truck ledger</p></button><button class="card" data-panel="drivers"><h2>Driver Khata</h2><p>Driver Gave / Driver Got balance</p></button><button class="card" data-panel="myTrucks"><h2>My Trucks & Expenses</h2><p>Own-truck expense register and reports</p></button></div>
    </div>
  </section>`;
}
function partyPaymentsPanel(d){
  const rows=filterRows(d.partyPayments,['receipt_no','party_name','payment_date','payment_mode','reference']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Party Payment History</h2><small>TransportBook-style receipt register</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search payments…"><button class="btn green" data-action="new-party-payment">Receive Payment</button></div></div>${table(['Receipt','Date','Party','Mode','Reference','Notes','Amount','Action'],rows.map(p=>[
    `<b>${esc(p.receipt_no||p.id)}</b>`,esc(p.payment_date),esc(p.party_name),statusBadge(p.payment_mode),esc(p.reference||'-'),esc(p.notes||'-'),`<b>${money(p.amount)}</b>`,actionButtons('party-payment',p.id)
  ]),'950px')}</div></section>`;
}
function supplierTruckNumbers(d,ownerName){
  const owner=accountKey(ownerName),numbers=new Set();
  for(const t of d.trucks||[])if(accountKey(t.owner_name)===owner&&t.truck_no)numbers.add(norm(t.truck_no));
  for(const e of d.truckEntries||[])if(accountKey(e.owner_name)===owner&&e.truck_no)numbers.add(norm(e.truck_no));
  for(const p of d.supplierPayments||[])if(accountKey(p.owner_name)===owner&&p.truck_no)numbers.add(norm(p.truck_no));
  for(const b of d.pmBills||[])if(accountKey(b.supplier_name)===owner)for(const item of b.items||[])if(item.truck_no)numbers.add(norm(item.truck_no));
  return [...numbers].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function supplierTruckBalance(d,ownerName,truckNo){
  const owner=accountKey(ownerName),truck=accountKey(truckNo);
  const entryPayable=(d.truckEntries||[]).filter(e=>accountKey(e.owner_name)===owner&&accountKey(e.truck_no)===truck).reduce((a,x)=>a+Number(x.payable||0),0);
  const pmPayable=(d.pmBills||[]).filter(b=>accountKey(b.supplier_name)===owner).reduce((sum,b)=>sum+(b.items||[]).filter(i=>accountKey(i.truck_no)===truck).reduce((a,i)=>a+Number(i.supplier_amount||0),0),0);
  const paid=(d.supplierPayments||[]).filter(p=>accountKey(p.owner_name)===owner&&accountKey(p.truck_no)===truck).reduce((a,x)=>a+Number(x.amount||0),0);
  return {payable:entryPayable+pmPayable,paid,pending:entryPayable+pmPayable-paid};
}
function supplierPayActionId(ownerName,truckNo='',suggestedAmount=0){
  return encodeURIComponent(JSON.stringify({ownerName:norm(ownerName),truckNo:norm(truckNo),suggestedAmount:Math.max(0,Number(suggestedAmount||0))}));
}
function supplierLedgerLinesForCard(d,ownerName){
  const owner=accountKey(ownerName);
  const entries=(d.truckEntries||[]).filter(e=>accountKey(e.owner_name)===owner).map(e=>({
    date:e.entry_date||'',type:'FREIGHT',reference:e.trip_id||e.truck_no||'-',truck:e.truck_no||'-',
    detail:`${e.loading_point||'-'} → ${e.unloading_point||'-'}`,debit:Number(e.payable||0),credit:0,created:e.created_at||''
  }));
  const payments=(d.supplierPayments||[]).filter(p=>accountKey(p.owner_name)===owner).map(p=>({
    date:p.payment_date||'',type:'PAYMENT',reference:p.receipt_no||p.reference||'-',truck:p.truck_no||'-',
    detail:p.reference||p.payment_mode||'-',debit:0,credit:Number(p.amount||0),created:p.created_at||''
  }));
  const pmBills=(d.pmBills||[]).filter(b=>accountKey(b.supplier_name)===owner).map(b=>({
    date:b.bill_date||'',type:'PM BILL',reference:b.bill_no||'-',truck:'-',
    detail:b.party_name||b.notes||'-',debit:Number(b.supplier_total||0),credit:0,created:b.created_at||''
  }));
  const lines=[...entries,...payments,...pmBills].sort((a,b)=>{
    const da=String(a.date||''),db=String(b.date||'');
    if(da!==db)return da.localeCompare(db);
    return String(a.created||'').localeCompare(String(b.created||''));
  });
  let balance=0;
  return lines.map(line=>{balance+=Number(line.debit||0)-Number(line.credit||0);return {...line,balance}});
}
function suppliersPanel(d){
  const all=d.supplierLedger||[];
  const rows=all.filter(s=>{
    if(!state.search)return true;
    const trucks=supplierTruckNumbers(d,s.owner_name).join(' ').toLowerCase();
    return String(s.owner_name||'').toLowerCase().includes(state.search)
      ||String(s.ledger_no||'').toLowerCase().includes(state.search)
      ||trucks.includes(state.search);
  });
  return `<section class="panel active"><div class="card">
    <div class="section-title v55-supplier-title">
      <div><h2>Supplier Khata</h2><small>Supplier-wise payable, payments, linked trucks ane ledger details</small></div>
      <div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search supplier or truck…"></div>
    </div>
    <div class="v57-supplier-list">${rows.map(s=>{
      const trucks=supplierTruckNumbers(d,s.owner_name);
      const truckHtml=trucks.length
        ? `<div class="v55-truck-list">${trucks.map(no=>`<span class="v55-truck-chip"><b>${esc(no)}</b></span>`).join('')}</div>`
        : `<div class="v55-no-truck">No truck linked</div>`;
      const pending=Math.max(0,Number(s.pending||0));
      const ledgerLines=[...supplierLedgerLinesForCard(d,s.owner_name)].reverse();
      return `<article class="v57-supplier-card">
        <div class="v57-supplier-head">
          <div class="v57-supplier-main">
            <button class="v55-supplier-name" data-action="view-supplier-ledger" data-id="${encodeURIComponent(s.owner_name)}">
              <b>${esc((s.ledger_no?s.ledger_no+' · ':'')+s.owner_name)}</b>
              <small>${s.entries} freight entries · ${s.pm_bills||0} PM bills · ${s.payments} payments · ${trucks.length} trucks</small>
            </button>
            ${truckHtml}
          </div>
          <div class="v57-supplier-summary">
            <div class="v55-money">
              <small>Pending</small>
              <b>${money(s.pending)}</b>
              <span>Payable ${money(s.payable)} · Paid ${money(s.paid||0)}</span>
            </div>
            <div class="v55-actions">
              <button class="btn green" data-action="pay-supplier-owner" data-id="${supplierPayActionId(s.owner_name,'',pending)}">₹ Pay Supplier</button>
              <button class="btn soft" data-action="view-supplier-ledger" data-id="${encodeURIComponent(s.owner_name)}">Ledger View</button>
            </div>
          </div>
        </div>
        <div class="v57-supplier-ledger-preview">
          ${ledgerLines.length?table(
            ['Date','Type','Trip / Ref','Truck','Route / Detail','Payable','Paid','Balance'],
            ledgerLines.map(l=>[
              esc(l.date),statusBadge(l.type),esc(l.reference),`<b>${esc(l.truck)}</b>`,esc(l.detail),
              l.debit?money(l.debit):'-',l.credit?money(l.credit):'-',`<b>${money(l.balance)}</b>`
            ]),'980px'
          ):'<div class="notice">No supplier ledger entries yet.</div>'}
        </div>
      </article>`;
    }).join('')||'<div class="empty">No supplier found.</div>'}</div>
  </div></section>`;
}
function truckEntriesPanel(d){
  const rows=filterRows(d.truckEntries,['entry_date','truck_no','owner_name','loading_point','unloading_point']);
  return `<section class="panel active"><div class="card"><div class="section-title"><div><h2>Truck / Supplier Entries</h2><small>Freight payable per truck trip</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search entries…"><button class="btn primary" data-action="new-truck-entry">New Entry</button></div></div>${table(['Date','Trip','Truck','Owner','Route','Weight × Rate','Commission','Payable','Action'],rows.map(e=>[
    esc(e.entry_date),esc(e.trip_id||'-'),`<b>${esc(e.truck_no)}</b>`,esc(e.owner_name),`<span data-route-text>${esc(e.loading_point)} → ${esc(e.unloading_point)}</span>`,`${esc(e.weight)} × ${money(e.rate)}`,money(e.commission),`<b>${money(e.payable)}</b>`,actionButtons('truck-entry',e.id)
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
  return `<section class="panel active">
    <div class="v64-mobile-list-screen">
      <div class="v64-mobile-screen-head"><div><b>Truck Fleet</b><small>${rows.length} trucks · documents & owners</small></div><button class="v64-round-add" data-action="new-truck">＋</button></div>
      <label class="v64-search-wrap"><span>⌕</span><input class="search" data-search value="${esc(state.search)}" placeholder="Search truck or owner…"></label>
      <div class="v64-list">${rows.map(t=>{
        const docs=(d.documents||[]).filter(x=>x.truck_no===t.truck_no);
        const initials=String(t.truck_no||'TR').replace(/[^A-Z0-9]/gi,'').slice(-2);
        return `<div class="v64-simple-row">
          <span class="v64-avatar">${esc(initials)}</span>
          <button class="v64-row-copy" data-action="edit-truck" data-id="${esc(t.id)}"><b>${esc(t.truck_no)}</b><small>${esc(t.owner_name||'No owner')} · ${docs.length} documents</small></button>
          <button class="v64-doc-pill" data-action="new-document" data-id="${encodeURIComponent(t.truck_no)}">DOC +</button>
        </div>`;
      }).join('')||'<div class="v64-empty">No trucks found.</div>'}</div>
    </div>
    <div class="v64-desktop-list">
      <div class="grid2"><div class="card"><div class="section-title"><div><h2>Truck Master</h2><small>Owner and bank details</small></div><div class="toolbar"><input class="search" data-search value="${esc(state.search)}" placeholder="Search truck…"><button class="btn primary" data-action="new-truck">Add Truck</button></div></div>${table(['Truck','Owner','Mobile','Bank Details','Documents','Action'],rows.map(t=>[
        `<b>${esc(t.truck_no)}</b>`,esc(t.owner_name||'-'),esc(t.owner_mobile||'-'),esc(t.bank_details||'-'),String(d.documents.filter(x=>x.truck_no===t.truck_no).length),actionButtons('truck',t.id,`<button class="mini green" data-action="new-document" data-id="${encodeURIComponent(t.truck_no)}">Document</button>`)
      ]),'850px')}</div><div class="card"><div class="section-title"><h2>Recent Documents</h2><button class="btn soft" data-action="new-document">Add</button></div>${d.documents.length?d.documents.slice(0,12).map(x=>`<div class="ledger-row"><button style="all:unset;cursor:pointer;flex:1" data-action="view-document" data-id="${esc(x.id)}"><b>${esc(x.truck_no)} · ${esc(x.kind)}</b><small>${esc(x.file_name||'Document')} ${x.expiry_date?'· Expiry '+esc(x.expiry_date):''}</small></button><button class="mini danger" data-action="delete-document" data-id="${esc(x.id)}">Delete</button></div>`).join(''):'<div class="notice">No documents.</div>'}</div></div>
    </div>
  </section>`;
}
function mastersPanel(d){
  return `<section class="panel active"><div class="grid3"><div class="card"><div class="section-title"><h3>Party Master</h3><button class="btn soft" data-action="new-party">Add</button></div>${d.parties.slice(0,30).map(p=>`<div class="ledger-row"><div><b>${esc(p.party_name)}</b><small>${esc(p.ledger_no||'No ledger number')} · ${esc(p.gst_no||'No GST')}</small></div><div class="action-set"><button class="mini" data-action="edit-party" data-id="${esc(p.id)}">Edit</button><button class="mini danger" data-action="delete-party" data-id="${esc(p.id)}">Delete</button></div></div>`).join('')}</div>
  <div class="card"><div class="section-title"><h3>Route Master</h3><button class="btn soft" data-action="new-route">Add</button></div>${d.routes.map(r=>`<div class="ledger-row"><div data-route-text><b>${esc(r.loading_point)}</b><small>→ ${esc(r.unloading_point)}</small></div><div class="action-set"><button class="mini" data-action="edit-route" data-id="${esc(r.id)}">Edit</button><button class="mini danger" data-action="delete-route" data-id="${esc(r.id)}">Delete</button></div></div>`).join('')}</div>
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
    ${field('Firm Name','firmName',window.ML_SETTINGS?.companyName||'MEERA LOGISTICS','text','required')}
    ${field('Firm PAN','firmPan',window.ML_SETTINGS?.pan||'ACFFM2544N','text','required')}
    ${field('Firm GST Number','firmGst',window.ML_SETTINGS?.gstNo||'24ACFFM2544N1Z1','text')}
    ${field('Phone','firmPhone',window.ML_SETTINGS?.phone||'9558959579','tel')}
    ${field('Email','firmEmail',window.ML_SETTINGS?.email||'meera.logistics99@gmail.com','email')}
    ${textarea('Firm Address','firmAddress',window.ML_SETTINGS?.address||'OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR','span2')}
    ${field('Authorized Partner Name','authorizedPartner',window.ML_SETTINGS?.authorizedPartner||'AUTHORIZED PARTNER','text','required')}
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
  const a=d.accountingAudit||{};
  return `<section class="panel active">
  <div class="cards">
    ${metric('Invoice Subtotal',d.summary.invoiceSubtotal)}
    ${metric('Supplier Payable',d.summary.supplierPayable)}
    ${metric('Supplier Paid',d.summary.supplierPaid)}
    ${metric('Office Expenses',d.summary.expenses)}
    ${metric('Estimated Profit',d.summary.estimatedProfit)}
    ${metric('Party Outstanding',d.summary.partyOutstanding)}
  </div>
  <div class="v58-accounting-strip">
    <div><b>Accounting Allocation V66.5</b><small>Exact invoice receipts + locked one-time allocation for old receipts</small></div>
    <div><span>Legacy FIFO: <b>${Number(a.fifoLegacyPayments||0)}</b></span><span>Unallocated Credit: <b>${money(a.unallocatedPartyCredit||0)}</b></span><span>Invoice Pending: <b>${money(a.invoicePending||0)}</b></span></div>
    <button class="btn primary" data-action="run-accounting-audit">Run Full Accounting Audit</button>
  </div>
  <div class="grid2"><div class="card"><div class="section-title"><div><h2>Audit Alerts</h2><small>Darek query mate Solve button thi direct fix screen khulse</small></div><button class="btn light" data-action="restore-backup">Restore Backup</button></div>${d.issues.length?d.issues.map(x=>`<div class="audit-item audit-resolvable ${x.severity==='warning'?'warning':''}"><div class="audit-copy"><b>${esc(x.type)}</b><small>${esc(x.text)}</small></div><button class="mini green audit-solve" data-action="resolve-audit" data-id="${encodeURIComponent(JSON.stringify(x))}">Solve</button></div>`).join(''):'<div class="notice">No detected ledger issues.</div>'}</div>
  <div class="card"><div class="section-title"><h2>Recent Changes</h2></div>${d.audits.slice(0,30).map(x=>`<div class="audit-item"><b>${esc(x.action)} · ${esc(x.entity)}</b><small>${esc(x.created_at)} · ${esc(x.entity_id||'')}</small></div>`).join('')}</div></div></section>`;
}


function resolveAuditIssue(raw){
  let issue={};
  try{issue=JSON.parse(decodeURIComponent(raw||''))}catch{issue={type:'UNKNOWN',text:String(raw||'')}}
  const type=String(issue.type||'').toUpperCase();
  if(type==='MISSING_TRUCK_MASTER'){
    const truckNo=norm(issue.entityId||String(issue.text||'').split(' is used')[0]);
    const trip=state.data.trips.find(t=>norm(t.truck_no)===truckNo)||{};
    const entry=state.data.truckEntries.find(e=>norm(e.truck_no)===truckNo)||{};
    return truckForm({
      truck_no:truckNo,
      owner_name:entry.owner_name||trip.driver_name||'',
      owner_mobile:trip.driver_mobile||'',
      bank_details:entry.bank_details||''
    });
  }
  if(type==='TRIP_WITHOUT_INVOICE'){
    const trip=state.data.trips.find(t=>String(t.id)===String(issue.entityId||''))||
      state.data.trips.find(t=>String(issue.text||'').includes(String(t.id)));
    if(!trip)return alert('Trip not found. Refresh કરીને ફરી Solve કરો.');
    return invoiceForm({},trip);
  }
  if(type==='PARTY_OVERPAYMENT'){
    const name=issue.entityId||String(issue.text||'').split(':')[0];
    return viewPartyLedger(name);
  }
  if(type==='SUPPLIER_OVERPAYMENT'){
    const name=issue.entityId||String(issue.text||'').split(':')[0];
    return viewSupplierLedger(name);
  }
  alert('Aa alert mate automatic fix screen available nathi. System Health ma details check karo.');
}


async function runAccountingAuditV58(){
  try{
    const a=await api('/accounting-audit');
    const errorCount=(a.issues||[]).filter(x=>x.severity==='error').length;
    const warningCount=(a.issues||[]).filter(x=>x.severity==='warning').length;
    modal('V66.5 Accounting & Data Isolation Audit',`
      <div class="cards">
        ${metric('Billing',a.totals?.billing||0)}
        ${metric('Party Received',a.totals?.partyReceived||0)}
        ${metric('Party Outstanding',a.totals?.partyOutstanding||0)}
        ${metric('Supplier Payable',a.totals?.supplierPayable||0)}
        ${metric('Supplier Paid',a.totals?.supplierPaid||0)}
        ${metric('Supplier Pending',a.totals?.supplierPending||0)}
      </div>
      <div class="v58-audit-status ${a.ok?'ok':'bad'}">
        <b>${a.ok?'Accounting isolation checks passed':'Audit needs attention'}</b>
        <span>${errorCount} errors · ${warningCount} warnings · Cross-company links ${a.crossCompanyLinks||0}</span>
      </div>
      <div class="v58-audit-meta">Checked ${esc(a.checkedAt||'')} · Company ${esc(a.companyId||'')} · Unallocated Party Credit ${money(a.totals?.unallocatedPartyCredit||0)}</div>
      <div class="v58-audit-list">${(a.issues||[]).length?(a.issues||[]).map(x=>`<div class="audit-item ${x.severity==='warning'?'warning':''}"><b>${esc(x.type)}</b><small>${esc(x.text)}</small></div>`).join(''):'<div class="notice">No accounting/data-isolation issue detected.</div>'}</div>
    `);
  }catch(e){alert(e.message||'Accounting audit failed')}
}

function handleAction(action,id){
  if(action==='run-accounting-audit')return runAccountingAuditV58();
  if(action==='resolve-audit')return resolveAuditIssue(id);
  if(action==='new-trip'||action==='edit-trip')return tripForm(action==='edit-trip'?(find('trip',id)||{}):{});
  if(action==='view-trip')return universalTripScreen(find('trip',id));
  if(action==='view-trip-lr')return tripLrView(find('trip',id));
  if(action==='view-linked-invoice')return viewInvoice(find('invoice',id));
  if(action==='trip-create-invoice'){const t=find('trip',id);return invoiceForm({},t||{});}
  if(action==='trip-party-payment'){const t=find('trip',id);return partyPaymentForm({},t||{});}
  if(action==='trip-supplier-payment'){
    const t=find('trip',id)||{};
    const owner=tripSupplierName(t),f=tripFinancials(t);
    return supplierPaymentForm({}, {...t,owner_name:owner,truck_no:t.truck_no,suggestedAmount:Math.max(0,f.supplierPayable-f.supplierPaid)});
  }
  if(action==='pay-supplier-owner'||action==='pay-supplier-truck'){
    try{const ctx=JSON.parse(decodeURIComponent(id||''));return supplierPaymentForm({}, {owner_name:ctx.ownerName||'',truck_no:ctx.truckNo||'',suggestedAmount:ctx.suggestedAmount||0});}
    catch(_){return supplierPaymentForm({});}
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
  if(action==='receive-party-owner'){
    try{
      const payload=JSON.parse(decodeURIComponent(id||''));
      return partyPaymentForm({party_name:payload.partyName||'',amount:Number(payload.amount||0)});
    }catch(_){return partyPaymentForm({})}
  }
  if(action==='new-party-payment'||action==='edit-party-payment')return partyPaymentForm(action==='edit-party-payment'?(find('party-payment',id)||{}):{});
  if(action==='delete-party-payment')return remove(`/party-payments/${id}`,'Delete this party payment?');
  if(action==='view-supplier-ledger')return viewSupplierLedger(decodeURIComponent(id));
  if(action==='edit-trip-supplier')return editTripSupplier(find('trip',id));
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



function tripSupplierName(trip){
  const d=state.data;
  const linkedEntry=d.truckEntries.find(e=>String(e.trip_id||'')===String(trip.id));
  const truck=d.trucks.find(t=>norm(t.truck_no)===norm(trip.truck_no));
  return norm(trip.supplier_name||linkedEntry?.owner_name||truck?.owner_name||trip.driver_name||'SUPPLIER');
}
function tripPutBody(trip,supplierName,overrides={}){
  return {
    tripDate:overrides.tripDate||trip.trip_date||today(),
    partyName:overrides.partyName||trip.party_name||'',
    truckNo:overrides.truckNo||trip.truck_no||'',
    driverName:(overrides.driverName??trip.driver_name)||'',
    driverMobile:(overrides.driverMobile??trip.driver_mobile)||'',
    supplierName:supplierName||overrides.supplierName||tripSupplierName(trip),
    material:trip.material||'',
    loadingPoint:trip.loading_point||'',
    unloadingPoint:trip.unloading_point||'',
    lrNumber:trip.lr_number||'',
    loadingWeight:Number(trip.loading_weight??trip.weight??0),
    unloadingWeight:Number(trip.unloading_weight??trip.weight??0),
    billingWeight:Number(trip.billing_weight??trip.weight??0),
    weight:Number(trip.billing_weight??trip.weight??0),
    rate:Number(trip.rate||0),
    status:trip.status||'BOOKED',
    notes:trip.notes||'',
    podFileName:trip.pod_file_name||'',
    podData:trip.pod_data||''
  };
}
function editTripSupplier(trip){
  if(!trip)return;
  const d=state.data;
  const linkedEntry=(d.truckEntries||[]).find(e=>String(e.trip_id||'')===String(trip.id))||null;
  const currentTruck=d.trucks.find(t=>norm(t.truck_no)===norm(trip.truck_no))||{};
  const current=tripSupplierName(trip);
  const host=modal(`Edit Supplier & Truck · ${trip.trip_no||trip.id}`,`<form class="form-grid" id="tripSupplierForm">
    ${field('Trip Number','tripNo',trip.trip_no||trip.id,'text','readonly')}
    ${masterSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),trip.truck_no||'','truck','required')}
    ${supplierSelectField('Supplier / Truck Malik Name','supplierName',current,'required')}
    ${field('Owner Mobile','ownerMobile',currentTruck.owner_mobile||'','tel')}
    ${textarea('Bank Details','bankDetails',linkedEntry?.bank_details||currentTruck.bank_details||'','span2')}
    ${field('Supplier Rate','supplierRate',linkedEntry?.rate||0,'number','step="0.01" min="0"')}
    ${field('Commission','commission',linkedEntry?.commission||0,'number','step="0.01" min="0"')}
    ${field('Supplier Payable','supplierPayable',linkedEntry?.payable||0,'number','readonly')}
    <div class="field span2"><span>Supplier Vehicles</span><div class="v54-linked-trucks" data-linked-trucks></div></div>
    <div class="span2 notice">Aa full supplier tab mathi Supplier, Truck, Mobile, Bank, Supplier Rate ane Commission badhu aa Trip sathe update thashe.</div>
    <div class="form-actions"><button type="button" class="btn light" data-cancel>Cancel</button><button class="btn primary">Save Supplier & Truck</button></div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);
    const truckSelect=host.querySelector('[name=truckNo]'),supplierSelect=host.querySelector('[name=supplierName]');
    const mobile=host.querySelector('[name=ownerMobile]'),bank=host.querySelector('[name=bankDetails]');
    const rate=host.querySelector('[name=supplierRate]'),commission=host.querySelector('[name=commission]'),payable=host.querySelector('[name=supplierPayable]');
    const linked=host.querySelector('[data-linked-trucks]');
    const renderLinked=()=>{
      const owner=norm(supplierSelect.value),trucks=supplierTruckNumbers(d,owner);
      linked.innerHTML=trucks.length?trucks.map(no=>`<button type="button" class="v54-linked-truck ${norm(no)===norm(truckSelect.value)?'active':''}" data-v54-truck="${esc(no)}">${esc(no)}</button>`).join(''):'<small>No vehicle linked yet.</small>';
      linked.querySelectorAll('[data-v54-truck]').forEach(btn=>btn.onclick=()=>{addOptionAndSelect(truckSelect,btn.dataset.v54Truck);truckSelect.dispatchEvent(new Event('change',{bubbles:true}))});
    };
    const recalc=()=>{payable.value=Math.max(0,Number(trip.billing_weight??trip.weight??0)*Number(rate.value||0)-Number(commission.value||0)).toFixed(2)};
    supplierSelect.addEventListener('change',()=>{supplierSelect.dataset.manual='1';renderLinked()});
    truckSelect.addEventListener('change',()=>{
      const t=d.trucks.find(x=>norm(x.truck_no)===norm(truckSelect.value));
      if(t){
        if(t.owner_name&&!supplierSelect.dataset.manual){addOptionAndSelect(supplierSelect,t.owner_name);supplierSelect.dataset.manual=''}
        mobile.value=t.owner_mobile||'';bank.value=t.bank_details||bank.value||'';
      }
      renderLinked();
    });
    rate.addEventListener('input',recalc);commission.addEventListener('input',recalc);recalc();renderLinked();
    host.querySelector('[data-cancel]').onclick=()=>host.remove();
    host.querySelector('#tripSupplierForm').onsubmit=async event=>{
      event.preventDefault();const button=event.submitter,body=formDataObject(event.target);
      const supplierName=norm(body.supplierName),truckNo=norm(body.truckNo);
      if(!supplierName)return alert('Supplier name required.');if(!truckNo)return alert('Truck Number required.');
      try{
        setBusy(button,true);
        await api('/trips/'+trip.id,{method:'PUT',body:JSON.stringify(tripPutBody(trip,supplierName,{truckNo}))});
        let truck=d.trucks.find(t=>norm(t.truck_no)===truckNo);
        const truckBody={truckNo,ownerName:supplierName,ownerMobile:body.ownerMobile||'',bankDetails:body.bankDetails||''};
        if(truck)await api('/trucks/'+truck.id,{method:'PUT',body:JSON.stringify(truckBody)});
        else{const res=await api('/trucks',{method:'POST',body:JSON.stringify(truckBody)});truck={id:res.id,...truckBody,truck_no:truckNo,owner_name:supplierName}}
        const entryBody={tripId:trip.id,entryDate:trip.trip_date||today(),truckNo,ownerName:supplierName,bankDetails:body.bankDetails||'',loadingPoint:trip.loading_point||'',unloadingPoint:trip.unloading_point||'',weight:Number(trip.billing_weight??trip.weight??0),rate:Number(body.supplierRate||0),commission:Number(body.commission||0),notes:linkedEntry?.notes||''};
        if(linkedEntry)await api('/truck-entries/'+linkedEntry.id,{method:'PUT',body:JSON.stringify(entryBody)});
        else if(Number(body.supplierRate||0)>0)await api('/truck-entries',{method:'POST',body:JSON.stringify(entryBody)});
        const fresh=await api('/bootstrap');state.data=fresh;writeCache(fresh);host.remove();universalTripScreen(fresh.trips.find(x=>String(x.id)===String(trip.id)));
      }catch(error){alert(error.message||'Unable to update supplier / truck.')}finally{setBusy(button,false)}
    };
  }});
}
function tripFinancials(trip){
  const d=state.data;
  const invoiceItems=[];
  for(const invoice of d.invoices){
    for(const item of (invoice.items||[])){
      if(String(item.trip_id||'')===String(trip.id))invoiceItems.push({...item,invoice});
    }
  }
  const invoice=invoiceItems[0]?.invoice||null;
  // Revenue must be this Trip/Truck line only, never the complete multi-truck invoice total.
  const linkedLineAmount=invoiceItems.reduce((sum,item)=>{
    const amount=item.amount??(Number(item.weight||0)*Number(item.rate||0));
    return sum+Number(amount||0);
  },0);
  const tripOwnAmount=Number(trip.billing_weight??trip.weight??0)*Number(trip.rate||0);
  const revenue=linkedLineAmount>0?linkedLineAmount:tripOwnAmount;

  const partyPayments=d.partyPayments.filter(p=>String(p.trip_id||'')===String(trip.id));
  const partyPaid=partyPayments.reduce((a,x)=>a+Number(x.amount||0),0);

  const supplierEntries=d.truckEntries.filter(e=>
    String(e.trip_id||'')===String(trip.id) ||
    (!e.trip_id && e.truck_no===trip.truck_no && e.entry_date===trip.trip_date)
  );
  const supplierPayable=supplierEntries.reduce((a,x)=>a+Number(x.payable||0),0);
  const ownerNames=[...new Set([trip.supplier_name,...supplierEntries.map(x=>x.owner_name)].filter(Boolean).map(norm))];

  const supplierPays=d.supplierPayments.filter(p=>String(p.trip_id||'')===String(trip.id));
  // Include exact Trip payments plus legacy/unlinked Supplier payments allocated FIFO.
  const supplierPaid=supplierTripPaidAmount(d,trip);

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
  const owner=tripSupplierName(trip);
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
          <div class="ut-route" data-route-text><b>${esc(trip.loading_point)}</b><span>→</span><b>${esc(trip.unloading_point)}</b></div>
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
            <div><small>LR NO.</small><b>${esc(f.invoiceItems[0]?.lr_number||trip.lr_number||'-')}</b></div>
            <div><small>TRIP BILL AMOUNT</small><b>${money(f.revenue)}</b></div>
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
          <div class="section-title"><div><h3>${esc(owner)}</h3><small>${esc(trip.trip_no||trip.id)} · ${esc(trip.truck_no)}</small></div><button class="btn light" data-action="edit-trip-supplier" data-id="${esc(trip.id)}">Edit Supplier</button></div>
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
          <button data-action="view-trip-lr" data-id="${esc(trip.id)}">
            <span>🧾</span><div><b>Online Bilty / LR</b><small>View LR with complete trip details</small></div><i>›</i>
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


function tripLrDetails(trip){
  const f=tripFinancials(trip);
  const owner=tripSupplierName(trip);
  const inv=f.invoice||null;
  const item=(f.invoiceItems||[])[0]||{};
  const party=state.data.parties.find(p=>norm(p.party_name)===norm(trip.party_name))||{};
  const loadingWeight=Number(trip.loading_weight??item.loading_weight??trip.weight??0);
  const unloadingWeight=Number(trip.unloading_weight??item.unloading_weight??trip.weight??0);
  const billingWeight=Number(trip.billing_weight??item.weight??trip.weight??unloadingWeight);
  return {
    lrNo:item.lr_number||trip.lr_number||trip.trip_no||trip.id||'-',
    tripNo:trip.trip_no||trip.id||'-',
    date:trip.trip_date||'-',
    party:trip.party_name||'-',
    partyGst:inv?.party_gst||party.gst_no||'-',
    truck:trip.truck_no||'-',
    supplier:owner||'-',
    driver:trip.driver_name||'-',
    driverMobile:trip.driver_mobile||'-',
    loading:trip.loading_point||'-',
    unloading:trip.unloading_point||'-',
    material:trip.material||'-',
    loadingWeight,
    unloadingWeight,
    billingWeight,
    shortage:Math.max(0,loadingWeight-unloadingWeight),
    rate:Number(trip.rate||item.rate||0),
    amount:Number(f.revenue||0),
    invoiceNo:inv?.invoice_no||'-',
    status:trip.status||'Booked'
  };
}
function tripLrHtml(trip){
  const x=tripLrDetails(trip);
  return `<div class="v65-lr-sheet">
    <div class="v65-lr-head">
      <div>
        <small>TRANSPORT CONSIGNMENT NOTE</small>
        <h1>${esc(state.data.saas?.company?.company_name||'MEERA LOGISTICS')}</h1>
        <p>Online Bilty / LR · Trip linked details</p>
      </div>
      <div class="v65-lr-no"><small>LR NO.</small><b>${esc(x.lrNo)}</b><span>${esc(x.date)}</span></div>
    </div>
    <div class="v65-lr-strip">
      <div><small>TRIP NO.</small><b>${esc(x.tripNo)}</b></div>
      <div><small>STATUS</small><b>${esc(x.status)}</b></div>
      <div><small>INVOICE</small><b>${esc(x.invoiceNo)}</b></div>
    </div>
    <div class="v65-lr-grid">
      <div class="v65-lr-box span2"><small>PARTY / CONSIGNEE</small><b>${esc(x.party)}</b><span>GST: ${esc(x.partyGst)}</span></div>
      <div class="v65-lr-box"><small>TRUCK NUMBER</small><b class="v65-lr-plate">${esc(x.truck)}</b></div>
      <div class="v65-lr-box"><small>SUPPLIER / TRUCK MALIK</small><b>${esc(x.supplier)}</b></div>
      <div class="v65-lr-box"><small>DRIVER</small><b>${esc(x.driver)}</b><span>${esc(x.driverMobile)}</span></div>
      <div class="v65-lr-box"><small>MATERIAL</small><b>${esc(x.material)}</b></div>
    </div>
    <div class="v65-lr-route">
      <div><small>LOADING POINT</small><b>${esc(x.loading)}</b></div>
      <span>→</span>
      <div><small>UNLOADING POINT</small><b>${esc(x.unloading)}</b></div>
    </div>
    <div class="v65-lr-weight-grid">
      <div><small>LOADING WT.</small><b>${esc(x.loadingWeight)}</b></div>
      <div><small>UNLOADING WT.</small><b>${esc(x.unloadingWeight)}</b></div>
      <div><small>SHORTAGE</small><b>${esc(x.shortage)}</b></div>
      <div><small>BILLING WT.</small><b>${esc(x.billingWeight)}</b></div>
    </div>
    <div class="v65-lr-money">
      <div><span>Rate</span><b>${money(x.rate)}</b></div>
      <div class="total"><span>Trip Freight Amount</span><b>${money(x.amount)}</b></div>
    </div>
    <div class="v65-lr-sign">
      <div><span></span><b>Driver / Receiver</b></div>
      <div><span></span><b>Authorized Signatory</b></div>
    </div>
  </div>`;
}
function tripLrView(trip){
  if(!trip)return alert('Trip not found.');
  modal(`Online Bilty / LR · ${trip.trip_no||trip.id}`,`
    ${tripLrHtml(trip)}
    <div class="form-actions no-print v65-lr-actions">
      <button type="button" class="btn primary" data-v65-lr-print>Print / Save PDF</button>
    </div>
  `,{onMount:host=>{
    host.querySelector('[data-v65-lr-print]').onclick=()=>{
      const w=window.open('','_blank');
      if(!w)return alert('Please allow pop-ups to print LR.');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LR ${esc(tripLrDetails(trip).lrNo)}</title><link rel="stylesheet" href="/src/styles.css?v=65"></head><body class="v65-lr-print-body">${tripLrHtml(trip)}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
      w.document.close();
    };
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
  const linkedSupplierEntry=d.truckEntries.find(e=>String(e.trip_id||'')===String(x.id||''))||null;
  const initialSupplier=norm(x.supplier_name||linkedSupplierEntry?.owner_name||d.trucks.find(t=>norm(t.truck_no)===norm(x.truck_no))?.owner_name||x.driver_name||'');
  const supplierNames=[...new Set([
    ...(d.supplierLedger||[]).map(s=>s.owner_name),
    ...(d.trucks||[]).map(t=>t.owner_name),
    ...(d.truckEntries||[]).map(e=>e.owner_name),
    ...(d.trips||[]).map(t=>t.supplier_name)
  ].filter(Boolean).map(norm))].sort();
  const existingAdvance=(d.supplierPayments||[]).filter(p=>String(p.trip_id||'')===String(x.id||'')&&/ADVANCE/i.test(String(p.reference||p.notes||''))).reduce((sum,p)=>sum+Number(p.amount||0),0);

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
    <div class="trip-party-gst-field">${field('Party GST Number','partyGst',linkedInvoice?.party_gst||partyMaster.gst_no||'','text','readonly')}</div>
    <div class="trip-gst-field">${field('SGST %','sgst',linkedInvoice?.sgst??Number(window.ML_SETTINGS?.defaultSgst??9),'number','step="0.01"')}</div>
    <div class="trip-gst-field">${field('CGST %','cgst',linkedInvoice?.cgst??Number(window.ML_SETTINGS?.defaultCgst??9),'number','step="0.01"')}</div>
    ${field('Diesel','diesel',linkedInvoice?.diesel||0,'number','step="0.01"')}
    ${field('Munshi Charges','munshi',linkedInvoice?.munshi||0,'number','step="0.01"')}
    <label class="field span2"><span>Party Address</span><textarea name="partyAddress" readonly>${esc(linkedInvoice?.party_address||partyMaster.address||'')}</textarea></label>
    ${textarea('Invoice Comments','comments',linkedInvoice?.comments||window.ML_SETTINGS?.defaultComments||'1. Payment due within 30 days.\\n2. Mention invoice number in payment reference.','span2')}

    <div class="span2 universal-section-title supplier"><b>SUPPLIER / TRUCK MALIK</b><small>Supplier aa Trip Number sathe separately save ane edit thashe</small></div>
    ${supplierSelectField('Supplier / Truck Malik Name','supplierName',initialSupplier,'required')}
    ${field('Supplier Rate','supplierRate',linkedSupplierEntry?.rate||0,'number','step="0.01"')}
    ${field('Commission','commission',linkedSupplierEntry?.commission||0,'number','step="0.01"')}
    ${field('Supplier Advance','supplierAdvance',existingAdvance,'number','step="0.01"')}

    ${textarea('Trip Notes','notes',x.notes||'','span2')}
    <label class="field span2"><span>POD Images (multiple allowed)</span><input id="podFiles" type="file" accept="image/*" multiple></label>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Universal Trip</button></div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);

    const tripTypeInput=host.querySelector('[name=tripType]');
    const invoiceNoInput=host.querySelector('[name=invoiceNo]');
    const partySelect=host.querySelector('[name=partyName]');
    const truckSelect=host.querySelector('[name=truckNo]');
    const supplierInput=host.querySelector('[name=supplierName]');
    supplierInput.addEventListener('change',()=>supplierInput.dataset.manual='1');
    truckSelect.addEventListener('change',()=>{
      const truck=d.trucks.find(t=>norm(t.truck_no)===norm(truckSelect.value));
      if(truck?.owner_name && (!supplierInput.value || supplierInput.dataset.manual!=='1')){addOptionAndSelect(supplierInput,truck.owner_name);supplierInput.dataset.manual=''}
    });

    const applyTripType=(type,forceNumber=true)=>{
      tripTypeInput.value=type;
      host.querySelectorAll('[data-trip-type]').forEach(b=>b.classList.toggle('active',b.dataset.tripType===type));
      const nonGst=type==='NON_GST';
      host.querySelectorAll('.trip-gst-field').forEach(el=>el.style.display=nonGst?'none':'');
      if(nonGst){
        host.querySelector('[name=sgst]').value=0;
        host.querySelector('[name=cgst]').value=0;
        const p=getPartyDetails(partySelect.value);
        host.querySelector('[name=partyGst]').value=p.gst_no||'';
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
      gst.value=p.gst_no||'';
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
          const sameNumber=freshBeforeInvoice.invoices.find(inv=>accountKey(inv.invoice_no)===accountKey(body.invoiceNo));
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
            partyGst:body.partyGst||'',
            lrNo:body.lrNumber||'',
            material:body.material,
            loadingDate:body.tripDate,
            sgst:body.tripType==='NON_GST'?0:Number(body.sgst||0),
            cgst:body.tripType==='NON_GST'?0:Number(body.cgst||0),
            diesel:Number(body.diesel||0),
            munshi:Number(body.munshi||0),
            comments:body.comments||'',
            items:existingItems.map(it=>{
              const itemTrip=freshBeforeInvoice.trips.find(t=>String(t.id)===String(it.trip_id||it.tripId||''));
              const itemSupplierEntry=freshBeforeInvoice.truckEntries.find(te=>String(te.trip_id||'')===String(it.trip_id||it.tripId||''))||null;
              const itemAdvance=(freshBeforeInvoice.supplierPayments||[])
                .filter(p=>String(p.trip_id||'')===String(it.trip_id||it.tripId||'')&&/ADVANCE/i.test(String(p.reference||p.notes||'')))
                .reduce((sum,p)=>sum+Number(p.amount||0),0);
              const current=String(it.trip_id||it.tripId||'')===String(tripId);
              return {
                tripId:it.trip_id||it.tripId||'',
                loadingDate:current?body.tripDate:(itemTrip?.trip_date||targetInvoice?.loading_date||body.tripDate),
                lrNumber:it.lr_number||it.lrNumber||'',
                truckNo:it.truck_no||it.truckNo||'',
                description:it.description||'',
                loadingWeight:it.loading_weight??it.loadingWeight??it.weight,
                unloadingWeight:it.unloading_weight??it.unloadingWeight??it.weight,
                weight:it.weight,
                rate:it.rate,
                supplierName:current?body.supplierName:(itemSupplierEntry?.owner_name||freshBeforeInvoice.trucks.find(t=>norm(t.truck_no)===norm(it.truck_no||it.truckNo||''))?.owner_name||''),
                supplierRate:current?Number(body.supplierRate||0):Number(itemSupplierEntry?.rate||0),
                commission:current?Number(body.commission||0):Number(itemSupplierEntry?.commission||0),
                supplierAdvance:current?Number(body.supplierAdvance||0):itemAdvance
              };
            })
          };

          await api('/invoices'+(targetInvoice?'/'+targetInvoice.id:''),{
            method:targetInvoice?'PUT':'POST',
            body:JSON.stringify(invoiceBody)
          });
        }

        const supplierRate=Number(body.supplierRate||0);
        if(supplierRate>0 && !e.target.createInvoice.checked){
          const freshSupplier=await api('/bootstrap');
          const truck=freshSupplier.trucks.find(t=>t.truck_no===norm(body.truckNo))||{};
          const existingEntry=freshSupplier.truckEntries.find(te=>String(te.trip_id||'')===String(tripId));
          const entryBody={
            tripId,
            entryDate:body.tripDate,
            truckNo:body.truckNo,
            ownerName:body.supplierName||truck.owner_name||body.driverName||'',
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
          const oldAdvance=(freshSupplier.supplierPayments||[]).find(p=>String(p.trip_id||'')===String(tripId)&&/ADVANCE/i.test(String(p.reference||p.notes||'')))||null;
          if(advance>0){
            const advanceBody={
              tripId,
              ownerName:entryBody.ownerName,
              truckNo:body.truckNo,
              paymentDate:body.tripDate,
              amount:advance,
              paymentMode:'BANK',
              reference:'TRIP ADVANCE',
              notes:`Advance for ${tripId}`
            };
            await api('/supplier-payments'+(oldAdvance?'/'+oldAdvance.id:''),{
              method:oldAdvance?'PUT':'POST',
              body:JSON.stringify(advanceBody)
            });
          }else if(oldAdvance){
            await api('/supplier-payments/'+oldAdvance.id,{method:'DELETE'});
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
  const clientRequestId=edit?'':(globalThis.crypto?.randomUUID?.()||`INV-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const initialType=x.invoice_type||'GST';
  const items=(x.items&&x.items.length?x.items:(tripContext?[{
    trip_id:tripContext.id,tripId:tripContext.id,truck_no:tripContext.truck_no,truckNo:tripContext.truck_no,
    loading_point:tripContext.loading_point,loadingPoint:tripContext.loading_point,
    unloading_point:tripContext.unloading_point,unloadingPoint:tripContext.unloading_point,
    description:`${tripContext.loading_point} TO ${tripContext.unloading_point}`,
    lr_number:tripContext.lr_number||'',loading_weight:tripContext.loading_weight??tripContext.weight,
    unloading_weight:tripContext.unloading_weight??tripContext.weight,
    shortage:tripContext.shortage||0,weight:tripContext.billing_weight??tripContext.weight,rate:tripContext.rate
  }]:[{trip_id:'',lr_number:'',truck_no:'',loadingPoint:'',unloadingPoint:'',description:'',loading_weight:0,unloading_weight:0,shortage:0,weight:0,rate:0}]));

  const invoiceRouteParts=(item={},linkedTrip=null)=>{
    let loadingPoint=norm(item.loading_point||item.loadingPoint||linkedTrip?.loading_point||'');
    let unloadingPoint=norm(item.unloading_point||item.unloadingPoint||linkedTrip?.unloading_point||'');
    if(!loadingPoint||!unloadingPoint){
      const parts=String(item.description||'').trim().split(/\s+(?:TO|→|->)\s+/i);
      if(!loadingPoint)loadingPoint=norm(parts[0]||'');
      if(!unloadingPoint)unloadingPoint=norm(parts.slice(1).join(' TO '));
    }
    return {loadingPoint,unloadingPoint};
  };

  const host=modal(edit?'Edit Invoice':'New Invoice',`<form class="form-grid" id="invoiceForm">
    <input type="hidden" name="clientRequestId" value="${esc(clientRequestId)}">
    <div class="span2 invoice-type-switch">
      <span>Invoice Type</span>
      <div class="invoice-type-buttons">
        <button type="button" class="type-choice ${initialType==='GST'?'active':''}" data-type-choice="GST">GST Invoice</button>
        <button type="button" class="type-choice ${initialType==='IGST'?'active':''}" data-type-choice="IGST">IGST Invoice</button>
        <button type="button" class="type-choice ${initialType==='NON_GST'?'active':''}" data-type-choice="NON_GST">Non-GST Invoice</button>
      </div>
      <input type="hidden" name="invoiceType" value="${esc(initialType)}">
    </div>

    <label class="field"><span>Invoice Number (Auto, Editable)</span><input name="invoiceNo" type="text" value="${esc(x.invoice_no||(initialType==='NON_GST'?d.nextNonGstInvoiceNo:d.nextInvoiceNo))}" required></label>
    ${field('Invoice Date','invoiceDate',x.invoice_date||today(),'date','required')}
    ${masterSelectField('Party','partyName',d.parties.map(p=>p.party_name),x.party_name||tripContext?.party_name||'','party','required')}
    <div class="party-gst-field">${field('Party GST','partyGst',x.party_gst||getPartyDetails(tripContext?.party_name||x.party_name).gst_no||'','text','readonly')}</div>
    <label class="field span2"><span>Party Address</span><textarea name="partyAddress" readonly>${esc(x.party_address||getPartyDetails(tripContext?.party_name||x.party_name).address||'')}</textarea></label>
    ${masterSelectField('Material','material',d.materials.map(m=>m.material_name),x.material||tripContext?.material||'','material')}
    <input type="hidden" name="loadingDate" value="${esc(x.loading_date||tripContext?.trip_date||today())}">
    ${field('Diesel','diesel',x.diesel||0,'number','step="0.01"')}
    ${field('Munshi','munshi',x.munshi||0,'number','step="0.01"')}
    <div class="gst-field sgst-field">${field('SGST %','sgst',x.sgst??Number(window.ML_SETTINGS?.defaultSgst??9),'number','step="0.01"')}</div>
    <div class="gst-field cgst-field">${field(initialType==='IGST'?'IGST %':'CGST %','cgst',x.cgst??Number(window.ML_SETTINGS?.defaultCgst??9),'number','step="0.01"')}</div>

    <div class="span2"><div class="section-title"><div><h3>Truck Details</h3><small>એક invoiceમાં જેટલી truck જોઈએ એટલી add કરો</small></div><div class="toolbar"><button type="button" class="btn green" id="addTripFromInvoice">+ New Trip</button><button type="button" class="btn soft" id="addLine">+ Add Another Truck</button></div></div><div class="invoice-lines" id="invoiceLines"></div></div>

    <div class="span2 invoice-live-summary">
      <div><small>Subtotal</small><b id="sumSubtotal">₹0.00</b></div>
      <div class="gst-summary"><small>GST</small><b id="sumGst">₹0.00</b></div>
      <div><small>Total</small><b id="sumTotal">₹0.00</b></div>
    </div>

    ${textarea('Comments / Payment Terms','comments',x.comments||window.ML_SETTINGS?.defaultComments||'1. Payment due within 30 days.\\n2. Mention invoice number in payment reference.','span2')}
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">${edit?'Update':'Save'} Invoice</button></div>
  </form>`,{onMount:host=>{
    wireMasterSelects(host);
    const lines=host.querySelector('#invoiceLines');
    const typeInput=host.querySelector('[name=invoiceType]');
    const numberInput=host.querySelector('[name=invoiceNo]');
    let invoiceLineSequence=0;

    function addLine(item={}){
      const linkedTrip=d.trips.find(t=>String(t.id)===String(item.trip_id||item.tripId||''));
      const route=invoiceRouteParts(item,linkedTrip);
      const linkedSupplierEntry=d.truckEntries.find(e=>String(e.trip_id||'')===String(linkedTrip?.id||item.trip_id||item.tripId||''))||null;
      const linkedTruck=d.trucks.find(t=>norm(t.truck_no)===norm(item.truck_no||item.truckNo||linkedTrip?.truck_no||''));
      const initialSupplier=norm(item.supplier_name||item.supplierName||linkedSupplierEntry?.owner_name||linkedTruck?.owner_name||linkedTrip?.supplier_name||'');
      const truckListId=`v667-invoice-trucks-${Date.now()}-${++invoiceLineSequence}`;
      const existingAdvance=(d.supplierPayments||[])
        .filter(p=>String(p.trip_id||'')===String(linkedTrip?.id||item.trip_id||item.tripId||'')&&/ADVANCE/i.test(String(p.reference||p.notes||'')))
        .reduce((sum,p)=>sum+Number(p.amount||0),0);

      const row=document.createElement('div');
      row.className='invoice-line v664-invoice-line v667-invoice-line';
      row.innerHTML=`
        <label class="field"><span>Trip No.</span>
          <input name="tripNoDisplay" value="${esc(linkedTrip?.trip_no||'AUTO')}" readonly>
          <input name="tripId" type="hidden" value="${esc(item.trip_id||item.tripId||'')}">
        </label>
        ${field('Loading Date','loadingDate',item.loading_date||item.loadingDate||linkedTrip?.trip_date||x.loading_date||today(),'date','required')}
        ${field('LR Number','lrNumber',item.lr_number||item.lrNumber||linkedTrip?.lr_number||'','','required')}
        ${searchableMasterField('Truck No.','truckNo',d.trucks.map(t=>t.truck_no),item.truck_no||item.truckNo||linkedTrip?.truck_no||'',truckListId,'truck','required')}
        ${masterSelectField('Loading Point','loadingPoint',[...new Set(d.routes.map(r=>r.loading_point))],route.loadingPoint,'route-loading','required')}
        ${masterSelectField('Unloading Point','unloadingPoint',[...new Set(d.routes.map(r=>r.unloading_point))],route.unloadingPoint,'route-unloading','required')}
        ${field('Loading Weight','loadingWeight',item.loading_weight??item.loadingWeight??linkedTrip?.loading_weight??item.weight??0,'number','step="0.001" required')}
        ${field('Unloading Weight','unloadingWeight',item.unloading_weight??item.unloadingWeight??linkedTrip?.unloading_weight??item.weight??0,'number','step="0.001" required')}
        ${field('Difference','shortage',item.shortage??linkedTrip?.shortage??0,'number','step="0.001" readonly')}
        ${field('Billing Weight','weight',item.weight??item.billingWeight??linkedTrip?.billing_weight??0,'number','step="0.001" required')}
        ${field('Party Rate','rate',item.rate||linkedTrip?.rate||0,'number','step="0.01" required')}
        ${field('Party Amount','amount',Number(item.amount||0).toFixed(2),'number','step="0.01" readonly')}
        <button type="button" class="mini danger v664-remove-trip">Remove</button>

        <div class="v664-line-supplier">
          <div class="v664-line-supplier-title"><b>SUPPLIER / TRUCK MALIK</b><small>આ Truck / Trip માટે અલગ supplier payment details</small></div>
          ${supplierSelectField('Supplier / Truck Malik Name','supplierName',initialSupplier,'required')}
          ${field('Supplier Rate','supplierRate',item.supplier_rate??item.supplierRate??linkedSupplierEntry?.rate??0,'number','step="0.01" required')}
          ${field('Commission','commission',item.commission??linkedSupplierEntry?.commission??0,'number','step="0.01"')}
          ${field('Supplier Advance','supplierAdvance',item.supplier_advance??item.supplierAdvance??existingAdvance,'number','step="0.01"')}
          ${field('Supplier Payable','supplierPayable',0,'number','step="0.01" readonly')}
        </div>`;

      const updateSupplierPayable=()=>{
        const loading=Number(row.querySelector('[name=loadingWeight]').value||0);
        const unloading=Number(row.querySelector('[name=unloadingWeight]').value||0);
        const supplierWeight=unloading||loading;
        const supplierRate=Number(row.querySelector('[name=supplierRate]').value||0);
        const commission=Number(row.querySelector('[name=commission]').value||0);
        row.querySelector('[name=supplierPayable]').value=Math.max(0,supplierWeight*supplierRate-commission).toFixed(2);
      };
      const updateLine=()=>{
        const loading=Number(row.querySelector('[name=loadingWeight]').value||0);
        const unloading=Number(row.querySelector('[name=unloadingWeight]').value||0);
        const shortage=Math.max(0,loading-unloading);
        row.querySelector('[name=shortage]').value=shortage.toFixed(3);
        const weight=Number(row.querySelector('[name=weight]').value||0);
        const rate=Number(row.querySelector('[name=rate]').value||0);
        row.querySelector('[name=amount]').value=(weight*rate).toFixed(2);
        updateSupplierPayable();
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

      lines.appendChild(row);
      wireMasterSelects(row);
      wireSearchableMasterFields(row);

      const truckSelect=row.querySelector('[name=truckNo]');
      const supplierSelect=row.querySelector('[name=supplierName]');
      supplierSelect?.addEventListener('change',()=>supplierSelect.dataset.manual='1');
      const applyTruckSupplier=()=>{
        const truck=d.trucks.find(t=>norm(t.truck_no)===norm(truckSelect.value));
        if(truck?.owner_name && (!supplierSelect.value || supplierSelect.dataset.manual!=='1')){
          addOptionAndSelect(supplierSelect,truck.owner_name);
          supplierSelect.dataset.manual='';
        }
      };
      truckSelect?.addEventListener('input',applyTruckSupplier);
      truckSelect?.addEventListener('change',applyTruckSupplier);

      row.querySelector('.v664-remove-trip').onclick=()=>{row.remove();recalcInvoice()};
      row.querySelector('[name=loadingWeight]').addEventListener('input',autoBilling);
      row.querySelector('[name=unloadingWeight]').addEventListener('input',autoBilling);
      row.querySelector('[name=weight]').addEventListener('input',e=>{e.target.dataset.edited='1';updateLine()});
      row.querySelector('[name=rate]').addEventListener('input',updateLine);
      row.querySelector('[name=supplierRate]').addEventListener('input',updateSupplierPayable);
      row.querySelector('[name=commission]').addEventListener('input',updateSupplierPayable);
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
      const previous=typeInput.value;
      typeInput.value=type;
      host.querySelectorAll('[data-type-choice]').forEach(b=>b.classList.toggle('active',b.dataset.typeChoice===type));
      const nonGst=type==='NON_GST';
      const igst=type==='IGST';
      host.querySelectorAll('.gst-field').forEach(el=>el.style.display=nonGst?'none':'');
      host.querySelector('.sgst-field').style.display=nonGst||igst?'none':'';
      host.querySelector('.cgst-field .field>span').textContent=igst?'IGST %':'CGST %';
      host.querySelectorAll('.gst-summary').forEach(el=>el.style.display=nonGst?'none':'');
      if(nonGst){
        host.querySelector('[name=sgst]').value=0;
        host.querySelector('[name=cgst]').value=0;
        if(forceNumber && (!edit || !numberInput.value || /^ML/i.test(numberInput.value)))numberInput.value=d.nextNonGstInvoiceNo||'JAY 001';
      }else if(igst){
        const combined=Number(host.querySelector('[name=sgst]').value||0)+Number(host.querySelector('[name=cgst]').value||0);
        host.querySelector('[name=sgst]').value=0;
        host.querySelector('[name=cgst]').value=combined||18;
        if(forceNumber && (!edit || !numberInput.value || /^JAY/i.test(numberInput.value)))numberInput.value=d.nextInvoiceNo||'ML - 1';
      }else{
        if(previous==='IGST'&&Number(host.querySelector('[name=sgst]').value||0)===0&&Number(host.querySelector('[name=cgst]').value||0)>0){const half=Number(host.querySelector('[name=cgst]').value||0)/2;host.querySelector('[name=sgst]').value=half;host.querySelector('[name=cgst]').value=half}
        else{if(Number(host.querySelector('[name=sgst]').value||0)===0)host.querySelector('[name=sgst]').value=9;if(Number(host.querySelector('[name=cgst]').value||0)===0)host.querySelector('[name=cgst]').value=9}
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
      addLine({tripId:trip.id,loadingDate:trip.trip_date,lrNumber:trip.lr_number||'',truckNo:trip.truck_no,loadingPoint:trip.loading_point,unloadingPoint:trip.unloading_point,description:`${trip.loading_point} TO ${trip.unloading_point}`,loadingWeight:trip.loading_weight??trip.weight,unloadingWeight:trip.unloading_weight??trip.weight,weight:trip.billing_weight??trip.weight,rate:trip.rate});
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
      e.preventDefault();
      const searchableTruck=[...lines.querySelectorAll('input[name=truckNo][data-searchable-master]')].find(input=>!validateSearchableMaster(input));
      if(searchableTruck){searchableTruck.reportValidity();searchableTruck.focus();return}
      const body=formDataObject(e.target);
      body.items=[...lines.querySelectorAll('.invoice-line')].map(r=>({
        tripId:r.querySelector('[name=tripId]').value,
        loadingDate:r.querySelector('[name=loadingDate]').value,
        lrNumber:r.querySelector('[name=lrNumber]').value,
        truckNo:r.querySelector('[name=truckNo]').value,
        loadingPoint:r.querySelector('[name=loadingPoint]').value,
        unloadingPoint:r.querySelector('[name=unloadingPoint]').value,
        description:`${norm(r.querySelector('[name=loadingPoint]').value)} TO ${norm(r.querySelector('[name=unloadingPoint]').value)}`,
        loadingWeight:r.querySelector('[name=loadingWeight]').value,
        unloadingWeight:r.querySelector('[name=unloadingWeight]').value,
        billingWeight:r.querySelector('[name=weight]').value,
        weight:r.querySelector('[name=weight]').value,
        rate:r.querySelector('[name=rate]').value,
        supplierName:r.querySelector('[name=supplierName]').value,
        supplierRate:r.querySelector('[name=supplierRate]').value,
        commission:r.querySelector('[name=commission]').value,
        supplierAdvance:r.querySelector('[name=supplierAdvance]').value
      }));
      body.loadingDate=body.items[0]?.loadingDate||body.invoiceDate;
      if(await mutate('/invoices'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove();
    };
  }});
}

function partyForm(x={}){
  x=x||{};
  const edit=!!x.id,host=modal(edit?'Edit Party':'New Party',`<form class="form-grid" id="partyForm">
    ${field('Ledger Number (Auto)','ledgerNo',x.ledger_no||'','text','readonly placeholder="Auto MLP"')}
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
  const d=state.data,edit=!!x.id;
  const tripInvoiceId=tripContext?.invoice_id||'';
  const initialParty=norm(x.party_name||tripContext?.party_name||'');
  const initialInvoice=x.invoice_id||tripInvoiceId||'';
  const host=modal(edit?'Edit Party Payment':'Receive Party Payment',`<form class="form-grid" id="partyPayForm">
    ${masterSelectField('Party','partyName',d.parties.map(p=>p.party_name),initialParty,'party','required')}
    <label class="field"><span>Invoice Allocation</span><select name="invoiceId" data-party-invoice><option value="">Party Advance / Auto FIFO</option></select></label>
    ${field('Trip ID','tripId',x.trip_id||tripContext?.id||'','text','readonly')}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="span2 notice" data-party-payment-note>Invoice select karsho to payment exact e invoice sathe link thashe. Blank rakhsho to old pending invoices ma FIFO allocation thashe.</div>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Receipt</button></div></form>`,{small:true,onMount:host=>{
      wireMasterSelects(host);
      const party=host.querySelector('[name=partyName]'),invoice=host.querySelector('[name=invoiceId]');
      const amount=host.querySelector('[name=amount]'),note=host.querySelector('[data-party-payment-note]');
      const refreshInvoices=(preferred='')=>{
        const partyName=norm(party.value);
        const rows=sortInvoicesSeries((d.invoices||[]).filter(i=>accountKey(i.party_name)===accountKey(partyName)),true);
        invoice.innerHTML=`<option value="">Party Advance / Auto FIFO</option>${rows.map(i=>{
          const received=invoiceReceivedAmount(i),pending=invoicePendingAmount(i);
          return `<option value="${esc(i.id)}">${esc(i.invoice_no)} · Pending ${money(pending)}</option>`;
        }).join('')}`;
        if(preferred&&rows.some(i=>String(i.id)===String(preferred)))invoice.value=preferred;
        if(invoice.value){
          const selected=rows.find(i=>String(i.id)===String(invoice.value));
          if(selected&&!edit&&Number(amount.value||0)<=0)amount.value=Math.max(0,Number(selected.total||0)-invoiceReceivedAmount(selected)).toFixed(2);
        }
      };
      party.addEventListener('change',()=>refreshInvoices(''));
      invoice.addEventListener('change',()=>{
        const selected=(d.invoices||[]).find(i=>String(i.id)===String(invoice.value));
        if(selected&&!edit){
          const pending=invoicePendingAmount(selected);
          if(pending>0)amount.value=pending.toFixed(2);
          note.textContent=`${selected.invoice_no} sathe aa receipt exact link thashe. Current pending ${money(pending)}.`;
        }else note.textContent='Blank invoice = Party Advance / Auto FIFO allocation.';
      });
      refreshInvoices(initialInvoice);
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#partyPayForm').onsubmit=async e=>{
        e.preventDefault();
        const body=formDataObject(e.target);
        if(await mutate('/party-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove()
      };
    }});
}
function supplierPaymentForm(x={},tripContext=null){
  x=x||{};
  const d=state.data,edit=!!x.id;
  const initialOwner=norm(x.owner_name||tripContext?.owner_name||'');
  const initialTruck=norm(x.truck_no||tripContext?.truck_no||'');
  const initialTrucks=initialOwner?supplierTruckNumbers(d,initialOwner):[];
  if(initialTruck&&!initialTrucks.includes(initialTruck))initialTrucks.push(initialTruck);
  const host=modal(edit?'Edit Supplier Payment':'Pay Supplier',`<form class="form-grid" id="supplierPayForm">
    ${supplierSelectField('Owner / Supplier','ownerName',initialOwner,'required')}
    ${field('Trip ID','tripId',x.trip_id||tripContext?.id||'','text','readonly')}
    ${masterSelectField('Truck Number','truckNo',initialTrucks,initialTruck,'truck')}
    ${field('Payment Date','paymentDate',x.payment_date||today(),'date','required')}
    ${field('Amount','amount',x.amount||tripContext?.suggestedAmount||0,'number','step="0.01" min="0.01" required')}
    ${selectField('Mode','paymentMode',['CASH','BANK','UPI','CHEQUE'],x.payment_mode||'BANK')}
    ${field('Reference','reference',x.reference||'')}
    ${textarea('Notes','notes',x.notes||'','span2')}
    <div class="span2 notice" data-supplier-truck-note></div>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn green">Save Payment</button></div></form>`,{small:true,onMount:host=>{
      wireMasterSelects(host);
      const truckSelect=host.querySelector('[name=truckNo]'),ownerSelect=host.querySelector('[name=ownerName]');
      const note=host.querySelector('[data-supplier-truck-note]');

      const refreshSupplierTrucks=(preferred='')=>{
        const owner=norm(ownerSelect.value);
        host.dataset.preferredSupplier=owner;
        const linked=owner?supplierTruckNumbers(d,owner):[];
        const keep=norm(preferred||truckSelect.value);
        if(keep&&owner){
          const master=d.trucks.find(t=>norm(t.truck_no)===keep);
          const paymentMatch=(d.supplierPayments||[]).some(p=>norm(p.owner_name)===owner&&norm(p.truck_no)===keep);
          const entryMatch=(d.truckEntries||[]).some(e=>norm(e.owner_name)===owner&&norm(e.truck_no)===keep);
          if((master&&norm(master.owner_name)===owner)||paymentMatch||entryMatch){
            if(!linked.includes(keep))linked.push(keep);
          }
        }
        linked.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));

        truckSelect.innerHTML=`<option value="">${owner?'Select '+owner+' Truck':'Select Supplier First'}</option>
          ${linked.map(no=>`<option value="${esc(no)}">${esc(no)}</option>`).join('')}
          <option value="__ADD_NEW__">＋ New Truck Add</option>`;

        if(keep&&linked.includes(keep))truckSelect.value=keep;
        else truckSelect.value='';

        if(!owner)note.textContent='Pehla Supplier select karo. Pachhi aa Supplier na j Truck Number dropdown ma aavshe.';
        else if(!linked.length)note.textContent=`${owner} sathe haju koi truck linked nathi. "＋ New Truck Add" thi navo truck add kari shako.`;
        else note.textContent=`${owner} na ${linked.length} linked truck j aa dropdown ma batave chhe.`;
      };

      ownerSelect.addEventListener('change',()=>refreshSupplierTrucks(''));
      truckSelect.addEventListener('change',()=>{
        if(truckSelect.value==='__ADD_NEW__')return;
        const truck=norm(truckSelect.value);
        if(!truck)return;
        const owner=norm(ownerSelect.value);
        const valid=supplierTruckNumbers(d,owner).includes(truck)
          ||(d.trucks||[]).some(t=>norm(t.truck_no)===truck&&norm(t.owner_name)===owner);
        if(owner&&!valid){
          alert(`Aa truck ${owner} sathe linked nathi.`);
          refreshSupplierTrucks('');
        }
      });

      refreshSupplierTrucks(initialTruck);
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#supplierPayForm').onsubmit=async e=>{
        e.preventDefault();
        const body=formDataObject(e.target);
        if(!body.ownerName||body.ownerName==='__ADD_NEW__')return alert('Supplier select karo.');
        if(body.truckNo&&body.truckNo==='__ADD_NEW__')return alert('Valid Truck Number select karo.');
        if(await mutate('/supplier-payments'+(edit?'/'+x.id:''),edit?'PUT':'POST',body,e.submitter))host.remove()
      };
    }});
}
function truckForm(x={}){
  x=x||{};
  const d=state.data,edit=!!x.id;
  let activeTruckId=x.id||'';
  const host=modal(edit?'Edit Truck':'Add Truck',`<form class="form-grid" id="truckForm">
    ${newValueSelectField('Truck Number','truckNo',d.trucks.map(t=>t.truck_no),x.truck_no||'','＋ New Truck Add','required')}
    ${supplierSelectField('Owner Name','ownerName',x.owner_name||'','required')}
    ${field('Owner Mobile','ownerMobile',x.owner_mobile||'','tel')}
    ${textarea('Bank Details','bankDetails',x.bank_details||'','span2')}
    <div class="span2 notice">Truck Number ane Owner Name banne dropdown chhe. New Truck Add / New Supplier Add option dropdown ma j chhe.</div>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary" data-save-truck>${edit?'Update Truck':'Save Truck'}</button></div></form>`,{small:true,onMount:host=>{
      wireNewValueSelects(host);wireMasterSelects(host);
      const truckSelect=host.querySelector('[name=truckNo]'),ownerSelect=host.querySelector('[name=ownerName]'),save=host.querySelector('[data-save-truck]');
      truckSelect.addEventListener('change',()=>{
        const t=d.trucks.find(x=>norm(x.truck_no)===norm(truckSelect.value));
        if(t){activeTruckId=t.id;if(t.owner_name)addOptionAndSelect(ownerSelect,t.owner_name);host.querySelector('[name=ownerMobile]').value=t.owner_mobile||'';host.querySelector('[name=bankDetails]').value=t.bank_details||'';save.textContent='Update Truck'}
        else{activeTruckId=x.id||'';save.textContent=activeTruckId?'Update Truck':'Save Truck'}
      });
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#truckForm').onsubmit=async e=>{
        e.preventDefault();const body=formDataObject(e.target);
        if(!body.truckNo||body.truckNo==='__ADD_VALUE__')return alert('Truck Number required.');
        if(!body.ownerName||body.ownerName==='__ADD_NEW__')return alert('Owner / Supplier required.');
        const path='/trucks'+(activeTruckId?'/'+activeTruckId:'');
        if(await mutate(path,activeTruckId?'PUT':'POST',body,e.submitter))host.remove();
      };
    }});
}
function routeForm(x={}){
  x=x||{};
  const edit=!!x.id,host=modal(edit?'Edit Route':'Add Route',`<form class="form-grid" id="routeForm">${field('Loading Point','loadingPoint',x.loading_point||'','text','required')}${field('Unloading Point','unloadingPoint',x.unloading_point||'','text','required')}<div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Save Route</button></div></form>`,{small:true,onMount:host=>{
    const form=host.querySelector('#routeForm');
    host.querySelector('[data-close-form]').onclick=()=>host.remove();form.onsubmit=async e=>{
      e.preventDefault();
      if(form.dataset.saving==='1')return;
      form.dataset.saving='1';
      try{if(await mutate('/routes'+(edit?'/'+x.id:''),edit?'PUT':'POST',formDataObject(e.target),e.submitter))host.remove()}
      finally{delete form.dataset.saving}
    }
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
    <div class="span2 notice">V62 cloud-ready upload: R2 configured hoy to file cloud ma save thase; nahi to current D1 fallback safely use thase.</div>
    <div class="form-actions"><button type="button" class="btn light" data-close-form>Cancel</button><button class="btn primary">Upload Document</button></div></form>`,{onMount:host=>{
      wireMasterSelects(host);
      host.querySelector('[data-close-form]').onclick=()=>host.remove();
      host.querySelector('#documentForm').onsubmit=async e=>{
        e.preventDefault();const btn=e.submitter,file=host.querySelector('#documentFile').files[0];if(!file)return;
        const form=e.target,fd=new FormData();
        fd.append('truckNo',form.truckNo.value);fd.append('kind',form.kind.value);fd.append('expiryDate',form.expiryDate.value||'');
        fd.append('notes',form.notes.value||'');fd.append('fileName',file.name);fd.append('fileType',file.type||'application/octet-stream');fd.append('file',file,file.name);
        try{
          setBusy(btn,true,'Uploading...');
          await api('/documents',{method:'POST',body:fd});
          host.remove();await loadData();
        }catch(err){alert(err.message)}finally{setBusy(btn,false)}
      };
    }});
}
async function viewDocument(id){
  try{
    const d=await api('/documents/'+id);
    const blob=await apiBlob('/document-content/'+id);
    const url=URL.createObjectURL(blob);
    const body=d.file_type==='application/pdf'
      ?`<iframe src="${url}" style="width:100%;height:70vh;border:0"></iframe>`
      :`<img src="${url}" alt="${esc(d.file_name)}" style="max-width:100%;max-height:70vh;border-radius:10px">`;
    const host=modal(`${d.truck_no} · ${d.kind}`,`<div style="text-align:center">${body}<p>${esc(d.file_name)}</p><small>${esc(d.storage_mode||'D1')} · ${Number(d.file_size||blob.size||0).toLocaleString('en-IN')} bytes</small></div>`);
    host.addEventListener('remove',()=>URL.revokeObjectURL(url),{once:true});
    setTimeout(()=>{if(!document.body.contains(host))URL.revokeObjectURL(url)},600000);
  }catch(e){alert(e.message)}
}

function safeFileName(value){return String(value||'LEDGER').replace(/[\\/:*?"<>|]+/g,' ').trim()}
function downloadTextFile(name,text,type='text/csv;charset=utf-8'){
  const blob=new Blob([text],{type});const a=document.createElement('a');
  if(window.TransportNative?.saveBlob){window.TransportNative.saveBlob(blob,name).then(saved=>alert(`Ledger downloaded successfully: ${saved.location}`)).catch(error=>alert(error.message||'Unable to save file.'));return}
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
  const url=`https://wa.me/?text=${encodeURIComponent(message)}`;
  if(window.TransportNative?.openExternal)return window.TransportNative.openExternal(url);
  window.open(url,'_blank');
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
    const summary=state.data.supplierLedger.find(s=>accountKey(s.owner_name)===accountKey(name))||{};
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
  const taxType=invoiceTypeLabel(i);
  const taxRows=taxType==='NON-GST'?'':taxType==='IGST'?`<div><span>IGST ${Number(i.sgst||0)+Number(i.cgst||0)}%</span><b>${money(i.subtotal*(Number(i.sgst||0)+Number(i.cgst||0))/100)}</b></div>`:`<div><span>SGST ${i.sgst}%</span><b>${money(i.subtotal*i.sgst/100)}</b></div><div><span>CGST ${i.cgst}%</span><b>${money(i.subtotal*i.cgst/100)}</b></div>`;
  return `<div class="print-sheet"><div class="invoice-header"><div class="invoice-company"><h1>MEERA LOGISTICS</h1><div>Transport & Logistics Services</div><div>Jamnagar, Gujarat</div></div><div class="invoice-meta"><b>${taxType==='NON-GST'?'NON-GST INVOICE':taxType==='IGST'?'IGST INVOICE':'TAX INVOICE'}</b><div>${esc(i.invoice_no)}</div><div>${esc(i.invoice_date)}</div></div></div>
  <div class="invoice-party"><div><b>Bill To</b><div>${esc(i.party_name)}</div><div>${esc(i.party_address||'')}</div><div>GST: ${esc(i.party_gst||state.data?.parties?.find(p=>accountKey(p.party_name)===accountKey(i.party_name))?.gst_no||'-')}</div></div><div><b>Material:</b> ${esc(i.material||'-')}<br><b>Loading Date:</b> Trip-wise below</div></div>
  ${table(['Trip','Loading Date','LR No','Truck No','Description','Loading Wt.','Unloading Wt.','Difference','Billing Wt.','Rate','Amount'],(i.items||[]).map(x=>{
    const trip=state.data?.trips?.find(t=>String(t.id)===String(x.trip_id));
    return [esc(trip?.trip_no||'-'),esc(trip?.trip_date||i.loading_date||'-'),esc(x.lr_number||'-'),esc(x.truck_no),esc(x.description),number3(x.loading_weight??x.weight),number3(x.unloading_weight??x.weight),number3(x.shortage||0),number3(x.weight),money(x.rate),money(x.amount)];
  }),'1180px')}
  <div class="invoice-total"><div><span>Subtotal</span><b>${money(i.subtotal)}</b></div><div><span>Diesel</span><b>${money(i.diesel)}</b></div><div><span>Munshi</span><b>${money(i.munshi)}</b></div>${taxRows}<div class="grand"><span>Total</span><span>${money(i.total)}</span></div></div><p style="white-space:pre-line">${esc(i.comments||'')}</p></div>`;
}

function shareInvoice(i){
  const text=`Meera Logistics\nInvoice: ${i.invoice_no}\nDate: ${i.invoice_date}\nParty: ${i.party_name}\nTotal: ${money(i.total)}`;
  if(window.TransportNative?.shareText)return window.TransportNative.shareText(`Invoice ${i.invoice_no}`,text);
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
  input.onchange=async()=>{try{
    const file=input.files?.[0];if(!file)return;
    const data=JSON.parse(await file.text());
    const mode=confirm('OK = Replace current business data safely. Cancel = Merge with current data.')?'replace':'merge';
    const result=await api('/import',{method:'POST',body:JSON.stringify({data,mode}),timeoutMs:90000});
    await loadData();
    const warning=(result.warnings||[]).length?`\n\nWarnings:\n${result.warnings.slice(0,6).join('\n')}`:'';
    alert(`Backup restored successfully.\nInvoices: ${result.actual?.invoices||0}\nTrips: ${result.actual?.trips||0}\nSupplier Entries: ${result.actual?.truckEntries||0}${warning}`);
  }catch(e){alert(e.message)}};input.click();
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

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-v50-register-company]');
  if(button){event.preventDefault();openCompanyRegistration()}
});
