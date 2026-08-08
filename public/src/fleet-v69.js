import {api} from './core/api.js';
import {parseWorkbookSheets,buildImportedInvoices} from './invoice-import-v691.js?v=691';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const norm=value=>String(value??'').trim().replace(/\s+/g,' ').toUpperCase();
const accountKey=value=>norm(value).replace(/[^A-Z0-9]/g,'');
const money=value=>'₹'+Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
const data=()=>window.ML_APP_DATA||{};
const safeName=value=>String(value||'TRANSPORT ERP').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const translate=value=>window.TransportLanguage?.text?.(value)||value;

const EXPENSE_TYPES=[
  'DRIVER BHATTA','DRIVER PAYMENT','LOADING CHARGES','UNLOADING CHARGES','DETENTION CHARGES',
  'UNION CHARGES','TOLL EXPENSE','POLICE EXPENSE','RTO EXPENSE','BROKERAGE EXPENSE','FUEL EXPENSE',
  'SHOWROOM SERVICE','REGULAR SERVICE','MINOR REPAIR','GEAR MAINTENANCE','BRAKE OIL CHANGE',
  'GREASE OIL CHANGE','ENGINE OIL CHANGE','SPARE PARTS PURCHASE','AIR FILTER CHANGE','OTHER EXPENSE'
];

function driverBalance(driverId,source=data()){
  return (source.driverEntries||[]).filter(x=>String(x.driver_id)===String(driverId)).reduce((sum,row)=>
    sum+(norm(row.direction)==='GOT'?-Number(row.amount||0):Number(row.amount||0)),0);
}
function truckExpenseTotal(truckNo,source=data(),month=''){
  return (source.truckExpenses||[]).filter(x=>norm(x.truck_no)===norm(truckNo)&&(!month||String(x.expense_date||'').slice(0,7)===month)).reduce((sum,row)=>sum+Number(row.amount||0),0);
}
function initials(value){return norm(value).split(/\s+/).map(x=>x[0]).join('').slice(0,2)||'DR'}

export function renderV69Panel(panel,source){
  if(panel==='drivers')return driversPanel(source);
  if(panel==='myTrucks')return myTrucksPanel(source);
  if(panel==='truckExpenses')return truckExpensesPanel(source);
  if(panel==='invoiceImport')return invoiceImportPanel(source);
  return '';
}

function driversPanel(source){
  const drivers=source.drivers||[];
  const total=drivers.reduce((sum,row)=>sum+driverBalance(row.id,source),0);
  return `<section class="panel active v69-page" data-v69-panel="drivers">
    <div class="v69-summary-card"><small>Total Driver Balance</small><b>${money(total)}</b><span>${drivers.length} Drivers</span></div>
    <div class="card v69-list-card">
      <div class="section-title"><div><h2>Driver Khata</h2><small>Driver Gave / Driver Got balance register</small></div><button class="btn primary" data-v69-action="add-driver">＋ Add Driver</button></div>
      <label class="v69-search"><span>⌕</span><input type="search" placeholder="Search by Driver Name" data-v69-filter-input="drivers"></label>
      <div class="v69-driver-list" data-v69-filter-list="drivers">${drivers.length?drivers.map(driver=>{
        const balance=driverBalance(driver.id,source);
        return `<article data-v69-filter-value="${esc(`${driver.driver_name} ${driver.mobile} ${driver.license_no}`.toLowerCase())}">
          <button class="v69-list-main" data-v69-action="open-driver" data-id="${esc(driver.id)}"><span class="v69-avatar">${esc(initials(driver.driver_name))}</span><span><b>${esc(driver.driver_name)}</b><small>${esc(driver.mobile||'No mobile')} · ${esc(driver.license_no||'No licence number')}</small></span></button>
          <strong class="${balance<0?'negative':''}">${money(balance)}</strong>
          <button class="mini" data-v69-action="edit-driver" data-id="${esc(driver.id)}">Edit</button>
        </article>`;
      }).join(''):'<div class="notice">No drivers added yet.</div>'}</div>
    </div>
  </section>`;
}

