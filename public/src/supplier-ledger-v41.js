import {api} from './core/api.js';
import {buildSupplierLedgerModel,createSupplierLedgerPdfBlob,supplierLedgerPdfName} from './supplier-ledger-pdf-v41.js';

const CACHE_KEY='ml_bootstrap_cache_v6';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const amount=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
const amount2=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const number3=value=>Number(value||0).toFixed(3);
const safeDecode=value=>{try{return decodeURIComponent(String(value||''))}catch{return String(value||'')}};
const formatDate=value=>String(value||'-').slice(0,10);

let activeOverlay=null;
let bootstrapPromise=null;
function closeLedger(){activeOverlay?.remove();activeOverlay=null}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function getBootstrap(){
  try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(cached?.data?.supplierLedger)return cached.data}catch{}
  bootstrapPromise??=api('/bootstrap').finally(()=>{bootstrapPromise=null});
  return bootstrapPromise;
}
async function loadSupplierLedger(name){
  const [payload,bootstrap]=await Promise.all([api('/supplier-ledger/'+encodeURIComponent(name)),getBootstrap()]);
  return {payload,bootstrap};
}
function ledgerSheet(payload,name,bootstrap){
  const model=buildSupplierLedgerModel(payload,name,bootstrap);
  const rows=model.rows.length?model.rows.map((row,index)=>`<tr>
    <td>${index+1}</td><td>${esc(row.lrNumber||'-')}</td><td>${esc(formatDate(row.tripDate))}</td><td class="sl41-truck-owner"><b>${esc(row.truckNo||'-')}</b><small>${esc(row.supplierName||model.ownerName)}</small></td>
    <td>${esc(row.route||'-')}</td><td>${esc(row.material||'-')}</td><td>${esc(row.rateText||'-')}</td>
    <td class="sl41-money">Rs. ${amount(Math.round(row.hireCost))}</td><td class="sl41-money">Rs. ${amount(Math.round(row.advance))}</td>
    <td class="sl41-money">Rs. ${amount(Math.round(row.charges))}</td><td class="sl41-money">Rs. ${amount(Math.round(row.deduction))}</td>
    <td class="sl41-money">Rs. ${amount(Math.round(row.payments))}</td><td class="sl41-money"><b>Rs. ${amount(Math.round(row.totalDue))}</b></td>
  </tr>`).join(''):`<tr><td colspan="13" class="sl41-empty">No supplier ledger transactions found.</td></tr>`;
  return `<article class="sl41-sheet">
    <header class="sl41-head">
      <div></div><div class="sl41-title"><h1>MEERA LOGISTICS</h1><p>Supplier Ledger Details as on ${esc(model.asOn)}</p></div>
      <div class="sl41-supplier">${esc(model.ledgerNo?model.ledgerNo+' · '+model.ownerName:model.ownerName)}</div>
    </header>
    <div class="sl41-rule"></div>
    <div class="sl41-summary"><div><b>Total Due :</b><small>${model.truckNumbers.length?` Trucks: ${esc(model.truckNumbers.join(' · '))}`:' No Truck Master linked'}</small></div><strong>${model.tripCount} Trips${model.pmBillCount?` + ${model.pmBillCount} PM Bills`:''} &nbsp;|&nbsp; Rs. ${amount(Math.round(model.totalDue))}</strong></div>
    <div class="sl41-table-wrap"><table class="sl41-table"><thead><tr>
      <th>S.No.</th><th>LR Number</th><th>Trip Date</th><th>Truck No / Supplier</th><th>Route</th><th>Material</th><th>Rate</th>
      <th>Truck Hire Cost</th><th>Advance</th><th>Charges</th><th>Deduction</th><th>Payments</th><th>Total Due</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <footer><span>Page 1</span><span>Automatically generated supplier ledger - Meera Logistics</span><span></span></footer>
  </article>`;
}
async function downloadLedger(name,button=null){
  const old=button?.textContent;if(button){button.disabled=true;button.textContent='Preparing...'}
  try{
    const {payload,bootstrap}=await loadSupplierLedger(name);
    downloadBlob(createSupplierLedgerPdfBlob(payload,name,bootstrap),supplierLedgerPdfName(payload,name,bootstrap));
  }catch(error){alert(error.message||'Unable to download Supplier Ledger.')}
  finally{if(button){button.disabled=false;button.textContent=old||'Download'}}
}
async function viewLedger(name){
  closeLedger();
  const overlay=document.createElement('div');overlay.className='sl41-overlay';
  overlay.innerHTML=`<div class="sl41-modal"><div class="sl41-modal-head"><b>Supplier Ledger · ${esc(name)}</b><div><button class="sl41-download-head">Download</button><button class="sl41-close">Close</button></div></div><div class="sl41-modal-body"><div class="sl41-loading">Loading supplier ledger…</div></div></div>`;
  document.body.appendChild(overlay);activeOverlay=overlay;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeLedger()});overlay.querySelector('.sl41-close').onclick=closeLedger;
  try{
    const {payload,bootstrap}=await loadSupplierLedger(name);
    overlay.querySelector('.sl41-modal-body').innerHTML=ledgerSheet(payload,name,bootstrap);
    overlay.querySelector('.sl41-download-head').onclick=event=>downloadLedger(name,event.currentTarget);
  }catch(error){overlay.querySelector('.sl41-modal-body').innerHTML=`<div class="sl41-error">${esc(error.message||'Unable to load Supplier Ledger.')}</div>`}
}
function decorateSupplierCards(){
  document.querySelectorAll('button.ledger-row[data-action="view-supplier-ledger"]').forEach(button=>{
    if(button.closest('.sl41-card'))return;
    const encoded=button.dataset.id||'';
    const card=document.createElement('div');card.className='sl41-card';
    const head=button.cloneNode(true);head.classList.add('sl41-card-head');head.removeAttribute('data-action');head.dataset.sl41View=encoded;
    const actions=document.createElement('div');actions.className='sl41-card-actions';
    actions.innerHTML=`<button type="button" class="sl41-view-btn" data-sl41-view="${esc(encoded)}">Ledger View</button><button type="button" class="sl41-download-btn" data-sl41-download="${esc(encoded)}">Download</button>`;
    card.append(head,actions);button.replaceWith(card);
  });
}
let queued=false;
function queueDecorate(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateSupplierCards()})}
new MutationObserver(queueDecorate).observe(document.body,{childList:true,subtree:true});queueDecorate();

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-sl41-view],[data-sl41-download],button[data-action="view-supplier-ledger"]');
  if(!target)return;
  const encoded=target.dataset.sl41View||target.dataset.sl41Download||target.dataset.id||'';
  const name=safeDecode(encoded);if(!name)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(target.hasAttribute('data-sl41-download'))downloadLedger(name,target);else viewLedger(name);
},true);
