
import { loadDatabase, money, round2 } from './core/dataStore.js';
import { normalizeTruckPayment, invoiceSubtotal, buildPartyLedger, buildSupplierLedger, reconcile } from './core/ledgerEngine.js';

const app = document.getElementById('app');
let db, state = {panel:'dashboard'};

const table = (heads, rows, min='1050px') => rows.length
  ? `<div class="table-wrap"><table style="min-width:${min}"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="note">No records found.</div>`;

function invoiceRows(items){
  return items.map(i => `<tr>
    <td><b>${i.invoiceNo}</b></td><td>${i.date||''}</td><td>${i.company?.company||''}</td>
    <td>${i.data?.lrNo||''}</td><td>${i.data?.material||''}</td><td>${i.data?.trips?.[0]?.truck||''}</td>
    <td>${money(invoiceSubtotal(i))}</td><td><b>${money(i.total)}</b></td>
  </tr>`);
}
function tripRows(items){
  return items.map(t => `<tr>
    <td>${t.id}</td><td>${t.tripDate||''}</td><td><b>${t.partyName||''}</b></td><td>${t.truckNo||''}</td>
    <td>${t.loadingPoint||''} → ${t.unloadingPoint||''}</td><td>${t.material||''}</td><td>${t.weight||0}</td>
    <td>${money(t.rate)}</td><td><span class="badge ${t.status==='DELIVERED'?'paid':'pending'}">${t.status||''}</span></td>
    <td>${t.podFileName?'<span class="badge info">POD</span>':'-'}</td>
  </tr>`);
}
function paymentRows(items){
  return items.map(raw => {
    const p = normalizeTruckPayment(raw);
    return `<tr>
      <td>${p.entryDate||''}</td><td><b>${p.truckNo||''}</b></td><td>${p.driverName||''}</td>
      <td>${p.loadingPoint||''} → ${p.unloadingPoint||''}</td><td>${p.weight||0}</td><td>${money(p.rate)}</td>
      <td>${money(p.commission)}</td><td>${money(p.payable)}</td><td>${money(p.paid)}</td><td>${money(p.pending)}</td>
      <td><span class="badge ${p.pending<=.01?'paid':'pending'}">${p.pending<=.01?'Paid':'Pending'}</span></td>
    </tr>`;
  });
}