function myTrucksPanel(source){
  const trucks=source.trucks||[];
  const total=(source.truckExpenses||[]).reduce((sum,row)=>sum+Number(row.amount||0),0);
  return `<section class="panel active v69-page" data-v69-panel="my-trucks">
    <div class="v69-summary-card"><small>My Truck Expenses</small><b>${money(total)}</b><span>${trucks.length} Trucks</span></div>
    <div class="card v69-list-card">
      <div class="section-title"><div><h2>My Trucks</h2><small>Truck details, documents and expense ledger</small></div><div class="toolbar"><button class="btn soft" data-panel="truckExpenses">Expense Report</button><button class="btn primary" data-action="new-truck">＋ Add Truck</button></div></div>
      <label class="v69-search"><span>⌕</span><input type="search" placeholder="Search truck or owner" data-v69-filter-input="trucks"></label>
      <div class="v69-truck-grid" data-v69-filter-list="trucks">${trucks.length?trucks.map(truck=>{
        const expenses=truckExpenseTotal(truck.truck_no,source);
        const docs=(source.documents||[]).filter(x=>norm(x.truck_no)===norm(truck.truck_no)).length;
        return `<article data-v69-filter-value="${esc(`${truck.truck_no} ${truck.owner_name}`.toLowerCase())}">
          <header><span>🚚</span><div><b>${esc(truck.truck_no)}</b><small>${esc(truck.owner_name||'No owner')}</small></div></header>
          <div><span>Expenses <b>${money(expenses)}</b></span><span>Documents <b>${docs}</b></span></div>
          <footer><button class="mini green" data-v69-action="add-truck-expense" data-truck="${esc(truck.truck_no)}">＋ Expense</button><button class="mini" data-v69-action="truck-expense-ledger" data-truck="${esc(truck.truck_no)}">View Ledger</button><button class="mini" data-action="edit-truck" data-id="${esc(truck.id)}">Edit</button></footer>
        </article>`;
      }).join(''):'<div class="notice">No trucks found.</div>'}</div>
    </div>
  </section>`;
}

function truckExpensesPanel(source){
  const month=new Date().toISOString().slice(0,7);
  const rows=(source.truckExpenses||[]).filter(x=>String(x.expense_date||'').slice(0,7)===month);
  return `<section class="panel active v69-page" data-v69-panel="truck-expenses">
    <div class="card v69-list-card">
      <div class="section-title"><div><h2>Truck Expenses</h2><small>Truck, trip and office-style expense register</small></div><button class="btn primary" data-v69-action="add-truck-expense">＋ Add Truck Expense</button></div>
      <div class="v69-expense-toolbar"><label><span>Month</span><input type="month" value="${month}" data-v69-expense-month></label><button class="btn soft" data-v69-action="download-truck-expenses">Download Report</button></div>
      <div class="v69-expense-total"><small>Selected Month Total</small><b data-v69-expense-total>${money(rows.reduce((sum,x)=>sum+Number(x.amount||0),0))}</b></div>
      <div data-v69-expense-rows>${truckExpenseRows(rows)}</div>
    </div>
  </section>`;
}

