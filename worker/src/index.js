
import { SEED_DATA } from './seed-data.js';

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers: HEADERS});
const num = v => Number(v || 0);
const round2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const clean = v => String(v ?? '').trim().replace(/\s+/g,' ');
const upper = v => clean(v).toUpperCase();
const uid = p => `${p}-${crypto.randomUUID()}`;
let initPromise;

async function sha256(text){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function run(env, sql, ...args){ return env.DB.prepare(sql).bind(...args).run(); }
async function all(env, sql, ...args){ return (await env.DB.prepare(sql).bind(...args).all()).results; }
async function first(env, sql, ...args){ return env.DB.prepare(sql).bind(...args).first(); }
async function safe(env, sql){
  try{ await env.DB.prepare(sql).run(); }catch(e){
    const msg = String(e?.message || e);
    if(!/duplicate column|already exists/i.test(msg)) throw e;
  }
}

async function ensureDatabase(env){
  if(initPromise) return initPromise;
  initPromise = (async()=>{
    // Fast path: on an already-configured database, avoid repeating all DDL
    // statements on every Worker cold start.
    try{
      const ready=await first(env,`SELECT value FROM app_meta WHERE key='schema_version'`);
      if(ready?.value==='14'){
        // Verify the columns required by the universal Trip screen.
        await first(env,`SELECT trip_id FROM party_payments LIMIT 1`);
        await first(env,`SELECT trip_id FROM supplier_payments LIMIT 1`);
        await first(env,`SELECT trip_id FROM expenses LIMIT 1`);
        return;
      }
    }catch(_){/* first deployment or an incomplete older schema */}

    const creates = [
      `CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'ADMIN',active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS party_accounts(id TEXT PRIMARY KEY,ledger_no TEXT UNIQUE,party_name TEXT UNIQUE NOT NULL,address TEXT DEFAULT '',gst_no TEXT DEFAULT '',mobile TEXT DEFAULT '',email TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS party_payments(id TEXT PRIMARY KEY,receipt_no TEXT,trip_id TEXT DEFAULT '',party_name TEXT NOT NULL,payment_date TEXT NOT NULL,amount REAL NOT NULL,payment_mode TEXT,reference TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS trucks(id TEXT PRIMARY KEY,truck_no TEXT UNIQUE NOT NULL,owner_name TEXT,owner_mobile TEXT DEFAULT '',bank_details TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS routes(id TEXT PRIMARY KEY,loading_point TEXT NOT NULL,unloading_point TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,material_name TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,trip_date TEXT,party_name TEXT,truck_no TEXT,driver_name TEXT DEFAULT '',driver_mobile TEXT DEFAULT '',material TEXT,loading_point TEXT,unloading_point TEXT,weight REAL DEFAULT 0,rate REAL DEFAULT 0,status TEXT DEFAULT 'BOOKED',notes TEXT DEFAULT '',pod_file_name TEXT DEFAULT '',pod_data TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,invoice_no TEXT UNIQUE NOT NULL,invoice_date TEXT,party_name TEXT,party_address TEXT DEFAULT '',party_gst TEXT DEFAULT '',lr_no TEXT DEFAULT '',material TEXT DEFAULT '',loading_date TEXT DEFAULT '',sgst REAL DEFAULT 9,cgst REAL DEFAULT 9,diesel REAL DEFAULT 0,munshi REAL DEFAULT 0,subtotal REAL DEFAULT 0,gst_amount REAL DEFAULT 0,total REAL DEFAULT 0,comments TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS invoice_items(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL,trip_id TEXT DEFAULT '',truck_no TEXT,description TEXT,loading_weight REAL DEFAULT 0,unloading_weight REAL DEFAULT 0,shortage REAL DEFAULT 0,weight REAL DEFAULT 0,rate REAL DEFAULT 0,amount REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS truck_payments(id TEXT PRIMARY KEY,trip_id TEXT DEFAULT '',entry_date TEXT,truck_no TEXT,owner_name TEXT,bank_details TEXT DEFAULT '',loading_point TEXT,unloading_point TEXT,weight REAL DEFAULT 0,rate REAL DEFAULT 0,commission REAL DEFAULT 0,payable REAL DEFAULT 0,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS supplier_payments(id TEXT PRIMARY KEY,receipt_no TEXT,trip_id TEXT DEFAULT '',owner_name TEXT NOT NULL,truck_no TEXT DEFAULT '',payment_date TEXT NOT NULL,amount REAL NOT NULL,payment_mode TEXT,reference TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,trip_id TEXT DEFAULT '',expense_date TEXT,category TEXT,amount REAL DEFAULT 0,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS truck_documents(id TEXT PRIMARY KEY,truck_no TEXT NOT NULL,kind TEXT NOT NULL,file_name TEXT,file_type TEXT DEFAULT '',file_data TEXT DEFAULT '',expiry_date TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,user_id INTEGER,action TEXT,entity TEXT,entity_id TEXT,payload TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
    ];
    for(const sql of creates) await env.DB.prepare(sql).run();

    const alters = [
      `ALTER TABLE party_accounts ADD COLUMN address TEXT DEFAULT ''`,
      `ALTER TABLE party_accounts ADD COLUMN gst_no TEXT DEFAULT ''`,
      `ALTER TABLE party_accounts ADD COLUMN mobile TEXT DEFAULT ''`,
      `ALTER TABLE party_accounts ADD COLUMN email TEXT DEFAULT ''`,
      `ALTER TABLE party_accounts ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE party_accounts ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE party_payments ADD COLUMN receipt_no TEXT`,
      `ALTER TABLE party_payments ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE party_payments ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE party_payments ADD COLUMN trip_id TEXT DEFAULT ''`,
      `ALTER TABLE trucks ADD COLUMN owner_mobile TEXT DEFAULT ''`,
      `ALTER TABLE trucks ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE trucks ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN driver_name TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN driver_mobile TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN notes TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN pod_data TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN party_address TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN party_gst TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN loading_date TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN sgst REAL DEFAULT 9`,
      `ALTER TABLE invoices ADD COLUMN cgst REAL DEFAULT 9`,
      `ALTER TABLE invoices ADD COLUMN comments TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE invoices ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE truck_payments ADD COLUMN trip_id TEXT DEFAULT ''`,
      `ALTER TABLE truck_payments ADD COLUMN bank_details TEXT DEFAULT ''`,
      `ALTER TABLE truck_payments ADD COLUMN created_at TEXT DEFAULT ''`,
      `ALTER TABLE truck_payments ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE routes ADD COLUMN updated_at TEXT DEFAULT ''`,
      `ALTER TABLE truck_documents ADD COLUMN file_type TEXT DEFAULT ''`,
      `ALTER TABLE truck_documents ADD COLUMN file_data TEXT DEFAULT ''`,
      `ALTER TABLE truck_documents ADD COLUMN notes TEXT DEFAULT ''`,
      `ALTER TABLE supplier_payments ADD COLUMN trip_id TEXT DEFAULT ''`,
      `ALTER TABLE expenses ADD COLUMN trip_id TEXT DEFAULT ''`,
      `ALTER TABLE invoice_items ADD COLUMN loading_weight REAL DEFAULT 0`,
      `ALTER TABLE invoice_items ADD COLUMN unloading_weight REAL DEFAULT 0`,
      `ALTER TABLE invoice_items ADD COLUMN shortage REAL DEFAULT 0`
    ];
    for(const sql of alters) await safe(env, sql);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_trip_party ON trips(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_truck ON trips(truck_no)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_date ON trips(trip_date)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_party ON invoices(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoices(invoice_date)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_item_invoice ON invoice_items(invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_item_trip ON invoice_items(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_party_payment_party ON party_payments(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_entry_owner ON truck_payments(owner_name)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payment_owner ON supplier_payments(owner_name)`,
      `CREATE INDEX IF NOT EXISTS idx_document_truck ON truck_documents(truck_no)`,
      `CREATE INDEX IF NOT EXISTS idx_party_payment_trip ON party_payments(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payment_trip ON supplier_payments(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expense_trip ON expenses(trip_id)`
    ];
    for(const sql of indexes){
      try{await env.DB.prepare(sql).run()}
      catch(e){
        // If an index references a newly-added column, retry its ALTER and index.
        const message=String(e?.message||e);
        if(/no such column: trip_id/i.test(message)){
          await safe(env,`ALTER TABLE party_payments ADD COLUMN trip_id TEXT DEFAULT ''`);
          await safe(env,`ALTER TABLE supplier_payments ADD COLUMN trip_id TEXT DEFAULT ''`);
          await safe(env,`ALTER TABLE expenses ADD COLUMN trip_id TEXT DEFAULT ''`);
          await env.DB.prepare(sql).run();
        }else throw e;
      }
    }

    const triggers = [
      `CREATE TRIGGER IF NOT EXISTS trg_party_accounts_ai AFTER INSERT ON party_accounts WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE party_accounts SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_party_accounts_au AFTER UPDATE ON party_accounts WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE party_accounts SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_party_payments_ai AFTER INSERT ON party_payments WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE party_payments SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_party_payments_au AFTER UPDATE ON party_payments WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE party_payments SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_trucks_ai AFTER INSERT ON trucks WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE trucks SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_trucks_au AFTER UPDATE ON trucks WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE trucks SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_routes_ai AFTER INSERT ON routes WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE routes SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_routes_au AFTER UPDATE ON routes WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE routes SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_trips_ai AFTER INSERT ON trips WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE trips SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_trips_au AFTER UPDATE ON trips WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE trips SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_invoices_ai AFTER INSERT ON invoices WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE invoices SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_invoices_au AFTER UPDATE ON invoices WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE invoices SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_truck_payments_ai AFTER INSERT ON truck_payments WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE truck_payments SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
      `CREATE TRIGGER IF NOT EXISTS trg_truck_payments_au AFTER UPDATE ON truck_payments WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE truck_payments SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`
    ];
    for(const sql of triggers) await env.DB.prepare(sql).run();

    await run(env,
      `INSERT OR IGNORE INTO users(username,password_hash,role,active) VALUES('admin',?,'ADMIN',1)`,
      '0d6cf348539dd46934bae6adfaf2696453d0e74faa6823c80c986851d08362d3'
    );

    const seeded = await first(env, `SELECT value FROM app_meta WHERE key='seed_version'`);
    if(!seeded){
      for(const p of SEED_DATA.parties){
        await run(env, `INSERT OR IGNORE INTO party_accounts(id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?)`,
          p.id,p.ledger_no,p.party_name,p.address,p.gst_no,p.mobile,p.email);
      }
      for(const p of SEED_DATA.party_payments){
        await run(env, `INSERT OR IGNORE INTO party_payments(id,receipt_no,trip_id,party_name,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?)`,
          p.id,`PR-${p.id}`,'',p.party_name,p.payment_date,p.amount,p.payment_mode,p.reference,p.notes);
      }
      for(const t of SEED_DATA.trucks){
        await run(env, `INSERT OR IGNORE INTO trucks(id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?)`,
          t.id,t.truck_no,t.owner_name,t.owner_mobile,t.bank_details);
      }
      for(const r of SEED_DATA.routes){
        await run(env, `INSERT OR IGNORE INTO routes(id,loading_point,unloading_point) VALUES(?,?,?)`,
          r.id,r.loading_point,r.unloading_point);
      }
      for(const m of SEED_DATA.materials){
        await run(env, `INSERT OR IGNORE INTO materials(id,material_name) VALUES(?,?)`,m.id,m.material_name);
      }
      for(const t of SEED_DATA.trips){
        await run(env, `INSERT OR IGNORE INTO trips(id,trip_date,party_name,truck_no,driver_name,driver_mobile,material,loading_point,unloading_point,weight,rate,status,notes,pod_file_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          t.id,t.trip_date,t.party_name,t.truck_no,t.driver_name,t.driver_mobile,t.material,t.loading_point,t.unloading_point,t.weight,t.rate,t.status,t.notes,t.pod_file_name);
      }
      for(const i of SEED_DATA.invoices){
        await run(env, `INSERT OR IGNORE INTO invoices(id,invoice_no,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          i.id,i.invoice_no,i.invoice_date,i.party_name,i.party_address,i.party_gst,i.lr_no,i.material,i.loading_date,i.sgst,i.cgst,i.diesel,i.munshi,i.subtotal,i.gst_amount,i.total,i.comments);
      }
      for(const it of SEED_DATA.invoice_items){
        await run(env, `INSERT OR IGNORE INTO invoice_items(id,invoice_id,trip_id,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          it.id,it.invoice_id,it.trip_id,it.truck_no,it.description,num(it.loading_weight||it.weight),num(it.unloading_weight||it.weight),num(it.shortage),it.weight,it.rate,it.amount);
      }
      for(const e of SEED_DATA.truck_entries){
        await run(env, `INSERT OR IGNORE INTO truck_payments(id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,weight,rate,commission,payable,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          e.id,e.trip_id,e.entry_date,e.truck_no,e.owner_name,e.bank_details,e.loading_point,e.unloading_point,e.weight,e.rate,e.commission,e.payable,e.notes);
      }
      for(const p of SEED_DATA.supplier_payments){
        await run(env, `INSERT OR IGNORE INTO supplier_payments(id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,
          p.id,`SP-${p.id}`,'',p.owner_name,p.truck_no,p.payment_date,p.amount,p.payment_mode,p.reference,p.notes);
      }
      for(const e of SEED_DATA.expenses){
        await run(env, `INSERT OR IGNORE INTO expenses(id,trip_id,expense_date,category,amount,notes) VALUES(?,?,?,?,?,?)`,
          e.id,'',e.expense_date,e.category,e.amount,e.notes);
      }
      await run(env, `INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('seed_version','2',CURRENT_TIMESTAMP)`);
    }
    await run(env, `INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('schema_version','14',CURRENT_TIMESTAMP)`);
  })().catch(e=>{ initPromise=null; throw e; });
  return initPromise;
}

async function auth(req,env){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) return null;
  return first(env, `SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.active=1`, token);
}
async function requestBody(req){
  const type=req.headers.get('content-type')||'';
  if(type.includes('application/json')) return req.json().catch(()=>({}));
  return {};
}
async function audit(env,user,action,entity,id,payload={}){
  await run(env, `INSERT INTO audit_logs(id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?)`,
    uid('AUD'), user?.id || null, action, entity, id, JSON.stringify(payload));
}
async function upsertMasters(env,b){
  if(b.partyName){
    const name=upper(b.partyName);
    await run(env, `INSERT OR IGNORE INTO party_accounts(id,party_name) VALUES(?,?)`,uid('PA'),name);
  }
  if(b.truckNo){
    const no=upper(b.truckNo);
    await run(env, `INSERT OR IGNORE INTO trucks(id,truck_no,owner_name) VALUES(?,?,?)`,uid('TRK'),no,upper(b.ownerName||''));
  }
  if(b.material){
    await run(env, `INSERT OR IGNORE INTO materials(id,material_name) VALUES(?,?)`,uid('MAT'),upper(b.material));
  }
  if(b.loadingPoint && b.unloadingPoint){
    const exists=await first(env,`SELECT id FROM routes WHERE loading_point=? AND unloading_point=?`,upper(b.loadingPoint),upper(b.unloadingPoint));
    if(!exists) await run(env,`INSERT INTO routes(id,loading_point,unloading_point) VALUES(?,?,?)`,uid('RTE'),upper(b.loadingPoint),upper(b.unloadingPoint));
  }
}
function nextNumber(rows,defaultPrefix='ML - '){
  let best={number:0,prefix:defaultPrefix,width:0};
  for(const raw of rows){
    const value=String(raw||'').trim();
    const match=value.match(/^(.*?)(\d+)\s*$/);
    if(!match)continue;
    const number=Number(match[2]);
    if(number>best.number){
      best={
        number,
        prefix:match[1]||defaultPrefix,
        width:match[2].length
      };
    }
  }
  const next=best.number+1;
  const digits=best.width>1?String(next).padStart(best.width,'0'):String(next);
  return `${best.prefix}${digits}`;
}
function pathParts(path){ return path.replace(/^\/api\/?/,'').split('/').filter(Boolean); }

async function bootstrap(env,user){
  const [
    parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    truckEntries,supplierPayments,expenses,documents,audits
  ]=await Promise.all([
    all(env,`SELECT * FROM party_accounts ORDER BY COALESCE(ledger_no,''),party_name`),
    all(env,`SELECT * FROM party_payments ORDER BY payment_date DESC,created_at DESC`),
    all(env,`SELECT * FROM trucks ORDER BY truck_no`),
    all(env,`SELECT * FROM routes ORDER BY loading_point,unloading_point`),
    all(env,`SELECT * FROM materials ORDER BY material_name`),
    all(env,`SELECT * FROM trips ORDER BY trip_date DESC,created_at DESC`),
    all(env,`SELECT * FROM invoices ORDER BY invoice_date DESC,created_at DESC`),
    all(env,`SELECT * FROM invoice_items ORDER BY invoice_id,created_at`),
    all(env,`SELECT * FROM truck_payments ORDER BY entry_date DESC,created_at DESC`),
    all(env,`SELECT * FROM supplier_payments ORDER BY payment_date DESC,created_at DESC`),
    all(env,`SELECT * FROM expenses ORDER BY expense_date DESC,created_at DESC`),
    all(env,`SELECT id,truck_no,kind,file_name,file_type,expiry_date,notes,created_at FROM truck_documents ORDER BY created_at DESC`),
    all(env,`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 150`)
  ]);

  const itemsByInvoice={};
  for(const it of invoiceItems)(itemsByInvoice[it.invoice_id]??=[]).push(it);
  for(const inv of invoices)inv.items=itemsByInvoice[inv.id]||[];

  const partyMap={};
  for(const p of parties)partyMap[p.party_name]={...p,billed:0,received:0,invoices:0,payments:0};
  for(const inv of invoices){
    partyMap[inv.party_name]??={party_name:inv.party_name,ledger_no:'',billed:0,received:0,invoices:0,payments:0};
    partyMap[inv.party_name].billed+=num(inv.total);partyMap[inv.party_name].invoices++;
  }
  for(const pay of partyPayments){
    partyMap[pay.party_name]??={party_name:pay.party_name,ledger_no:'',billed:0,received:0,invoices:0,payments:0};
    partyMap[pay.party_name].received+=num(pay.amount);partyMap[pay.party_name].payments++;
  }
  const partyLedger=Object.values(partyMap).map(x=>({...x,billed:round2(x.billed),received:round2(x.received),outstanding:round2(x.billed-x.received)})).sort((a,b)=>b.outstanding-a.outstanding);

  const supplierMap={};
  for(const e of truckEntries){
    const n=e.owner_name||'UNKNOWN';
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set()};
    supplierMap[n].payable+=num(e.payable);supplierMap[n].entries++;supplierMap[n].trucks.add(e.truck_no);
  }
  for(const p of supplierPayments){
    const n=p.owner_name||'UNKNOWN';
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set()};
    supplierMap[n].paid+=num(p.amount);supplierMap[n].payments++;if(p.truck_no)supplierMap[n].trucks.add(p.truck_no);
  }
  const supplierLedger=Object.values(supplierMap).map(x=>({
    owner_name:x.owner_name,payable:round2(x.payable),paid:round2(x.paid),pending:round2(x.payable-x.paid),
    entries:x.entries,payments:x.payments,truck_count:x.trucks.size
  })).sort((a,b)=>b.pending-a.pending);

  const totalBilling=round2(invoices.reduce((a,x)=>a+num(x.total),0));
  const invoiceSubtotal=round2(invoices.reduce((a,x)=>a+num(x.subtotal),0));
  const partyReceived=round2(partyPayments.reduce((a,x)=>a+num(x.amount),0));
  const supplierPayable=round2(truckEntries.reduce((a,x)=>a+num(x.payable),0));
  const supplierPaid=round2(supplierPayments.reduce((a,x)=>a+num(x.amount),0));
  const expenseTotal=round2(expenses.reduce((a,x)=>a+num(x.amount),0));

  const issues=[];
  for(const p of partyLedger)if(p.outstanding<-.01)issues.push({severity:'warning',type:'PARTY_OVERPAYMENT',text:`${p.party_name}: received amount is ${Math.abs(p.outstanding).toFixed(2)} greater than billing. Verify missing invoice or advance.`});
  for(const s of supplierLedger)if(s.pending<-.01)issues.push({severity:'warning',type:'SUPPLIER_OVERPAYMENT',text:`${s.owner_name}: supplier payment is ${Math.abs(s.pending).toFixed(2)} greater than payable.`});
  for(const t of trips){
    if(!invoiceItems.some(i=>String(i.trip_id||'')===String(t.id)))issues.push({severity:'info',type:'TRIP_WITHOUT_INVOICE',text:`Trip ${t.id} (${t.truck_no}) has no linked invoice.`});
    if(!trucks.some(x=>x.truck_no===t.truck_no))issues.push({severity:'warning',type:'MISSING_TRUCK_MASTER',text:`${t.truck_no} is used in trips but missing from Truck Master.`});
  }

  return {
    version:'2026.08.04-final',
    user,parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    truckEntries,supplierPayments,expenses,documents,audits,partyLedger,supplierLedger,issues,
    nextInvoiceNo:nextNumber(invoices.map(x=>x.invoice_no),'ML - '),
    summary:{
      totalBilling,invoiceSubtotal,partyReceived,partyOutstanding:round2(totalBilling-partyReceived),
      supplierPayable,supplierPaid,supplierPending:round2(supplierPayable-supplierPaid),
      expenses:expenseTotal,estimatedProfit:round2(invoiceSubtotal-supplierPayable-expenseTotal),
      trips:trips.length,invoices:invoices.length
    }
  };
}

