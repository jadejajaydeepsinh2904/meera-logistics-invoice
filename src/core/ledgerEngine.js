
import { round2 } from './dataStore.js';

export function normalizeTruckPayment(p){
  const gross = round2((+p.weight || 0) * (+p.rate || 0));
  const payable = round2(gross - (+p.commission || 0));
  const paid = round2(+p.paidAmount || 0);
  return {...p, gross, payable, paid, pending: round2(payable - paid), storedFreight: round2(+p.freight || 0)};
}

export function invoiceSubtotal(i){
  const d = i.data || {};
  return round2((d.trips || []).reduce((sum,t) => sum + (+t.weight || 0) * (+t.rate || 0), 0) + (+d.diesel || 0) + (+d.munshi || 0));
}

export function buildPartyLedger(db){
  const map = {};
  for(const invoice of db.invoices){
    const name = (invoice.company?.company || invoice.company?.name || 'UNKNOWN').trim();
    map[name] ||= {name, invoices:[], payments:[], billed:0, received:0, outstanding:0};
    map[name].invoices.push(invoice);
    map[name].billed += +invoice.total || 0;
  }
  for(const p of db.partyPayments){
    const name = (p.partyName || p.company || 'UNKNOWN').trim();
    map[name] ||= {name, invoices:[], payments:[], billed:0, received:0, outstanding:0};
    map[name].payments.push(p);
    map[name].received += +p.amount || +p.paidAmount || 0;
  }
  const ledgerMap = Object.fromEntries((db.partyAccounts || []).map(a => [a.partyName.trim().toUpperCase(), a.ledgerNo]));
  return Object.values(map).map(x => ({
    ...x,
    ledgerNo: ledgerMap[x.name.trim().toUpperCase()] || '',
    billed: round2(x.billed),
    received: round2(x.received),
    outstanding: round2(x.billed - x.received)
  })).sort((a,b) => b.outstanding - a.outstanding);
}

export function buildSupplierLedger(db){
  const map = {};
  for(const raw of db.payments){
    const p = normalizeTruckPayment(raw);
    const name = (p.driverName || 'UNKNOWN').trim().toUpperCase();
    map[name] ||= {name, entries:[], payable:0, paid:0, pending:0, trucks:new Set()};
    map[name].entries.push(p);
    map[name].payable += p.payable;
    map[name].paid += p.paid;
    map[name].pending += p.pending;
    map[name].trucks.add(p.truckNo);
  }
  return Object.values(map).map(x => ({
    ...x, truckCount:x.trucks.size,
    payable:round2(x.payable), paid:round2(x.paid), pending:round2(x.pending)
  })).sort((a,b) => b.pending-a.pending);
}

export function reconcile(db){
  const issues = [];
  for(const raw of db.payments){
    const p = normalizeTruckPayment(raw);
    if(Math.abs(p.pending - p.storedFreight) > .01){
      issues.push({type:'PAYMENT_MISMATCH', text:`${p.truckNo} / ${p.driverName}: calculated ${p.pending}, stored ${p.storedFreight}`});
    }
  }
  for(const trip of db.trips){
    const linked = db.invoices.find(i => String(i.data?.tripLinkId || '') === String(trip.id));
    if(!linked) issues.push({type:'MISSING_INVOICE_LINK', text:`Trip ${trip.id} (${trip.truckNo}) has no linked invoice`});
  }
  const partyLedger = buildPartyLedger(db);
  for(const party of partyLedger){
    if(party.outstanding < -0.01){
      issues.push({
        type:'PARTY_OVERPAYMENT_OR_MISSING_INVOICES',
        text:`${party.name}: received ${party.received} is greater than exported billing ${party.billed} by ${Math.abs(party.outstanding)}. Missing invoices or advance payment must be verified.`
      });
    }
  }
  return issues;
}