function truckExpenseRows(rows){
  if(!rows.length)return '<div class="notice">No Truck Expense for this month.</div>';
  return `<div class="responsive-table table-wrap"><table class="v69-table"><thead><tr><th>Date</th><th>Truck No.</th><th>Expense Type</th><th>Payment Mode</th><th>Note</th><th>Amount</th><th>Action</th></tr></thead><tbody>${rows.map(row=>`<tr>
    <td>${esc(row.expense_date)}</td><td><b>${esc(row.truck_no)}</b></td><td>${esc(row.category)}</td><td>${esc(row.payment_mode||'-')}</td><td>${esc(row.notes||row.reference||'-')}</td><td><b>${money(row.amount)}</b></td>
    <td><div class="action-set"><button class="mini" data-v69-action="edit-truck-expense" data-id="${esc(row.id)}">Edit</button><button class="mini danger" data-v69-action="delete-truck-expense" data-id="${esc(row.id)}">Delete</button></div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function invoiceImportPanel(){
  return `<section class="panel active v69-page" data-v69-panel="invoice-import">
    <div class="card v69-import-card">
      <div class="section-title"><div><h2>Old Excel → Invoice Import</h2><small>Upload old Bill Excel, automatically detect every sheet, preview and create invoices</small></div></div>
      <div class="v69-import-steps"><span><b>1</b>Select Excel</span><span><b>2</b>Detect Format</span><span><b>3</b>Preview</span><span><b>4</b>Create Invoices</span></div>
      <label class="v69-drop"><input type="file" accept=".xlsx,.xls,.csv" data-v69-import-file><b>Choose old Excel file</b><small>.xlsx, .xls or .csv · Your file is previewed before saving</small></label>
      <div class="v69-import-workspace" data-v69-import-workspace><div class="notice">Select your old Excel file to begin. Existing invoices are not changed automatically.</div></div>
    </div>
  </section>`;
}

function modal(title,content,{wide=false,onMount}={}){
  const host=document.createElement('div');host.className='modal-bg v69-modal-bg';
  host.innerHTML=`<div class="modal ${wide?'v69-wide-modal':'small'}"><div class="modal-head"><h3>${esc(title)}</h3><button class="btn light" data-v69-close>Close</button></div><div class="modal-body">${content}</div></div>`;
  document.body.appendChild(host);host.querySelector('[data-v69-close]').onclick=()=>host.remove();host.onclick=event=>{if(event.target===host)host.remove()};onMount?.(host);window.TransportLanguage?.apply?.();return host;
}
function formObject(form){return Object.fromEntries(new FormData(form).entries())}
function busy(button,on,label='Saving...'){
  if(!button)return;button.disabled=on;if(on){button.dataset.oldText=button.textContent;button.textContent=label}else button.textContent=button.dataset.oldText||'Save';
}
function refresh(){document.dispatchEvent(new CustomEvent('ml-v69-data-changed'))}
async function submitApi(path,method,body,button,host){
  try{busy(button,true);await api(path,{method,body:JSON.stringify(body)});host?.remove();refresh();return true}catch(error){alert(error.message||String(error));return false}finally{busy(button,false)}
}

function openDriverForm(driver={}){
  const edit=!!driver.id;
  modal(edit?'Edit Driver':'Add Driver',`<form class="form-grid" data-v69-driver-form>
    <label class="field"><span>Driver Name</span><input name="driverName" value="${esc(driver.driver_name||'')}" required></label>
    <label class="field"><span>Mobile</span><input name="mobile" type="tel" value="${esc(driver.mobile||'')}"></label>
    <label class="field"><span>Licence Number</span><input name="licenseNo" value="${esc(driver.license_no||'')}"></label>
    <label class="field"><span>Notes</span><input name="notes" value="${esc(driver.notes||'')}"></label>
    <div class="form-actions"><button type="button" class="btn light" data-v69-cancel>Cancel</button><button class="btn primary">${edit?'Update Driver':'Save Driver'}</button></div>
  </form>`,{onMount:host=>{
    host.querySelector('[data-v69-cancel]').onclick=()=>host.remove();host.querySelector('form').onsubmit=event=>{event.preventDefault();submitApi(`/drivers${edit?'/'+driver.id:''}`,edit?'PUT':'POST',formObject(event.target),event.submitter,host)};
  }});
}

function openDriverEntryForm(driver,direction='GAVE',entry={}){
  const edit=!!entry.id;
  modal(`${driver.driver_name} · ${direction==='GOT'?'Driver Got':'Driver Gave'}`,`<form class="form-grid" data-v69-driver-entry-form>
    <input type="hidden" name="driverId" value="${esc(driver.id)}"><input type="hidden" name="direction" value="${esc(direction)}">
    <label class="field"><span>Date</span><input name="entryDate" type="date" value="${esc(entry.entry_date||today())}" required></label>
    <label class="field"><span>Amount</span><input name="amount" type="number" step="0.01" min="0.01" value="${esc(entry.amount||'')}" required></label>
    <label class="field"><span>Payment Mode</span><select name="paymentMode">${['CASH','BANK','UPI','NEFT','RTGS'].map(x=>`<option ${norm(entry.payment_mode)===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label class="field"><span>Reference</span><input name="reference" value="${esc(entry.reference||'')}"></label>
    <label class="field span2"><span>Notes</span><textarea name="notes">${esc(entry.notes||'')}</textarea></label>
    <div class="form-actions"><button type="button" class="btn light" data-v69-cancel>Cancel</button><button class="btn primary">Save Entry</button></div>
  </form>`,{onMount:host=>{
    host.querySelector('[data-v69-cancel]').onclick=()=>host.remove();host.querySelector('form').onsubmit=event=>{event.preventDefault();submitApi(`/driver-entries${edit?'/'+entry.id:''}`,edit?'PUT':'POST',formObject(event.target),event.submitter,host)};
  }});
}

function openDriverLedger(driver){
  const source=data(),entries=(source.driverEntries||[]).filter(x=>String(x.driver_id)===String(driver.id)).sort((a,b)=>String(b.entry_date||'').localeCompare(String(a.entry_date||'')));
  const balance=driverBalance(driver.id,source);
  modal(`Driver Khata · ${driver.driver_name}`,`<div class="v69-ledger-head"><div><small>Total Balance</small><b>${money(balance)}</b></div><button class="btn soft" data-v69-action="download-driver-ledger" data-id="${esc(driver.id)}">Download Ledger</button></div>
    <div class="v69-driver-actions"><button class="btn danger" data-v69-action="driver-entry" data-id="${esc(driver.id)}" data-direction="GAVE">− Driver Gave</button><button class="btn green" data-v69-action="driver-entry" data-id="${esc(driver.id)}" data-direction="GOT">＋ Driver Got</button></div>
    ${entries.length?`<div class="table-wrap"><table class="v69-table"><thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Reference</th><th>Amount</th><th>Balance</th></tr></thead><tbody>${(()=>{let running=0;return [...entries].reverse().map(row=>{running+=norm(row.direction)==='GOT'?-Number(row.amount||0):Number(row.amount||0);return `<tr><td>${esc(row.entry_date)}</td><td>${esc(row.direction)}</td><td>${esc(row.payment_mode||'-')}</td><td>${esc(row.reference||row.notes||'-')}</td><td>${money(row.amount)}</td><td><b>${money(running)}</b></td></tr>`}).reverse().join('')})()}</tbody></table></div>`:'<div class="v69-empty-ledger">No Driver Khata entry yet.<br><small>Use Driver Gave / Driver Got to manage balance.</small></div>'}`,
    {wide:true});
}

function openTruckExpenseForm(expense={},preferredTruck=''){
  const source=data(),edit=!!expense.id,trucks=source.trucks||[];
  const selected=expense.truck_no||preferredTruck;
  const categories=[...new Set([...EXPENSE_TYPES,...((source.truckExpenses||[]).map(x=>norm(x.category))).filter(Boolean)])];
  modal(edit?'Edit Truck Expense':'Add Truck Expense',`<form class="form-grid" data-v69-truck-expense-form>
    <label class="field"><span>Expense Type</span><select name="category" data-v69-expense-category required><option value="">Choose Expense Type</option>${categories.map(x=>`<option value="${esc(x)}" ${norm(expense.category)===x?'selected':''}>${esc(x)}</option>`).join('')}<option value="__CUSTOM__">＋ Add Custom Expense Type</option></select></label>
    <label class="field"><span>Truck No.</span><select name="truckNo" required><option value="">Select Truck Number</option>${trucks.map(x=>`<option value="${esc(x.truck_no)}" ${norm(selected)===norm(x.truck_no)?'selected':''}>${esc(x.truck_no)}</option>`).join('')}</select></label>
    <label class="field"><span>Expense Amount</span><input name="amount" type="number" step="0.01" min="0.01" value="${esc(expense.amount||'')}" required></label>
    <label class="field"><span>Expense Date</span><input name="expenseDate" type="date" value="${esc(expense.expense_date||today())}" required></label>
    <label class="field"><span>Payment Mode</span><select name="paymentMode">${['CASH','CREDIT','ONLINE','BANK','UPI'].map(x=>`<option ${norm(expense.payment_mode)===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label class="field"><span>Trip ID (optional)</span><input name="tripId" value="${esc(expense.trip_id||'')}"></label>
    <label class="field"><span>Reference</span><input name="reference" value="${esc(expense.reference||'')}"></label>
    <label class="field"><span>Note</span><input name="notes" value="${esc(expense.notes||'')}"></label>
    <div class="form-actions"><button type="button" class="btn light" data-v69-cancel>Cancel</button><button class="btn primary">Confirm</button></div>
  </form>`,{onMount:host=>{
    host.querySelector('[data-v69-cancel]').onclick=()=>host.remove();
    host.querySelector('[data-v69-expense-category]').onchange=event=>{if(event.target.value!=='__CUSTOM__')return;const custom=prompt('Enter custom Expense Type','');if(!custom){event.target.value='';return}const option=document.createElement('option');option.value=norm(custom);option.textContent=norm(custom);event.target.insertBefore(option,event.target.lastElementChild);event.target.value=option.value};
    host.querySelector('form').onsubmit=event=>{event.preventDefault();submitApi(`/truck-expenses${edit?'/'+expense.id:''}`,edit?'PUT':'POST',formObject(event.target),event.submitter,host)};
  }});
}

function openTruckExpenseLedger(truckNo){
  const rows=(data().truckExpenses||[]).filter(x=>norm(x.truck_no)===norm(truckNo));
  modal(`Truck Expense Ledger · ${truckNo}`,`<div class="v69-ledger-head"><div><small>Total Truck Expense</small><b>${money(rows.reduce((sum,x)=>sum+Number(x.amount||0),0))}</b></div><button class="btn soft" data-v69-action="download-one-truck-expenses" data-truck="${esc(truckNo)}">Download Ledger</button></div>${truckExpenseRows(rows)}`,{wide:true});
}

async function saveBlob(blob,fileName){
  if(window.TransportNative?.saveBlob){const saved=await window.TransportNative.saveBlob(blob,fileName);alert(`Downloaded successfully: ${saved.location}`);return}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function workbookDownload(name,sheets){
  if(!window.XLSX)throw new Error('Excel engine is unavailable. Please refresh and retry.');
  const workbook=window.XLSX.utils.book_new();
  for(const [sheetName,rows] of Object.entries(sheets))window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.aoa_to_sheet(rows),String(sheetName).slice(0,31));
  const bytes=window.XLSX.write(workbook,{bookType:'xlsx',type:'array'});
  await saveBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),safeName(name)+'.xlsx');
}
async function downloadDriverLedger(driver){
  const entries=(data().driverEntries||[]).filter(x=>String(x.driver_id)===String(driver.id)).sort((a,b)=>String(a.entry_date||'').localeCompare(String(b.entry_date||'')));
  let balance=0;const rows=[['Date','Driver','Type','Payment Mode','Reference','Notes','Amount','Balance']];
  for(const row of entries){balance+=norm(row.direction)==='GOT'?-Number(row.amount||0):Number(row.amount||0);rows.push([row.entry_date,driver.driver_name,row.direction,row.payment_mode,row.reference,row.notes,Number(row.amount||0),balance])}
  await workbookDownload(`${driver.driver_name} DRIVER KHATA`,{DriverKhata:rows});
}
async function downloadTruckExpenseRows(rows,name){
  const sheet=[['Date','Truck No','Trip ID','Expense Type','Payment Mode','Reference','Notes','Amount']];
  rows.forEach(row=>sheet.push([row.expense_date,row.truck_no,row.trip_id,row.category,row.payment_mode,row.reference,row.notes,Number(row.amount||0)]));
  sheet.push(['','','','','','','TOTAL',rows.reduce((sum,x)=>sum+Number(x.amount||0),0)]);
  await workbookDownload(name,{TruckExpenses:sheet});
}

let importSession=null;
async function readImportFile(file){
  if(!window.XLSX)throw new Error('Excel engine is unavailable. Refresh the App once and retry.');
  const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellText:false});
  const sheets=workbook.SheetNames.map(name=>({name,rows:window.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:'',raw:true,blankrows:false})}));
  const parsed=parseWorkbookSheets(sheets);
  if(!parsed.records.length)throw new Error('No supported invoice rows found. Keep Bill No., Date, Truck No. and Amount/Total headings in the Excel.');
  importSession={fileName:file.name,...parsed};renderImportWorkspace();
}
function mappedInvoices(){
  const source=data();
  return buildImportedInvoices(importSession.records,{parties:source.parties||[],existingInvoices:source.invoices||[],parseExcelDate:value=>window.XLSX?.SSF?.parse_date_code?.(value),fileName:importSession.fileName});
}
function renderImportWorkspace(){
  const host=document.querySelector('[data-v69-import-workspace]');if(!host||!importSession)return;
  const invoices=mappedInvoices(),valid=invoices.filter(x=>!x.errors.length&&!x.duplicate);
  const sourceCards=importSession.sources.map(source=>`<span><b>${esc(source.sheetName)}</b> · ${source.format==='FORM'?'Formatted Invoice':'Invoice List'} · ${source.rows} rows${source.metadata?.partyName?` · ${esc(source.metadata.partyName)}`:''}</span>`).join('');
  host.innerHTML=`<div class="v69-import-file"><b>${esc(importSession.fileName)}</b><span>${importSession.records.length} rows · ${invoices.length} invoices detected from ${importSession.sources.length} sheet/table(s)</span></div>
    <details class="v69-mapping" open><summary>Automatic Excel Detection</summary><div class="v69-auto-sources">${sourceCards||'<span>No supported table found.</span>'}</div>${importSession.warnings.length?`<div class="notice">${importSession.warnings.map(esc).join('<br>')}</div>`:''}</details>
    <div class="v69-import-summary"><span><b>${invoices.length}</b> detected</span><span><b>${valid.length}</b> ready</span><span><b>${invoices.filter(x=>x.duplicate).length}</b> duplicates skipped</span><span><b>${invoices.filter(x=>x.errors.length).length}</b> need correction</span></div>
    <div class="table-wrap"><table class="v69-table"><thead><tr><th>Bill No.</th><th>Bill / Loading Date</th><th>Party</th><th>Truck Lines</th><th>Tax</th><th>Total</th><th>Status</th></tr></thead><tbody>${invoices.slice(0,50).map(x=>`<tr><td><b>${esc(x.invoiceNo||'-')}</b></td><td>${esc(x.invoiceDate||'-')}<br><small>${esc(x.loadingDate||'-')}</small></td><td>${esc(x.partyName||'-')}</td><td>${x.items.map(i=>esc(i.truckNo||'-')).join('<br>')}</td><td>${x.invoiceType==='IGST'?`IGST ${Number(x.cgst||0)}%`:x.invoiceType==='NON_GST'?'NON-GST':`${Number(x.sgst||0)}% + ${Number(x.cgst||0)}%`}</td><td>${money(x.calculatedTotal)}</td><td>${x.duplicate?'<span class="badge warning">DUPLICATE</span>':x.errors.length?`<span class="badge pending">${esc(x.errors.join(', '))}</span>`:`<span class="badge paid">READY</span>${x.warnings.length?`<small class="v69-import-warning">${esc(x.warnings.join(' · '))}</small>`:''}`}</td></tr>`).join('')}</tbody></table></div>
    <div class="v69-import-progress" data-v69-import-progress></div><div class="form-actions"><button class="btn primary" data-v69-action="run-invoice-import" ${valid.length?'':'disabled'}>Create ${valid.length} Invoices</button></div>`;
  window.TransportLanguage?.apply?.();
}
async function runInvoiceImport(button){
  const invoices=mappedInvoices().filter(x=>!x.errors.length&&!x.duplicate);if(!invoices.length)return alert('No valid new invoices are ready.');
  if(!confirm(`Create ${invoices.length} invoices from this Excel? Existing duplicate Bill Numbers will stay unchanged.`))return;
  const progress=document.querySelector('[data-v69-import-progress]');let success=0;const errors=[];busy(button,true,'Importing...');
  for(let index=0;index<invoices.length;index++){
    const invoice=invoices[index];if(progress)progress.textContent=`Creating ${index+1} of ${invoices.length}: ${invoice.invoiceNo}`;
    try{const {errors:rowErrors,warnings,duplicate,sourceRows,tax,expectedTotal,calculatedTotal,...body}=invoice;await api('/invoices',{method:'POST',body:JSON.stringify(body),timeoutMs:60000});success++}catch(error){errors.push(`${invoice.invoiceNo}: ${error.message||error}`)}
  }
  busy(button,false);if(progress)progress.textContent=`Completed: ${success} created · ${errors.length} failed`;
  alert(`Excel invoice import complete.\nCreated: ${success}\nFailed: ${errors.length}${errors.length?'\n\n'+errors.slice(0,8).join('\n'):''}`);importSession=null;refresh();
}

