import {api} from './core/api.js';
import {buildPartyLedgerModel,createPartyLedgerPdfBlob,partyLedgerPdfName} from './party-ledger-pdf-v40.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const amount=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const safeDecode=value=>{try{return decodeURIComponent(String(value||''))}catch{return String(value||'')}};
const formatDate=value=>{
  if(!value)return '-';
  const [year,month,day]=String(value).slice(0,10).split('-').map(Number);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return year&&month&&day?`${String(day).padStart(2,'0')} ${months[month-1]} ${String(year).slice(-2)}`:String(value);
};
const balanceText=value=>`${amount(Math.abs(Number(value||0)))} ${Number(value||0)<0?'Dr':'Cr'}`;

let activeOverlay=null;
function closeLedger(){activeOverlay?.remove();activeOverlay=null}
async function downloadBlob(blob,name){
  if(window.TransportNative?.saveBlob){const saved=await window.TransportNative.saveBlob(blob,name);alert(`Ledger downloaded successfully: ${saved.location}`);return}
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function loadLedger(name){return api('/party-ledger/'+encodeURIComponent(name))}

function ledgerSheet(payload,name){
  const model=buildPartyLedgerModel(payload,name);
  const range=model.fromDate?`${formatDate(model.fromDate)} To ${formatDate(model.toDate)}`:'No Transactions';
  const body=model.rows.length?model.rows.map(row=>`<tr>
    <td>${esc(formatDate(row.date))}</td>
    <td class="pl40-left">${esc(row.particulars)}</td>
    <td>${esc(row.vchType)}</td>
    <td>${esc(row.vchRef)}</td>
    <td>${esc(row.vchNo)}</td>
    <td class="pl40-money">${row.debit?amount(row.debit):'-'}</td>
    <td class="pl40-money">${row.credit?amount(row.credit):'-'}</td>
    <td class="pl40-money">${balanceText(row.balance)}</td>
  </tr>`).join(''):`<tr><td colspan="8" class="pl40-empty">No ledger transactions found.</td></tr>`;
  return `<article class="pl40-sheet">
    <header class="pl40-ledger-head">
      <h1>${esc(model.partyName)}</h1>
      ${model.address?`<p>${esc(model.address)}</p>`:''}
      <p class="pl40-gst">GST NO.: ${esc(model.gstNo||'-')}</p>
      <h2>Meera Logistics</h2>
      <h3>Ledger Account</h3>
      <p>Shop No-101, Momai Complex<br>Bedi Bandar Road, Jamnagar</p>
      <p class="pl40-range">${esc(range)}</p>
    </header>
    <div class="pl40-page">Page 1</div>
    <div class="pl40-table-wrap"><table class="pl40-table">
      <thead><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th>Vch Ref.</th><th>Vch No.</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th colspan="5">Closing Balance</th><th class="pl40-money">${amount(model.debitTotal)}</th><th class="pl40-money">${amount(model.creditTotal)}</th><th class="pl40-money">${balanceText(model.closing)}</th></tr></tfoot>
    </table></div>
  </article>`;
}

async function downloadLedger(name,button=null){
  const old=button?.textContent;
  if(button){button.disabled=true;button.textContent='Preparing...'}
  try{
    const payload=await loadLedger(name);
    const blob=createPartyLedgerPdfBlob(payload,name);
    await downloadBlob(blob,partyLedgerPdfName(payload,name));
  }catch(error){alert(error.message||'Unable to download Party Ledger.')}
  finally{if(button){button.disabled=false;button.textContent=old||'Download'}}
}

async function viewLedger(name){
  closeLedger();
  const overlay=document.createElement('div');
  overlay.className='pl40-overlay';
  overlay.innerHTML=`<div class="pl40-modal"><div class="pl40-modal-head"><b>Party Ledger · ${esc(name)}</b><div><button class="pl40-download-head">Download</button><button class="pl40-close">Close</button></div></div><div class="pl40-modal-body"><div class="pl40-loading">Loading ledger…</div></div></div>`;
  document.body.appendChild(overlay);activeOverlay=overlay;
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeLedger()});
  overlay.querySelector('.pl40-close').onclick=closeLedger;
  try{
    const payload=await loadLedger(name);
    overlay.querySelector('.pl40-modal-body').innerHTML=ledgerSheet(payload,name);
    overlay.querySelector('.pl40-download-head').onclick=event=>downloadLedger(name,event.currentTarget);
  }catch(error){overlay.querySelector('.pl40-modal-body').innerHTML=`<div class="pl40-error">${esc(error.message||'Unable to load Party Ledger.')}</div>`}
}

function decoratePartyCards(){
  document.querySelectorAll('.party-account-card').forEach(card=>{
    if(card.dataset.pl40Decorated==='1')return;
    const title=card.querySelector('[data-action="view-party-ledger"]');
    if(!title)return;
    const encoded=title.dataset.id||'';
    const actions=document.createElement('div');
    actions.className='pl40-card-actions';
    actions.innerHTML=`<button type="button" class="pl40-view-btn" data-pl40-view="${esc(encoded)}">Ledger View</button><button type="button" class="pl40-download-btn" data-pl40-download="${esc(encoded)}">Download</button>`;
    const head=card.querySelector('.party-account-head');
    if(head)head.insertAdjacentElement('afterend',actions);else card.prepend(actions);
    card.dataset.pl40Decorated='1';
  });
}

let decorateQueued=false;
function queueDecorate(){
  if(decorateQueued)return;decorateQueued=true;
  requestAnimationFrame(()=>{decorateQueued=false;decoratePartyCards()});
}
new MutationObserver(queueDecorate).observe(document.body,{childList:true,subtree:true});
queueDecorate();

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-pl40-view],[data-pl40-download],[data-action="view-party-ledger"]');
  if(!target)return;
  const encoded=target.dataset.pl40View||target.dataset.pl40Download||target.dataset.id||'';
  const name=safeDecode(encoded);
  if(!name)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(target.hasAttribute('data-pl40-download'))downloadLedger(name,target);
  else viewLedger(name);
},true);
