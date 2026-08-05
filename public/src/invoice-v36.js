import {api} from './core/api.js';

const CACHE_KEY='ml_bootstrap_cache_v6';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const money=value=>'₹ '+Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const number3=value=>Number(value||0).toFixed(3);
const formatDate=value=>{
  if(!value)return '-';
  const parts=String(value).split('-');
  return parts.length===3?`${parts[2]}-${parts[1]}-${parts[0]}`:String(value);
};
const invoiceType=invoice=>(invoice.invoice_type||'GST')==='NON_GST'?'NON-GST':'GST';

let bootstrapPromise=null;
async function getBootstrap(){
  try{
    const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(cached?.data?.invoices)return cached.data;
  }catch{}
  bootstrapPromise??=api('/bootstrap').finally(()=>{bootstrapPromise=null});
  return bootstrapPromise;
}
async function getInvoice(id){
  const data=await getBootstrap();
  const invoice=(data.invoices||[]).find(item=>String(item.id)===String(id));
  if(!invoice)throw new Error('Invoice not found. Please refresh and retry.');
  return {invoice,data};
}
function tripNumber(data,tripId){
  return (data.trips||[]).find(trip=>String(trip.id)===String(tripId))?.trip_no||'-';
}
function invoiceMarkup(invoice,data){
  const items=invoice.items||[];
  const nonGst=invoiceType(invoice)==='NON-GST';
  const lrNumbers=[...new Set(items.map(item=>String(item.lr_number||'').trim()).filter(Boolean))];
  const loadingTotal=items.reduce((sum,item)=>sum+Number(item.loading_weight??item.weight??0),0);
  const unloadingTotal=items.reduce((sum,item)=>sum+Number(item.unloading_weight??item.weight??0),0);
  const shortageTotal=items.reduce((sum,item)=>sum+Number(item.shortage??Math.max(0,Number(item.loading_weight||0)-Number(item.unloading_weight||0))),0);
  const freightTotal=items.reduce((sum,item)=>sum+Number(item.amount??Number(item.weight||0)*Number(item.rate||0)),0);
  const taxable=Number(invoice.subtotal||0);
  const sgstAmount=nonGst?0:taxable*Number(invoice.sgst||0)/100;
  const cgstAmount=nonGst?0:taxable*Number(invoice.cgst||0)/100;
  const comments=esc(invoice.comments||'').replace(/\\n|\n/g,'<br>');

  return `<article class="v36-invoice">
    <header class="v36-head">
      <img class="v36-logo" src="/assets/meera-logo.png" alt="Meera Logistics logo">
      <div class="v36-company-name">MEERA LOGISTICS</div>
      <div class="v36-title"><b>${esc(invoice.invoice_no)}</b><span>${nonGst?'Non-GST Transport Invoice':'Transport Invoice'}</span></div>
    </header>

    <section class="v36-top-grid">
      <table class="v36-info"><tbody>
        <tr><th>Address</th><td>OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR</td></tr>
        <tr><th>Phone</th><td>9558959579</td></tr>
        <tr><th>Email</th><td><span class="v36-email">meera.logistics99@gmail.com</span></td></tr>
        <tr><th>GST No.</th><td>24ACFFM2544N1Z1</td></tr>
      </tbody></table>

      <table class="v36-summary"><tbody>
        <tr><th>INVOICE DATE</th><td>${esc(formatDate(invoice.invoice_date))}</td></tr>
        <tr><th>LR NO.</th><td>${esc(lrNumbers.join(' / ')||'-')}</td></tr>
        <tr><th>MATERIAL</th><td>${esc(invoice.material||'-')}</td></tr>
        <tr><th>LOADING DATE</th><td>${esc(formatDate(invoice.loading_date||invoice.invoice_date))}</td></tr>
        <tr><th>LOADING WEIGHT</th><td>${number3(loadingTotal)}</td></tr>
        <tr><th>UNLOADING WEIGHT</th><td>${number3(unloadingTotal)}</td></tr>
        <tr><th>SHORTAGE</th><td>${number3(shortageTotal)}</td></tr>
      </tbody></table>
    </section>

    <section class="v36-bill-row">
      <table class="v36-bill"><caption>Bill To</caption><tbody>
        <tr><th>Name</th><td>${esc(invoice.party_name||'-')}</td></tr>
        <tr><th>Company</th><td>${esc(invoice.party_name||'-')}</td></tr>
        <tr><th>Address</th><td>${esc(invoice.party_address||'-')}</td></tr>
        <tr><th>GST No.</th><td>${nonGst?'Not Applicable':esc(invoice.party_gst||'-')}</td></tr>
      </tbody></table>
      <div></div>
    </section>

    <table class="v36-lines">
      <thead><tr>
        <th>SR.</th><th>LR NUMBER</th><th>TRIP NO.</th><th>TRUCK NO.</th><th>DESCRIPTION</th>
        <th>LOADING WT.</th><th>UNLOADING WT.</th><th>DIFF.</th><th>BILLING WT./TON</th><th>RATE PER TONE</th><th>TOTAL</th>
      </tr></thead>
      <tbody>${items.map((item,index)=>`<tr>
        <td>${index+1}</td><td>${esc(item.lr_number||'-')}</td><td>${esc(tripNumber(data,item.trip_id))}</td><td>${esc(item.truck_no||'-')}</td>
        <td>${esc(item.description||'-')}</td><td>${number3(item.loading_weight??item.weight)}</td><td>${number3(item.unloading_weight??item.weight)}</td>
        <td>${number3(item.shortage||0)}</td><td>${number3(item.weight)}</td><td>${money(item.rate)}</td><td>${money(item.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>

    <section class="v36-bottom">
      <div class="v36-comments"><b>Comments</b><div>${comments||'1. Payment due within 30 days.<br>2. Mention invoice number in payment reference.'}</div></div>
      <table class="v36-totals"><tbody>
        <tr><th>Freight Total</th><td>${money(freightTotal)}</td></tr>
        ${Number(invoice.diesel||0)?`<tr><th>Diesel</th><td>${money(invoice.diesel)}</td></tr>`:''}
        ${Number(invoice.munshi||0)?`<tr><th>Munshi Charges</th><td>${money(invoice.munshi)}</td></tr>`:''}
        ${nonGst?'':`<tr><th>SGST ${Number(invoice.sgst||0)}%</th><td>${money(sgstAmount)}</td></tr><tr><th>CGST ${Number(invoice.cgst||0)}%</th><td>${money(cgstAmount)}</td></tr>`}
        <tr class="grand"><th>Grand Total</th><td>${money(invoice.total)}</td></tr>
      </tbody></table>
    </section>

    <footer class="v36-signatures">
      <div><span></span><b>Signature of the Customer</b></div>
      <div><div class="v36-stamp"><strong>MEERA</strong><small>LOGISTICS</small><em>JAMNAGAR</em></div><span></span><b>Signature of the Supplier</b></div>
    </footer>
  </article>`;
}
function closeViewer(){document.querySelector('.v36-viewer-bg')?.remove()}
function openViewer(invoice,data){
  closeViewer();
  const host=document.createElement('div');
  host.className='v36-viewer-bg';
  host.innerHTML=`<div class="v36-viewer"><div class="v36-viewer-head"><b>Invoice ${esc(invoice.invoice_no)}</b><div><button data-v36-edit>Edit</button><button data-v36-print>Download PDF / Print</button><button data-v36-share>WhatsApp</button><button data-v36-close>Close</button></div></div><div class="v36-viewer-body">${invoiceMarkup(invoice,data)}</div></div>`;
  document.body.appendChild(host);
  host.addEventListener('click',event=>{if(event.target===host)closeViewer()});
  host.querySelector('[data-v36-close]').onclick=closeViewer;
  host.querySelector('[data-v36-print]').onclick=()=>printInvoice(invoice,data);
  host.querySelector('[data-v36-share]').onclick=()=>shareInvoice(invoice);
  host.querySelector('[data-v36-edit]').onclick=()=>{
    closeViewer();
    const button=document.createElement('button');
    button.dataset.action='edit-invoice';button.dataset.id=invoice.id;button.hidden=true;
    document.body.appendChild(button);button.click();button.remove();
  };
}
function printInvoice(invoice,data){
  const win=window.open('','_blank','width=1280,height=900');
  if(!win){alert('Please allow pop-ups to print/download invoice.');return}
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.invoice_no)}</title><link rel="stylesheet" href="${location.origin}/src/invoice-v36.css?v=36"></head><body class="v36-print-body">${invoiceMarkup(invoice,data)}<script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`);
  win.document.close();
}
function shareInvoice(invoice){
  const items=invoice.items||[];
  const lrs=[...new Set(items.map(item=>item.lr_number).filter(Boolean))].join(' / ');
  const trucks=items.map(item=>item.truck_no).filter(Boolean).join(', ');
  const text=`🚛 MEERA LOGISTICS\n\nInvoice: ${invoice.invoice_no} (${invoiceType(invoice)})\nDate: ${formatDate(invoice.invoice_date)}\nParty: ${invoice.party_name}\nLR No.: ${lrs||'-'}\nTruck: ${trucks||'-'}\nAmount: ${money(invoice.total)}\n\nInvoice PDF can be attached manually.\nThank you — Meera Logistics`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
}
function exportInvoices(data){
  const rows=[['Invoice No','Type','Invoice Date','Party','Party GST','LR Numbers','Truck Numbers','Material','Loading Weight','Unloading Weight','Shortage','Billing Weight','Freight','Diesel','Munshi','GST Amount','Grand Total']];
  for(const invoice of data.invoices||[]){
    const items=invoice.items||[];
    rows.push([
      invoice.invoice_no,invoiceType(invoice),invoice.invoice_date,invoice.party_name,invoice.party_gst,
      [...new Set(items.map(item=>item.lr_number).filter(Boolean))].join(' / '),items.map(item=>item.truck_no).filter(Boolean).join(' / '),invoice.material,
      items.reduce((sum,item)=>sum+Number(item.loading_weight??item.weight??0),0).toFixed(3),
      items.reduce((sum,item)=>sum+Number(item.unloading_weight??item.weight??0),0).toFixed(3),
      items.reduce((sum,item)=>sum+Number(item.shortage||0),0).toFixed(3),
      items.reduce((sum,item)=>sum+Number(item.weight||0),0).toFixed(3),
      items.reduce((sum,item)=>sum+Number(item.amount||0),0).toFixed(2),invoice.diesel,invoice.munshi,invoice.gst_amount,invoice.total
    ]);
  }
  const csv='\uFEFF'+rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='MEERA LOGISTICS INVOICE HISTORY.csv';link.click();URL.revokeObjectURL(link.href);
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  const action=button.dataset.action;
  if(!['view-invoice','view-linked-invoice','download-invoice','share-invoice','export-invoices'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  try{
    const data=await getBootstrap();
    if(action==='export-invoices'){exportInvoices(data);return}
    const invoice=(data.invoices||[]).find(item=>String(item.id)===String(button.dataset.id));
    if(!invoice)throw new Error('Invoice not found. Please refresh and retry.');
    if(action==='download-invoice'){printInvoice(invoice,data);return}
    if(action==='share-invoice'){shareInvoice(invoice);return}
    openViewer(invoice,data);
  }catch(error){alert(error.message||'Unable to open invoice.')}
},true);
