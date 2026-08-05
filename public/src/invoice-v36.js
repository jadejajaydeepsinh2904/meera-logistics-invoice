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

  return `<article class="v36-invoice${rowClass}">
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
        <th>SR.</th><th>TRUCK NO.</th><th>DESCRIPTION</th><th>LOADING WT.</th>
        <th>UNLOADING WT.</th><th>DIFF.</th><th>WEIGHT / TON</th><th>RATE PER TONE</th><th>TOTAL</th>
      </tr></thead>
      <tbody>${items.map((item,index)=>`<tr>
        <td>${index+1}</td><td>${esc(item.truck_no||'-')}</td><td>${esc(item.description||'-')}</td>
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
function openViewer(invoice,data){
  closeViewer();
  const host=document.createElement('div');
  host.className='v36-viewer-bg';
  host.innerHTML=`<div class="v36-viewer"><div class="v36-viewer-head"><b>Invoice ${esc(invoice.invoice_no)}</b><div><button data-v36-edit>Edit</button><button data-v36-print>Download</button><button data-v36-share>WhatsApp</button><button data-v36-close>Close</button></div></div><div class="v36-viewer-body">${invoiceMarkup(invoice,data)}</div></div>`;
  document.body.appendChild(host);
  host.addEventListener('click',event=>{if(event.target===host)closeViewer()});
  host.querySelector('[data-v36-close]').onclick=closeViewer;
  host.querySelector('[data-v36-print]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Downloading...';try{await downloadInvoice(invoice,data)}catch(error){alert(error.message||'Unable to download invoice.')}finally{button.disabled=false;button.textContent='Download'}};
  host.querySelector('[data-v36-share]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Preparing PDF...';try{await shareInvoice(invoice,data)}catch(error){alert(error.message||'Unable to share invoice PDF.')}finally{button.disabled=false;button.textContent='WhatsApp'}};
  host.querySelector('[data-v36-edit]').onclick=()=>{
    closeViewer();
    const button=document.createElement('button');
    button.dataset.action='edit-invoice';button.dataset.id=invoice.id;button.hidden=true;
    document.body.appendChild(button);button.click();button.remove();
  };
}
const pdfLibraryState={promise:null};
function loadScriptFrom(url){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(script=>script.src===url);
    if(existing){
      if(existing.dataset.loaded==='1'){resolve();return}
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=url;script.async=true;script.crossOrigin='anonymous';
    script.onload=()=>{script.dataset.loaded='1';resolve()};
    script.onerror=()=>reject(new Error(`Unable to load PDF library: ${url}`));
    document.head.appendChild(script);
  });
}
async function loadWithFallback(urls,ready){
  if(ready())return;
  let lastError=null;
  for(const url of urls){
    try{await loadScriptFrom(url);if(ready())return}catch(error){lastError=error}
  }
  throw lastError||new Error('PDF library could not be loaded.');
}
async function ensurePdfLibraries(){
  if(window.html2canvas&&window.jspdf?.jsPDF)return;
  pdfLibraryState.promise??=(async()=>{
    await loadWithFallback([
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
    ],()=>typeof window.html2canvas==='function');
    await loadWithFallback([
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ],()=>Boolean(window.jspdf?.jsPDF));
  })().finally(()=>{pdfLibraryState.promise=null});
  await pdfLibraryState.promise;
}
function safeFilePart(value){
  return String(value||'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
}
function invoicePdfName(invoice){
  const number=safeFilePart(invoice.invoice_no||'INVOICE');
  const party=safeFilePart(invoice.party_name||'PARTY');
  return `${number} - ${party}.pdf`;
}
function waitForImages(host){
  return Promise.all([...host.querySelectorAll('img')].map(image=>{
    if(image.complete)return Promise.resolve();
    return new Promise(resolve=>{
      image.addEventListener('load',resolve,{once:true});
      image.addEventListener('error',resolve,{once:true});
    });
  }));
}
async function createInvoicePdfBlob(invoice,data){
  await ensurePdfLibraries();
  const stage=document.createElement('div');
  stage.className='v36-pdf-stage';
  stage.innerHTML=invoiceMarkup(invoice,data);
  document.body.appendChild(stage);
  try{
    const invoiceNode=stage.querySelector('.v36-invoice');
    if(!invoiceNode)throw new Error('Invoice layout could not be prepared.');
    await document.fonts?.ready;
    await waitForImages(stage);
    const canvas=await window.html2canvas(invoiceNode,{
      scale:2,
      useCORS:true,
      allowTaint:false,
      backgroundColor:'#ffffff',
      logging:false,
      imageTimeout:15000,
      windowWidth:1122,
      windowHeight:794
    });
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    const width=pdf.internal.pageSize.getWidth();
    const height=pdf.internal.pageSize.getHeight();
    pdf.addImage(canvas.toDataURL('image/jpeg',0.96),'JPEG',0,0,width,height,undefined,'FAST');
    return pdf.output('blob');
  }finally{stage.remove()}
}
function saveBlob(blob,fileName){
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);link.download=fileName;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1500);
}
async function downloadInvoice(invoice,data){
  const blob=await createInvoicePdfBlob(invoice,data);
  saveBlob(blob,invoicePdfName(invoice));
}
function invoiceShareText(invoice){
  const items=invoice.items||[];
  const lrs=[...new Set(items.map(item=>item.lr_number).filter(Boolean))].join(' / ');
  const trucks=items.map(item=>item.truck_no).filter(Boolean).join(', ');
  return `MEERA LOGISTICS\nInvoice: ${invoice.invoice_no} (${invoiceType(invoice)})\nDate: ${formatDate(invoice.invoice_date)}\nParty: ${invoice.party_name}\nLR No.: ${lrs||'-'}\nTruck: ${trucks||'-'}\nAmount: ${money(invoice.total)}`;
}
async function shareInvoice(invoice,data){
  const blob=await createInvoicePdfBlob(invoice,data);
  const fileName=invoicePdfName(invoice);
  const file=new File([blob],fileName,{type:'application/pdf',lastModified:Date.now()});
  const shareData={
    title:`Invoice ${invoice.invoice_no}`,
    text:invoiceShareText(invoice),
    files:[file]
  };
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share(shareData);return}
    catch(error){if(error?.name==='AbortError')return}
  }
  // Desktop browsers/WhatsApp Web cannot accept a file attachment directly from wa.me.
  // Download the correctly named PDF and open WhatsApp with the invoice message as fallback.
  saveBlob(blob,fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(invoiceShareText(invoice))}`,'_blank');
  alert(`PDF downloaded as "${fileName}". Attach this downloaded PDF in WhatsApp.`);
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
    if(action==='download-invoice'){await downloadInvoice(invoice,data);return}
    if(action==='share-invoice'){await shareInvoice(invoice,data);return}
    openViewer(invoice,data);
  }catch(error){alert(error.message||'Unable to open invoice.')}
},true);
