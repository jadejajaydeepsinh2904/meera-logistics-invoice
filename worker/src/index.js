
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


async function backfillPartyMaster(env){
  // Older databases may already contain Party rows with blank GST/address.
  // Use the latest available invoice values to complete the Party Master.
  try{
    await env.DB.prepare(`
      UPDATE party_accounts
      SET
        gst_no = CASE
          WHEN COALESCE(TRIM(gst_no),'')='' THEN COALESCE((
            SELECT i.party_gst
            FROM invoices i
            WHERE i.party_name=party_accounts.party_name
              AND COALESCE(TRIM(i.party_gst),'')<>''
            ORDER BY i.invoice_date DESC, i.created_at DESC
            LIMIT 1
          ),gst_no)
          ELSE gst_no
        END,
        address = CASE
          WHEN COALESCE(TRIM(address),'')='' THEN COALESCE((
            SELECT i.party_address
            FROM invoices i
            WHERE i.party_name=party_accounts.party_name
              AND COALESCE(TRIM(i.party_address),'')<>''
            ORDER BY i.invoice_date DESC, i.created_at DESC
            LIMIT 1
          ),address)
          ELSE address
        END,
        updated_at = CASE
          WHEN COALESCE(TRIM(gst_no),'')='' OR COALESCE(TRIM(address),'')=''
          THEN CURRENT_TIMESTAMP ELSE updated_at END
    `).run();
  }catch(_){
    // Safe on first deployment before all compatibility columns exist.
  }
}


async function currentTripMax(env){
  const rows=await all(env,`SELECT trip_no FROM trips WHERE COALESCE(TRIM(trip_no),'')<>''`);
  let max=0;
  for(const row of rows){
    const m=String(row.trip_no||'').match(/TR\s*0*(\d+)/i);
    if(m)max=Math.max(max,Number(m[1]));
  }
  return max;
}
async function reserveNextTripNumber(env){
  let candidate=(await currentTripMax(env))+1;
  for(let attempt=0;attempt<1000;attempt++,candidate++){
    const tripNo=`TR ${String(candidate).padStart(3,'0')}`;
    const exists=await first(env,`SELECT id FROM trips WHERE trip_no=? LIMIT 1`,tripNo);
    if(!exists)return tripNo;
  }
  throw new Error('Unable to allocate a unique Trip number');
}
function splitRoute(description=''){
  const text=String(description||'').trim();
  const parts=text.split(/\s+(?:TO|→|-)\s+/i);
  return {loading:upper(parts[0]||''),unloading:upper(parts.slice(1).join(' TO ')||'')};
}

async function ensureTripWeightColumns(env){
  const statements=[
    `ALTER TABLE trips ADD COLUMN lr_number TEXT DEFAULT ''`,
    `ALTER TABLE trips ADD COLUMN loading_weight REAL DEFAULT 0`,
    `ALTER TABLE trips ADD COLUMN unloading_weight REAL DEFAULT 0`,
    `ALTER TABLE trips ADD COLUMN shortage REAL DEFAULT 0`,
    `ALTER TABLE trips ADD COLUMN billing_weight REAL DEFAULT 0`,
    `ALTER TABLE trips ADD COLUMN supplier_name TEXT DEFAULT ''`,
    `ALTER TABLE invoice_items ADD COLUMN lr_number TEXT DEFAULT ''`
  ];
  for(const sql of statements)await safe(env,sql);
}

async function currentPartyLedgerMax(env){
  const rows=await all(env,`SELECT ledger_no FROM party_accounts WHERE COALESCE(TRIM(ledger_no),'')<>''`);
  let max=0;
  for(const row of rows){
    const match=String(row.ledger_no||'').match(/MLP\s*0*(\d+)/i);
    if(match)max=Math.max(max,Number(match[1]));
  }
  return max;
}
async function reservePartyLedgerNumber(env){
  let next=(await currentPartyLedgerMax(env))+1;
  for(let attempt=0;attempt<1000;attempt++,next++){
    const ledgerNo=`MLP ${String(next).padStart(3,'0')}`;
    const exists=await first(env,`SELECT id FROM party_accounts WHERE ledger_no=? LIMIT 1`,ledgerNo);
    if(!exists)return ledgerNo;
  }
  throw new Error('Unable to allocate Party ledger number');
}
async function ensurePartyLedgerForId(env,id){
  const row=await first(env,`SELECT id,ledger_no FROM party_accounts WHERE id=? LIMIT 1`,id);
  if(!row)return '';
  if(String(row.ledger_no||'').trim())return String(row.ledger_no).trim();
  for(let attempt=0;attempt<1000;attempt++){
    const ledgerNo=await reservePartyLedgerNumber(env);
    try{
      await run(env,`UPDATE party_accounts SET ledger_no=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(TRIM(ledger_no),'')=''`,ledgerNo,id);
      const saved=await first(env,`SELECT ledger_no FROM party_accounts WHERE id=? LIMIT 1`,id);
      if(saved?.ledger_no)return saved.ledger_no;
    }catch(error){
      if(!/UNIQUE|constraint/i.test(String(error?.message||error)))throw error;
    }
  }
  throw new Error('Unable to save Party ledger number');
}
async function ensureAllPartyLedgerNumbers(env){
  const rows=await all(env,`SELECT id FROM party_accounts WHERE ledger_no IS NULL OR TRIM(ledger_no)='' ORDER BY party_name,id`);
  for(const row of rows)await ensurePartyLedgerForId(env,row.id);
}
async function normalizeRequestedPartyLedger(env,value,excludeId=''){
  const requested=upper(value);
  if(!requested)return reservePartyLedgerNumber(env);
  const exists=excludeId
    ? await first(env,`SELECT id FROM party_accounts WHERE ledger_no=? AND id<>? LIMIT 1`,requested,excludeId)
    : await first(env,`SELECT id FROM party_accounts WHERE ledger_no=? LIMIT 1`,requested);
  if(exists)throw new Error(`Party ledger number ${requested} already exists`);
  return requested;
}

async function ensureSupplierAccountForName(env,value){
  const name=upper(value);
  if(!name)return '';
  const existing=await first(env,`SELECT ledger_no FROM supplier_accounts WHERE owner_name=? LIMIT 1`,name);
  if(existing?.ledger_no)return existing.ledger_no;
  const rows=await all(env,`SELECT ledger_no FROM supplier_accounts`);
  let next=rows.reduce((max,row)=>Math.max(max,Number(String(row.ledger_no||'').replace(/\D/g,''))||0),0)+1;
  for(let attempt=0;attempt<1000;attempt++,next++){
    const ledgerNo=`PML ${String(next).padStart(3,'0')}`;
    try{
      await run(env,`INSERT INTO supplier_accounts(id,ledger_no,owner_name) VALUES(?,?,?)`,uid('SUP'),ledgerNo,name);
      return ledgerNo;
    }catch(error){
      const now=await first(env,`SELECT ledger_no FROM supplier_accounts WHERE owner_name=? LIMIT 1`,name);
      if(now?.ledger_no)return now.ledger_no;
      if(!/UNIQUE|constraint/i.test(String(error?.message||error)))throw error;
    }
  }
  throw new Error('Unable to allocate supplier ledger number');
}

