import {api} from './core/api.js';
import {createInvoicePdfBlob,safeInvoicePdfName} from './invoice-pdf-v39.js';

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

const DEFAULT_COMPANY_SETTINGS={
  companyName:'MEERA LOGISTICS',
  address:'OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR',
  phone:'9558959579',
  email:'meera.logistics99@gmail.com',
  gstNo:'24ACFFM2544N1Z1'
};
function companySettings(data){
  let local={};
  if(window.ML_SETTINGS)local=window.ML_SETTINGS;
  else try{local=JSON.parse(localStorage.getItem('ml_app_settings_v44')||'{}')}catch{}
  const c=data?.saas?.company||{};
  const tenant=c.id?{companyName:c.company_name||'',address:c.address||'',phone:c.mobile||'',email:c.email||'',gstNo:c.gst_no||''}:{};
  return {...DEFAULT_COMPANY_SETTINGS,...local,...tenant};
}


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
  const company=companySettings(data);
  const items=invoice.items||[];
  const nonGst=invoiceType(invoice)==='NON-GST';
  const lrNumbers=[...new Set(items.map(item=>String(item.lr_number||'').trim()).filter(Boolean))];
  if(!lrNumbers.length && String(invoice.lr_no||'').trim())lrNumbers.push(String(invoice.lr_no).trim());
  const rowClass=items.length>14?' v36-very-many-lines':items.length>8?' v36-many-lines':'';
  const loadingTotal=items.reduce((sum,item)=>sum+Number(item.loading_weight??item.weight??0),0);
  const unloadingTotal=items.reduce((sum,item)=>sum+Number(item.unloading_weight??item.weight??0),0);
  const shortageTotal=items.reduce((sum,item)=>sum+Number(item.shortage??Math.max(0,Number(item.loading_weight||0)-Number(item.unloading_weight||0))),0);
  const freightTotal=items.reduce((sum,item)=>sum+Number(item.amount??Number(item.weight||0)*Number(item.rate||0)),0);
  const taxable=Number(invoice.subtotal||0);
  const sgstAmount=nonGst?0:taxable*Number(invoice.sgst||0)/100;
  const cgstAmount=nonGst?0:taxable*Number(invoice.cgst||0)/100;
  const comments=esc(invoice.comments||'').replace(/\\n|\n/g,'<br>');
  const partyGst=invoice.party_gst||(data.parties||[]).find(p=>String(p.party_name||'').trim().toUpperCase()===String(invoice.party_name||'').trim().toUpperCase())?.gst_no||'-';

  return `<article class="v36-invoice${rowClass}">
    <header class="v36-head">
      <img class="v36-logo" src="/assets/meera-logo.png" alt="Meera Logistics logo">
      <div class="v36-company-name">${esc(company.companyName)}</div>
      <div class="v36-title"><b>${esc(invoice.invoice_no)}</b><span>${nonGst?'Non-GST Transport Invoice':'Transport Invoice'}</span></div>
    </header>

    <section class="v36-top-grid">
      <table class="v36-info"><tbody>
        <tr><th>Address</th><td>${esc(company.address)}</td></tr>
        <tr><th>Phone</th><td>${esc(company.phone)}</td></tr>
        <tr><th>Email</th><td><span class="v36-email">${esc(company.email)}</span></td></tr>
        <tr><th>GST No.</th><td>${esc(company.gstNo)}</td></tr>
      </tbody></table>

      <table class="v36-summary"><tbody>
        <tr><th>INVOICE DATE</th><td>${esc(formatDate(invoice.invoice_date))}</td></tr>
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
        <tr><th>GST No.</th><td>${esc(partyGst)}</td></tr>
      </tbody></table>
      <div></div>
    </section>

    <table class="v36-lines">
      <thead><tr>
        <th>SR.</th><th>LR NO.</th><th>TRUCK NO.</th><th>DESCRIPTION</th><th>LOADING WT.</th>
        <th>UNLOADING WT.</th><th>DIFF.</th><th>WEIGHT / TON</th><th>RATE PER TON</th><th>TOTAL</th>
      </tr></thead>
      <tbody>${items.map((item,index)=>`<tr>
        <td>${index+1}</td><td>${esc(item.lr_number||invoice.lr_no||'-')}</td><td>${esc(item.truck_no||'-')}</td><td>${esc(item.description||'-')}</td>
        <td>${number3(item.loading_weight??item.weight)}</td><td>${number3(item.unloading_weight??item.weight)}</td>
        <td>${number3(item.shortage??Math.max(0,Number(item.loading_weight||0)-Number(item.unloading_weight||0)))}</td>
        <td>${number3(item.weight)}</td><td>${money(item.rate)}</td><td>${money(item.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>

    <section class="v36-bottom">
      <div class="v36-comments"><b>Comments</b><div>${comments||'1. Payment due within 30 days.<br>2. Mention invoice number in payment reference.'}</div></div>
      <table class="v36-totals"><tbody>
        <tr><th>Total</th><td>${money(freightTotal)}</td></tr>
        ${nonGst?'':`<tr><th>SGST ${Number(invoice.sgst||0)}%</th><td>${money(sgstAmount)}</td></tr><tr><th>CGST ${Number(invoice.cgst||0)}%</th><td>${money(cgstAmount)}</td></tr>`}
        <tr><th>Diesel</th><td>${money(invoice.diesel||0)}</td></tr>
        <tr><th>Munshi Charges</th><td>${money(invoice.munshi||0)}</td></tr>
        <tr class="grand"><th>Total</th><td>${money(invoice.total)}</td></tr>
      </tbody></table>
    </section>

    <footer class="v36-signatures">
      <div><span></span><b>Signature of the Customer</b></div>
      <div><img class="v36-partner-stamp" src="/assets/meera-partner-stamp.png" alt="Meera Logistics partner stamp and signature"><span></span><b>Signature of the Supplier</b></div>
    </footer>
  </article>`;
}
function closeViewer(){document.querySelector('.v36-viewer-bg')?.remove()}
async function openViewer(invoice,data){
  closeViewer();
  const host=document.createElement('div');
  host.className='v36-viewer-bg';
  host.innerHTML=`<div class="v36-viewer v50-pdf-viewer">
    <div class="v36-viewer-head"><b>Invoice ${esc(invoice.invoice_no)}</b><div>
      <button data-v36-edit>Edit</button><button data-v36-print>Print</button>
      <button data-v36-download>Download</button><button data-v36-share>WhatsApp</button><button data-v36-close>Close</button>
    </div></div>
    <div class="v36-viewer-body v50-pdf-body"><div class="v50-pdf-loading">Preparing exact invoice preview…</div></div>
  </div>`;
  document.body.appendChild(host);
  host.addEventListener('click',event=>{if(event.target===host)closeViewer()});
  host.querySelector('[data-v36-close]').onclick=closeViewer;

  let previewUrl='';
  try{
    const blob=await createInvoicePdfBlob(invoice,data);
    previewUrl=URL.createObjectURL(blob);
    const body=host.querySelector('.v50-pdf-body');
    body.innerHTML=`<iframe class="v50-invoice-pdf-frame" title="Invoice ${esc(invoice.invoice_no)} PDF preview"></iframe>`;
    body.querySelector('iframe').src=previewUrl;
    host.dataset.previewUrl=previewUrl;
  }catch(error){
    host.querySelector('.v50-pdf-body').innerHTML=`<div class="v50-pdf-fallback"><b>PDF preview could not load.</b><p>${esc(error.message||'Preview error')}</p>${invoiceMarkup(invoice,data)}</div>`;
  }

  const release=()=>{const url=host.dataset.previewUrl;if(url)URL.revokeObjectURL(url)};
  host.querySelector('[data-v36-close]').addEventListener('click',release,{once:true});

  host.querySelector('[data-v36-print]').onclick=async()=>{
    try{
      if(!host.dataset.previewUrl){
        const blob=await createInvoicePdfBlob(invoice,data);host.dataset.previewUrl=URL.createObjectURL(blob);
      }
      const win=window.open(host.dataset.previewUrl,'_blank');
      if(!win)throw new Error('Please allow pop-ups to print the PDF.');
      setTimeout(()=>{try{win.print()}catch{}},800);
    }catch(error){alert(error.message||'Unable to print invoice PDF.')}
  };
  host.querySelector('[data-v36-download]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Downloading...';
    try{await downloadInvoice(invoice,data)}catch(error){alert(error.message||'Unable to download invoice.')}
    finally{button.disabled=false;button.textContent='Download'}
  };
  host.querySelector('[data-v36-share]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Preparing PDF...';
    try{await shareInvoice(invoice,data)}catch(error){alert(error.message||'Unable to share invoice PDF.')}
    finally{button.disabled=false;button.textContent='WhatsApp'}
  };
  host.querySelector('[data-v36-edit]').onclick=()=>{
    release();closeViewer();
    const button=document.createElement('button');
    button.dataset.action='edit-invoice';button.dataset.id=invoice.id;button.hidden=true;
    document.body.appendChild(button);button.click();button.remove();
  };
}
function printInvoice(invoice,data){
  const win=window.open('','_blank','width=1280,height=900');
  if(!win){alert('Please allow pop-ups to print the invoice.');return}
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.invoice_no)}</title><link rel="stylesheet" href="${location.origin}/src/invoice-v36.css?v=39"></head><body class="v36-print-body">${invoiceMarkup(invoice,data)}<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  win.document.close();
}
function saveBlob(blob,fileName){
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);link.download=fileName;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1500);
}
async function downloadInvoice(invoice,data){
  const blob=await createInvoicePdfBlob(invoice,data);
  saveBlob(blob,safeInvoicePdfName(invoice));
}
function invoiceShareText(invoice,data){
  const company=companySettings(data);
  const items=invoice.items||[];
  const lrs=[...new Set(items.map(item=>item.lr_number).filter(Boolean))].join(' / ');
  const trucks=items.map(item=>item.truck_no).filter(Boolean).join(', ');
  return `${company.companyName}\nInvoice: ${invoice.invoice_no} (${invoiceType(invoice)})\nDate: ${formatDate(invoice.invoice_date)}\nParty: ${invoice.party_name}\nLR No.: ${lrs||'-'}\nTruck: ${trucks||'-'}\nAmount: ${money(invoice.total)}`;
}
async function shareInvoice(invoice,data){
  const blob=await createInvoicePdfBlob(invoice,data);
  const fileName=safeInvoicePdfName(invoice);
  const file=new File([blob],fileName,{type:'application/pdf',lastModified:Date.now()});
  const shareData={title:`Invoice ${invoice.invoice_no}`,text:invoiceShareText(invoice,data),files:[file]};
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share(shareData);return}
    catch(error){if(error?.name==='AbortError')return}
  }
  saveBlob(blob,fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(invoiceShareText(invoice,data))}`,'_blank');
  alert(`PDF downloaded as "${fileName}". Attach this PDF in WhatsApp.`);
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
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${safeInvoicePdfName({invoice_no:companySettings(data).companyName,party_name:'INVOICE HISTORY'}).replace(/\.pdf$/i,'')}.csv`;link.click();URL.revokeObjectURL(link.href);
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  const action=button.dataset.action;
  if(!['view-invoice','view-linked-invoice','print-invoice','download-invoice','share-invoice','export-invoices'].includes(action))return;
  event.preventDefault();event.stopImmediatePropagation();
  try{
    const data=await getBootstrap();
    if(action==='export-invoices'){exportInvoices(data);return}
    const invoice=(data.invoices||[]).find(item=>String(item.id)===String(button.dataset.id));
    if(!invoice)throw new Error('Invoice not found. Please refresh and retry.');
    if(action==='print-invoice'){printInvoice(invoice,data);return}
    if(action==='download-invoice'){await downloadInvoice(invoice,data);return}
    if(action==='share-invoice'){await shareInvoice(invoice,data);return}
    await openViewer(invoice,data);
  }catch(error){alert(error.message||'Unable to open invoice.')}
},true);