function render(){
  const parties = buildPartyLedger(db);
  const suppliers = buildSupplierLedger(db);
  const issues = reconcile(db);
  const normalized = db.payments.map(normalizeTruckPayment);
  const billing = round2(db.invoices.reduce((a,i)=>a+(+i.total||0),0));
  const supplierPayable = round2(normalized.reduce((a,p)=>a+p.payable,0));
  const supplierPaid = round2(normalized.reduce((a,p)=>a+p.paid,0));
  const supplierPending = round2(normalized.reduce((a,p)=>a+p.pending,0));
  const subtotal = round2(db.invoices.reduce((a,i)=>a+invoiceSubtotal(i),0));
  const received = round2(parties.reduce((a,p)=>a+p.received,0));
  const outstanding = round2(parties.reduce((a,p)=>a+p.outstanding,0));
  const expense = round2(db.expenses.reduce((a,x)=>a+(+x.amount||0),0));
  const profit = round2(subtotal - supplierPayable - expense);

  app.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">ML</div><div><b>MEERA LOGISTICS</b><small>ERP v3 Source</small></div></div>
      <div class="nav">
        ${['dashboard','trips','invoices','parties','payments','suppliers','trucks','routes','profit','audit']
          .map(id=>`<button data-panel="${id}" class="${state.panel===id?'active':''}">${{
            dashboard:'Dashboard',trips:'Trips',invoices:'Invoices',parties:'Party Ledger',
            payments:'Truck Payment',suppliers:'Supplier Ledger',trucks:'Truck Master',
            routes:'Routes',profit:'Profit Report',audit:'Data Audit'
          }[id]}</button>`).join('')}
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div><h1>${{
          dashboard:'Executive Dashboard',trips:'Trip Management',invoices:'Invoice Register',
          parties:'Party Ledger',payments:'Truck Payment = Supplier Payment',suppliers:'Malik-wise Supplier Ledger',
          trucks:'Truck Master',routes:'Route Master',profit:'Profit Report',audit:'Reconciliation Audit'
        }[state.panel]}</h1><p>Trip ID આધારિત unified transport workflow</p></div>
        <div class="actions"><button class="btn" id="exportBtn">Export Summary</button><button class="btn primary" onclick="window.print()">Print</button></div>
      </div>

      <section class="panel ${state.panel==='dashboard'?'active':''}">
        <div class="cards">
          <div class="card metric"><span>Total Billing</span><b>${money(billing)}</b></div>
          <div class="card metric"><span>Party Received</span><b>${money(received)}</b></div>
          <div class="card metric"><span>Party Outstanding</span><b>${money(outstanding)}</b></div>
          <div class="card metric"><span>Supplier Payable</span><b>${money(supplierPayable)}</b></div>
          <div class="card metric"><span>Supplier Pending</span><b>${money(supplierPending)}</b></div>
          <div class="card metric"><span>Estimated Profit</span><b>${money(profit)}</b></div>
        </div>
        <div class="grid2">
          <div class="card"><div class="section-title"><h2>Recent Invoices</h2></div>${table(['Invoice','Date','Party','LR','Material','Truck','Subtotal','Total'],invoiceRows(db.invoices.slice(0,6)),'850px')}</div>
          <div class="card"><div class="section-title"><h2>Party Outstanding</h2></div><div class="list">${parties.slice(0,6).map(p=>`<div class="row-card"><div><b>${p.ledgerNo ? p.ledgerNo + ' · ' : ''}${p.name}</b><small>${p.invoices.length} invoices · received ${money(p.received)}</small></div><div class="amount"><b>${money(p.outstanding)}</b><small>Outstanding</small></div></div>`).join('')}</div></div>
        </div>
      </section>

      <section class="panel ${state.panel==='trips'?'active':''}"><div class="card"><div class="section-title"><h2>Trips</h2><input class="search" data-search="trip" placeholder="Party, truck, route..."></div><div id="tripTable">${table(['ID','Date','Party','Truck','Route','Material','Weight','Rate','Status','POD'],tripRows(db.trips))}</div></div></section>
      <section class="panel ${state.panel==='invoices'?'active':''}"><div class="card"><div class="section-title"><h2>Invoices</h2><input class="search" data-search="invoice" placeholder="Invoice, party, LR..."></div><div id="invoiceTable">${table(['Invoice','Date','Party','LR','Material','Truck','Subtotal','Total'],invoiceRows(db.invoices))}</div></div></section>
      <section class="panel ${state.panel==='parties'?'active':''}"><div class="note">${db.partyPayments.length===0?'Party payment export હજી ખાલી છે. File ઉમેરતાં જ Received અને Outstanding auto update થશે.':'Party payments loaded.'}</div><div class="card"><div class="list">${parties.map(p=>`<div class="row-card"><div><b>${p.ledgerNo ? p.ledgerNo + ' · ' : ''}${p.name}</b><small>${p.invoices.length} invoices · ${p.payments.length} receipts</small></div><div class="amount"><b>${money(p.outstanding)}</b><small>Billed ${money(p.billed)} · Received ${money(p.received)}</small></div></div>`).join('')}</div></div></section>
      <section class="panel ${state.panel==='payments'?'active':''}"><div class="card"><div class="section-title"><h2>Truck Payment History</h2><input class="search" data-search="payment" placeholder="Truck, malik, route..."></div><div id="paymentTable">${table(['Date','Truck','Owner','Route','Weight','Rate','Commission','Payable','Paid','Pending','Status'],paymentRows(db.payments))}</div></div></section>
      <section class="panel ${state.panel==='suppliers'?'active':''}"><div class="card"><div class="list">${suppliers.map(s=>`<div class="row-card"><div><b>${s.name}</b><small>${s.entries.length} entries · ${s.truckCount} trucks · Paid ${money(s.paid)}</small></div><div class="amount"><b>${money(s.pending)}</b><small>Payable ${money(s.payable)}</small></div></div>`).join('')}</div></div></section>
      <section class="panel ${state.panel==='trucks'?'active':''}"><div class="card"><div class="list">${db.trucks.map(t=>`<div class="row-card"><div><b>${t.truckNo}</b><small>${t.ownerName||''} · ${t.bankDetails||'No bank details'}</small></div><div class="amount"><b>${(t.documentFiles||[]).length} files</b><small>Documents</small></div></div>`).join('')}</div></div></section>
      <section class="panel ${state.panel==='routes'?'active':''}"><div class="card"><div class="list">${db.routes.map(r=>`<div class="row-card"><div><b>${r.loadingPoint}</b><small>Loading</small></div><div class="amount"><b>→ ${r.unloadingPoint}</b><small>Unloading</small></div></div>`).join('')}</div></div></section>
      <section class="panel ${state.panel==='profit'?'active':''}"><div class="cards"><div class="card metric"><span>Invoice Subtotal</span><b>${money(subtotal)}</b></div><div class="card metric"><span>Supplier Payable</span><b>${money(supplierPayable)}</b></div><div class="card metric"><span>Expenses</span><b>${money(expense)}</b></div><div class="card metric"><span>Estimated Profit</span><b>${money(profit)}</b></div><div class="card metric"><span>Party Received</span><b>${money(received)}</b></div><div class="card metric"><span>Cash Outstanding</span><b>${money(outstanding)}</b></div></div></section>
      <section class="panel ${state.panel==='audit'?'active':''}"><div class="card">${issues.length?issues.map(i=>`<div class="audit">${i.text}</div>`).join(''):'<span class="badge paid">No detected issues</span>'}</div></section>
    </main>
  </div>`;

  document.querySelectorAll('[data-panel]').forEach(btn => btn.onclick = () => { state.panel = btn.dataset.panel; render(); });
  document.getElementById('exportBtn').onclick = () => {
    const summary = {generatedAt:new Date().toISOString(), billing, received, outstanding, supplierPayable, supplierPaid, supplierPending, profit, issues:issues.length};
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(summary,null,2)],{type:'application/json'}));
    a.download = 'meera-logistics-summary.json'; a.click();
  };
  const tripSearch = document.querySelector('[data-search="trip"]');
  if(tripSearch) tripSearch.oninput = e => {
    const q=e.target.value.toLowerCase(), rows=db.trips.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
    document.getElementById('tripTable').innerHTML=table(['ID','Date','Party','Truck','Route','Material','Weight','Rate','Status','POD'],tripRows(rows));
  };
  const invSearch = document.querySelector('[data-search="invoice"]');
  if(invSearch) invSearch.oninput = e => {
    const q=e.target.value.toLowerCase(), rows=db.invoices.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
    document.getElementById('invoiceTable').innerHTML=table(['Invoice','Date','Party','LR','Material','Truck','Subtotal','Total'],invoiceRows(rows));
  };
  const paySearch = document.querySelector('[data-search="payment"]');
  if(paySearch) paySearch.oninput = e => {
    const q=e.target.value.toLowerCase(), rows=db.payments.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
    document.getElementById('paymentTable').innerHTML=table(['Date','Truck','Owner','Route','Weight','Rate','Commission','Payable','Paid','Pending','Status'],paymentRows(rows));
  };
}

loadDatabase().then(data => { db=data; render(); }).catch(err => {
  app.innerHTML = `<div style="padding:30px;font-family:Arial"><h2>App could not load</h2><p>${err.message}</p><p>Use VS Code Live Server or any static server.</p></div>`;
});