export default {
  async fetch(req,env){
    if(req.method==='OPTIONS')return json({ok:true});
    try{
      const url=new URL(req.url);
      const parts=pathParts(url.pathname);
      const resource=parts[0]||'';
      const id=decodeURIComponent(parts[1]||'');

      if(resource==='health')return new Response(JSON.stringify({ok:true,service:'Meera Logistics ERP API',version:'2026.08.04-speed'}),{headers:{...HEADERS,'cache-control':'public,max-age=60'}});

      // Login fast path: query the existing users table first. Only run the full
      // schema initializer if this is a brand-new database.
      if(resource==='login'&&req.method==='POST'){
        let usersReady=true;
        try{await first(env,`SELECT id FROM users LIMIT 1`)}catch(_){usersReady=false}
        if(!usersReady)await ensureDatabase(env);
        const b=await requestBody(req);
        const hash=await sha256(b.password||'');
        const user=await first(env,`SELECT id,username,role FROM users WHERE LOWER(username)=LOWER(?) AND password_hash=? AND active=1`,clean(b.username),hash);
        if(!user)return json({error:'Invalid username or password'},401);
        const token=crypto.randomUUID();
        await run(env,`DELETE FROM sessions WHERE expires_at<=datetime('now')`);
        await run(env,`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))`,token,user.id);
        return json({token,user});
      }

      await ensureDatabase(env);
      const user=await auth(req,env);
      if(!user)return json({error:'Unauthorized'},401);

      if(resource==='logout'&&req.method==='POST'){
        const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
        if(token)await run(env,`DELETE FROM sessions WHERE token=?`,token);
        return json({ok:true});
      }
      if(resource==='bootstrap'&&req.method==='GET')return json(await bootstrap(env,user));

      if(resource==='party-ledger'&&req.method==='GET'&&id){
        const name=upper(id);
        const party=await first(env,`SELECT * FROM party_accounts WHERE party_name=?`,name);
        const invoices=await all(env,`SELECT * FROM invoices WHERE party_name=? ORDER BY invoice_date,created_at`,name);
        const payments=await all(env,`SELECT * FROM party_payments WHERE party_name=? ORDER BY payment_date,created_at`,name);
        const lines=[
          ...invoices.map(x=>({date:x.invoice_date,type:'INVOICE',reference:x.invoice_no,debit:num(x.total),credit:0,notes:x.lr_no||''})),
          ...payments.map(x=>({date:x.payment_date,type:'PAYMENT',reference:x.receipt_no||x.reference||x.id,debit:0,credit:num(x.amount),notes:x.notes||''}))
        ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        let balance=0;for(const x of lines){balance=round2(balance+x.debit-x.credit);x.balance=balance}
        return json({party,invoices,payments,lines,balance});
      }
      if(resource==='supplier-ledger'&&req.method==='GET'&&id){
        const name=upper(id);
        const entries=await all(env,`SELECT * FROM truck_payments WHERE owner_name=? ORDER BY entry_date,created_at`,name);
        const payments=await all(env,`SELECT * FROM supplier_payments WHERE owner_name=? ORDER BY payment_date,created_at`,name);
        const lines=[
          ...entries.map(x=>({date:x.entry_date,type:'FREIGHT',reference:x.truck_no,debit:num(x.payable),credit:0,notes:x.loading_point+' → '+x.unloading_point})),
          ...payments.map(x=>({date:x.payment_date,type:'PAYMENT',reference:x.receipt_no||x.reference||x.id,debit:0,credit:num(x.amount),notes:x.notes||''}))
        ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        let balance=0;for(const x of lines){balance=round2(balance+x.debit-x.credit);x.balance=balance}
        return json({entries,payments,lines,balance});
      }

      if(resource==='export'&&req.method==='GET')return json(await bootstrap(env,user));

      if(resource==='import'&&req.method==='POST'){
        const b=await requestBody(req);
        const data=b.data||b;
        if(!data || !Array.isArray(data.parties))return json({error:'Invalid backup file'},400);
        if(b.mode==='replace'){
          const tables=['invoice_items','invoices','party_payments','supplier_payments','truck_payments','trips','expenses','truck_documents','materials','routes','trucks','party_accounts'];
          for(const t of tables)await env.DB.prepare(`DELETE FROM ${t}`).run();
        }
        const rows=data;
        for(const p of rows.parties||[])await run(env,`INSERT OR REPLACE INTO party_accounts(id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?)`,p.id||uid('PA'),p.ledger_no||'',upper(p.party_name),p.address||'',p.gst_no||'',p.mobile||'',p.email||'');
        for(const p of rows.partyPayments||[])await run(env,`INSERT OR REPLACE INTO party_payments(id,receipt_no,trip_id,party_name,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?)`,p.id||uid('PP'),p.receipt_no||'',p.trip_id||'',upper(p.party_name),p.payment_date,num(p.amount),upper(p.payment_mode),p.reference||'',p.notes||'');
        for(const t of rows.trucks||[])await run(env,`INSERT OR REPLACE INTO trucks(id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?)`,t.id||uid('TRK'),upper(t.truck_no),upper(t.owner_name),t.owner_mobile||'',t.bank_details||'');
        for(const r of rows.routes||[])await run(env,`INSERT OR REPLACE INTO routes(id,loading_point,unloading_point) VALUES(?,?,?)`,r.id||uid('RTE'),upper(r.loading_point),upper(r.unloading_point));
        for(const m of rows.materials||[])await run(env,`INSERT OR REPLACE INTO materials(id,material_name) VALUES(?,?)`,m.id||uid('MAT'),upper(m.material_name));
        for(const t of rows.trips||[])await run(env,`INSERT OR REPLACE INTO trips(id,trip_date,party_name,truck_no,driver_name,driver_mobile,material,loading_point,unloading_point,weight,rate,status,notes,pod_file_name,pod_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,t.id||uid('TRIP'),t.trip_date,upper(t.party_name),upper(t.truck_no),upper(t.driver_name),t.driver_mobile||'',upper(t.material),upper(t.loading_point),upper(t.unloading_point),num(t.weight),num(t.rate),upper(t.status||'BOOKED'),t.notes||'',t.pod_file_name||'',t.pod_data||'');
        for(const i of rows.invoices||[])await run(env,`INSERT OR REPLACE INTO invoices(id,invoice_no,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,i.id||uid('INV'),i.invoice_no,i.invoice_date,upper(i.party_name),i.party_address||'',i.party_gst||'',i.lr_no||'',upper(i.material),i.loading_date||'',num(i.sgst),num(i.cgst),num(i.diesel),num(i.munshi),num(i.subtotal),num(i.gst_amount),num(i.total),i.comments||'');
        for(const it of rows.invoiceItems||[])await run(env,`INSERT OR REPLACE INTO invoice_items(id,invoice_id,trip_id,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,it.id||uid('II'),it.invoice_id,it.trip_id||'',upper(it.truck_no),upper(it.description),num(it.loading_weight||it.weight),num(it.unloading_weight||it.weight),num(it.shortage),num(it.weight),num(it.rate),num(it.amount));
        for(const e of rows.truckEntries||[])await run(env,`INSERT OR REPLACE INTO truck_payments(id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,weight,rate,commission,payable,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,e.id||uid('TE'),e.trip_id||'',e.entry_date,upper(e.truck_no),upper(e.owner_name),e.bank_details||'',upper(e.loading_point),upper(e.unloading_point),num(e.weight),num(e.rate),num(e.commission),num(e.payable),e.notes||'');
        for(const p of rows.supplierPayments||[])await run(env,`INSERT OR REPLACE INTO supplier_payments(id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,p.id||uid('SP'),p.receipt_no||'',p.trip_id||'',upper(p.owner_name),upper(p.truck_no),p.payment_date,num(p.amount),upper(p.payment_mode),p.reference||'',p.notes||'');
        for(const e of rows.expenses||[])await run(env,`INSERT OR REPLACE INTO expenses(id,trip_id,expense_date,category,amount,notes) VALUES(?,?,?,?,?,?)`,e.id||uid('EXP'),e.trip_id||'',e.expense_date,upper(e.category),num(e.amount),e.notes||'');
        await audit(env,user,'IMPORT','backup','', {mode:b.mode||'merge'});
        return json({ok:true});
      }

      // PARTY MASTER
      if(resource==='parties'){
        if(req.method==='POST'){
          const b=await requestBody(req),name=upper(b.partyName),newId=uid('PA');
          if(!name)return json({error:'Party name required'},400);
          await run(env,`INSERT INTO party_accounts(id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?)`,newId,b.ledgerNo||'',name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'');
          await audit(env,user,'CREATE','party',newId,b);return json({ok:true,id:newId});
        }
        if(req.method==='PUT'&&id){
          const b=await requestBody(req),old=await first(env,`SELECT party_name FROM party_accounts WHERE id=?`,id),name=upper(b.partyName);
          await run(env,`UPDATE party_accounts SET ledger_no=?,party_name=?,address=?,gst_no=?,mobile=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.ledgerNo||'',name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'',id);
          if(old&&old.party_name!==name){
            await run(env,`UPDATE invoices SET party_name=? WHERE party_name=?`,name,old.party_name);
            await run(env,`UPDATE trips SET party_name=? WHERE party_name=?`,name,old.party_name);
            await run(env,`UPDATE party_payments SET party_name=? WHERE party_name=?`,name,old.party_name);
          }
          await audit(env,user,'UPDATE','party',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          const p=await first(env,`SELECT party_name FROM party_accounts WHERE id=?`,id);
          if(p){
            const used=await first(env,`SELECT (SELECT COUNT(*) FROM invoices WHERE party_name=?)+(SELECT COUNT(*) FROM trips WHERE party_name=?)+(SELECT COUNT(*) FROM party_payments WHERE party_name=?) AS c`,p.party_name,p.party_name,p.party_name);
            if(num(used?.c)>0)return json({error:'Party has linked invoices, trips or payments'},409);
          }
          await run(env,`DELETE FROM party_accounts WHERE id=?`,id);await audit(env,user,'DELETE','party',id,{});return json({ok:true});
        }
      }

      // PARTY PAYMENTS
      if(resource==='party-payments'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          if(req.method==='POST'){
            const newId=uid('PP'),receipt=`PR-${Date.now().toString().slice(-8)}`;
            await run(env,`INSERT INTO party_payments(id,receipt_no,trip_id,party_name,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?)`,newId,receipt,b.tripId||'',upper(b.partyName),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'');
            await audit(env,user,'CREATE','party_payment',newId,b);return json({ok:true,id:newId,receipt});
          }
          await run(env,`UPDATE party_payments SET trip_id=?,party_name=?,payment_date=?,amount=?,payment_mode=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.tripId||'',upper(b.partyName),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'',id);
          await audit(env,user,'UPDATE','party_payment',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM party_payments WHERE id=?`,id);await audit(env,user,'DELETE','party_payment',id,{});return json({ok:true})}
      }

      // TRUCKS
      if(resource==='trucks'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req),no=upper(b.truckNo);
          if(req.method==='POST'){
            const newId=uid('TRK');await run(env,`INSERT INTO trucks(id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?)`,newId,no,upper(b.ownerName),b.ownerMobile||'',b.bankDetails||'');
            await audit(env,user,'CREATE','truck',newId,b);return json({ok:true,id:newId});
          }
          const old=await first(env,`SELECT truck_no FROM trucks WHERE id=?`,id);
          await run(env,`UPDATE trucks SET truck_no=?,owner_name=?,owner_mobile=?,bank_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,no,upper(b.ownerName),b.ownerMobile||'',b.bankDetails||'',id);
          if(old&&old.truck_no!==no){
            for(const table of ['trips','invoice_items','truck_payments','supplier_payments','truck_documents'])await run(env,`UPDATE ${table} SET truck_no=? WHERE truck_no=?`,no,old.truck_no);
          }
          await audit(env,user,'UPDATE','truck',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          const t=await first(env,`SELECT truck_no FROM trucks WHERE id=?`,id);
          if(t){
            const used=await first(env,`SELECT (SELECT COUNT(*) FROM trips WHERE truck_no=?)+(SELECT COUNT(*) FROM truck_payments WHERE truck_no=?) AS c`,t.truck_no,t.truck_no);
            if(num(used?.c)>0)return json({error:'Truck has linked trips or supplier entries'},409);
          }
          await run(env,`DELETE FROM trucks WHERE id=?`,id);await audit(env,user,'DELETE','truck',id,{});return json({ok:true});
        }
      }

      // TRIPS
      if(resource==='trips'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          if(req.method==='POST'){
            const duplicate=await first(env,`SELECT id FROM trips WHERE trip_date=? AND party_name=? AND truck_no=? AND loading_point=? AND unloading_point=? AND ABS(weight-?)<0.001`,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.loadingPoint),upper(b.unloadingPoint),num(b.weight));
            if(duplicate)return json({error:'Duplicate trip detected'},409);
            const newId=uid('TRIP');
            await run(env,`INSERT INTO trips(id,trip_date,party_name,truck_no,driver_name,driver_mobile,material,loading_point,unloading_point,weight,rate,status,notes,pod_file_name,pod_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,newId,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),b.driverMobile||'',upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||'');
            await audit(env,user,'CREATE','trip',newId,b);return json({ok:true,id:newId});
          }
          await run(env,`UPDATE trips SET trip_date=?,party_name=?,truck_no=?,driver_name=?,driver_mobile=?,material=?,loading_point=?,unloading_point=?,weight=?,rate=?,status=?,notes=?,pod_file_name=?,pod_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),b.driverMobile||'',upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||'',id);
          await audit(env,user,'UPDATE','trip',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          const linked=await first(env,`SELECT id FROM invoice_items WHERE trip_id=? LIMIT 1`,id);
          if(linked)return json({error:'Delete linked invoice first'},409);
          await run(env,`DELETE FROM trips WHERE id=?`,id);await audit(env,user,'DELETE','trip',id,{});return json({ok:true});
        }
      }

      // INVOICES
      if(resource==='invoices'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          const rawItems=Array.isArray(b.items)?b.items:[];
          const items=rawItems.map(x=>{
            const loading=round2(x.loadingWeight ?? x.loading_weight ?? x.weight);
            const unloading=round2(x.unloadingWeight ?? x.unloading_weight ?? x.weight);
            const shortage=round2(Math.max(0,loading-unloading));
            const billing=round2(x.weight ?? x.billingWeight ?? unloading);
            return {...x,loadingWeight:loading,unloadingWeight:unloading,shortage,weight:billing,rate:round2(x.rate)};
          }).filter(x=>num(x.weight)>0 && clean(x.truckNo));
          if(!items.length)return json({error:'At least one truck line is required'},400);
          const freightSubtotal=round2(items.reduce((a,x)=>a+num(x.weight)*num(x.rate),0));
          const subtotal=round2(freightSubtotal+num(b.diesel)+num(b.munshi));
          const gstAmount=round2(subtotal*(num(b.sgst)+num(b.cgst))/100);
          const total=round2(subtotal+gstAmount);
          if(req.method==='POST'){
            const newId=uid('INV');
            try{
              await run(env,`INSERT INTO invoices(id,invoice_no,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,newId,clean(b.invoiceNo),b.invoiceDate,upper(b.partyName),b.partyAddress||'',upper(b.partyGst),b.lrNo||'',upper(b.material),b.loadingDate||'',num(b.sgst),num(b.cgst),num(b.diesel),num(b.munshi),subtotal,gstAmount,total,b.comments||'');
            }catch(e){if(/UNIQUE/i.test(String(e.message)))return json({error:'Invoice number already exists'},409);throw e}
            for(const x of items)await run(env,`INSERT INTO invoice_items(id,invoice_id,trip_id,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,uid('II'),newId,x.tripId||'',upper(x.truckNo),upper(x.description),x.loadingWeight,x.unloadingWeight,x.shortage,x.weight,x.rate,round2(x.weight*x.rate));
            await audit(env,user,'CREATE','invoice',newId,b);return json({ok:true,id:newId,total});
          }
          await run(env,`UPDATE invoices SET invoice_no=?,invoice_date=?,party_name=?,party_address=?,party_gst=?,lr_no=?,material=?,loading_date=?,sgst=?,cgst=?,diesel=?,munshi=?,subtotal=?,gst_amount=?,total=?,comments=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,clean(b.invoiceNo),b.invoiceDate,upper(b.partyName),b.partyAddress||'',upper(b.partyGst),b.lrNo||'',upper(b.material),b.loadingDate||'',num(b.sgst),num(b.cgst),num(b.diesel),num(b.munshi),subtotal,gstAmount,total,b.comments||'',id);
          await run(env,`DELETE FROM invoice_items WHERE invoice_id=?`,id);
          for(const x of items)await run(env,`INSERT INTO invoice_items(id,invoice_id,trip_id,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,uid('II'),id,x.tripId||'',upper(x.truckNo),upper(x.description),x.loadingWeight,x.unloadingWeight,x.shortage,x.weight,x.rate,round2(x.weight*x.rate));
          await audit(env,user,'UPDATE','invoice',id,b);return json({ok:true,total});
        }
        if(req.method==='DELETE'&&id){
          await run(env,`DELETE FROM invoice_items WHERE invoice_id=?`,id);await run(env,`DELETE FROM invoices WHERE id=?`,id);await audit(env,user,'DELETE','invoice',id,{});return json({ok:true});
        }
      }

      // TRUCK PAYABLE ENTRIES
      if(resource==='truck-entries'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          const payable=round2(num(b.weight)*num(b.rate)-num(b.commission));
          if(req.method==='POST'){
            const newId=uid('TE');await run(env,`INSERT INTO truck_payments(id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,weight,rate,commission,payable,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,newId,b.tripId||'',b.entryDate,upper(b.truckNo),upper(b.ownerName),b.bankDetails||'',upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),round2(b.commission),payable,b.notes||'');
            await audit(env,user,'CREATE','truck_entry',newId,b);return json({ok:true,id:newId,payable});
          }
          await run(env,`UPDATE truck_payments SET trip_id=?,entry_date=?,truck_no=?,owner_name=?,bank_details=?,loading_point=?,unloading_point=?,weight=?,rate=?,commission=?,payable=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.tripId||'',b.entryDate,upper(b.truckNo),upper(b.ownerName),b.bankDetails||'',upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),round2(b.commission),payable,b.notes||'',id);
          await audit(env,user,'UPDATE','truck_entry',id,b);return json({ok:true,payable});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM truck_payments WHERE id=?`,id);await audit(env,user,'DELETE','truck_entry',id,{});return json({ok:true})}
      }

      // SUPPLIER PAYMENTS
      if(resource==='supplier-payments'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          if(req.method==='POST'){
            const newId=uid('SP'),receipt=`SP-${Date.now().toString().slice(-8)}`;
            await run(env,`INSERT INTO supplier_payments(id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,newId,receipt,b.tripId||'',upper(b.ownerName),upper(b.truckNo),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'');
            await audit(env,user,'CREATE','supplier_payment',newId,b);return json({ok:true,id:newId,receipt});
          }
          await run(env,`UPDATE supplier_payments SET trip_id=?,owner_name=?,truck_no=?,payment_date=?,amount=?,payment_mode=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.tripId||'',upper(b.ownerName),upper(b.truckNo),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'',id);
          await audit(env,user,'UPDATE','supplier_payment',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM supplier_payments WHERE id=?`,id);await audit(env,user,'DELETE','supplier_payment',id,{});return json({ok:true})}
      }

      // ROUTES & MATERIALS
      if(resource==='routes'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);
          if(req.method==='POST'){const newId=uid('RTE');await run(env,`INSERT INTO routes(id,loading_point,unloading_point) VALUES(?,?,?)`,newId,upper(b.loadingPoint),upper(b.unloadingPoint));await audit(env,user,'CREATE','route',newId,b);return json({ok:true,id:newId})}
          await run(env,`UPDATE routes SET loading_point=?,unloading_point=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,upper(b.loadingPoint),upper(b.unloadingPoint),id);await audit(env,user,'UPDATE','route',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM routes WHERE id=?`,id);await audit(env,user,'DELETE','route',id,{});return json({ok:true})}
      }
      if(resource==='materials'){
        if(req.method==='POST'){const b=await requestBody(req),newId=uid('MAT');await run(env,`INSERT INTO materials(id,material_name) VALUES(?,?)`,newId,upper(b.materialName));await audit(env,user,'CREATE','material',newId,b);return json({ok:true,id:newId})}
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM materials WHERE id=?`,id);await audit(env,user,'DELETE','material',id,{});return json({ok:true})}
      }

      // EXPENSES
      if(resource==='expenses'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);
          if(req.method==='POST'){const newId=uid('EXP');await run(env,`INSERT INTO expenses(id,trip_id,expense_date,category,amount,notes) VALUES(?,?,?,?,?,?)`,newId,b.tripId||'',b.expenseDate,upper(b.category),round2(b.amount),b.notes||'');await audit(env,user,'CREATE','expense',newId,b);return json({ok:true,id:newId})}
          await run(env,`UPDATE expenses SET trip_id=?,expense_date=?,category=?,amount=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.tripId||'',b.expenseDate,upper(b.category),round2(b.amount),b.notes||'',id);await audit(env,user,'UPDATE','expense',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM expenses WHERE id=?`,id);await audit(env,user,'DELETE','expense',id,{});return json({ok:true})}
      }

      // DOCUMENTS
      if(resource==='documents'){
        if(req.method==='POST'){
          const b=await requestBody(req);
          if(String(b.fileData||'').length>2200000)return json({error:'Image is too large. Use a smaller/compressed image.'},413);
          const newId=uid('DOC');await run(env,`INSERT INTO truck_documents(id,truck_no,kind,file_name,file_type,file_data,expiry_date,notes) VALUES(?,?,?,?,?,?,?,?)`,newId,upper(b.truckNo),upper(b.kind),b.fileName||'',b.fileType||'',b.fileData||'',b.expiryDate||'',b.notes||'');await audit(env,user,'CREATE','document',newId,{...b,fileData:'[hidden]'});return json({ok:true,id:newId});
        }
        if(req.method==='GET'&&id){
          const d=await first(env,`SELECT * FROM truck_documents WHERE id=?`,id);
          if(!d)return json({error:'File not found'},404);
          return json(d);
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM truck_documents WHERE id=?`,id);await audit(env,user,'DELETE','document',id,{});return json({ok:true})}
      }

      return json({error:'Not found'},404);
    }catch(e){
      return json({error:String(e?.message||e)},500);
    }
  }
};