async function recalcInvoiceById(env,invoiceId){
  const inv=await first(env,`SELECT * FROM invoices WHERE id=?`,invoiceId);
  if(!inv)return;
  const items=await all(env,`SELECT * FROM invoice_items WHERE invoice_id=?`,invoiceId);
  const freight=round2(items.reduce((a,x)=>a+num(x.amount),0));
  const subtotal=round2(freight+num(inv.diesel)+num(inv.munshi));
  const nonGst=(inv.invoice_type||'GST')==='NON_GST';
  const gstAmount=nonGst?0:round2(subtotal*(num(inv.sgst)+num(inv.cgst))/100);
  const total=round2(subtotal+gstAmount);
  await run(env,`UPDATE invoices SET subtotal=?,gst_amount=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,subtotal,gstAmount,total,invoiceId);
}
async function ensureSupplierAccounts(env){
  const names=await all(env,`
    SELECT DISTINCT owner_name FROM trucks WHERE COALESCE(TRIM(owner_name),'')<>''
    UNION
    SELECT DISTINCT owner_name FROM truck_payments WHERE COALESCE(TRIM(owner_name),'')<>''
    UNION
    SELECT DISTINCT owner_name FROM supplier_payments WHERE COALESCE(TRIM(owner_name),'')<>''
    ORDER BY owner_name
  `);
  const existing=await all(env,`SELECT * FROM supplier_accounts ORDER BY CAST(REPLACE(ledger_no,'PML ','') AS INTEGER)`);
  let next=existing.reduce((m,x)=>{
    const n=Number(String(x.ledger_no||'').replace(/\D/g,''));return Math.max(m,n||0)
  },0)+1;
  if(!existing.length){
    let n=1;
    for(const row of names){
      await run(env,`INSERT OR IGNORE INTO supplier_accounts(id,ledger_no,owner_name) VALUES(?,?,?)`,uid('SUP'),`PML ${String(n++).padStart(3,'0')}`,upper(row.owner_name));
    }
    return;
  }
  const have=new Set(existing.map(x=>upper(x.owner_name)));
  for(const row of names){
    const name=upper(row.owner_name);
    if(!have.has(name)){
      await run(env,`INSERT OR IGNORE INTO supplier_accounts(id,ledger_no,owner_name) VALUES(?,?,?)`,uid('SUP'),`PML ${String(next++).padStart(3,'0')}`,name);
    }
  }
}
async function repairTripSeriesAndInvoiceLinks(env){
  const trips=await all(env,`SELECT id,trip_no,trip_date,created_at FROM trips ORDER BY trip_date,created_at,id`);
  const seen=new Set();
  let max=0;

  for(const t of trips){
    const m=String(t.trip_no||'').match(/^TR\s*0*(\d+)$/i);
    if(m){
      const normalized=`TR ${String(Number(m[1])).padStart(3,'0')}`;
      if(!seen.has(normalized)){
        seen.add(normalized);
        max=Math.max(max,Number(m[1]));
        if(normalized!==t.trip_no){
          try{await run(env,`UPDATE trips SET trip_no=? WHERE id=?`,normalized,t.id)}
          catch(_){}
        }
        continue;
      }
    }
    await run(env,`UPDATE trips SET trip_no=NULL WHERE id=?`,t.id);
  }

  const needsNumber=await all(env,`SELECT id FROM trips WHERE trip_no IS NULL OR TRIM(trip_no)='' ORDER BY trip_date,created_at,id`);
  for(const t of needsNumber){
    let assigned=false;
    while(!assigned){
      max++;
      const tripNo=`TR ${String(max).padStart(3,'0')}`;
      try{
        await run(env,`UPDATE trips SET trip_no=? WHERE id=?`,tripNo,t.id);
        assigned=true;
      }catch(e){
        if(!/UNIQUE|constraint/i.test(String(e?.message||e)))throw e;
      }
    }
  }

  const items=await all(env,`
    SELECT ii.*,i.invoice_date,i.party_name,i.material,i.loading_date
    FROM invoice_items ii
    JOIN invoices i ON i.id=ii.invoice_id
    ORDER BY i.invoice_date,ii.created_at,ii.id
  `);

  for(const item of items){
    let trip=await first(env,`SELECT * FROM trips WHERE invoice_item_id=? LIMIT 1`,item.id);
    if(!trip && item.trip_id){
      trip=await first(env,`SELECT * FROM trips WHERE id=? LIMIT 1`,item.trip_id);
    }

    const route=splitRoute(item.description);

    if(!trip){
      const tripId=uid('TRIP');
      let created=false;
      while(!created){
        const tripNo=await reserveNextTripNumber(env);
        try{
          await run(env,`INSERT INTO trips(
            id,trip_no,invoice_id,invoice_item_id,trip_date,party_name,truck_no,material,
            loading_point,unloading_point,weight,rate,status,notes
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            tripId,tripNo,item.invoice_id,item.id,item.loading_date||item.invoice_date,
            upper(item.party_name),upper(item.truck_no),upper(item.material),
            route.loading,route.unloading,round2(item.weight),round2(item.rate),'BOOKED',
            `Auto-created from invoice`
          );
          created=true;
        }catch(e){
          if(!/UNIQUE|constraint/i.test(String(e?.message||e)))throw e;
        }
      }
      await run(env,`UPDATE invoice_items SET trip_id=? WHERE id=?`,tripId,item.id);
      continue;
    }

    await run(env,`UPDATE trips SET invoice_id=?,invoice_item_id=? WHERE id=?`,item.invoice_id,item.id,trip.id);
    if(String(item.trip_id||'')!==String(trip.id)){
      await run(env,`UPDATE invoice_items SET trip_id=? WHERE id=?`,trip.id,item.id);
    }
  }
}
async function ensureDatabase(env){
  if(initPromise) return initPromise;
  initPromise = (async()=>{
    // Fast path: on an already-configured database, avoid repeating all DDL
    // statements on every Worker cold start.
    try{
      const ready=await first(env,`SELECT value FROM app_meta WHERE key='schema_version'`);
      if(ready?.value==='34'){
        await first(env,`SELECT trip_no,invoice_id,invoice_item_id FROM trips LIMIT 1`);
        await first(env,`SELECT ledger_no FROM supplier_accounts LIMIT 1`);
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
      `CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,trip_no TEXT DEFAULT NULL,invoice_id TEXT DEFAULT '',invoice_item_id TEXT DEFAULT '',trip_date TEXT,party_name TEXT,truck_no TEXT,driver_name TEXT DEFAULT '',driver_mobile TEXT DEFAULT '',material TEXT,loading_point TEXT,unloading_point TEXT,weight REAL DEFAULT 0,rate REAL DEFAULT 0,status TEXT DEFAULT 'BOOKED',notes TEXT DEFAULT '',pod_file_name TEXT DEFAULT '',pod_data TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,invoice_no TEXT UNIQUE NOT NULL,invoice_type TEXT DEFAULT 'GST',invoice_date TEXT,party_name TEXT,party_address TEXT DEFAULT '',party_gst TEXT DEFAULT '',lr_no TEXT DEFAULT '',material TEXT DEFAULT '',loading_date TEXT DEFAULT '',sgst REAL DEFAULT 9,cgst REAL DEFAULT 9,diesel REAL DEFAULT 0,munshi REAL DEFAULT 0,subtotal REAL DEFAULT 0,gst_amount REAL DEFAULT 0,total REAL DEFAULT 0,comments TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS pm_bills(id TEXT PRIMARY KEY,bill_no TEXT UNIQUE NOT NULL,bill_date TEXT,party_name TEXT NOT NULL,party_address TEXT DEFAULT '',supplier_name TEXT DEFAULT '',notes TEXT DEFAULT '',subtotal REAL DEFAULT 0,supplier_total REAL DEFAULT 0,profit REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS pm_bill_items(id TEXT PRIMARY KEY,bill_id TEXT NOT NULL,truck_no TEXT DEFAULT '',loading_point TEXT DEFAULT '',unloading_point TEXT DEFAULT '',weight REAL DEFAULT 0,party_rate REAL DEFAULT 0,supplier_rate REAL DEFAULT 0,party_amount REAL DEFAULT 0,supplier_amount REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS invoice_items(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL,trip_id TEXT DEFAULT '',truck_no TEXT,description TEXT,loading_weight REAL DEFAULT 0,unloading_weight REAL DEFAULT 0,shortage REAL DEFAULT 0,weight REAL DEFAULT 0,rate REAL DEFAULT 0,amount REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS truck_payments(id TEXT PRIMARY KEY,trip_id TEXT DEFAULT '',entry_date TEXT,truck_no TEXT,owner_name TEXT,bank_details TEXT DEFAULT '',loading_point TEXT,unloading_point TEXT,weight REAL DEFAULT 0,rate REAL DEFAULT 0,commission REAL DEFAULT 0,payable REAL DEFAULT 0,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS supplier_payments(id TEXT PRIMARY KEY,receipt_no TEXT,trip_id TEXT DEFAULT '',owner_name TEXT NOT NULL,truck_no TEXT DEFAULT '',payment_date TEXT NOT NULL,amount REAL NOT NULL,payment_mode TEXT,reference TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS supplier_accounts(id TEXT PRIMARY KEY,ledger_no TEXT UNIQUE NOT NULL,owner_name TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

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
      `ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT 'GST'`,
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
      `ALTER TABLE invoice_items ADD COLUMN shortage REAL DEFAULT 0`,
      `ALTER TABLE trips ADD COLUMN trip_no TEXT DEFAULT NULL`,
      `ALTER TABLE trips ADD COLUMN invoice_id TEXT DEFAULT ''`,
      `ALTER TABLE trips ADD COLUMN invoice_item_id TEXT DEFAULT ''`,
    ];
    for(const sql of alters) await safe(env, sql);

    // Old V30-V33 builds created a unique index before legacy Trip numbers
    // were normalized. Drop it first so duplicates/blanks can be repaired safely.
    await safe(env,`DROP INDEX IF EXISTS idx_trip_no`);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_trip_party ON trips(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_truck ON trips(truck_no)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_date ON trips(trip_date)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_party ON invoices(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoices(invoice_date)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_item_invoice ON invoice_items(invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_item_trip ON invoice_items(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pm_bill_party ON pm_bills(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_pm_bill_supplier ON pm_bills(supplier_name)`,
      `CREATE INDEX IF NOT EXISTS idx_pm_item_bill ON pm_bill_items(bill_id)`,
      `CREATE INDEX IF NOT EXISTS idx_party_payment_party ON party_payments(party_name)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_entry_owner ON truck_payments(owner_name)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payment_owner ON supplier_payments(owner_name)`,
      `CREATE INDEX IF NOT EXISTS idx_document_truck ON truck_documents(truck_no)`,
      `CREATE INDEX IF NOT EXISTS idx_party_payment_trip ON party_payments(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payment_trip ON supplier_payments(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expense_trip ON expenses(trip_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_invoice ON trips(invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trip_invoice_item ON trips(invoice_item_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_ledger_no ON supplier_accounts(ledger_no)`,
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
        await run(env, `INSERT OR IGNORE INTO trips(id,trip_no,trip_date,party_name,truck_no,driver_name,driver_mobile,material,loading_point,unloading_point,weight,rate,status,notes,pod_file_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          t.id,null,t.trip_date,t.party_name,t.truck_no,t.driver_name,t.driver_mobile,t.material,t.loading_point,t.unloading_point,t.weight,t.rate,t.status,t.notes,t.pod_file_name);
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
    await backfillPartyMaster(env);
    await ensureSupplierAccounts(env);
    await repairTripSeriesAndInvoiceLinks(env);
    await run(env,`CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_no
      ON trips(trip_no)
      WHERE trip_no IS NOT NULL AND TRIM(trip_no)<>''`);
    await run(env, `INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('schema_version','34',CURRENT_TIMESTAMP)`);
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
    await run(env, `INSERT OR IGNORE INTO party_accounts(id,ledger_no,party_name) VALUES(?,?,?)`,uid('PA'),null,name);
    const party=await first(env,`SELECT id FROM party_accounts WHERE party_name=? LIMIT 1`,name);
    if(party?.id)await ensurePartyLedgerForId(env,party.id);
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
  await ensureAllPartyLedgerNumbers(env);
  const [
    parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    pmBills,pmBillItems,truckEntries,supplierPayments,supplierAccounts,expenses,documents,audits
  ]=await Promise.all([
    all(env,`SELECT * FROM party_accounts ORDER BY COALESCE(ledger_no,''),party_name`),
    all(env,`SELECT * FROM party_payments ORDER BY payment_date DESC,created_at DESC`),
    all(env,`SELECT * FROM trucks ORDER BY truck_no`),
    all(env,`SELECT * FROM routes ORDER BY loading_point,unloading_point`),
    all(env,`SELECT * FROM materials ORDER BY material_name`),
    all(env,`SELECT * FROM trips ORDER BY CAST(REPLACE(trip_no,'TR ','') AS INTEGER) DESC,trip_date DESC`),
    all(env,`SELECT * FROM invoices ORDER BY invoice_date DESC,created_at DESC`),
    all(env,`SELECT * FROM invoice_items ORDER BY invoice_id,created_at`),
    all(env,`SELECT * FROM pm_bills ORDER BY bill_date DESC,created_at DESC`),
    all(env,`SELECT * FROM pm_bill_items ORDER BY bill_id,created_at`),
    all(env,`SELECT * FROM truck_payments ORDER BY entry_date DESC,created_at DESC`),
    all(env,`SELECT * FROM supplier_payments ORDER BY payment_date DESC,created_at DESC`),
    all(env,`SELECT * FROM supplier_accounts ORDER BY CAST(REPLACE(ledger_no,'PML ','') AS INTEGER)`),
    all(env,`SELECT * FROM expenses ORDER BY expense_date DESC,created_at DESC`),
    all(env,`SELECT id,truck_no,kind,file_name,file_type,expiry_date,notes,created_at FROM truck_documents ORDER BY created_at DESC`),
    all(env,`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 150`)
  ]);

  const itemsByInvoice={};
  for(const it of invoiceItems)(itemsByInvoice[it.invoice_id]??=[]).push(it);
  for(const inv of invoices)inv.items=itemsByInvoice[inv.id]||[];
  const invoiceById=Object.fromEntries(invoices.map(i=>[i.id,i]));
  for(const trip of trips){
    const inv=invoiceById[trip.invoice_id]||null;
    trip.invoice_no=inv?.invoice_no||'';
    trip.invoice_type=inv?.invoice_type||'';
  }

  const pmItemsByBill={};
  for(const it of pmBillItems)(pmItemsByBill[it.bill_id]??=[]).push(it);
  for(const bill of pmBills)bill.items=pmItemsByBill[bill.id]||[];

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
  for(const trip of trips){
    const n=upper(trip.supplier_name||'');
    if(!n)continue;
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    if(trip.truck_no)supplierMap[n].trucks.add(trip.truck_no);
  }
  for(const e of truckEntries){
    const n=e.owner_name||'UNKNOWN';
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set()};
    supplierMap[n].payable+=num(e.payable);supplierMap[n].entries++;supplierMap[n].trucks.add(e.truck_no);
  }
  for(const p of supplierPayments){
    const n=p.owner_name||'UNKNOWN';
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    supplierMap[n].paid+=num(p.amount);supplierMap[n].payments++;if(p.truck_no)supplierMap[n].trucks.add(p.truck_no);
  }
  for(const b of pmBills){
    const n=b.supplier_name||'UNKNOWN';
    supplierMap[n]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    supplierMap[n].payable+=num(b.supplier_total);
    supplierMap[n].pm_bills=(supplierMap[n].pm_bills||0)+1;
    for(const it of (b.items||[]))if(it.truck_no)supplierMap[n].trucks.add(it.truck_no);
  }
  const supplierAccountByName=Object.fromEntries(supplierAccounts.map(x=>[upper(x.owner_name),x]));
  const supplierLedger=Object.values(supplierMap).map(x=>({
    owner_name:x.owner_name,ledger_no:supplierAccountByName[upper(x.owner_name)]?.ledger_no||'',payable:round2(x.payable),paid:round2(x.paid),pending:round2(x.payable-x.paid),
    entries:x.entries,payments:x.payments,truck_count:x.trucks.size
  })).sort((a,b)=>b.pending-a.pending);

  const totalBilling=round2(invoices.reduce((a,x)=>a+num(x.total),0));
  const invoiceSubtotal=round2(invoices.reduce((a,x)=>a+num(x.subtotal),0));
  const partyReceived=round2(partyPayments.reduce((a,x)=>a+num(x.amount),0));
  const supplierPayable=round2(truckEntries.reduce((a,x)=>a+num(x.payable),0));
  const supplierPaid=round2(supplierPayments.reduce((a,x)=>a+num(x.amount),0));
  const expenseTotal=round2(expenses.reduce((a,x)=>a+num(x.amount),0));

  const issues=[];
  for(const p of partyLedger)if(p.outstanding<-.01)issues.push({severity:'warning',type:'PARTY_OVERPAYMENT',entityType:'party',entityId:p.party_name,text:`${p.party_name}: received amount is ${Math.abs(p.outstanding).toFixed(2)} greater than billing. Verify missing invoice or advance.`});
  for(const s of supplierLedger)if(s.pending<-.01)issues.push({severity:'warning',type:'SUPPLIER_OVERPAYMENT',entityType:'supplier',entityId:s.owner_name,text:`${s.owner_name}: supplier payment is ${Math.abs(s.pending).toFixed(2)} greater than payable.`});
  const missingTruckNos=new Set();
  for(const t of trips){
    if(!invoiceItems.some(i=>String(i.trip_id||'')===String(t.id)))issues.push({severity:'info',type:'TRIP_WITHOUT_INVOICE',entityType:'trip',entityId:t.id,text:`Trip ${t.id} (${t.truck_no}) has no linked invoice.`});
    if(!trucks.some(x=>x.truck_no===t.truck_no)&&!missingTruckNos.has(t.truck_no)){
      missingTruckNos.add(t.truck_no);
      issues.push({severity:'warning',type:'MISSING_TRUCK_MASTER',entityType:'truck',entityId:t.truck_no,text:`${t.truck_no} is used in trips but missing from Truck Master.`});
    }
  }

  return {
    version:'2026.08.04-final',
    user,parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    pmBills,pmBillItems,truckEntries,supplierPayments,supplierAccounts,expenses,documents,audits,partyLedger,supplierLedger,issues,
    nextInvoiceNo:nextNumber(invoices.filter(x=>(x.invoice_type||'GST')==='GST').map(x=>x.invoice_no),'ML - '),
    nextNonGstInvoiceNo:nextNumber(invoices.filter(x=>(x.invoice_type||'GST')==='NON_GST').map(x=>x.invoice_no),'JAY '),
    nextTripNo:await reserveNextTripNumber(env),
    nextPmBillNo:nextNumber(pmBills.map(x=>x.bill_no),'PM - '),
    summary:{
      totalBilling,invoiceSubtotal,partyReceived,partyOutstanding:round2(totalBilling-partyReceived),
      supplierPayable,supplierPaid,supplierPending:round2(supplierPayable-supplierPaid),
      expenses:expenseTotal,estimatedProfit:round2(invoiceSubtotal-supplierPayable-expenseTotal),
      trips:trips.length,invoices:invoices.length
    }
  };
}


// -----------------------------------------------------------------------------
// V43 ADVANCED OPERATIONS — lazy tables, no login/schema-version changes
// -----------------------------------------------------------------------------
let advancedInitPromise;
async function ensureAdvancedTables(env){
  if(advancedInitPromise)return advancedInitPromise;
  advancedInitPromise=(async()=>{
    const tables=[
      `CREATE TABLE IF NOT EXISTS workflow_bookings(
        id TEXT PRIMARY KEY,booking_no TEXT UNIQUE NOT NULL,booking_date TEXT NOT NULL,
        party_name TEXT NOT NULL,truck_no TEXT DEFAULT '',material TEXT DEFAULT '',
        loading_point TEXT DEFAULT '',unloading_point TEXT DEFAULT '',expected_date TEXT DEFAULT '',
        status TEXT DEFAULT 'DRAFT',approval_status TEXT DEFAULT 'NOT_REQUIRED',
        approved_by TEXT DEFAULT '',approved_at TEXT DEFAULT '',dispatch_date TEXT DEFAULT '',
        trip_id TEXT DEFAULT '',notes TEXT DEFAULT '',created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS approval_requests(
        id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',requested_by TEXT DEFAULT '',approved_by TEXT DEFAULT '',
        notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS recycle_bin(
        id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,label TEXT DEFAULT '',
        payload TEXT NOT NULL,deleted_by TEXT DEFAULT '',deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS backup_snapshots(
        id TEXT PRIMARY KEY,backup_type TEXT DEFAULT 'SCHEDULED',period_key TEXT DEFAULT '',
        payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS monthly_exports(
        id TEXT PRIMARY KEY,month_key TEXT UNIQUE NOT NULL,summary TEXT DEFAULT '{}',
        payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings(
        setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL,updated_by TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    for(const sql of tables)await env.DB.prepare(sql).run();
    const indexes=[
      `CREATE INDEX IF NOT EXISTS idx_booking_date ON workflow_bookings(booking_date)`,
      `CREATE INDEX IF NOT EXISTS idx_booking_status ON workflow_bookings(status)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status)`,
      `CREATE INDEX IF NOT EXISTS idx_recycle_deleted ON recycle_bin(deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_snapshots(created_at)`
    ];
    for(const sql of indexes)await env.DB.prepare(sql).run();
  })().catch(e=>{advancedInitPromise=null;throw e});
  return advancedInitPromise;
}


const DEFAULT_APP_SETTINGS={
  companyName:'MEERA LOGISTICS',
  address:'OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR',
  phone:'9558959579',
  email:'meera.logistics99@gmail.com',
  gstNo:'24ACFFM2544N1Z1',
  pan:'ACFFM2544N',
  authorizedPartner:'J. K. JADEJA',
  defaultSgst:9,
  defaultCgst:9,
  defaultComments:'1. Payment due within 30 days.\n2. Mention invoice number in payment reference.',
  compactMode:'COMFORTABLE',
  showOnlineStatus:true,
  automaticBackups:true
};
async function readAppSettings(env){
  await ensureAdvancedTables(env);
  const row=await first(env,`SELECT setting_value FROM app_settings WHERE setting_key='APP'`);
  if(!row?.setting_value)return {...DEFAULT_APP_SETTINGS};
  try{return {...DEFAULT_APP_SETTINGS,...JSON.parse(row.setting_value)}}catch{return {...DEFAULT_APP_SETTINGS}}
}
async function writeAppSettings(env,user,input={}){
  await ensureAdvancedTables(env);
  const cleanSettings={...DEFAULT_APP_SETTINGS};
  for(const key of Object.keys(DEFAULT_APP_SETTINGS))if(input[key]!==undefined)cleanSettings[key]=input[key];
  cleanSettings.defaultSgst=num(cleanSettings.defaultSgst);
  cleanSettings.defaultCgst=num(cleanSettings.defaultCgst);
  cleanSettings.compactMode=String(cleanSettings.compactMode||'COMFORTABLE').toUpperCase()==='COMPACT'?'COMPACT':'COMFORTABLE';
  cleanSettings.showOnlineStatus=!!cleanSettings.showOnlineStatus;
  cleanSettings.automaticBackups=!!cleanSettings.automaticBackups;
  await run(env,`INSERT INTO app_settings(setting_key,setting_value,updated_by,updated_at)
    VALUES('APP',?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
    JSON.stringify(cleanSettings),user?.username||'');
  await audit(env,user,'UPDATE','settings','APP',cleanSettings);
  return cleanSettings;
}

const ADVANCED_EXPORT_TABLES={
  Parties:{table:'party_accounts',columns:['id','ledger_no','party_name','address','gst_no','mobile','email','created_at','updated_at']},
  PartyPayments:{table:'party_payments',columns:['id','receipt_no','trip_id','party_name','payment_date','amount','payment_mode','reference','notes','created_at','updated_at']},
  Trucks:{table:'trucks',columns:['id','truck_no','owner_name','owner_mobile','bank_details','created_at','updated_at']},
  Routes:{table:'routes',columns:['id','loading_point','unloading_point','created_at','updated_at']},
  Materials:{table:'materials',columns:['id','material_name','created_at']},
  Trips:{table:'trips',columns:['id','trip_no','invoice_id','invoice_item_id','trip_date','party_name','truck_no','driver_name','driver_mobile','material','loading_point','unloading_point','lr_number','loading_weight','unloading_weight','shortage','billing_weight','supplier_name','weight','rate','status','notes','pod_file_name','created_at','updated_at']},
  Invoices:{table:'invoices',columns:['id','invoice_no','invoice_type','invoice_date','party_name','party_address','party_gst','lr_no','material','loading_date','sgst','cgst','diesel','munshi','subtotal','gst_amount','total','comments','created_at','updated_at']},
  InvoiceItems:{table:'invoice_items',columns:['id','invoice_id','trip_id','lr_number','truck_no','description','loading_weight','unloading_weight','shortage','weight','rate','amount','created_at']},
  PMBills:{table:'pm_bills',columns:['id','bill_no','bill_date','party_name','party_address','supplier_name','notes','subtotal','supplier_total','profit','created_at','updated_at']},
  PMBillItems:{table:'pm_bill_items',columns:['id','bill_id','truck_no','loading_point','unloading_point','weight','party_rate','supplier_rate','party_amount','supplier_amount','created_at']},
  SupplierAccounts:{table:'supplier_accounts',columns:['id','ledger_no','owner_name','created_at','updated_at']},
  TruckEntries:{table:'truck_payments',columns:['id','trip_id','entry_date','truck_no','owner_name','bank_details','loading_point','unloading_point','weight','rate','commission','payable','notes','created_at','updated_at']},
  SupplierPayments:{table:'supplier_payments',columns:['id','receipt_no','trip_id','owner_name','truck_no','payment_date','amount','payment_mode','reference','notes','created_at','updated_at']},
  Expenses:{table:'expenses',columns:['id','trip_id','expense_date','category','amount','notes','created_at','updated_at']},
  Documents:{table:'truck_documents',columns:['id','truck_no','kind','file_name','file_type','expiry_date','notes','created_at']},
  Bookings:{table:'workflow_bookings',columns:['id','booking_no','booking_date','party_name','truck_no','material','loading_point','unloading_point','expected_date','status','approval_status','approved_by','approved_at','dispatch_date','trip_id','notes','created_by','created_at','updated_at']},
  Settings:{table:'app_settings',columns:['setting_key','setting_value','updated_by','updated_at']}
};

async function advancedRows(env,config,where='',...args){
  const columns=config.columns.join(',');
  return all(env,`SELECT ${columns} FROM ${config.table} ${where}`, ...args);
}
async function advancedExportPayload(env){
  await ensureAdvancedTables(env);
  await ensureTripWeightColumns(env);
  const sheets={};
  for(const [name,config] of Object.entries(ADVANCED_EXPORT_TABLES)){
    try{sheets[name]=await advancedRows(env,config)}catch(_){sheets[name]=[]}
  }
  return {version:'V43',exportedAt:new Date().toISOString(),sheets};
}
async function createBackupSnapshot(env,type='SCHEDULED',periodKey=''){
  const payload=await advancedExportPayload(env);
  const id=uid('BKP');
  await run(env,`INSERT INTO backup_snapshots(id,backup_type,period_key,payload) VALUES(?,?,?,?)`,id,type,periodKey,JSON.stringify(payload));
  await run(env,`DELETE FROM backup_snapshots WHERE id NOT IN (SELECT id FROM backup_snapshots ORDER BY created_at DESC LIMIT 30)`);
  return {id,createdAt:new Date().toISOString()};
}
function monthRange(monthKey){
  const [y,m]=String(monthKey||'').split('-').map(Number);
  if(!y||!m)return null;
  const start=`${y}-${String(m).padStart(2,'0')}-01`;
  const next=new Date(Date.UTC(y,m,1));
  const end=next.toISOString().slice(0,10);
  return {start,end};
}
async function createMonthlyExport(env,monthKey){
  await ensureAdvancedTables(env);
  const range=monthRange(monthKey);if(!range)throw new Error('Invalid month');
  const payload=await advancedExportPayload(env);
  const filter=(rows,key)=>rows.filter(row=>String(row[key]||'')>=range.start&&String(row[key]||'')<range.end);
  payload.sheets.Invoices=filter(payload.sheets.Invoices||[],'invoice_date');
  payload.sheets.PMBills=filter(payload.sheets.PMBills||[],'bill_date');
  const pmIds=new Set(payload.sheets.PMBills.map(x=>x.id));
  payload.sheets.PMBillItems=(payload.sheets.PMBillItems||[]).filter(x=>pmIds.has(x.bill_id));
  const invoiceIds=new Set(payload.sheets.Invoices.map(x=>x.id));
  payload.sheets.InvoiceItems=(payload.sheets.InvoiceItems||[]).filter(x=>invoiceIds.has(x.invoice_id));
  payload.sheets.Trips=filter(payload.sheets.Trips||[],'trip_date');
  payload.sheets.PartyPayments=filter(payload.sheets.PartyPayments||[],'payment_date');
  payload.sheets.SupplierPayments=filter(payload.sheets.SupplierPayments||[],'payment_date');
  payload.sheets.TruckEntries=filter(payload.sheets.TruckEntries||[],'entry_date');
  payload.sheets.Expenses=filter(payload.sheets.Expenses||[],'expense_date');
  payload.sheets.Bookings=filter(payload.sheets.Bookings||[],'booking_date');
  const summary={
    invoices:payload.sheets.Invoices.length,
    trips:payload.sheets.Trips.length,
    billing:round2(payload.sheets.Invoices.reduce((a,x)=>a+num(x.total),0)),
    received:round2(payload.sheets.PartyPayments.reduce((a,x)=>a+num(x.amount),0)),
    supplierPaid:round2(payload.sheets.SupplierPayments.reduce((a,x)=>a+num(x.amount),0)),
    expenses:round2(payload.sheets.Expenses.reduce((a,x)=>a+num(x.amount),0))
  };
  await run(env,`INSERT OR REPLACE INTO monthly_exports(id,month_key,summary,payload,created_at) VALUES(COALESCE((SELECT id FROM monthly_exports WHERE month_key=?),?),?,?,?,CURRENT_TIMESTAMP)`,monthKey,uid('MON'),monthKey,JSON.stringify(summary),JSON.stringify(payload));
  return {monthKey,summary};
}

async function advancedHealth(env){
  await ensureAdvancedTables(env);
  const count=async table=>num((await first(env,`SELECT COUNT(*) count FROM ${table}`))?.count);
  const counts={};
  for(const table of ['trips','invoices','invoice_items','party_accounts','trucks','truck_documents','workflow_bookings','approval_requests','recycle_bin','backup_snapshots']){
    try{counts[table]=await count(table)}catch(_){counts[table]=-1}
  }
  const duplicateTrips=await all(env,`SELECT trip_no,COUNT(*) count FROM trips WHERE COALESCE(TRIM(trip_no),'')<>'' GROUP BY trip_no HAVING COUNT(*)>1`);
  const orphanItems=await first(env,`SELECT COUNT(*) count FROM invoice_items ii LEFT JOIN invoices i ON i.id=ii.invoice_id WHERE i.id IS NULL`);
  const orphanTrips=await first(env,`SELECT COUNT(*) count FROM trips t LEFT JOIN trucks m ON m.truck_no=t.truck_no WHERE COALESCE(TRIM(t.truck_no),'')<>'' AND m.id IS NULL`);
  const expiredDocs=await first(env,`SELECT COUNT(*) count FROM truck_documents WHERE COALESCE(expiry_date,'')<>'' AND expiry_date<date('now')`);
  const pendingApprovals=await first(env,`SELECT COUNT(*) count FROM approval_requests WHERE status='PENDING'`);
  const latestBackup=await first(env,`SELECT id,backup_type,created_at FROM backup_snapshots ORDER BY created_at DESC LIMIT 1`);
  const checks=[
    {name:'Database connection',status:'OK',detail:'D1 queries responding'},
    {name:'Duplicate Trip numbers',status:duplicateTrips.length?'WARNING':'OK',detail:duplicateTrips.length?`${duplicateTrips.length} duplicate groups`:'No duplicates'},
    {name:'Orphan invoice items',status:num(orphanItems?.count)?'WARNING':'OK',detail:`${num(orphanItems?.count)} orphan rows`},
    {name:'Missing Truck Master',status:num(orphanTrips?.count)?'WARNING':'OK',detail:`${num(orphanTrips?.count)} trips`},
    {name:'Expired documents',status:num(expiredDocs?.count)?'WARNING':'OK',detail:`${num(expiredDocs?.count)} expired`},
    {name:'Pending approvals',status:num(pendingApprovals?.count)?'INFO':'OK',detail:`${num(pendingApprovals?.count)} pending`},
    {name:'Scheduled backup',status:latestBackup?'OK':'WARNING',detail:latestBackup?.created_at||'No snapshot yet'}
  ];
  return {ok:!checks.some(x=>x.status==='ERROR'),checkedAt:new Date().toISOString(),counts,checks,latestBackup};
}

const TRASH_MAP={
  party:{table:'party_accounts',label:'party_name'},
  'party-payment':{table:'party_payments',label:'receipt_no'},
  truck:{table:'trucks',label:'truck_no'},
  trip:{table:'trips',label:'trip_no'},
  invoice:{table:'invoices',label:'invoice_no',children:[{table:'invoice_items',fk:'invoice_id'}]},
  'pm-bill':{table:'pm_bills',label:'bill_no',children:[{table:'pm_bill_items',fk:'bill_id'}]},
  'truck-entry':{table:'truck_payments',label:'truck_no'},
  'supplier-payment':{table:'supplier_payments',label:'receipt_no'},
  route:{table:'routes',label:'loading_point'},
  material:{table:'materials',label:'material_name'},
  expense:{table:'expenses',label:'category'},
  document:{table:'truck_documents',label:'file_name'},
  booking:{table:'workflow_bookings',label:'booking_no'}
};
async function trashEntity(env,user,entityType,entityId){
  await ensureAdvancedTables(env);
  const config=TRASH_MAP[entityType];if(!config)throw new Error('Unsupported recycle entity');
  const main=await first(env,`SELECT * FROM ${config.table} WHERE id=?`,entityId);
  if(!main)throw new Error('Record not found');
  const children=[];
  for(const child of config.children||[])children.push({table:child.table,rows:await all(env,`SELECT * FROM ${child.table} WHERE ${child.fk}=?`,entityId)});
  const recycleId=uid('BIN');
  await run(env,`INSERT INTO recycle_bin(id,entity_type,entity_id,label,payload,deleted_by) VALUES(?,?,?,?,?,?)`,recycleId,entityType,entityId,String(main[config.label]||entityId),JSON.stringify({main,children}),user?.username||'');
  for(const child of config.children||[])await run(env,`DELETE FROM ${child.table} WHERE ${child.fk}=?`,entityId);
  await run(env,`DELETE FROM ${config.table} WHERE id=?`,entityId);
  await audit(env,user,'RECYCLE',entityType,entityId,{recycleId});
  return {ok:true,recycleId};
}
async function insertObject(env,table,row){
  const keys=Object.keys(row||{}).filter(k=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
  if(!keys.length)return;
  await run(env,`INSERT OR REPLACE INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,...keys.map(k=>row[k]));
}
async function restoreRecycle(env,user,recycleId){
  const item=await first(env,`SELECT * FROM recycle_bin WHERE id=?`,recycleId);if(!item)throw new Error('Recycle item not found');
  const config=TRASH_MAP[item.entity_type];if(!config)throw new Error('Unsupported recycle entity');
  const payload=JSON.parse(item.payload||'{}');
  await insertObject(env,config.table,payload.main||{});
  for(const child of payload.children||[])for(const row of child.rows||[])await insertObject(env,child.table,row);
  await run(env,`DELETE FROM recycle_bin WHERE id=?`,recycleId);
  await audit(env,user,'RESTORE',item.entity_type,item.entity_id,{recycleId});
  return {ok:true};
}

function nextBookingNo(rows){
  let max=0;for(const row of rows){const m=String(row.booking_no||'').match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1]))}
  return `BK ${String(max+1).padStart(3,'0')}`;
}
async function bookingAction(env,user,id,action,body={}){
  await ensureAdvancedTables(env);
  const booking=await first(env,`SELECT * FROM workflow_bookings WHERE id=?`,id);if(!booking)throw new Error('Booking not found');
  if(action==='submit'){
    await run(env,`UPDATE workflow_bookings SET status='PENDING_APPROVAL',approval_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?`,id);
    const existing=await first(env,`SELECT id FROM approval_requests WHERE entity_type='BOOKING' AND entity_id=? AND status='PENDING'`,id);
    if(!existing)await run(env,`INSERT INTO approval_requests(id,entity_type,entity_id,action,status,requested_by,notes) VALUES(?,?,?,?,?,?,?)`,uid('APR'),'BOOKING',id,'APPROVE_DISPATCH','PENDING',user.username,body.notes||'');
    return {ok:true,status:'PENDING_APPROVAL'};
  }
  if(action==='dispatch'){
    if(booking.approval_status!=='APPROVED')throw new Error('Approval required before dispatch');
    await run(env,`UPDATE workflow_bookings SET status='DISPATCHED',dispatch_date=COALESCE(NULLIF(?,''),date('now')),updated_at=CURRENT_TIMESTAMP WHERE id=?`,body.dispatchDate||'',id);
    return {ok:true,status:'DISPATCHED'};
  }
  if(action==='convert'){
    if(!['APPROVED','DISPATCHED'].includes(booking.status)&&booking.approval_status!=='APPROVED')throw new Error('Approve booking before Trip conversion');
    if(booking.trip_id)return {ok:true,status:'CONVERTED',tripId:booking.trip_id};
    const tripId=uid('TRIP'),tripNo=await reserveNextTripNumber(env);
    await run(env,`INSERT INTO trips(id,trip_no,trip_date,party_name,truck_no,material,loading_point,unloading_point,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,tripId,tripNo,booking.dispatch_date||booking.booking_date,booking.party_name,booking.truck_no,booking.material,booking.loading_point,booking.unloading_point,'BOOKED',`Created from ${booking.booking_no}. ${booking.notes||''}`);
    await run(env,`UPDATE workflow_bookings SET status='CONVERTED',trip_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,tripId,id);
    await audit(env,user,'CONVERT','booking',id,{tripId,tripNo});
    return {ok:true,status:'CONVERTED',tripId,tripNo};
  }
  if(action==='complete'){
    await run(env,`UPDATE workflow_bookings SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE id=?`,id);return {ok:true,status:'COMPLETED'};
  }
  throw new Error('Unknown booking action');
}
async function approveRequest(env,user,id,status,notes=''){
  const req=await first(env,`SELECT * FROM approval_requests WHERE id=?`,id);if(!req)throw new Error('Approval request not found');
  const finalStatus=status==='APPROVED'?'APPROVED':'REJECTED';
  await run(env,`UPDATE approval_requests SET status=?,approved_by=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,finalStatus,user.username,notes||req.notes||'',id);
  if(req.entity_type==='BOOKING'){
    await run(env,`UPDATE workflow_bookings SET approval_status=?,status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`,finalStatus,finalStatus,user.username,req.entity_id);
  }
  await audit(env,user,finalStatus,'approval',id,{entityId:req.entity_id});
  return {ok:true,status:finalStatus};
}

async function importAdvancedSheets(env,user,sheets={}){
  await ensureAdvancedTables(env);
  await ensureTripWeightColumns(env);
  const result={};
  for(const [sheetName,rows] of Object.entries(sheets||{})){
    const config=ADVANCED_EXPORT_TABLES[sheetName];if(!config||!Array.isArray(rows)){continue}
    let count=0;
    for(const raw of rows){
      const row={};for(const col of config.columns)if(raw[col]!==undefined&&raw[col]!==null&&raw[col]!=='')row[col]=raw[col];
      if(!row.id)row.id=uid(sheetName.slice(0,3).toUpperCase());
      try{await insertObject(env,config.table,row);count++}catch(_){/* skip invalid row but continue import */}
    }
    result[sheetName]=count;
  }
  await audit(env,user,'IMPORT','excel','bulk',result);
  return result;
}

async function runScheduledTasks(env,scheduledTime=Date.now()){
  await ensureDatabase(env);await ensureAdvancedTables(env);
  const d=new Date(scheduledTime);
  const day=d.getUTCDate();
  const dateKey=d.toISOString().slice(0,10);
  const settings=await readAppSettings(env);
  if(settings.automaticBackups!==false)await createBackupSnapshot(env,'SCHEDULED',dateKey);
  if(day===1){
    const prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));
    await createMonthlyExport(env,prev.toISOString().slice(0,7));
  }
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

      // V43 advanced operations are initialized only when these tools are opened.
      if(['advanced-data','workflow-bookings','approvals','recycle-bin','system-health','backups','monthly-exports','excel-export','excel-import','settings'].includes(resource))await ensureAdvancedTables(env);

      if(resource==='settings'){
        if(req.method==='GET')return json(await readAppSettings(env));
        if(req.method==='PUT')return json(await writeAppSettings(env,user,await requestBody(req)));
      }

      if(resource==='advanced-data'&&req.method==='GET'){
        const [bookings,approvals,recycle,backups,monthly]=await Promise.all([
          all(env,`SELECT * FROM workflow_bookings ORDER BY booking_date DESC,created_at DESC`),
          all(env,`SELECT * FROM approval_requests ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,created_at DESC`),
          all(env,`SELECT id,entity_type,entity_id,label,deleted_by,deleted_at FROM recycle_bin ORDER BY deleted_at DESC LIMIT 200`),
          all(env,`SELECT id,backup_type,period_key,created_at FROM backup_snapshots ORDER BY created_at DESC LIMIT 30`),
          all(env,`SELECT id,month_key,summary,created_at FROM monthly_exports ORDER BY month_key DESC LIMIT 36`)
        ]);
        const [trips,invoices,documents]=await Promise.all([
          all(env,`SELECT id,trip_no,trip_date,party_name,truck_no,loading_point,unloading_point,status FROM trips ORDER BY trip_date DESC`),
          all(env,`SELECT id,invoice_no,invoice_date,party_name,total FROM invoices ORDER BY invoice_date DESC`),
          all(env,`SELECT id,truck_no,kind,file_name,expiry_date,notes,created_at FROM truck_documents ORDER BY created_at DESC`)
        ]);
        return json({bookings,approvals,recycle,backups,monthly,trips,invoices,documents});
      }

      if(resource==='system-health'&&req.method==='GET')return json(await advancedHealth(env));

      if(resource==='workflow-bookings'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT * FROM workflow_bookings ORDER BY booking_date DESC,created_at DESC`));
        if(req.method==='POST'&&!id){
          const b=await requestBody(req);await upsertMasters(env,b);
          const rows=await all(env,`SELECT booking_no FROM workflow_bookings`),newId=uid('BKG'),bookingNo=clean(b.bookingNo)||nextBookingNo(rows);
          await run(env,`INSERT INTO workflow_bookings(id,booking_no,booking_date,party_name,truck_no,material,loading_point,unloading_point,expected_date,status,approval_status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT','NOT_REQUIRED',?,?)`,newId,bookingNo,b.bookingDate||new Date().toISOString().slice(0,10),upper(b.partyName),upper(b.truckNo),upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),b.expectedDate||'',b.notes||'',user.username);
          await audit(env,user,'CREATE','booking',newId,b);return json({ok:true,id:newId,bookingNo});
        }
        if(req.method==='PUT'&&id&&!action){
          const b=await requestBody(req);await upsertMasters(env,b);
          await run(env,`UPDATE workflow_bookings SET booking_date=?,party_name=?,truck_no=?,material=?,loading_point=?,unloading_point=?,expected_date=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.bookingDate,upper(b.partyName),upper(b.truckNo),upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),b.expectedDate||'',b.notes||'',id);
          await audit(env,user,'UPDATE','booking',id,b);return json({ok:true});
        }
        if(req.method==='POST'&&id&&action)return json(await bookingAction(env,user,id,action,await requestBody(req)));
      }

      if(resource==='approvals'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT * FROM approval_requests ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,created_at DESC`));
        if(req.method==='POST'&&id&&['approve','reject'].includes(action))return json(await approveRequest(env,user,id,action==='approve'?'APPROVED':'REJECTED',(await requestBody(req)).notes||''));
      }

      if(resource==='recycle-bin'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT id,entity_type,entity_id,label,deleted_by,deleted_at FROM recycle_bin ORDER BY deleted_at DESC LIMIT 300`));
        if(req.method==='POST'&&!id){const b=await requestBody(req);return json(await trashEntity(env,user,b.entityType,b.entityId));}
        if(req.method==='POST'&&id&&action==='restore')return json(await restoreRecycle(env,user,id));
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM recycle_bin WHERE id=?`,id);return json({ok:true})}
      }

      if(resource==='backups'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET'&&!id)return json(await all(env,`SELECT id,backup_type,period_key,created_at FROM backup_snapshots ORDER BY created_at DESC LIMIT 30`));
        if(req.method==='POST'&&!id)return json(await createBackupSnapshot(env,'MANUAL',new Date().toISOString().slice(0,10)));
        if(req.method==='GET'&&id&&action==='download'){
          const item=await first(env,`SELECT * FROM backup_snapshots WHERE id=?`,id);if(!item)return json({error:'Backup not found'},404);return json({id:item.id,createdAt:item.created_at,payload:JSON.parse(item.payload)});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM backup_snapshots WHERE id=?`,id);return json({ok:true})}
      }

      if(resource==='monthly-exports'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET'&&!id)return json(await all(env,`SELECT id,month_key,summary,created_at FROM monthly_exports ORDER BY month_key DESC LIMIT 36`));
        if(req.method==='POST'&&!id){const b=await requestBody(req);return json(await createMonthlyExport(env,b.monthKey||new Date().toISOString().slice(0,7)))}
        if(req.method==='GET'&&id&&action==='download'){
          const item=await first(env,`SELECT * FROM monthly_exports WHERE id=?`,id);if(!item)return json({error:'Monthly export not found'},404);return json({id:item.id,monthKey:item.month_key,summary:JSON.parse(item.summary||'{}'),payload:JSON.parse(item.payload)});
        }
      }

      if(resource==='excel-export'&&req.method==='GET')return json(await advancedExportPayload(env));
      if(resource==='excel-import'&&req.method==='POST')return json({ok:true,imported:await importAdvancedSheets(env,user,(await requestBody(req)).sheets||{})});

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
        const pmBills=await all(env,`SELECT * FROM pm_bills WHERE supplier_name=? ORDER BY bill_date,created_at`,name);
        const lines=[
          ...entries.map(x=>({date:x.entry_date,type:'FREIGHT',reference:x.truck_no,debit:num(x.payable),credit:0,notes:x.loading_point+' → '+x.unloading_point})),
          ...pmBills.map(x=>({date:x.bill_date,type:'PM BILL',reference:x.bill_no,debit:num(x.supplier_total),credit:0,notes:'Non-GST supplier payable'})),
          ...payments.map(x=>({date:x.payment_date,type:'PAYMENT',reference:x.receipt_no||x.reference||x.id,debit:0,credit:num(x.amount),notes:x.notes||''}))
        ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        let balance=0;for(const x of lines){balance=round2(balance+x.debit-x.credit);x.balance=balance}
        return json({entries,payments,pmBills,lines,balance});
      }

      if(resource==='export'&&req.method==='GET')return json(await bootstrap(env,user));

      if(resource==='import'&&req.method==='POST'){
        await ensureTripWeightColumns(env);
        const b=await requestBody(req);
        const data=b.data||b;
        if(!data || !Array.isArray(data.parties))return json({error:'Invalid backup file'},400);
        if(b.mode==='replace'){
          const tables=['pm_bill_items','pm_bills','invoice_items','invoices','party_payments','supplier_payments','truck_payments','trips','expenses','truck_documents','materials','routes','trucks','party_accounts'];
          for(const t of tables)await env.DB.prepare(`DELETE FROM ${t}`).run();
        }
        const rows=data;
        for(const p of rows.parties||[])await run(env,`INSERT OR REPLACE INTO party_accounts(id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?)`,p.id||uid('PA'),String(p.ledger_no||'').trim()||null,upper(p.party_name),p.address||'',p.gst_no||'',p.mobile||'',p.email||'');
        for(const p of rows.partyPayments||[])await run(env,`INSERT OR REPLACE INTO party_payments(id,receipt_no,trip_id,party_name,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?)`,p.id||uid('PP'),p.receipt_no||'',p.trip_id||'',upper(p.party_name),p.payment_date,num(p.amount),upper(p.payment_mode),p.reference||'',p.notes||'');
        for(const t of rows.trucks||[])await run(env,`INSERT OR REPLACE INTO trucks(id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?)`,t.id||uid('TRK'),upper(t.truck_no),upper(t.owner_name),t.owner_mobile||'',t.bank_details||'');
        for(const r of rows.routes||[])await run(env,`INSERT OR REPLACE INTO routes(id,loading_point,unloading_point) VALUES(?,?,?)`,r.id||uid('RTE'),upper(r.loading_point),upper(r.unloading_point));
        for(const m of rows.materials||[])await run(env,`INSERT OR REPLACE INTO materials(id,material_name) VALUES(?,?)`,m.id||uid('MAT'),upper(m.material_name));
        for(const t of rows.trips||[])await run(env,`INSERT OR REPLACE INTO trips(id,trip_date,party_name,truck_no,driver_name,driver_mobile,supplier_name,material,loading_point,unloading_point,weight,rate,status,notes,pod_file_name,pod_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,t.id||uid('TRIP'),t.trip_date,upper(t.party_name),upper(t.truck_no),upper(t.driver_name),t.driver_mobile||'',upper(t.supplier_name),upper(t.material),upper(t.loading_point),upper(t.unloading_point),num(t.weight),num(t.rate),upper(t.status||'BOOKED'),t.notes||'',t.pod_file_name||'',t.pod_data||'');
        for(const i of rows.invoices||[])await run(env,`INSERT OR REPLACE INTO invoices(id,invoice_no,invoice_type,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,i.id||uid('INV'),i.invoice_no,i.invoice_type||'GST',i.invoice_date,upper(i.party_name),i.party_address||'',i.party_gst||'',i.lr_no||'',upper(i.material),i.loading_date||'',num(i.sgst),num(i.cgst),num(i.diesel),num(i.munshi),num(i.subtotal),num(i.gst_amount),num(i.total),i.comments||'');
        for(const it of rows.invoiceItems||[])await run(env,`INSERT OR REPLACE INTO invoice_items(id,invoice_id,trip_id,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,it.id||uid('II'),it.invoice_id,it.trip_id||'',upper(it.truck_no),upper(it.description),num(it.loading_weight||it.weight),num(it.unloading_weight||it.weight),num(it.shortage),num(it.weight),num(it.rate),num(it.amount));
        for(const e of rows.truckEntries||[])await run(env,`INSERT OR REPLACE INTO truck_payments(id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,weight,rate,commission,payable,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,e.id||uid('TE'),e.trip_id||'',e.entry_date,upper(e.truck_no),upper(e.owner_name),e.bank_details||'',upper(e.loading_point),upper(e.unloading_point),num(e.weight),num(e.rate),num(e.commission),num(e.payable),e.notes||'');
        for(const p of rows.supplierPayments||[])await run(env,`INSERT OR REPLACE INTO supplier_payments(id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,p.id||uid('SP'),p.receipt_no||'',p.trip_id||'',upper(p.owner_name),upper(p.truck_no),p.payment_date,num(p.amount),upper(p.payment_mode),p.reference||'',p.notes||'');
        for(const e of rows.expenses||[])await run(env,`INSERT OR REPLACE INTO expenses(id,trip_id,expense_date,category,amount,notes) VALUES(?,?,?,?,?,?)`,e.id||uid('EXP'),e.trip_id||'',e.expense_date,upper(e.category),num(e.amount),e.notes||'');
        await ensureAllPartyLedgerNumbers(env);
        await audit(env,user,'IMPORT','backup','', {mode:b.mode||'merge'});
        return json({ok:true});
      }

      // PARTY MASTER
      if(resource==='parties'){
        if(req.method==='POST'){
          const b=await requestBody(req),name=upper(b.partyName),newId=uid('PA');
          if(!name)return json({error:'Party name required'},400);
          const existingName=await first(env,`SELECT id FROM party_accounts WHERE party_name=? LIMIT 1`,name);
          if(existingName)return json({error:'Party name already exists'},409);
          try{
            const ledgerNo=await normalizeRequestedPartyLedger(env,b.ledgerNo);
            await run(env,`INSERT INTO party_accounts(id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?)`,newId,ledgerNo,name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'');
            await audit(env,user,'CREATE','party',newId,{...b,ledgerNo});
            return json({ok:true,id:newId,ledgerNo});
          }catch(error){
            const message=String(error?.message||error);
            if(/UNIQUE|constraint|already exists/i.test(message))return json({error:message.includes('already exists')?message:'Party ledger number already exists. Please try again.'},409);
            throw error;
          }
        }
        if(req.method==='PUT'&&id){
          const b=await requestBody(req),old=await first(env,`SELECT party_name,ledger_no FROM party_accounts WHERE id=?`,id),name=upper(b.partyName);
          if(!old)return json({error:'Party not found'},404);
          if(!name)return json({error:'Party name required'},400);
          const duplicateName=await first(env,`SELECT id FROM party_accounts WHERE party_name=? AND id<>? LIMIT 1`,name,id);
          if(duplicateName)return json({error:'Party name already exists'},409);
          try{
            const ledgerNo=String(b.ledgerNo||old.ledger_no||'').trim()||await normalizeRequestedPartyLedger(env,'',id);
            if(ledgerNo!==String(old.ledger_no||'').trim())await normalizeRequestedPartyLedger(env,ledgerNo,id);
            await run(env,`UPDATE party_accounts SET ledger_no=?,party_name=?,address=?,gst_no=?,mobile=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,ledgerNo,name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'',id);
          }catch(error){
            const message=String(error?.message||error);
            if(/UNIQUE|constraint|already exists/i.test(message))return json({error:message.includes('already exists')?message:'Party ledger number already exists. Please try again.'},409);
            throw error;
          }
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
        await ensureTripWeightColumns(env);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          if(req.method==='POST'){
            const duplicate=await first(env,`SELECT id FROM trips WHERE trip_date=? AND party_name=? AND truck_no=? AND loading_point=? AND unloading_point=? AND ABS(weight-?)<0.001`,
              b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.loadingPoint),upper(b.unloadingPoint),num(b.weight));
            if(duplicate)return json({error:'Duplicate trip detected'},409);
            const newId=uid('TRIP');
            const tripNo=await reserveNextTripNumber(env);
            await run(env,`INSERT INTO trips(
              id,trip_no,trip_date,party_name,truck_no,driver_name,driver_mobile,material,
              loading_point,unloading_point,lr_number,loading_weight,unloading_weight,shortage,
              billing_weight,supplier_name,weight,rate,status,notes,pod_file_name,pod_data
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              newId,tripNo,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),
              b.driverMobile||'',upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),
              clean(b.lrNumber),round2(b.loadingWeight),round2(b.unloadingWeight),
              round2(Math.max(0,num(b.loadingWeight)-num(b.unloadingWeight))),
              round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),upper(b.supplierName),
              round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),round2(b.rate),
              upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||''
            );
            if(upper(b.supplierName)){
              await ensureSupplierAccountForName(env,b.supplierName);
              await run(env,`UPDATE truck_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE trip_id=?`,upper(b.supplierName),newId);
              await run(env,`UPDATE supplier_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE trip_id=?`,upper(b.supplierName),newId);
            }
            await audit(env,user,'CREATE','trip',newId,b);
            return json({ok:true,id:newId,tripNo});
          }

          const old=await first(env,`SELECT * FROM trips WHERE id=?`,id);
          await run(env,`UPDATE trips SET
            trip_date=?,party_name=?,truck_no=?,driver_name=?,driver_mobile=?,material=?,
            loading_point=?,unloading_point=?,lr_number=?,loading_weight=?,unloading_weight=?,
            shortage=?,billing_weight=?,supplier_name=?,weight=?,rate=?,status=?,notes=?,pod_file_name=?,
            pod_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),b.driverMobile||'',
            upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),clean(b.lrNumber),
            round2(b.loadingWeight),round2(b.unloadingWeight),
            round2(Math.max(0,num(b.loadingWeight)-num(b.unloadingWeight))),
            round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),upper(b.supplierName),
            round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),round2(b.rate),
            upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||'',id
          );
          if(upper(b.supplierName)){
            await ensureSupplierAccountForName(env,b.supplierName);
            await run(env,`UPDATE truck_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE trip_id=?`,upper(b.supplierName),id);
            await run(env,`UPDATE supplier_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE trip_id=?`,upper(b.supplierName),id);
          }

          // Keep the linked invoice line synchronized.
          if(old?.invoice_item_id){
            const description=`${upper(b.loadingPoint)} TO ${upper(b.unloadingPoint)}`;
            const loadingWeight=round2(b.loadingWeight);
            const unloadingWeight=round2(b.unloadingWeight);
            const shortage=round2(Math.max(0,loadingWeight-unloadingWeight));
            const billingWeight=round2(b.billingWeight||unloadingWeight||loadingWeight);
            const amount=round2(billingWeight*num(b.rate));
            await run(env,`UPDATE invoice_items SET
              lr_number=?,truck_no=?,description=?,loading_weight=?,unloading_weight=?,shortage=?,
              weight=?,rate=?,amount=? WHERE id=?`,
              clean(b.lrNumber),upper(b.truckNo),description,loadingWeight,unloadingWeight,shortage,
              billingWeight,round2(b.rate),amount,old.invoice_item_id
            );
            if(old.invoice_id){
              await run(env,`UPDATE invoices SET party_name=?,material=?,loading_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                upper(b.partyName),upper(b.material),b.tripDate,old.invoice_id);
              await recalcInvoiceById(env,old.invoice_id);
            }
          }

          await audit(env,user,'UPDATE','trip',id,b);
          return json({ok:true});
        }

        if(req.method==='DELETE'&&id){
          const trip=await first(env,`SELECT * FROM trips WHERE id=?`,id);
          if(!trip)return json({ok:true});
          if(trip.invoice_id){
            const count=await first(env,`SELECT COUNT(*) count FROM invoice_items WHERE invoice_id=?`,trip.invoice_id);
            if(num(count?.count)<=1){
              return json({error:'This is the last trip of the linked invoice. Delete the invoice, or add another truck line first.'},409);
            }
            await run(env,`DELETE FROM invoice_items WHERE trip_id=?`,id);
            await recalcInvoiceById(env,trip.invoice_id);
          }
          await run(env,`DELETE FROM truck_payments WHERE trip_id=?`,id);
          await run(env,`DELETE FROM trips WHERE id=?`,id);
          await audit(env,user,'DELETE','trip',id,{});
          return json({ok:true});
        }
      }

      // INVOICES
      if(resource==='invoices'){
        await ensureTripWeightColumns(env);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b);
          const invoiceType=upper(b.invoiceType||'GST');
          const sgst=invoiceType==='NON_GST'?0:num(b.sgst);
          const cgst=invoiceType==='NON_GST'?0:num(b.cgst);
          const rawItems=Array.isArray(b.items)?b.items:[];
          const items=rawItems.map(x=>{
            const loading=round2(x.loadingWeight ?? x.loading_weight ?? x.weight);
            const unloading=round2(x.unloadingWeight ?? x.unloading_weight ?? x.weight);
            const shortage=round2(Math.max(0,loading-unloading));
            const billing=round2(x.weight ?? x.billingWeight ?? unloading);
            return {...x,lrNumber:clean(x.lrNumber||x.lr_number),loadingWeight:loading,unloadingWeight:unloading,shortage,weight:billing,rate:round2(x.rate)};
          }).filter(x=>num(x.weight)>0 && clean(x.truckNo));
          if(!items.length)return json({error:'At least one truck line is required'},400);

          const freightSubtotal=round2(items.reduce((a,x)=>a+num(x.weight)*num(x.rate),0));
          const subtotal=round2(freightSubtotal+num(b.diesel)+num(b.munshi));
          const gstAmount=invoiceType==='NON_GST'?0:round2(subtotal*(sgst+cgst)/100);
          const total=round2(subtotal+gstAmount);
          let invoiceId=id;

          if(req.method==='POST'){
            invoiceId=uid('INV');
            try{
              await run(env,`INSERT INTO invoices(
                id,invoice_no,invoice_type,invoice_date,party_name,party_address,party_gst,
                lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                invoiceId,clean(b.invoiceNo),invoiceType,b.invoiceDate,upper(b.partyName),b.partyAddress||'',
                invoiceType==='NON_GST'?'':upper(b.partyGst),b.lrNo||'',upper(b.material),b.loadingDate||'',
                sgst,cgst,num(b.diesel),num(b.munshi),subtotal,gstAmount,total,b.comments||''
              );
            }catch(e){
              if(/UNIQUE/i.test(String(e.message)))return json({error:'Invoice number already exists'},409);
              throw e
            }
          }else{
            await run(env,`UPDATE invoices SET
              invoice_no=?,invoice_type=?,invoice_date=?,party_name=?,party_address=?,party_gst=?,
              lr_no=?,material=?,loading_date=?,sgst=?,cgst=?,diesel=?,munshi=?,subtotal=?,
              gst_amount=?,total=?,comments=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
              clean(b.invoiceNo),invoiceType,b.invoiceDate,upper(b.partyName),b.partyAddress||'',
              invoiceType==='NON_GST'?'':upper(b.partyGst),b.lrNo||'',upper(b.material),b.loadingDate||'',
              sgst,cgst,num(b.diesel),num(b.munshi),subtotal,gstAmount,total,b.comments||'',invoiceId
            );
          }

          const oldItems=await all(env,`SELECT id,trip_id FROM invoice_items WHERE invoice_id=?`,invoiceId);
          const usedTripIds=new Set();
          await run(env,`DELETE FROM invoice_items WHERE invoice_id=?`,invoiceId);

          for(const x of items){
            const itemId=uid('II');
            let tripId=x.tripId||'';
            let trip=tripId?await first(env,`SELECT * FROM trips WHERE id=?`,tripId):null;
            const route=splitRoute(x.description);

            if(!trip){
              tripId=uid('TRIP');
              const tripNo=await reserveNextTripNumber(env);
              await run(env,`INSERT INTO trips(
                id,trip_no,invoice_id,invoice_item_id,trip_date,party_name,truck_no,driver_name,
                driver_mobile,material,loading_point,unloading_point,lr_number,loading_weight,
                unloading_weight,shortage,billing_weight,weight,rate,status,notes
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                tripId,tripNo,invoiceId,itemId,b.loadingDate||b.invoiceDate,upper(b.partyName),
                upper(x.truckNo),'','',upper(b.material),route.loading,route.unloading,
                x.lrNumber,x.loadingWeight,x.unloadingWeight,x.shortage,x.weight,x.weight,x.rate,
                'BOOKED',`Created from invoice ${clean(b.invoiceNo)}`
              );
            }else{
              await run(env,`UPDATE trips SET
                invoice_id=?,invoice_item_id=?,trip_date=?,party_name=?,truck_no=?,material=?,
                loading_point=?,unloading_point=?,lr_number=?,loading_weight=?,unloading_weight=?,
                shortage=?,billing_weight=?,weight=?,rate=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                invoiceId,itemId,b.loadingDate||b.invoiceDate,upper(b.partyName),upper(x.truckNo),
                upper(b.material),route.loading,route.unloading,x.lrNumber,x.loadingWeight,
                x.unloadingWeight,x.shortage,x.weight,x.weight,x.rate,tripId
              );
            }
            usedTripIds.add(String(tripId));

            await run(env,`INSERT INTO invoice_items(
              id,invoice_id,trip_id,lr_number,truck_no,description,loading_weight,unloading_weight,
              shortage,weight,rate,amount
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
              itemId,invoiceId,tripId,x.lrNumber,upper(x.truckNo),upper(x.description),x.loadingWeight,
              x.unloadingWeight,x.shortage,x.weight,x.rate,round2(x.weight*x.rate)
            );
          }

          // Remove trips whose truck lines were removed from the invoice.
          for(const old of oldItems){
            if(old.trip_id && !usedTripIds.has(String(old.trip_id))){
              await run(env,`DELETE FROM truck_payments WHERE trip_id=?`,old.trip_id);
              await run(env,`DELETE FROM trips WHERE id=?`,old.trip_id);
            }
          }

          await audit(env,user,req.method==='POST'?'CREATE':'UPDATE','invoice',invoiceId,b);
          return json({ok:true,id:invoiceId,total});
        }

        if(req.method==='DELETE'&&id){
          const linked=await all(env,`SELECT trip_id FROM invoice_items WHERE invoice_id=?`,id);
          for(const row of linked){
            if(row.trip_id){
              await run(env,`DELETE FROM truck_payments WHERE trip_id=?`,row.trip_id);
              await run(env,`DELETE FROM trips WHERE id=?`,row.trip_id);
            }
          }
          await run(env,`DELETE FROM invoice_items WHERE invoice_id=?`,id);
          await run(env,`DELETE FROM invoices WHERE id=?`,id);
          await audit(env,user,'DELETE','invoice',id,{});
          return json({ok:true});
        }
      }


      // PM / NON-GST BILLS
      if(resource==='pm-bills'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);
          if(b.partyName)await upsertMasters(env,{partyName:b.partyName});
          const items=Array.isArray(b.items)?b.items.filter(x=>num(x.weight)>0):[];
          if(!items.length)return json({error:'At least one truck line is required'},400);
          const subtotal=round2(items.reduce((a,x)=>a+num(x.weight)*num(x.partyRate),0));
          const supplierTotal=round2(items.reduce((a,x)=>a+num(x.weight)*num(x.supplierRate),0));
          const profit=round2(subtotal-supplierTotal);

          if(req.method==='POST'){
            const newId=uid('PMB');
            try{
              await run(env,`INSERT INTO pm_bills(id,bill_no,bill_date,party_name,party_address,supplier_name,notes,subtotal,supplier_total,profit) VALUES(?,?,?,?,?,?,?,?,?,?)`,
                newId,clean(b.billNo),b.billDate,upper(b.partyName),b.partyAddress||'',upper(b.supplierName),b.notes||'',subtotal,supplierTotal,profit);
            }catch(e){
              if(/UNIQUE/i.test(String(e.message)))return json({error:'PM bill number already exists'},409);
              throw e;
            }
            for(const x of items){
              const partyAmount=round2(num(x.weight)*num(x.partyRate));
              const supplierAmount=round2(num(x.weight)*num(x.supplierRate));
              await run(env,`INSERT INTO pm_bill_items(id,bill_id,truck_no,loading_point,unloading_point,weight,party_rate,supplier_rate,party_amount,supplier_amount) VALUES(?,?,?,?,?,?,?,?,?,?)`,
                uid('PMI'),newId,upper(x.truckNo),upper(x.loadingPoint),upper(x.unloadingPoint),round2(x.weight),round2(x.partyRate),round2(x.supplierRate),partyAmount,supplierAmount);
            }
            await audit(env,user,'CREATE','pm_bill',newId,b);
            return json({ok:true,id:newId,total:subtotal,profit});
          }

          await run(env,`UPDATE pm_bills SET bill_no=?,bill_date=?,party_name=?,party_address=?,supplier_name=?,notes=?,subtotal=?,supplier_total=?,profit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            clean(b.billNo),b.billDate,upper(b.partyName),b.partyAddress||'',upper(b.supplierName),b.notes||'',subtotal,supplierTotal,profit,id);
          await run(env,`DELETE FROM pm_bill_items WHERE bill_id=?`,id);
          for(const x of items){
            const partyAmount=round2(num(x.weight)*num(x.partyRate));
            const supplierAmount=round2(num(x.weight)*num(x.supplierRate));
            await run(env,`INSERT INTO pm_bill_items(id,bill_id,truck_no,loading_point,unloading_point,weight,party_rate,supplier_rate,party_amount,supplier_amount) VALUES(?,?,?,?,?,?,?,?,?,?)`,
              uid('PMI'),id,upper(x.truckNo),upper(x.loadingPoint),upper(x.unloadingPoint),round2(x.weight),round2(x.partyRate),round2(x.supplierRate),partyAmount,supplierAmount);
          }
          await audit(env,user,'UPDATE','pm_bill',id,b);
          return json({ok:true,total:subtotal,profit});
        }

        if(req.method==='DELETE'&&id){
          await run(env,`DELETE FROM pm_bill_items WHERE bill_id=?`,id);
          await run(env,`DELETE FROM pm_bills WHERE id=?`,id);
          await audit(env,user,'DELETE','pm_bill',id,{});
          return json({ok:true});
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
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(runScheduledTasks(env,controller?.scheduledTime||Date.now()));
  }
};