document.addEventListener('input',event=>{
  const input=event.target.closest('[data-v69-filter-input]');if(!input)return;
  const list=document.querySelector(`[data-v69-filter-list="${input.dataset.v69FilterInput}"]`),query=input.value.trim().toLowerCase();
  list?.querySelectorAll('[data-v69-filter-value]').forEach(row=>row.hidden=query&&!String(row.dataset.v69FilterValue||'').includes(query));
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-v69-import-file]')){const file=event.target.files?.[0];if(file)readImportFile(file).catch(error=>alert(error.message||String(error)));return}
  if(event.target.matches('[data-v69-expense-month]')){
    const month=event.target.value,rows=(data().truckExpenses||[]).filter(x=>String(x.expense_date||'').slice(0,7)===month),host=document.querySelector('[data-v69-expense-rows]');if(host)host.innerHTML=truckExpenseRows(rows);const total=document.querySelector('[data-v69-expense-total]');if(total)total.textContent=money(rows.reduce((sum,x)=>sum+Number(x.amount||0),0));window.TransportLanguage?.apply?.();
  }
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-v69-action]');if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  const source=data(),action=button.dataset.v69Action,id=button.dataset.id;
  try{
    if(action==='add-driver')return openDriverForm();
    if(action==='edit-driver')return openDriverForm((source.drivers||[]).find(x=>String(x.id)===String(id))||{});
    if(action==='open-driver')return openDriverLedger((source.drivers||[]).find(x=>String(x.id)===String(id))||{});
    if(action==='driver-entry'){const driver=(source.drivers||[]).find(x=>String(x.id)===String(id));if(driver)return openDriverEntryForm(driver,button.dataset.direction||'GAVE')}
    if(action==='download-driver-ledger'){const driver=(source.drivers||[]).find(x=>String(x.id)===String(id));if(driver)return downloadDriverLedger(driver)}
    if(action==='add-truck-expense')return openTruckExpenseForm({},button.dataset.truck||'');
    if(action==='edit-truck-expense')return openTruckExpenseForm((source.truckExpenses||[]).find(x=>String(x.id)===String(id))||{});
    if(action==='delete-truck-expense'){if(confirm('Delete this Truck Expense?')){await api(`/truck-expenses/${id}`,{method:'DELETE'});refresh()}return}
    if(action==='truck-expense-ledger')return openTruckExpenseLedger(button.dataset.truck||'');
    if(action==='download-one-truck-expenses'){const truck=button.dataset.truck||'',rows=(source.truckExpenses||[]).filter(x=>norm(x.truck_no)===norm(truck));return downloadTruckExpenseRows(rows,`${truck} TRUCK EXPENSE LEDGER`)}
    if(action==='download-truck-expenses'){const month=document.querySelector('[data-v69-expense-month]')?.value||'',rows=(source.truckExpenses||[]).filter(x=>!month||String(x.expense_date||'').slice(0,7)===month);return downloadTruckExpenseRows(rows,`TRUCK EXPENSES ${month||today()}`)}
    if(action==='run-invoice-import')return runInvoiceImport(button);
  }catch(error){alert(error.message||String(error))}
},true);
