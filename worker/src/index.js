
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
const accountKey = v => upper(v).replace(/[^A-Z0-9]/g,'');
const ACCOUNTING_SETTLEMENT_TOLERANCE_V665 = 1;
const settledBalanceV665 = v => {
  const value=round2(v);
  return Math.abs(value)<=ACCOUNTING_SETTLEMENT_TOLERANCE_V665?0:value;
};
const uid = p => `${p}-${crypto.randomUUID()}`;
let initPromise;
let tenantColumnPromise=null;
let saasFoundationPromise=null;
let tenantUpgradePromise=null;

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



const DEFAULT_COMPANY_ID='CMP-MEERA';
const ROLE_PERMISSIONS={
  OWNER:['*'],
  ADMIN:['*'],
  ACCOUNTANT:['read','suppliers.write','parties.write','party-payments.write','invoices.write','pm-bills.write','truck-entries.write','supplier-payments.write','expenses.write','settings.write','excel.write','reports.write'],
  OPERATOR:['read','suppliers.write','trips.write','trucks.write','routes.write','materials.write','documents.write','workflow.write'],
  VIEWER:['read']
};
function permissionsForRole(role='VIEWER'){
  return ROLE_PERMISSIONS[upper(role)]||ROLE_PERMISSIONS.VIEWER;
}
function hasPermission(user,permission){
  const permissions=user?.permissions||permissionsForRole(user?.role);
  return permissions.includes('*')||permissions.includes(permission);
}
function resourceWritePermission(resource=''){
  const map={
    'parties':'parties.write','party-payments':'party-payments.write','invoices':'invoices.write',
    'pm-bills':'pm-bills.write','truck-entries':'truck-entries.write','supplier-payments':'supplier-payments.write',
    'expenses':'expenses.write','suppliers':'suppliers.write','settings':'settings.write','trips':'trips.write','trucks':'trucks.write',
    'routes':'routes.write','materials':'materials.write','documents':'documents.write',
    'workflow-bookings':'workflow.write','approvals':'workflow.write','recycle-bin':'settings.write',
    'backups':'settings.write','monthly-exports':'excel.write','excel-import':'excel.write','import':'excel.write'
  };
  return map[resource]||'settings.write';
}
function canWriteResource(user,resource){
  if(['OWNER','ADMIN'].includes(upper(user?.role)))return true;
  return hasPermission(user,resourceWritePermission(resource));
}

async function ensureUserTenantColumns(env){
  const row=await first(env,`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
  const sql=String(row?.sql||'');
  if(!sql)return;
  const columns=[
    ['company_id',`ALTER TABLE users ADD COLUMN company_id TEXT DEFAULT '${DEFAULT_COMPANY_ID}'`],
    ['full_name',`ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''`],
    ['email',`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`],
    ['mobile',`ALTER TABLE users ADD COLUMN mobile TEXT DEFAULT ''`],
    ['updated_at',`ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT ''`]
  ];
  const missing=columns.filter(([name])=>!new RegExp(`\\b${name}\\b`,'i').test(sql));
  if(missing.length)await env.DB.batch(missing.map(([,ddl])=>env.DB.prepare(ddl)));
  if(missing.some(([name])=>name==='company_id')){
    await run(env,`UPDATE users SET company_id=? WHERE company_id IS NULL OR TRIM(company_id)=''`,DEFAULT_COMPANY_ID);
  }
}
async function healTenantColumns(env){
  if(tenantColumnPromise)return tenantColumnPromise;
  tenantColumnPromise=(async()=>{
    // One schema read instead of 20+ failing ALTER TABLE calls on every request.
    const tables=await all(env,`SELECT name,sql FROM sqlite_master WHERE type='table'`);
    const schema=new Map(tables.map(x=>[x.name,String(x.sql||'')]));
    const targets=['users',...TENANT_TABLES];
    const missing=[];
    for(const table of targets){
      const sql=schema.get(table);
      if(sql&&!/\bcompany_id\b/i.test(sql)){
        missing.push(env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN company_id TEXT DEFAULT '${DEFAULT_COMPANY_ID}'`));
      }
    }
    if(missing.length)await env.DB.batch(missing);

    // Backfill only tables that exist. Batch = one D1 round trip.
    const after=missing.length?await all(env,`SELECT name,sql FROM sqlite_master WHERE type='table'`):tables;
    const names=new Set(after.map(x=>x.name));
    const updates=[];
    for(const table of targets){
      if(names.has(table))updates.push(env.DB.prepare(`UPDATE ${table} SET company_id=? WHERE company_id IS NULL OR TRIM(company_id)=''`).bind(DEFAULT_COMPANY_ID));
    }
    if(updates.length)await env.DB.batch(updates);
    return true;
  })().catch(error=>{tenantColumnPromise=null;throw error});
  return tenantColumnPromise;
}

async function ensureSaasFoundation(env){
  if(saasFoundationPromise)return saasFoundationPromise;
  saasFoundationPromise=(async()=>{
    try{
      const ready=await first(env,`SELECT value FROM app_meta WHERE key='saas_ready_v53'`);
      if(ready?.value==='1')return true;
    }catch(_){}

  const creates=[
    `CREATE TABLE IF NOT EXISTS companies(
      id TEXT PRIMARY KEY,company_code TEXT UNIQUE NOT NULL,company_name TEXT NOT NULL,
      legal_name TEXT DEFAULT '',gst_no TEXT DEFAULT '',pan_no TEXT DEFAULT '',mobile TEXT DEFAULT '',
      email TEXT DEFAULT '',address TEXT DEFAULT '',invoice_prefix TEXT DEFAULT 'ML',
      non_gst_prefix TEXT DEFAULT 'JAY',trip_prefix TEXT DEFAULT 'TR',supplier_prefix TEXT DEFAULT 'PML',
      status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS saas_plans(
      id TEXT PRIMARY KEY,plan_name TEXT UNIQUE NOT NULL,monthly_price REAL DEFAULT 0,yearly_price REAL DEFAULT 0,
      max_users INTEGER DEFAULT 1,max_trips_month INTEGER DEFAULT 100,max_invoices_month INTEGER DEFAULT 100,
      max_storage_mb INTEGER DEFAULT 100,features_json TEXT DEFAULT '{}',play_product_id_monthly TEXT DEFAULT '',
      play_product_id_yearly TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS company_subscriptions(
      id TEXT PRIMARY KEY,company_id TEXT UNIQUE NOT NULL,plan_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'TRIAL',
      source TEXT NOT NULL DEFAULT 'SYSTEM',trial_started_at TEXT DEFAULT '',trial_ends_at TEXT DEFAULT '',
      current_period_start TEXT DEFAULT '',current_period_end TEXT DEFAULT '',grace_ends_at TEXT DEFAULT '',
      play_purchase_token TEXT DEFAULT '',play_order_id TEXT DEFAULT '',auto_renewing INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS subscription_requests(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,requested_plan_id TEXT NOT NULL,billing_cycle TEXT DEFAULT 'MONTHLY',
      status TEXT NOT NULL DEFAULT 'PENDING',notes TEXT DEFAULT '',requested_by TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];
  for(const sql of creates)await env.DB.prepare(sql).run();
  await ensureUserTenantColumns(env);

  await run(env,`INSERT OR IGNORE INTO companies(
    id,company_code,company_name,legal_name,gst_no,pan_no,mobile,email,address,invoice_prefix,non_gst_prefix,trip_prefix,supplier_prefix,status
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    DEFAULT_COMPANY_ID,'MEERA','MEERA LOGISTICS','MEERA LOGISTICS','24ACFFM2544N1Z1','ACFFM2544N',
    '9558959579','meera.logistics99@gmail.com','OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR',
    'ML','JAY','TR','PML','ACTIVE');

  const plans=[
    ['TRIAL','Free Trial',1,50,25,250,{calendar:true,trip:true,invoice:true,ledger:true,reports:true,approvals:true,excel:true,offline:true,documents:true},0],
    ['BASIC','Basic',2,300,150,500,{calendar:true,trip:true,invoice:true,ledger:true,reports:true,excel:true,offline:true},10],
    ['PRO','Pro',5,1500,750,2048,{calendar:true,trip:true,invoice:true,ledger:true,reports:true,approvals:true,excel:true,offline:true,documents:true},20],
    ['BUSINESS','Business',15,999999,999999,10240,{calendar:true,trip:true,invoice:true,ledger:true,reports:true,approvals:true,excel:true,offline:true,documents:true,team:true,prioritySupport:true},30]
  ];
  for(const p of plans)await run(env,`INSERT OR IGNORE INTO saas_plans(
    id,plan_name,max_users,max_trips_month,max_invoices_month,max_storage_mb,features_json,sort_order
  ) VALUES(?,?,?,?,?,?,?,?)`,p[0],p[1],p[2],p[3],p[4],p[5],JSON.stringify(p[6]),p[7]);

  await run(env,`INSERT OR IGNORE INTO company_subscriptions(
    id,company_id,plan_id,status,source,current_period_start
  ) VALUES(?,?,?,?,?,date('now'))`,uid('SUB'),DEFAULT_COMPANY_ID,'BUSINESS','GRANDFATHERED','LEGACY_MIGRATION');

  await run(env,`UPDATE users SET company_id=? WHERE company_id IS NULL OR TRIM(company_id)=''`,DEFAULT_COMPANY_ID);

    try{await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('saas_ready_v53','1',CURRENT_TIMESTAMP)`)}catch(_){}
    return true;
  })().catch(error=>{saasFoundationPromise=null;throw error});
  return saasFoundationPromise;
}



let subscriptionRequestsV61Promise=null;
async function ensureSubscriptionRequestsV61(env){
  if(subscriptionRequestsV61Promise)return subscriptionRequestsV61Promise;
  subscriptionRequestsV61Promise=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscription_requests(
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      requested_plan_id TEXT NOT NULL,
      billing_cycle TEXT DEFAULT 'MONTHLY',
      status TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT DEFAULT '',
      requested_by TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_subscription_request_company_v61
      ON subscription_requests(company_id,status,created_at)`);
    try{
      await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at)
        VALUES('subscription_requests_v61','1',CURRENT_TIMESTAMP)`);
    }catch(_){}
    return true;
  })().catch(error=>{subscriptionRequestsV61Promise=null;throw error});
  return subscriptionRequestsV61Promise;
}

let platformV60Promise=null;
async function ensurePlatformV60(env){
  if(platformV60Promise)return platformV60Promise;
  platformV60Promise=(async()=>{
    await ensureSubscriptionRequestsV61(env);
    const creates=[
      `CREATE TABLE IF NOT EXISTS subscription_requests(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL,requested_plan_id TEXT NOT NULL,billing_cycle TEXT DEFAULT 'MONTHLY',
        status TEXT NOT NULL DEFAULT 'PENDING',notes TEXT DEFAULT '',requested_by TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS platform_admins(
        username TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS platform_audit_logs(
        id TEXT PRIMARY KEY,admin_username TEXT NOT NULL,action TEXT NOT NULL,company_id TEXT DEFAULT '',
        request_id TEXT DEFAULT '',payload TEXT DEFAULT '{}',created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    for(const sql of creates)await env.DB.prepare(sql).run();
    await run(env,`INSERT OR IGNORE INTO platform_admins(username,active) VALUES('admin',1)`);
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_subscription_request_company_v60 ON subscription_requests(company_id,status,created_at)`);
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_platform_audit_v60 ON platform_audit_logs(created_at)`);
    return true;
  })().catch(error=>{platformV60Promise=null;throw error});
  return platformV60Promise;
}
async function isPlatformAdminV60(env,user){
  if(!user||companyIdOf(user)!==DEFAULT_COMPANY_ID)return false;
  await ensurePlatformV60(env);
  const row=await first(env,`SELECT username FROM platform_admins WHERE LOWER(username)=LOWER(?) AND active=1`,user.username||'');
  return !!row;
}
async function platformAuditV60(env,user,action,companyId='',requestId='',payload={}){
  await ensurePlatformV60(env);
  await run(env,`INSERT INTO platform_audit_logs(id,admin_username,action,company_id,request_id,payload)
    VALUES(?,?,?,?,?,?)`,uid('PAD'),user?.username||'',action,companyId||'',requestId||'',JSON.stringify(payload||{}));
}
function v60SubscriptionExpired(row){
  const today=new Date().toISOString().slice(0,10);
  if(String(row.subscription_status||'')==='EXPIRED')return true;
  if(String(row.subscription_status||'')==='TRIAL'&&row.trial_ends_at&&String(row.trial_ends_at)<today)return true;
  if(row.current_period_end&&['ACTIVE','GRACE','CANCELLED'].includes(String(row.subscription_status||''))&&String(row.current_period_end)<today){
    if(!row.grace_ends_at||String(row.grace_ends_at)<today)return true;
  }
  return false;
}
async function platformDashboardV60(env){
  await ensurePlatformV60(env);
  const month=new Date().toISOString().slice(0,7);
  const companies=await all(env,`
    SELECT c.id,c.company_code,c.company_name,c.mobile,c.email,c.status,c.created_at,
      cs.plan_id,cs.status subscription_status,cs.source,cs.trial_ends_at,cs.current_period_end,cs.grace_ends_at,
      (SELECT username FROM users u WHERE u.company_id=c.id AND u.role='OWNER' ORDER BY u.id LIMIT 1) owner_username,
      (SELECT full_name FROM users u WHERE u.company_id=c.id AND u.role='OWNER' ORDER BY u.id LIMIT 1) owner_name,
      (SELECT mobile FROM users u WHERE u.company_id=c.id AND u.role='OWNER' ORDER BY u.id LIMIT 1) owner_mobile,
      (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.active=1) active_users,
      (SELECT COUNT(*) FROM trips t WHERE t.company_id=c.id AND substr(COALESCE(t.trip_date,''),1,7)=?) month_trips,
      (SELECT COUNT(*) FROM invoices i WHERE i.company_id=c.id AND substr(COALESCE(i.invoice_date,''),1,7)=?) month_invoices
    FROM companies c
    LEFT JOIN company_subscriptions cs ON cs.company_id=c.id
    ORDER BY c.created_at DESC,c.company_name`,month,month);
  for(const c of companies){
    c.subscription_expired=v60SubscriptionExpired(c);
    c.days_remaining=c.subscription_status==='TRIAL'?dateDaysRemainingV59(c.trial_ends_at):dateDaysRemainingV59(c.grace_ends_at||c.current_period_end);
  }
  const requests=await all(env,`
    SELECT r.*,c.company_name,c.company_code,c.mobile company_mobile,c.email company_email
    FROM subscription_requests r JOIN companies c ON c.id=r.company_id
    ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`);
  const recentAudit=await all(env,`SELECT * FROM platform_audit_logs ORDER BY created_at DESC LIMIT 100`);
  const summary={
    totalCompanies:companies.length,
    activeCompanies:companies.filter(c=>c.status==='ACTIVE').length,
    trials:companies.filter(c=>c.subscription_status==='TRIAL'&&!c.subscription_expired).length,
    expired:companies.filter(c=>c.subscription_expired).length,
    suspended:companies.filter(c=>c.status!=='ACTIVE').length,
    pendingRequests:requests.filter(r=>r.status==='PENDING').length
  };
  return {summary,companies,requests,recentAudit,checkedAt:new Date().toISOString()};
}

async function saasContext(env,user){
  await ensureSaasFoundation(env);
  await ensurePlatformV60(env);
  await ensureSubscriptionRequestsV61(env);
  const companyId=user?.company_id||DEFAULT_COMPANY_ID;
  const company=await first(env,`SELECT * FROM companies WHERE id=?`,companyId)
    ||await first(env,`SELECT * FROM companies WHERE id=?`,DEFAULT_COMPANY_ID);
  const subscription=await first(env,`
    SELECT cs.*,sp.plan_name,sp.max_users,sp.max_trips_month,sp.max_invoices_month,sp.max_storage_mb,
      sp.features_json,sp.monthly_price,sp.yearly_price,sp.play_product_id_monthly,sp.play_product_id_yearly
    FROM company_subscriptions cs JOIN saas_plans sp ON sp.id=cs.plan_id WHERE cs.company_id=?`,
    company?.id||DEFAULT_COMPANY_ID);
  const month=new Date().toISOString().slice(0,7);
  const users=Number((await first(env,`SELECT COUNT(*) count FROM users WHERE company_id=? AND active=1`,company?.id||DEFAULT_COMPANY_ID))?.count||0);
  const trips=Number((await first(env,`SELECT COUNT(*) count FROM trips WHERE company_id=? AND substr(COALESCE(trip_date,''),1,7)=?`,company?.id||DEFAULT_COMPANY_ID,month))?.count||0);
  const invoices=Number((await first(env,`SELECT COUNT(*) count FROM invoices WHERE company_id=? AND substr(COALESCE(invoice_date,''),1,7)=?`,company?.id||DEFAULT_COMPANY_ID,month))?.count||0);
  const features=JSON.parse(subscription?.features_json||'{}');
  const pendingRequest=await first(env,`SELECT id,requested_plan_id,billing_cycle,status,created_at FROM subscription_requests WHERE company_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1`,company?.id||DEFAULT_COMPANY_ID);
  return {company,subscription:{...subscription,features_json:undefined,features},usage:{month,users,trips,invoices},pendingRequest,
    role:upper(user?.role||'VIEWER'),permissions:permissionsForRole(user?.role)};
}
function dateDaysRemainingV59(dateValue){
  if(!dateValue)return null;
  const target=new Date(`${String(dateValue).slice(0,10)}T23:59:59Z`).getTime();
  const now=Date.now();
  return Math.max(0,Math.ceil((target-now)/86400000));
}
function subscriptionFeatureAllowedV59(context,feature){
  if(!feature)return true;
  const features=context?.subscription?.features||{};
  return !!features[feature];
}
async function subscriptionAccess(env,user){
  const context=await saasContext(env,user),s=context.subscription||{},today=new Date().toISOString().slice(0,10);
  const trialExpired=s.status==='TRIAL'&&s.trial_ends_at&&s.trial_ends_at<today;
  const periodExpired=s.current_period_end&&['ACTIVE','GRACE','CANCELLED'].includes(s.status)
    &&s.current_period_end<today&&(!s.grace_ends_at||s.grace_ends_at<today);
  const expired=s.status==='EXPIRED'||trialExpired||periodExpired;
  const endDate=s.status==='TRIAL'?s.trial_ends_at:(s.grace_ends_at||s.current_period_end||'');
  const daysRemaining=dateDaysRemainingV59(endDate);
  const limits={
    users:Number(s.max_users||1),
    trips:Number(s.max_trips_month||0),
    invoices:Number(s.max_invoices_month||0),
    storageMb:Number(s.max_storage_mb||0)
  };
  const usage=context.usage||{};
  const usagePercent={
    users:limits.users?Math.min(100,Math.round(Number(usage.users||0)*100/limits.users)):0,
    trips:limits.trips?Math.min(100,Math.round(Number(usage.trips||0)*100/limits.trips)):0,
    invoices:limits.invoices?Math.min(100,Math.round(Number(usage.invoices||0)*100/limits.invoices)):0
  };
  return {
    ...context,
    readOnly:expired,
    trialExpired,
    daysRemaining,
    limits,
    usagePercent,
    accessMessage:expired
      ? 'Subscription expired. Existing data is available in read-only mode.'
      : (s.status==='TRIAL'
        ? `${daysRemaining??0} trial day(s) remaining`
        : `${s.plan_name||s.plan_id||'Plan'} active`)
  };
}


const TENANT_TABLES=[
  'party_accounts','party_payments','trucks','routes','materials','trips','invoices','invoice_items',
  'pm_bills','pm_bill_items','truck_payments','supplier_payments','supplier_accounts','expenses',
  'truck_documents','audit_logs','workflow_bookings','approval_requests','recycle_bin',
  'backup_snapshots','monthly_exports','app_settings'
];
const TENANT_RESOURCE_TABLE={
  parties:'party_accounts','party-payments':'party_payments',trucks:'trucks',trips:'trips',
  invoices:'invoices','pm-bills':'pm_bills','truck-entries':'truck_payments',suppliers:'supplier_accounts',
  'supplier-payments':'supplier_payments',expenses:'expenses',documents:'truck_documents',
  'workflow-bookings':'workflow_bookings',approvals:'approval_requests','recycle-bin':'recycle_bin',
  backups:'backup_snapshots','monthly-exports':'monthly_exports'
};
function companyIdOf(user){return clean(user?.company_id)||DEFAULT_COMPANY_ID}
async function tenantOwns(env,user,resource,id){
  const table=TENANT_RESOURCE_TABLE[resource];
  if(!table||!id)return true;
  const row=await first(env,`SELECT id FROM ${table} WHERE id=? AND company_id=? LIMIT 1`,id,companyIdOf(user));
  return !!row;
}
async function requireTenantRecord(env,user,resource,id){
  if(await tenantOwns(env,user,resource,id))return true;
  const error=new Error('Record not found for this company');
  error.status=404;throw error;
}
async function addTenantColumn(env,table){
  await safe(env,`ALTER TABLE ${table} ADD COLUMN company_id TEXT DEFAULT '${DEFAULT_COMPANY_ID}'`);
  await safe(env,`UPDATE ${table} SET company_id='${DEFAULT_COMPANY_ID}' WHERE company_id IS NULL OR TRIM(company_id)=''`);
}
async function rebuildTenantUniqueTables(env){
  const marker=await first(env,`SELECT value FROM app_meta WHERE key='tenant_unique_v50'`);
  if(marker?.value==='1')return;

  // All advanced tables must exist before the rebuild.
  await ensureAdvancedTables(env);
  for(const table of TENANT_TABLES)await addTenantColumn(env,table);

  // Drop global Trip number uniqueness from legacy versions.
  await safe(env,`DROP INDEX IF EXISTS idx_trip_no`);

  // Rebuild only tables that previously had global UNIQUE/PRIMARY constraints on user-facing numbers.
  const rebuilds=[
    {
      table:'party_accounts',
      create:`CREATE TABLE party_accounts(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        ledger_no TEXT,party_name TEXT NOT NULL,address TEXT DEFAULT '',gst_no TEXT DEFAULT '',
        mobile TEXT DEFAULT '',email TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,ledger_no),UNIQUE(company_id,party_name)
      )`,
      columns:'id,company_id,ledger_no,party_name,address,gst_no,mobile,email,created_at,updated_at'
    },
    {
      table:'trucks',
      create:`CREATE TABLE trucks(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        truck_no TEXT NOT NULL,owner_name TEXT,owner_mobile TEXT DEFAULT '',bank_details TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,truck_no)
      )`,
      columns:'id,company_id,truck_no,owner_name,owner_mobile,bank_details,created_at,updated_at'
    },
    {
      table:'materials',
      create:`CREATE TABLE materials(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        material_name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,material_name)
      )`,
      columns:'id,company_id,material_name,created_at'
    },
    {
      table:'invoices',
      create:`CREATE TABLE invoices(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        invoice_no TEXT NOT NULL,invoice_type TEXT DEFAULT 'GST',invoice_date TEXT,party_name TEXT,
        party_address TEXT DEFAULT '',party_gst TEXT DEFAULT '',lr_no TEXT DEFAULT '',material TEXT DEFAULT '',
        loading_date TEXT DEFAULT '',sgst REAL DEFAULT 9,cgst REAL DEFAULT 9,diesel REAL DEFAULT 0,
        munshi REAL DEFAULT 0,subtotal REAL DEFAULT 0,gst_amount REAL DEFAULT 0,total REAL DEFAULT 0,
        comments TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,invoice_no)
      )`,
      columns:'id,company_id,invoice_no,invoice_type,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments,created_at,updated_at'
    },
    {
      table:'pm_bills',
      create:`CREATE TABLE pm_bills(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        bill_no TEXT NOT NULL,bill_date TEXT,party_name TEXT NOT NULL,party_address TEXT DEFAULT '',
        supplier_name TEXT DEFAULT '',notes TEXT DEFAULT '',subtotal REAL DEFAULT 0,supplier_total REAL DEFAULT 0,
        profit REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,bill_no)
      )`,
      columns:'id,company_id,bill_no,bill_date,party_name,party_address,supplier_name,notes,subtotal,supplier_total,profit,created_at,updated_at'
    },
    {
      table:'supplier_accounts',
      create:`CREATE TABLE supplier_accounts(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        ledger_no TEXT NOT NULL,owner_name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,ledger_no),UNIQUE(company_id,owner_name)
      )`,
      columns:'id,company_id,ledger_no,owner_name,created_at,updated_at'
    },
    {
      table:'workflow_bookings',
      create:`CREATE TABLE workflow_bookings(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        booking_no TEXT NOT NULL,booking_date TEXT NOT NULL,party_name TEXT NOT NULL,truck_no TEXT DEFAULT '',
        material TEXT DEFAULT '',loading_point TEXT DEFAULT '',unloading_point TEXT DEFAULT '',expected_date TEXT DEFAULT '',
        status TEXT DEFAULT 'DRAFT',approval_status TEXT DEFAULT 'NOT_REQUIRED',approved_by TEXT DEFAULT '',
        approved_at TEXT DEFAULT '',dispatch_date TEXT DEFAULT '',trip_id TEXT DEFAULT '',notes TEXT DEFAULT '',
        created_by TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id,booking_no)
      )`,
      columns:'id,company_id,booking_no,booking_date,party_name,truck_no,material,loading_point,unloading_point,expected_date,status,approval_status,approved_by,approved_at,dispatch_date,trip_id,notes,created_by,created_at,updated_at'
    },
    {
      table:'monthly_exports',
      create:`CREATE TABLE monthly_exports(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
        month_key TEXT NOT NULL,summary TEXT DEFAULT '{}',payload TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,month_key)
      )`,
      columns:'id,company_id,month_key,summary,payload,created_at'
    },
    {
      table:'app_settings',
      create:`CREATE TABLE app_settings(
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,updated_by TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(company_id,setting_key)
      )`,
      columns:'company_id,setting_key,setting_value,updated_by,updated_at'
    }
  ];

  for(const spec of rebuilds){
    const sqlRow=await first(env,`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,spec.table);
    const sql=String(sqlRow?.sql||'');
    if(/company_id/i.test(sql) && (/UNIQUE\s*\(\s*company_id/i.test(sql)||/PRIMARY KEY\s*\(\s*company_id/i.test(sql)))continue;
    const old=`${spec.table}_v49_${Date.now().toString().slice(-6)}`;
    await env.DB.prepare(`ALTER TABLE ${spec.table} RENAME TO ${old}`).run();
    await env.DB.prepare(spec.create).run();
    await env.DB.prepare(`INSERT INTO ${spec.table}(${spec.columns}) SELECT ${spec.columns} FROM ${old}`).run();
    await env.DB.prepare(`DROP TABLE ${old}`).run();
  }

  // Tenant-scoped indexes and unique Trip number.
  const indexes=[
    `CREATE INDEX IF NOT EXISTS idx_party_company ON party_accounts(company_id,party_name)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_company ON party_payments(company_id,party_name,payment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_truck_company ON trucks(company_id,truck_no)`,
    `CREATE INDEX IF NOT EXISTS idx_route_company ON routes(company_id,loading_point,unloading_point)`,
    `CREATE INDEX IF NOT EXISTS idx_material_company ON materials(company_id,material_name)`,
    `CREATE INDEX IF NOT EXISTS idx_trip_company ON trips(company_id,trip_date)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_company_no ON trips(company_id,trip_no) WHERE trip_no IS NOT NULL AND TRIM(trip_no)<>''`,
    `CREATE INDEX IF NOT EXISTS idx_invoice_company ON invoices(company_id,invoice_date)`,
    `CREATE INDEX IF NOT EXISTS idx_invoice_item_company ON invoice_items(company_id,invoice_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pmb_company ON pm_bills(company_id,bill_date)`,
    `CREATE INDEX IF NOT EXISTS idx_pmi_company ON pm_bill_items(company_id,bill_id)`,
    `CREATE INDEX IF NOT EXISTS idx_truck_payment_company ON truck_payments(company_id,owner_name,entry_date)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_payment_company ON supplier_payments(company_id,owner_name,payment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_company ON supplier_accounts(company_id,owner_name)`,
    `CREATE INDEX IF NOT EXISTS idx_expense_company ON expenses(company_id,expense_date)`,
    `CREATE INDEX IF NOT EXISTS idx_document_company ON truck_documents(company_id,truck_no)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_booking_company ON workflow_bookings(company_id,booking_date)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_company ON approval_requests(company_id,status,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_recycle_company ON recycle_bin(company_id,deleted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_backup_company ON backup_snapshots(company_id,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_month_company ON monthly_exports(company_id,month_key)`
  ];
  for(const sql of indexes)await env.DB.prepare(sql).run();

  // Recreate triggers dropped by table rebuilds.
  const triggers=[
    `CREATE TRIGGER IF NOT EXISTS trg_party_accounts_ai AFTER INSERT ON party_accounts WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE party_accounts SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
    `CREATE TRIGGER IF NOT EXISTS trg_party_accounts_au AFTER UPDATE ON party_accounts WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE party_accounts SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
    `CREATE TRIGGER IF NOT EXISTS trg_trucks_ai AFTER INSERT ON trucks WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE trucks SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
    `CREATE TRIGGER IF NOT EXISTS trg_trucks_au AFTER UPDATE ON trucks WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE trucks SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
    `CREATE TRIGGER IF NOT EXISTS trg_invoices_ai AFTER INSERT ON invoices WHEN NEW.created_at IS NULL OR NEW.created_at='' BEGIN UPDATE invoices SET created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`,
    `CREATE TRIGGER IF NOT EXISTS trg_invoices_au AFTER UPDATE ON invoices WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE invoices SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END`
  ];
  for(const sql of triggers)await env.DB.prepare(sql).run();

  await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tenant_unique_v50','1',CURRENT_TIMESTAMP)`);
}

const V52_TENANT_REBUILDS=[
  {
    table:'party_accounts',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*ledger_no/i,
    create:`CREATE TABLE party_accounts(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      ledger_no TEXT,party_name TEXT NOT NULL,address TEXT DEFAULT '',gst_no TEXT DEFAULT '',
      mobile TEXT DEFAULT '',email TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,ledger_no),UNIQUE(company_id,party_name)
    )`,
    columns:'id,company_id,ledger_no,party_name,address,gst_no,mobile,email,created_at,updated_at'
  },
  {
    table:'trucks',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*truck_no/i,
    create:`CREATE TABLE trucks(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      truck_no TEXT NOT NULL,owner_name TEXT,owner_mobile TEXT DEFAULT '',bank_details TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,truck_no)
    )`,
    columns:'id,company_id,truck_no,owner_name,owner_mobile,bank_details,created_at,updated_at'
  },
  {
    table:'materials',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*material_name/i,
    create:`CREATE TABLE materials(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      material_name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,material_name)
    )`,
    columns:'id,company_id,material_name,created_at'
  },
  {
    table:'invoices',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*invoice_no/i,
    create:`CREATE TABLE invoices(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      invoice_no TEXT NOT NULL,invoice_type TEXT DEFAULT 'GST',invoice_date TEXT,party_name TEXT,
      party_address TEXT DEFAULT '',party_gst TEXT DEFAULT '',lr_no TEXT DEFAULT '',material TEXT DEFAULT '',
      loading_date TEXT DEFAULT '',sgst REAL DEFAULT 9,cgst REAL DEFAULT 9,diesel REAL DEFAULT 0,
      munshi REAL DEFAULT 0,subtotal REAL DEFAULT 0,gst_amount REAL DEFAULT 0,total REAL DEFAULT 0,
      comments TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,invoice_no)
    )`,
    columns:'id,company_id,invoice_no,invoice_type,invoice_date,party_name,party_address,party_gst,lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments,created_at,updated_at'
  },
  {
    table:'pm_bills',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*bill_no/i,
    create:`CREATE TABLE pm_bills(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      bill_no TEXT NOT NULL,bill_date TEXT,party_name TEXT NOT NULL,party_address TEXT DEFAULT '',
      supplier_name TEXT DEFAULT '',notes TEXT DEFAULT '',subtotal REAL DEFAULT 0,supplier_total REAL DEFAULT 0,
      profit REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,bill_no)
    )`,
    columns:'id,company_id,bill_no,bill_date,party_name,party_address,supplier_name,notes,subtotal,supplier_total,profit,created_at,updated_at'
  },
  {
    table:'supplier_accounts',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*ledger_no/i,
    create:`CREATE TABLE supplier_accounts(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      ledger_no TEXT NOT NULL,owner_name TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,ledger_no),UNIQUE(company_id,owner_name)
    )`,
    columns:'id,company_id,ledger_no,owner_name,created_at,updated_at'
  },
  {
    table:'workflow_bookings',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*booking_no/i,
    create:`CREATE TABLE workflow_bookings(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      booking_no TEXT NOT NULL,booking_date TEXT NOT NULL,party_name TEXT NOT NULL,truck_no TEXT DEFAULT '',
      material TEXT DEFAULT '',loading_point TEXT DEFAULT '',unloading_point TEXT DEFAULT '',expected_date TEXT DEFAULT '',
      status TEXT DEFAULT 'DRAFT',approval_status TEXT DEFAULT 'NOT_REQUIRED',approved_by TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',dispatch_date TEXT DEFAULT '',trip_id TEXT DEFAULT '',notes TEXT DEFAULT '',
      created_by TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,booking_no)
    )`,
    columns:'id,company_id,booking_no,booking_date,party_name,truck_no,material,loading_point,unloading_point,expected_date,status,approval_status,approved_by,approved_at,dispatch_date,trip_id,notes,created_by,created_at,updated_at'
  },
  {
    table:'monthly_exports',
    ready:/UNIQUE\s*\(\s*company_id\s*,\s*month_key/i,
    create:`CREATE TABLE monthly_exports(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',
      month_key TEXT NOT NULL,summary TEXT DEFAULT '{}',payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,month_key)
    )`,
    columns:'id,company_id,month_key,summary,payload,created_at'
  },
  {
    table:'app_settings',
    ready:/PRIMARY KEY\s*\(\s*company_id\s*,\s*setting_key/i,
    create:`CREATE TABLE app_settings(
      company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,updated_by TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(company_id,setting_key)
    )`,
    columns:'company_id,setting_key,setting_value,updated_by,updated_at'
  }
];

async function rebuildOneTenantTableV52(env,spec){
  const row=await first(env,`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,spec.table);
  const sql=String(row?.sql||'');
  if(!sql)return true;
  if(spec.ready.test(sql))return true;

  // D1 batch is transactional, so rename/create/copy/drop cannot leave a half table.
  const old=`${spec.table}_v52_old`;
  const oldExists=await first(env,`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,old);
  if(oldExists){
    // Previous pre-V52 code could have been interrupted. Prefer the current table;
    // only remove a stale temp table after confirming the live table exists.
    await env.DB.prepare(`DROP TABLE ${old}`).run();
  }
  await env.DB.batch([
    env.DB.prepare(`ALTER TABLE ${spec.table} RENAME TO ${old}`),
    env.DB.prepare(spec.create),
    env.DB.prepare(`INSERT INTO ${spec.table}(${spec.columns}) SELECT ${spec.columns} FROM ${old}`),
    env.DB.prepare(`DROP TABLE ${old}`)
  ]);
  return true;
}

async function finalizeTenantUpgradeV52(env){
  const indexes=[
    `DROP INDEX IF EXISTS idx_trip_no`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_company_no ON trips(company_id,trip_no) WHERE trip_no IS NOT NULL AND TRIM(trip_no)<>''`,
    `CREATE INDEX IF NOT EXISTS idx_party_company ON party_accounts(company_id,party_name)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_company ON party_payments(company_id,party_name,payment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_truck_company ON trucks(company_id,truck_no)`,
    `CREATE INDEX IF NOT EXISTS idx_route_company ON routes(company_id,loading_point,unloading_point)`,
    `CREATE INDEX IF NOT EXISTS idx_material_company ON materials(company_id,material_name)`,
    `CREATE INDEX IF NOT EXISTS idx_trip_company ON trips(company_id,trip_date)`,
    `CREATE INDEX IF NOT EXISTS idx_invoice_company ON invoices(company_id,invoice_date)`,
    `CREATE INDEX IF NOT EXISTS idx_invoice_item_company ON invoice_items(company_id,invoice_id)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_company ON supplier_accounts(company_id,owner_name)`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_payment_company ON supplier_payments(company_id,owner_name,payment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_document_company ON truck_documents(company_id,truck_no)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id,created_at)`
  ];
  for(const sql of indexes)await safe(env,sql);
  await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tenant_unique_v52','1',CURRENT_TIMESTAMP)`);
  await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tenant_unique_v50','1',CURRENT_TIMESTAMP)`);
}

async function progressTenantUpgradeV52(env,steps=2){
  if(tenantUpgradePromise)return tenantUpgradePromise;
  tenantUpgradePromise=(async()=>{
    await healTenantColumns(env);
    let marker=await first(env,`SELECT value FROM app_meta WHERE key='tenant_stage_v52'`);
    let stage=Math.max(0,Number(marker?.value||0));
    for(let n=0;n<steps&&stage<V52_TENANT_REBUILDS.length;n++,stage++){
      await rebuildOneTenantTableV52(env,V52_TENANT_REBUILDS[stage]);
      await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('tenant_stage_v52',?,CURRENT_TIMESTAMP)`,String(stage+1));
    }
    if(stage>=V52_TENANT_REBUILDS.length){
      await finalizeTenantUpgradeV52(env);
    }
    return stage;
  })().finally(()=>{tenantUpgradePromise=null});
  return tenantUpgradePromise;
}

async function ensureTenantIsolation(env){
  await ensureAdvancedTables(env);
  await rebuildTenantUniqueTables(env);
  for(const table of TENANT_TABLES)await addTenantColumn(env,table);
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


async function currentTripMax(env,companyId=DEFAULT_COMPANY_ID){
  const rows=await all(env,`SELECT trip_no FROM trips WHERE company_id=? AND COALESCE(TRIM(trip_no),'')<>''`,companyId);
  let max=0;
  for(const row of rows){const m=String(row.trip_no||'').match(/TR\s*0*(\d+)/i);if(m)max=Math.max(max,Number(m[1]))}
  return max;
}
async function reserveNextTripNumber(env,companyId=DEFAULT_COMPANY_ID){
  let candidate=(await currentTripMax(env,companyId))+1;
  for(let attempt=0;attempt<1000;attempt++,candidate++){
    const tripNo=`TR ${String(candidate).padStart(3,'0')}`;
    const exists=await first(env,`SELECT id FROM trips WHERE company_id=? AND trip_no=? LIMIT 1`,companyId,tripNo);
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

let accountingV58Promise=null;
async function ensureAccountingV58(env){
  if(accountingV58Promise)return accountingV58Promise;
  accountingV58Promise=(async()=>{
    const row=await first(env,`SELECT sql FROM sqlite_master WHERE type='table' AND name='party_payments'`);
    const sql=String(row?.sql||'');
    if(sql&&!/\binvoice_id\b/i.test(sql)){
      await env.DB.prepare(`ALTER TABLE party_payments ADD COLUMN invoice_id TEXT DEFAULT ''`).run();
    }
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_party_payment_invoice_v58 ON party_payments(company_id,invoice_id)`);
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_party_payment_party_v58 ON party_payments(company_id,party_name,payment_date)`);
    return true;
  })().catch(error=>{accountingV58Promise=null;throw error});
  return accountingV58Promise;
}

let accountingSchemaV665Promise=null;
const repairedAccountingCompaniesV665=new Set();
async function ensureAccountingSchemaV665(env){
  if(accountingSchemaV665Promise)return accountingSchemaV665Promise;
  accountingSchemaV665Promise=(async()=>{
    await ensureAccountingV58(env);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS party_payment_allocations(
      id TEXT PRIMARY KEY,company_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,allocation_mode TEXT DEFAULT 'FIFO_LOCKED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id,payment_id,invoice_id)
    )`).run();
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_ppa_company_payment_v665 ON party_payment_allocations(company_id,payment_id)`);
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_ppa_company_invoice_v665 ON party_payment_allocations(company_id,invoice_id)`);
    return true;
  })().catch(error=>{accountingSchemaV665Promise=null;throw error});
  return accountingSchemaV665Promise;
}

function sameTruckEntryBusinessV665(a,b){
  if(!a||!b)return false;
  const textPairs=[['truck_no','truck_no'],['owner_name','owner_name'],['loading_point','loading_point'],['unloading_point','unloading_point']];
  for(const [ak,bk] of textPairs){
    if(accountKey(a[ak])&&accountKey(b[bk])&&accountKey(a[ak])!==accountKey(b[bk]))return false;
  }
  return Math.abs(num(a.weight)-num(b.weight))<=0.06 &&
    Math.abs(num(a.rate)-num(b.rate))<=0.01 &&
    Math.abs(num(a.commission)-num(b.commission))<=0.01 &&
    Math.abs(num(a.payable)-num(b.payable))<=10;
}
function truckEntryTripScoreV665(entry,trip){
  if(!entry||!trip||accountKey(entry.truck_no)!==accountKey(trip.truck_no))return -1;
  if(accountKey(entry.loading_point)&&accountKey(trip.loading_point)&&accountKey(entry.loading_point)!==accountKey(trip.loading_point))return -1;
  if(accountKey(entry.unloading_point)&&accountKey(trip.unloading_point)&&accountKey(entry.unloading_point)!==accountKey(trip.unloading_point))return -1;
  if(Math.abs(num(entry.weight)-num(trip.unloading_weight||trip.loading_weight||trip.billing_weight||trip.weight))>0.06)return -1;
  if(accountKey(entry.owner_name)&&accountKey(trip.supplier_name)&&accountKey(entry.owner_name)!==accountKey(trip.supplier_name))return -1;
  let score=10;
  if(accountKey(entry.owner_name)===accountKey(trip.supplier_name))score+=4;
  if(accountKey(entry.loading_point)===accountKey(trip.loading_point))score+=2;
  if(accountKey(entry.unloading_point)===accountKey(trip.unloading_point))score+=2;
  if(String(entry.entry_date||'')===String(trip.trip_date||''))score+=1;
  return score;
}
const LEGACY_INVOICE_LINES_V665=[
  {invoiceNo:'ML - 110',partyName:'MANOJ & CO.',total:34323.84,loadingDate:'2026-07-03',lrNumber:'280',truckNo:'GJ 37 V 8587',description:'WELSPU ANJAR TO DCC SIKKA',loadingWeight:36.58,unloadingWeight:36.36,weight:36.36,rate:800},
  {invoiceNo:'ML - 116',partyName:'SHREE DWARKADHISH ENTERPRISE',total:63007.28,loadingDate:'2026-07-08',lrNumber:'144',truckNo:'GJ 03 CU 6679',description:'RELINCE TO JHAGADIA',loadingWeight:38.14,unloadingWeight:38.14,weight:38.14,rate:1400}
];
function recoverLegacyInvoiceLinesV665(companyId,invoices=[],items=[],trips=[],trucks=[]){
  const created={items:[],trips:[],trucks:[]};
  let maxTrip=trips.reduce((max,row)=>{const m=String(row.trip_no||'').match(/TR\s*0*(\d+)/i);return Math.max(max,m?Number(m[1]):0)},0);
  for(const spec of LEGACY_INVOICE_LINES_V665){
    const invoice=invoices.find(x=>accountKey(x.invoice_no)===accountKey(spec.invoiceNo)&&accountKey(x.party_name)===accountKey(spec.partyName)&&Math.abs(num(x.total)-spec.total)<=0.02);
    if(!invoice||items.some(x=>String(x.invoice_id)===String(invoice.id)))continue;
    const itemId=uid('II'),tripId=uid('TRIP'),route=splitRoute(spec.description),createdAt=new Date().toISOString();
    const truck=trucks.find(x=>accountKey(x.truck_no)===accountKey(spec.truckNo));
    if(!truck){
      const newTruck={id:uid('TRK'),company_id:companyId,truck_no:upper(spec.truckNo),owner_name:'',owner_mobile:'',bank_details:'',created_at:createdAt,updated_at:createdAt};
      trucks.push(newTruck);created.trucks.push(newTruck);
    }
    const owner=(trucks.find(x=>accountKey(x.truck_no)===accountKey(spec.truckNo))||{}).owner_name||'';
    const trip={id:tripId,company_id:companyId,trip_no:`TR ${String(++maxTrip).padStart(3,'0')}`,invoice_id:invoice.id,invoice_item_id:itemId,trip_date:spec.loadingDate,party_name:upper(invoice.party_name),truck_no:upper(spec.truckNo),driver_name:'',driver_mobile:'',material:upper(invoice.material),loading_point:route.loading,unloading_point:route.unloading,lr_number:spec.lrNumber,loading_weight:spec.loadingWeight,unloading_weight:spec.unloadingWeight,shortage:round2(spec.loadingWeight-spec.unloadingWeight),billing_weight:spec.weight,supplier_name:upper(owner),weight:spec.weight,rate:spec.rate,status:'BOOKED',notes:`Recovered from original ${spec.invoiceNo} source`,pod_file_name:'',pod_data:'',created_at:createdAt,updated_at:createdAt};
    const item={id:itemId,company_id:companyId,invoice_id:invoice.id,trip_id:tripId,lr_number:spec.lrNumber,truck_no:upper(spec.truckNo),description:upper(spec.description),loading_weight:spec.loadingWeight,unloading_weight:spec.unloadingWeight,shortage:round2(spec.loadingWeight-spec.unloadingWeight),weight:spec.weight,rate:spec.rate,amount:round2(spec.weight*spec.rate),created_at:createdAt};
    trips.push(trip);items.push(item);created.trips.push(trip);created.items.push(item);
  }
  return created;
}
async function repairAccountingLinksV665(env,companyId=DEFAULT_COMPANY_ID,{force=false}={}){
  await ensureAccountingSchemaV665(env);
  if(!force&&repairedAccountingCompaniesV665.has(companyId))return {linked:0,removedDuplicates:0,clearedOrphans:0};
  const [invoices,trips,items,entries,trucks]=await Promise.all([
    all(env,`SELECT * FROM invoices WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM trips WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM invoice_items WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM truck_payments WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM trucks WHERE company_id=?`,companyId)
  ]);
  const statements=[];
  const recovered=recoverLegacyInvoiceLinesV665(companyId,invoices,items,trips,trucks);
  for(const row of recovered.trucks)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO trucks(id,company_id,truck_no,owner_name,owner_mobile,bank_details,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(row.id,companyId,row.truck_no,row.owner_name,row.owner_mobile,row.bank_details,row.created_at,row.updated_at));
  for(const row of recovered.trips)statements.push(env.DB.prepare(`INSERT INTO trips(id,company_id,trip_no,invoice_id,invoice_item_id,trip_date,party_name,truck_no,driver_name,driver_mobile,material,loading_point,unloading_point,lr_number,loading_weight,unloading_weight,shortage,billing_weight,supplier_name,weight,rate,status,notes,pod_file_name,pod_data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.id,companyId,row.trip_no,row.invoice_id,row.invoice_item_id,row.trip_date,row.party_name,row.truck_no,row.driver_name,row.driver_mobile,row.material,row.loading_point,row.unloading_point,row.lr_number,row.loading_weight,row.unloading_weight,row.shortage,row.billing_weight,row.supplier_name,row.weight,row.rate,row.status,row.notes,row.pod_file_name,row.pod_data,row.created_at,row.updated_at));
  for(const row of recovered.items)statements.push(env.DB.prepare(`INSERT INTO invoice_items(id,company_id,invoice_id,trip_id,lr_number,truck_no,description,loading_weight,unloading_weight,shortage,weight,rate,amount,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.id,companyId,row.invoice_id,row.trip_id,row.lr_number,row.truck_no,row.description,row.loading_weight,row.unloading_weight,row.shortage,row.weight,row.rate,row.amount,row.created_at));
  const tripById=new Map(trips.map(x=>[String(x.id),x]));
  const linkedByTrip=new Map();
  let linked=0,removedDuplicates=0,clearedOrphans=0,fixedInvoiceLinks=0;

  for(const item of items){
    const trip=tripById.get(String(item.trip_id||''));
    if(!trip)continue;
    if(String(trip.invoice_id||'')!==String(item.invoice_id)||String(trip.invoice_item_id||'')!==String(item.id)){
      statements.push(env.DB.prepare(`UPDATE trips SET invoice_id=?,invoice_item_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(item.invoice_id,item.id,trip.id,companyId));
      trip.invoice_id=item.invoice_id;trip.invoice_item_id=item.id;fixedInvoiceLinks++;
    }
  }

  for(const entry of entries){
    if(entry.trip_id&&tripById.has(String(entry.trip_id))){
      const list=linkedByTrip.get(String(entry.trip_id))||[];list.push(entry);linkedByTrip.set(String(entry.trip_id),list);
    }
  }
  for(const [tripId,list] of linkedByTrip){
    if(list.length<=1)continue;
    list.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
    const keep=list[0];
    for(const extra of list.slice(1)){
      if(sameTruckEntryBusinessV665(keep,extra)){
        statements.push(env.DB.prepare(`DELETE FROM truck_payments WHERE id=? AND company_id=?`).bind(extra.id,companyId));removedDuplicates++;
      }else{
        statements.push(env.DB.prepare(`UPDATE truck_payments SET trip_id='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(extra.id,companyId));clearedOrphans++;
      }
    }
    linkedByTrip.set(tripId,[keep]);
  }

  const unlinked=entries.filter(entry=>!entry.trip_id||!tripById.has(String(entry.trip_id)));
  for(const entry of unlinked){
    const matches=trips.map(trip=>({trip,score:truckEntryTripScoreV665(entry,trip)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
    if(!matches.length){
      if(entry.trip_id){statements.push(env.DB.prepare(`UPDATE truck_payments SET trip_id='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(entry.id,companyId));clearedOrphans++}
      continue;
    }
    if(matches.length>1&&matches[0].score===matches[1].score)continue;
    const trip=matches[0].trip,existing=(linkedByTrip.get(String(trip.id))||[])[0];
    if(existing){
      if(sameTruckEntryBusinessV665(existing,entry)){
        statements.push(env.DB.prepare(`DELETE FROM truck_payments WHERE id=? AND company_id=?`).bind(entry.id,companyId));removedDuplicates++;
      }else if(entry.trip_id){
        statements.push(env.DB.prepare(`UPDATE truck_payments SET trip_id='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(entry.id,companyId));clearedOrphans++;
      }
    }else{
      statements.push(env.DB.prepare(`UPDATE truck_payments SET trip_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(trip.id,entry.id,companyId));
      entry.trip_id=trip.id;linkedByTrip.set(String(trip.id),[entry]);linked++;
    }
  }
  if(statements.length)await env.DB.batch(statements);
  await safe(env,`CREATE UNIQUE INDEX IF NOT EXISTS idx_truck_payment_trip_v665 ON truck_payments(company_id,trip_id) WHERE COALESCE(TRIM(trip_id),'')<>''`);
  repairedAccountingCompaniesV665.add(companyId);
  return {linked,removedDuplicates,clearedOrphans,fixedInvoiceLinks,recoveredInvoiceLines:recovered.items.length,recoveredTrucks:recovered.trucks.length};
}
async function findTruckEntryForTripV665(env,companyId,tripId,draft){
  const direct=await first(env,`SELECT * FROM truck_payments WHERE company_id=? AND trip_id=? ORDER BY updated_at DESC,created_at DESC LIMIT 1`,companyId,tripId);
  if(direct)return direct;
  const candidates=await all(env,`SELECT * FROM truck_payments WHERE company_id=? AND truck_no=? AND (COALESCE(TRIM(trip_id),'')='' OR trip_id NOT IN (SELECT id FROM trips WHERE company_id=?))`,companyId,upper(draft.truck_no),companyId);
  const matches=candidates.map(entry=>({entry,score:truckEntryTripScoreV665(entry,draft)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
  if(!matches.length||(matches.length>1&&matches[0].score===matches[1].score))return null;
  const entry=matches[0].entry;
  await run(env,`UPDATE truck_payments SET trip_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,tripId,entry.id,companyId);
  return {...entry,trip_id:tripId};
}

function partyPaymentAllocationV58(invoices=[],invoiceItems=[],payments=[],storedAllocations=[]){
  const sortedInvoices=[...invoices].sort((a,b)=>
    String(a.invoice_date||'').localeCompare(String(b.invoice_date||'')) ||
    String(a.created_at||'').localeCompare(String(b.created_at||'')) ||
    String(a.invoice_no||'').localeCompare(String(b.invoice_no||''),undefined,{numeric:true})
  );
  const invoiceById=Object.fromEntries(sortedInvoices.map(i=>[String(i.id),i]));
  const tripToInvoice={};
  for(const item of invoiceItems){
    if(item.trip_id&&item.invoice_id)tripToInvoice[String(item.trip_id)]=String(item.invoice_id);
  }
  const allocated={};
  const paymentAllocations={};
  const creditsByParty={};
  for(const inv of sortedInvoices)allocated[String(inv.id)]=0;

  const savedByPayment={};
  for(const row of storedAllocations||[])(savedByPayment[String(row.payment_id)]??=[]).push(row);
  for(const rows of Object.values(savedByPayment))rows.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.invoice_id||'').localeCompare(String(b.invoice_id||'')));

  const payRows=[...payments].sort((a,b)=>
    String(a.payment_date||'').localeCompare(String(b.payment_date||'')) ||
    String(a.created_at||'').localeCompare(String(b.created_at||'')) ||
    String(a.id||'').localeCompare(String(b.id||''))
  );

  // Previously allocated legacy receipts stay locked to the same invoice(s).
  // New explicit invoice/trip links are applied next; only the remainder uses FIFO.
  const unlinked=[];
  for(const p of payRows){
    const amount=Math.max(0,num(p.amount));
    let left=amount;
    const party=accountKey(p.party_name||'');
    const pieces=[];
    for(const saved of savedByPayment[String(p.id)]||[]){
      if(left<=0)break;
      const inv=invoiceById[String(saved.invoice_id||'')];
      if(!inv||accountKey(inv.party_name)!==party)continue;
      const invId=String(inv.id),remaining=Math.max(0,num(inv.total)-num(allocated[invId]));
      const applied=round2(Math.min(left,remaining,Math.max(0,num(saved.amount))));
      if(applied>0){
        allocated[invId]=round2(num(allocated[invId])+applied);
        pieces.push({invoice_id:invId,amount:applied,mode:saved.allocation_mode||'FIFO_LOCKED'});
        left=round2(left-applied);
      }
    }
    const explicitId=clean(p.invoice_id)||tripToInvoice[String(p.trip_id||'')]||'';
    const inv=invoiceById[String(explicitId||'')];
    if(left>0&&inv&&accountKey(inv.party_name)===party){
      const invId=String(inv.id),remaining=Math.max(0,num(inv.total)-num(allocated[invId]));
      const applied=round2(Math.min(left,remaining));
      if(applied>0){allocated[invId]=round2(num(allocated[invId])+applied);pieces.push({invoice_id:invId,amount:applied,mode:'EXPLICIT'});left=round2(left-applied)}
    }
    if(left>0)unlinked.push({payment:p,left,party,pieces,amount});
    else paymentAllocations[String(p.id)]={payment_id:p.id,amount,allocated:amount,unallocated:0,pieces};
  }

  // Legacy/unlinked payments are allocated FIFO ONCE across that party's invoices.
  for(const entry of unlinked){
    const p=entry.payment,party=entry.party;
    let left=entry.left;
    const pieces=entry.pieces;
    const partyInvoices=sortedInvoices.filter(i=>accountKey(i.party_name)===party);
    const dated=partyInvoices.filter(i=>!p.payment_date||!i.invoice_date||String(i.invoice_date)<=String(p.payment_date));
    const future=partyInvoices.filter(i=>!dated.includes(i));
    for(const inv of [...dated,...future]){
      if(left<=0)break;
      const invId=String(inv.id);
      const remaining=Math.max(0,num(inv.total)-num(allocated[invId]));
      if(remaining<=0)continue;
      const applied=round2(Math.min(left,remaining));
      allocated[invId]=round2(num(allocated[invId])+applied);
      pieces.push({invoice_id:invId,amount:applied,mode:'FIFO'});
      left=round2(left-applied);
    }
    if(left>0)creditsByParty[party]=round2(num(creditsByParty[party])+left);
    paymentAllocations[String(p.id)]={payment_id:p.id,amount:entry.amount,allocated:round2(entry.amount-left),unallocated:left,pieces};
  }

  const invoiceAllocations={};
  for(const inv of sortedInvoices){
    const received=round2(num(allocated[String(inv.id)]));
    const rawPending=round2(Math.max(0,num(inv.total)-received));
    const roundOff=rawPending>0&&rawPending<=ACCOUNTING_SETTLEMENT_TOLERANCE_V665?rawPending:0;
    invoiceAllocations[String(inv.id)]={
      invoice_id:inv.id,
      invoice_no:inv.invoice_no,
      party_name:inv.party_name,
      total:round2(inv.total),
      received,
      raw_pending:rawPending,
      round_off:roundOff,
      pending:round2(rawPending-roundOff),
      overpaid:round2(Math.max(0,received-num(inv.total)))
    };
  }
  return {invoiceAllocations,paymentAllocations,creditsByParty};
}

function allocationRowsV665(allocation,companyId){
  const rows=[];
  for(const pay of Object.values(allocation.paymentAllocations||{})){
    const byInvoice={};
    for(const piece of pay.pieces||[]){
      const invoiceId=String(piece.invoice_id||'');if(!invoiceId||num(piece.amount)<=0)continue;
      const key=`${pay.payment_id}::${invoiceId}`;
      byInvoice[key]??={id:key,company_id:companyId,payment_id:String(pay.payment_id),invoice_id:invoiceId,amount:0,allocation_mode:piece.mode==='EXPLICIT'?'EXPLICIT':'FIFO_LOCKED'};
      byInvoice[key].amount=round2(byInvoice[key].amount+num(piece.amount));
      if(piece.mode==='EXPLICIT')byInvoice[key].allocation_mode='EXPLICIT';
    }
    rows.push(...Object.values(byInvoice));
  }
  return rows.sort((a,b)=>String(a.payment_id).localeCompare(String(b.payment_id))||String(a.invoice_id).localeCompare(String(b.invoice_id)));
}
async function partyPaymentAllocationV665(env,companyId,invoices,invoiceItems,payments,{persist=true}={}){
  await ensureAccountingSchemaV665(env);
  const stored=await all(env,`SELECT * FROM party_payment_allocations WHERE company_id=? ORDER BY payment_id,invoice_id`,companyId);
  const allocation=partyPaymentAllocationV58(invoices,invoiceItems,payments,stored);
  if(persist){
    const desired=allocationRowsV665(allocation,companyId);
    const sig=rows=>JSON.stringify(rows.map(x=>[String(x.payment_id),String(x.invoice_id),round2(x.amount),String(x.allocation_mode||'')]));
    if(sig(stored)!==sig(desired)){
      const statements=[env.DB.prepare(`DELETE FROM party_payment_allocations WHERE company_id=?`).bind(companyId)];
      for(const row of desired)statements.push(env.DB.prepare(`INSERT INTO party_payment_allocations(id,company_id,payment_id,invoice_id,amount,allocation_mode) VALUES(?,?,?,?,?,?)`).bind(row.id,companyId,row.payment_id,row.invoice_id,row.amount,row.allocation_mode));
      await env.DB.batch(statements);
    }
  }
  return allocation;
}

async function accountingAuditV58(env,user){
  const companyId=companyIdOf(user);
  await ensureAccountingSchemaV665(env);
  await repairAccountingLinksV665(env,companyId);
  const [parties,invoices,items,payments,trips,trucks,truckEntries,supplierPayments,supplierAccounts,pmBills,expenses]=await Promise.all([
    all(env,`SELECT * FROM party_accounts WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM invoices WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM invoice_items WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM party_payments WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM trips WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM trucks WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM truck_payments WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM supplier_payments WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM supplier_accounts WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM pm_bills WHERE company_id=?`,companyId),
    all(env,`SELECT * FROM expenses WHERE company_id=?`,companyId)
  ]);
  const alloc=await partyPaymentAllocationV665(env,companyId,invoices,items,payments);
  const issues=[];
  const partyNames=new Set(parties.map(x=>accountKey(x.party_name)));
  const invoiceById=Object.fromEntries(invoices.map(x=>[String(x.id),x]));
  const tripById=Object.fromEntries(trips.map(x=>[String(x.id),x]));
  const supplierNames=new Set(supplierAccounts.map(x=>accountKey(x.owner_name)));
  const truckByNo=Object.fromEntries(trucks.map(x=>[accountKey(x.truck_no),x]));

  for(const p of payments){
    if(!partyNames.has(accountKey(p.party_name)))issues.push({severity:'warning',type:'PAYMENT_PARTY_MISSING',text:`${p.receipt_no||p.id}: party ${p.party_name} is missing from Party Master.`});
    if(p.invoice_id){
      const inv=invoiceById[String(p.invoice_id)];
      if(!inv)issues.push({severity:'error',type:'PAYMENT_INVOICE_MISSING',text:`${p.receipt_no||p.id}: linked invoice was not found.`});
      else if(accountKey(inv.party_name)!==accountKey(p.party_name))issues.push({severity:'error',type:'PAYMENT_PARTY_INVOICE_MISMATCH',text:`${p.receipt_no||p.id}: payment party and invoice party do not match.`});
    }
    if(p.trip_id){
      const trip=tripById[String(p.trip_id)];
      if(!trip)issues.push({severity:'warning',type:'PAYMENT_TRIP_MISSING',text:`${p.receipt_no||p.id}: linked trip was not found.`});
      else if(accountKey(trip.party_name)!==accountKey(p.party_name))issues.push({severity:'error',type:'PAYMENT_PARTY_TRIP_MISMATCH',text:`${p.receipt_no||p.id}: payment party and trip party do not match.`});
    }
  }

  for(const inv of invoices){
    const a=alloc.invoiceAllocations[String(inv.id)];
    if(a&&a.overpaid>.01)issues.push({severity:'error',type:'INVOICE_OVERPAYMENT',text:`${inv.invoice_no}: allocated receipt exceeds bill by ${a.overpaid.toFixed(2)}.`});
    const invoiceItems=items.filter(x=>String(x.invoice_id)===String(inv.id));
    if(!invoiceItems.length)issues.push({severity:'warning',type:'INVOICE_WITHOUT_TRUCK',text:`${inv.invoice_no}: invoice has no truck line.`});
  }
  for(const item of items){
    if(!invoiceById[String(item.invoice_id)])issues.push({severity:'error',type:'ORPHAN_INVOICE_ITEM',text:`Invoice item ${item.id} has no parent invoice.`});
    if(item.trip_id&&!tripById[String(item.trip_id)])issues.push({severity:'warning',type:'INVOICE_ITEM_TRIP_MISSING',text:`Invoice item ${item.id} points to missing trip.`});
  }
  for(const t of trips){
    if(t.truck_no&&!truckByNo[accountKey(t.truck_no)])issues.push({severity:'warning',type:'MISSING_TRUCK_MASTER',text:`${t.trip_no||t.id}: ${t.truck_no} missing from Truck Master.`});
    if(t.supplier_name&&!supplierNames.has(accountKey(t.supplier_name)))issues.push({severity:'warning',type:'MISSING_SUPPLIER_MASTER',text:`${t.trip_no||t.id}: ${t.supplier_name} missing from Supplier Master.`});
  }
  for(const entry of truckEntries)if(entry.trip_id&&!tripById[String(entry.trip_id)])issues.push({severity:'warning',type:'TRUCK_ENTRY_TRIP_MISSING',text:`${entry.id}: linked trip ${entry.trip_id} was not found.`});
  for(const p of supplierPayments){
    if(p.owner_name&&!supplierNames.has(accountKey(p.owner_name)))issues.push({severity:'warning',type:'SUPPLIER_PAYMENT_MASTER_MISSING',text:`${p.receipt_no||p.id}: ${p.owner_name} missing from Supplier Master.`});
    if(p.truck_no){
      const truck=truckByNo[accountKey(p.truck_no)];
      if(truck&&accountKey(truck.owner_name)!==accountKey(p.owner_name))issues.push({severity:'warning',type:'SUPPLIER_TRUCK_OWNER_MISMATCH',text:`${p.receipt_no||p.id}: ${p.truck_no} belongs to ${truck.owner_name}, not ${p.owner_name}.`});
    }
  }

  const unallocatedCredit=round2(Object.values(alloc.creditsByParty).reduce((a,x)=>a+num(x),0));
  const totalBilling=round2(invoices.reduce((a,x)=>a+num(x.total),0));
  const partyReceived=round2(payments.reduce((a,x)=>a+num(x.amount),0));
  const invoicePending=round2(Object.values(alloc.invoiceAllocations).reduce((a,x)=>a+num(x.pending),0));
  const supplierPayable=round2(truckEntries.reduce((a,x)=>a+num(x.payable),0)+pmBills.reduce((a,x)=>a+num(x.supplier_total),0));
  const supplierPaid=round2(supplierPayments.reduce((a,x)=>a+num(x.amount),0));
  const expensesTotal=round2(expenses.reduce((a,x)=>a+num(x.amount),0));

  // Cross-company link audit: current-company child must never point at another-company parent.
  const cross=[
    ['Invoice Item → Invoice',`SELECT COUNT(*) count FROM invoice_items c JOIN invoices p ON p.id=c.invoice_id WHERE c.company_id=? AND p.company_id<>c.company_id`],
    ['Trip → Invoice',`SELECT COUNT(*) count FROM trips c JOIN invoices p ON p.id=c.invoice_id WHERE c.company_id=? AND COALESCE(c.invoice_id,'')<>'' AND p.company_id<>c.company_id`],
    ['Party Payment → Invoice',`SELECT COUNT(*) count FROM party_payments c JOIN invoices p ON p.id=c.invoice_id WHERE c.company_id=? AND COALESCE(c.invoice_id,'')<>'' AND p.company_id<>c.company_id`],
    ['Truck Entry → Trip',`SELECT COUNT(*) count FROM truck_payments c JOIN trips p ON p.id=c.trip_id WHERE c.company_id=? AND COALESCE(c.trip_id,'')<>'' AND p.company_id<>c.company_id`],
    ['Supplier Payment → Trip',`SELECT COUNT(*) count FROM supplier_payments c JOIN trips p ON p.id=c.trip_id WHERE c.company_id=? AND COALESCE(c.trip_id,'')<>'' AND p.company_id<>c.company_id`]
  ];
  let crossCompanyLinks=0;
  for(const [label,sql] of cross){
    const count=num((await first(env,sql,companyId))?.count);
    crossCompanyLinks+=count;
    if(count)issues.push({severity:'error',type:'CROSS_COMPANY_LINK',text:`${label}: ${count} cross-company link(s) detected.`});
  }

  return {
    ok:issues.filter(x=>x.severity==='error').length===0,
    companyId,
    checkedAt:new Date().toISOString(),
    issues,
    counts:{
      parties:parties.length,invoices:invoices.length,partyPayments:payments.length,trips:trips.length,
      trucks:trucks.length,suppliers:supplierAccounts.length,supplierPayments:supplierPayments.length
    },
    totals:{
      billing:totalBilling,partyReceived,partyOutstanding:round2(invoicePending-unallocatedCredit),
      unallocatedPartyCredit:unallocatedCredit,
      supplierPayable,supplierPaid,supplierPending:round2(supplierPayable-supplierPaid),
      expenses:expensesTotal
    },
    crossCompanyLinks
  };
}


async function currentPartyLedgerMax(env,companyId=DEFAULT_COMPANY_ID){
  const rows=await all(env,`SELECT ledger_no FROM party_accounts WHERE company_id=? AND COALESCE(TRIM(ledger_no),'')<>''`,companyId);
  let max=0;for(const row of rows){const m=String(row.ledger_no||'').match(/MLP\s*0*(\d+)/i);if(m)max=Math.max(max,Number(m[1]))}
  return max;
}
async function reservePartyLedgerNumber(env,companyId=DEFAULT_COMPANY_ID){
  let next=(await currentPartyLedgerMax(env,companyId))+1;
  for(let attempt=0;attempt<1000;attempt++,next++){
    const ledgerNo=`MLP ${String(next).padStart(3,'0')}`;
    if(!await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND ledger_no=? LIMIT 1`,companyId,ledgerNo))return ledgerNo;
  }
  throw new Error('Unable to allocate Party ledger number');
}
async function ensurePartyLedgerForId(env,id,companyId=DEFAULT_COMPANY_ID){
  const row=await first(env,`SELECT id,ledger_no FROM party_accounts WHERE id=? AND company_id=? LIMIT 1`,id,companyId);
  if(!row)return '';if(String(row.ledger_no||'').trim())return String(row.ledger_no).trim();
  for(let attempt=0;attempt<1000;attempt++){
    const ledgerNo=await reservePartyLedgerNumber(env,companyId);
    try{
      await run(env,`UPDATE party_accounts SET ledger_no=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND COALESCE(TRIM(ledger_no),'')=''`,ledgerNo,id,companyId);
      const saved=await first(env,`SELECT ledger_no FROM party_accounts WHERE id=? AND company_id=? LIMIT 1`,id,companyId);
      if(saved?.ledger_no)return saved.ledger_no;
    }catch(error){if(!/UNIQUE|constraint/i.test(String(error?.message||error)))throw error}
  }
  throw new Error('Unable to save Party ledger number');
}
async function ensureAllPartyLedgerNumbers(env,companyId=DEFAULT_COMPANY_ID){
  const rows=await all(env,`SELECT id FROM party_accounts WHERE company_id=? AND (ledger_no IS NULL OR TRIM(ledger_no)='') ORDER BY party_name,id`,companyId);
  for(const row of rows)await ensurePartyLedgerForId(env,row.id,companyId);
}
async function normalizeRequestedPartyLedger(env,value,excludeId='',companyId=DEFAULT_COMPANY_ID){
  const requested=upper(value);if(!requested)return reservePartyLedgerNumber(env,companyId);
  const exists=excludeId
    ? await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND ledger_no=? AND id<>? LIMIT 1`,companyId,requested,excludeId)
    : await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND ledger_no=? LIMIT 1`,companyId,requested);
  if(exists)throw new Error(`Party ledger number ${requested} already exists`);
  return requested;
}
async function ensureSupplierAccountForName(env,value,companyId=DEFAULT_COMPANY_ID){
  const name=upper(value);if(!name)return '';
  const existing=(await all(env,`SELECT ledger_no,owner_name FROM supplier_accounts WHERE company_id=?`,companyId)).find(row=>accountKey(row.owner_name)===accountKey(name));
  if(existing?.ledger_no)return existing.ledger_no;
  const rows=await all(env,`SELECT ledger_no FROM supplier_accounts WHERE company_id=?`,companyId);
  let next=rows.reduce((max,row)=>Math.max(max,Number(String(row.ledger_no||'').replace(/\D/g,''))||0),0)+1;
  for(let attempt=0;attempt<1000;attempt++,next++){
    const ledgerNo=`PML ${String(next).padStart(3,'0')}`;
    try{
      await run(env,`INSERT INTO supplier_accounts(id,company_id,ledger_no,owner_name) VALUES(?,?,?,?)`,uid('SUP'),companyId,ledgerNo,name);
      return ledgerNo;
    }catch(error){
      const now=await first(env,`SELECT ledger_no FROM supplier_accounts WHERE company_id=? AND owner_name=? LIMIT 1`,companyId,name);
      if(now?.ledger_no)return now.ledger_no;
      if(!/UNIQUE|constraint/i.test(String(error?.message||error)))throw error;
    }
  }
  throw new Error('Unable to allocate supplier ledger number');
}
async function recalcInvoiceById(env,invoiceId,companyId=DEFAULT_COMPANY_ID){
  const inv=await first(env,`SELECT * FROM invoices WHERE id=? AND company_id=?`,invoiceId,companyId);if(!inv)return;
  const items=await all(env,`SELECT * FROM invoice_items WHERE invoice_id=? AND company_id=?`,invoiceId,companyId);
  const freight=round2(items.reduce((a,x)=>a+num(x.amount),0));
  const subtotal=round2(freight+num(inv.diesel)+num(inv.munshi));
  const nonGst=(inv.invoice_type||'GST')==='NON_GST';
  const gstAmount=nonGst?0:round2(subtotal*(num(inv.sgst)+num(inv.cgst))/100);
  await run(env,`UPDATE invoices SET subtotal=?,gst_amount=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,subtotal,gstAmount,round2(subtotal+gstAmount),invoiceId,companyId);
}
async function ensureSupplierAccounts(env,companyId=DEFAULT_COMPANY_ID){
  const names=await all(env,`
    SELECT DISTINCT owner_name FROM trucks WHERE company_id=? AND COALESCE(TRIM(owner_name),'')<>''
    UNION SELECT DISTINCT owner_name FROM truck_payments WHERE company_id=? AND COALESCE(TRIM(owner_name),'')<>''
    UNION SELECT DISTINCT owner_name FROM supplier_payments WHERE company_id=? AND COALESCE(TRIM(owner_name),'')<>''
    ORDER BY owner_name`,companyId,companyId,companyId);
  for(const row of names)await ensureSupplierAccountForName(env,row.owner_name,companyId);
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
        const tripNo=await reserveNextTripNumber(env,DEFAULT_COMPANY_ID);
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
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    try{
      const ready=await first(env,`SELECT value FROM app_meta WHERE key='schema_version'`);
      if(ready?.value==='53'){await ensurePlatformV60(env);return true;}
    }catch(_){}

    try{
      const existing=await all(env,`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','trips','invoices','app_meta')`);
      const names=new Set(existing.map(x=>x.name));
      if(names.has('users')&&names.has('sessions')&&names.has('trips')&&names.has('invoices')&&names.has('app_meta')){
        await ensureSaasFoundation(env);
        await healTenantColumns(env);
        await run(env,`INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('schema_version','53',CURRENT_TIMESTAMP)`);
        await ensurePlatformV60(env);
        return true;
      }
    }catch(error){
      initPromise=null;
      throw error;
    }

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
    await ensureSaasFoundation(env);
    await healTenantColumns(env);
    await ensureSupplierAccounts(env,DEFAULT_COMPANY_ID);
    await repairTripSeriesAndInvoiceLinks(env);
    await safe(env,`DROP INDEX IF EXISTS idx_trip_no`);
    await run(env,`CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_company_no
      ON trips(company_id,trip_no)
      WHERE trip_no IS NOT NULL AND TRIM(trip_no)<>''`);
    await run(env, `INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('schema_version','53',CURRENT_TIMESTAMP)`);
  })().catch(e=>{ initPromise=null; throw e; });
  return initPromise;
}

async function auth(req,env){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) return null;
  const user=await first(env, `SELECT u.id,u.username,u.role,u.company_id,u.full_name,u.email,u.mobile
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id
    WHERE s.token=? AND s.expires_at>datetime('now') AND u.active=1 AND c.status='ACTIVE'`, token);
  if(user)user.permissions=permissionsForRole(user.role);
  return user;
}
async function requestBody(req){
  const type=req.headers.get('content-type')||'';
  if(type.includes('application/json')) return req.json().catch(()=>({}));
  return {};
}
async function audit(env,user,action,entity,id,payload={}){
  await run(env,`INSERT INTO audit_logs(id,company_id,user_id,action,entity,entity_id,payload) VALUES(?,?,?,?,?,?,?)`,
    uid('AUD'),companyIdOf(user),user?.id||null,action,entity,id,JSON.stringify(payload));
}
async function upsertMasters(env,b,companyId=DEFAULT_COMPANY_ID){
  if(b.partyName){
    const name=upper(b.partyName);
    await run(env,`INSERT OR IGNORE INTO party_accounts(id,company_id,ledger_no,party_name) VALUES(?,?,?,?)`,uid('PA'),companyId,null,name);
    const party=await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND party_name=? LIMIT 1`,companyId,name);
    if(party?.id)await ensurePartyLedgerForId(env,party.id,companyId);
  }
  if(b.truckNo){
    await run(env,`INSERT OR IGNORE INTO trucks(id,company_id,truck_no,owner_name) VALUES(?,?,?,?)`,uid('TRK'),companyId,upper(b.truckNo),upper(b.ownerName||''));
  }
  if(b.material){
    await run(env,`INSERT OR IGNORE INTO materials(id,company_id,material_name) VALUES(?,?,?)`,uid('MAT'),companyId,upper(b.material));
  }
  if(b.loadingPoint&&b.unloadingPoint){
    const lp=upper(b.loadingPoint),up=upper(b.unloadingPoint);
    const exists=await first(env,`SELECT id FROM routes WHERE company_id=? AND loading_point=? AND unloading_point=?`,companyId,lp,up);
    if(!exists)await run(env,`INSERT INTO routes(id,company_id,loading_point,unloading_point) VALUES(?,?,?,?)`,uid('RTE'),companyId,lp,up);
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
  const companyId=companyIdOf(user);
  await ensureAccountingSchemaV665(env);
  await repairAccountingLinksV665(env,companyId);
  await ensureAllPartyLedgerNumbers(env,companyId);
  const [
    parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    pmBills,pmBillItems,truckEntries,supplierPayments,supplierAccounts,expenses,documents,audits
  ]=await Promise.all([
    all(env,`SELECT * FROM party_accounts WHERE company_id=? ORDER BY COALESCE(ledger_no,''),party_name`,companyId),
    all(env,`SELECT * FROM party_payments WHERE company_id=? ORDER BY payment_date DESC,created_at DESC`,companyId),
    all(env,`SELECT * FROM trucks WHERE company_id=? ORDER BY truck_no`,companyId),
    all(env,`SELECT * FROM routes WHERE company_id=? ORDER BY loading_point,unloading_point`,companyId),
    all(env,`SELECT * FROM materials WHERE company_id=? ORDER BY material_name`,companyId),
    all(env,`SELECT * FROM trips WHERE company_id=? ORDER BY CAST(REPLACE(trip_no,'TR ','') AS INTEGER) DESC,trip_date DESC`,companyId),
    all(env,`SELECT * FROM invoices WHERE company_id=? ORDER BY invoice_date DESC,created_at DESC`,companyId),
    all(env,`SELECT * FROM invoice_items WHERE company_id=? ORDER BY invoice_id,created_at`,companyId),
    all(env,`SELECT * FROM pm_bills WHERE company_id=? ORDER BY bill_date DESC,created_at DESC`,companyId),
    all(env,`SELECT * FROM pm_bill_items WHERE company_id=? ORDER BY bill_id,created_at`,companyId),
    all(env,`SELECT * FROM truck_payments WHERE company_id=? ORDER BY entry_date DESC,created_at DESC`,companyId),
    all(env,`SELECT * FROM supplier_payments WHERE company_id=? ORDER BY payment_date DESC,created_at DESC`,companyId),
    all(env,`SELECT * FROM supplier_accounts WHERE company_id=? ORDER BY CAST(REPLACE(ledger_no,'PML ','') AS INTEGER)`,companyId),
    all(env,`SELECT * FROM expenses WHERE company_id=? ORDER BY expense_date DESC,created_at DESC`,companyId),
    all(env,`SELECT id,company_id,truck_no,kind,file_name,file_type,expiry_date,notes,created_at FROM truck_documents WHERE company_id=? ORDER BY created_at DESC`,companyId),
    all(env,`SELECT * FROM audit_logs WHERE company_id=? ORDER BY created_at DESC LIMIT 150`,companyId)
  ]);

  const itemsByInvoice={};
  for(const it of invoiceItems)(itemsByInvoice[it.invoice_id]??=[]).push(it);
  for(const inv of invoices)inv.items=itemsByInvoice[inv.id]||[];
  const partyAllocation=await partyPaymentAllocationV665(env,companyId,invoices,invoiceItems,partyPayments);
  for(const inv of invoices){
    const a=partyAllocation.invoiceAllocations[String(inv.id)]||{};
    inv.received_amount=round2(a.received||0);
    inv.pending_amount=round2(a.pending??num(inv.total));
  }
  for(const pay of partyPayments){
    const a=partyAllocation.paymentAllocations[String(pay.id)]||{};
    pay.allocated_amount=round2(a.allocated||0);
    pay.unallocated_amount=round2(a.unallocated||0);
    pay.allocations=a.pieces||[];
  }
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
  for(const p of parties){const key=accountKey(p.party_name);partyMap[key]={...p,billed:0,received:0,roundOff:0,invoices:0,payments:0}}
  for(const inv of invoices){
    const key=accountKey(inv.party_name),allocation=partyAllocation.invoiceAllocations[String(inv.id)]||{};
    partyMap[key]??={party_name:inv.party_name,ledger_no:'',billed:0,received:0,roundOff:0,invoices:0,payments:0};
    partyMap[key].billed+=num(inv.total);partyMap[key].roundOff+=num(allocation.round_off);partyMap[key].invoices++;
  }
  for(const pay of partyPayments){
    const key=accountKey(pay.party_name);
    partyMap[key]??={party_name:pay.party_name,ledger_no:'',billed:0,received:0,roundOff:0,invoices:0,payments:0};
    partyMap[key].received+=num(pay.amount);partyMap[key].payments++;
  }
  const partyLedger=Object.values(partyMap).map(x=>{
    const credit=round2(partyAllocation.creditsByParty[accountKey(x.party_name)]||0);
    return {...x,billed:round2(x.billed),received:round2(x.received),roundOff:round2(x.roundOff),credit,outstanding:settledBalanceV665(x.billed-x.received-x.roundOff)};
  }).sort((a,b)=>b.outstanding-a.outstanding);

  const supplierMap={};
  for(const account of supplierAccounts){
    const n=upper(account.owner_name||''),key=accountKey(n);if(!key)continue;
    supplierMap[key]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
  }
  for(const trip of trips){
    const n=upper(trip.supplier_name||''),key=accountKey(n);
    if(!key)continue;
    supplierMap[key]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    if(trip.truck_no)supplierMap[key].trucks.add(trip.truck_no);
  }
  for(const e of truckEntries){
    const n=upper(e.owner_name||'UNKNOWN'),key=accountKey(n);
    supplierMap[key]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    supplierMap[key].payable+=num(e.payable);supplierMap[key].entries++;supplierMap[key].trucks.add(e.truck_no);
  }
  for(const p of supplierPayments){
    const n=upper(p.owner_name||'UNKNOWN'),key=accountKey(n);
    supplierMap[key]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    supplierMap[key].paid+=num(p.amount);supplierMap[key].payments++;if(p.truck_no)supplierMap[key].trucks.add(p.truck_no);
  }
  for(const b of pmBills){
    const n=upper(b.supplier_name||'UNKNOWN'),key=accountKey(n);
    supplierMap[key]??={owner_name:n,payable:0,paid:0,entries:0,payments:0,trucks:new Set(),pm_bills:0};
    supplierMap[key].payable+=num(b.supplier_total);
    supplierMap[key].pm_bills=(supplierMap[key].pm_bills||0)+1;
    for(const it of (b.items||[]))if(it.truck_no)supplierMap[key].trucks.add(it.truck_no);
  }
  const supplierAccountByName=Object.fromEntries(supplierAccounts.map(x=>[accountKey(x.owner_name),x]));
  const supplierLedger=Object.values(supplierMap).map(x=>({
    id:supplierAccountByName[accountKey(x.owner_name)]?.id||'',owner_name:x.owner_name,ledger_no:supplierAccountByName[accountKey(x.owner_name)]?.ledger_no||'',payable:round2(x.payable),paid:round2(x.paid),pending:settledBalanceV665(x.payable-x.paid),
    entries:x.entries||0,payments:x.payments||0,pm_bills:x.pm_bills||0,truck_count:x.trucks.size
  })).sort((a,b)=>b.pending-a.pending);

  const totalBilling=round2(invoices.reduce((a,x)=>a+num(x.total),0));
  const invoiceSubtotal=round2(invoices.reduce((a,x)=>a+num(x.subtotal),0));
  const partyReceived=round2(partyPayments.reduce((a,x)=>a+num(x.amount),0));
  const supplierPayable=round2(
    truckEntries.reduce((a,x)=>a+num(x.payable),0)+
    pmBills.reduce((a,x)=>a+num(x.supplier_total),0)
  );
  const supplierPaid=round2(supplierPayments.reduce((a,x)=>a+num(x.amount),0));
  const expenseTotal=round2(expenses.reduce((a,x)=>a+num(x.amount),0));
  const partyOutstanding=round2(partyLedger.reduce((a,x)=>a+num(x.outstanding),0));

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


  const accountingAudit={
    invoiceAllocationVersion:'V66.5-LOCKED',
    unallocatedPartyCredit:round2(Object.values(partyAllocation.creditsByParty).reduce((a,x)=>a+num(x),0)),
    exactLinkedPayments:partyPayments.filter(x=>clean(x.invoice_id)||clean(x.trip_id)).length,
    fifoLegacyPayments:partyPayments.filter(x=>!clean(x.invoice_id)&&!clean(x.trip_id)).length,
    invoicePending:round2(invoices.reduce((a,x)=>a+num(x.pending_amount),0)),
    settlementTolerance:ACCOUNTING_SETTLEMENT_TOLERANCE_V665
  };

  const saas=await subscriptionAccess(env,user);
  const platformAdmin=await isPlatformAdminV60(env,user);
  const company=saas.company||{};
  const gstPrefix=company.invoice_prefix||'ML';
  const nonGstPrefix=company.non_gst_prefix||'JAY';
  return {
    version:'V66.5-Accounting-Restore',
    user:{...user,permissions:permissionsForRole(user.role),platform_admin:platformAdmin},saas,parties,partyPayments,trucks,routes,materials,trips,invoices,invoiceItems,
    pmBills,pmBillItems,truckEntries,supplierPayments,supplierAccounts,expenses,documents,audits,partyLedger,supplierLedger,issues,accountingAudit,
    nextInvoiceNo:nextNumber(invoices.filter(x=>(x.invoice_type||'GST')==='GST').map(x=>x.invoice_no),`${gstPrefix} - `),
    nextNonGstInvoiceNo:nextNumber(invoices.filter(x=>(x.invoice_type||'GST')==='NON_GST').map(x=>x.invoice_no),`${nonGstPrefix} `),
    nextTripNo:await reserveNextTripNumber(env,companyId),
    nextPmBillNo:nextNumber(pmBills.map(x=>x.bill_no),'PM - '),
    summary:{
      totalBilling,invoiceSubtotal,partyReceived,partyOutstanding,
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
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',booking_no TEXT NOT NULL,booking_date TEXT NOT NULL,
        party_name TEXT NOT NULL,truck_no TEXT DEFAULT '',material TEXT DEFAULT '',
        loading_point TEXT DEFAULT '',unloading_point TEXT DEFAULT '',expected_date TEXT DEFAULT '',
        status TEXT DEFAULT 'DRAFT',approval_status TEXT DEFAULT 'NOT_REQUIRED',
        approved_by TEXT DEFAULT '',approved_at TEXT DEFAULT '',dispatch_date TEXT DEFAULT '',
        trip_id TEXT DEFAULT '',notes TEXT DEFAULT '',created_by TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,booking_no)
      )`,
      `CREATE TABLE IF NOT EXISTS approval_requests(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',requested_by TEXT DEFAULT '',approved_by TEXT DEFAULT '',
        notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS recycle_bin(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,label TEXT DEFAULT '',
        payload TEXT NOT NULL,deleted_by TEXT DEFAULT '',deleted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS backup_snapshots(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',backup_type TEXT DEFAULT 'SCHEDULED',period_key TEXT DEFAULT '',
        payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS monthly_exports(
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',month_key TEXT NOT NULL,summary TEXT DEFAULT '{}',
        payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,month_key)
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings(
        company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}',setting_key TEXT NOT NULL,setting_value TEXT NOT NULL,updated_by TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,setting_key)
      )`
    ];
    for(const sql of tables)await env.DB.prepare(sql).run();
    const indexes=[
      `CREATE INDEX IF NOT EXISTS idx_booking_date ON workflow_bookings(company_id,booking_date)`,
      `CREATE INDEX IF NOT EXISTS idx_booking_status ON workflow_bookings(company_id,status)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(company_id,status)`,
      `CREATE INDEX IF NOT EXISTS idx_recycle_deleted ON recycle_bin(company_id,deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_snapshots(company_id,created_at)`
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
async function readAppSettings(env,companyId=DEFAULT_COMPANY_ID){
  await ensureAdvancedTables(env);
  const row=await first(env,`SELECT setting_value FROM app_settings WHERE company_id=? AND setting_key='APP'`,companyId);
  const company=await first(env,`SELECT * FROM companies WHERE id=?`,companyId);
  const companyDefaults=company?{
    companyName:company.company_name||'',
    address:company.address||'',
    phone:company.mobile||'',
    email:company.email||'',
    gstNo:company.gst_no||'',
    pan:company.pan_no||'',
    authorizedPartner:''
  }:{};
  if(!row?.setting_value)return {...DEFAULT_APP_SETTINGS,...companyDefaults};
  try{return {...DEFAULT_APP_SETTINGS,...companyDefaults,...JSON.parse(row.setting_value)}}catch{return {...DEFAULT_APP_SETTINGS,...companyDefaults}}
}
async function writeAppSettings(env,user,input={}){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);
  const cleanSettings={...DEFAULT_APP_SETTINGS};
  for(const key of Object.keys(DEFAULT_APP_SETTINGS))if(input[key]!==undefined)cleanSettings[key]=input[key];
  cleanSettings.defaultSgst=num(cleanSettings.defaultSgst);
  cleanSettings.defaultCgst=num(cleanSettings.defaultCgst);
  cleanSettings.compactMode=String(cleanSettings.compactMode||'COMFORTABLE').toUpperCase()==='COMPACT'?'COMPACT':'COMFORTABLE';
  cleanSettings.showOnlineStatus=!!cleanSettings.showOnlineStatus;
  cleanSettings.automaticBackups=!!cleanSettings.automaticBackups;
  await run(env,`INSERT INTO app_settings(company_id,setting_key,setting_value,updated_by,updated_at)
    VALUES(?,'APP',?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
    companyId,JSON.stringify(cleanSettings),user?.username||'');
  await audit(env,user,'UPDATE','settings','APP',cleanSettings);
  return cleanSettings;
}

const ADVANCED_EXPORT_TABLES={
  Parties:{table:'party_accounts',columns:['id','ledger_no','party_name','address','gst_no','mobile','email','created_at','updated_at']},
  PartyPayments:{table:'party_payments',columns:['id','receipt_no','invoice_id','trip_id','party_name','payment_date','amount','payment_mode','reference','notes','created_at','updated_at']},
  PartyPaymentAllocations:{table:'party_payment_allocations',columns:['id','payment_id','invoice_id','amount','allocation_mode','created_at','updated_at']},
  Trucks:{table:'trucks',columns:['id','truck_no','owner_name','owner_mobile','bank_details','created_at','updated_at']},
  Routes:{table:'routes',columns:['id','loading_point','unloading_point','created_at','updated_at']},
  Materials:{table:'materials',columns:['id','material_name','created_at']},
  Trips:{table:'trips',columns:['id','trip_no','invoice_id','invoice_item_id','trip_date','party_name','truck_no','driver_name','driver_mobile','material','loading_point','unloading_point','lr_number','loading_weight','unloading_weight','shortage','billing_weight','supplier_name','weight','rate','status','notes','pod_file_name','pod_data','created_at','updated_at']},
  Invoices:{table:'invoices',columns:['id','invoice_no','invoice_type','invoice_date','party_name','party_address','party_gst','lr_no','material','loading_date','sgst','cgst','diesel','munshi','subtotal','gst_amount','total','comments','created_at','updated_at']},
  InvoiceItems:{table:'invoice_items',columns:['id','invoice_id','trip_id','lr_number','truck_no','description','loading_weight','unloading_weight','shortage','weight','rate','amount','created_at']},
  PMBills:{table:'pm_bills',columns:['id','bill_no','bill_date','party_name','party_address','supplier_name','notes','subtotal','supplier_total','profit','created_at','updated_at']},
  PMBillItems:{table:'pm_bill_items',columns:['id','bill_id','truck_no','loading_point','unloading_point','weight','party_rate','supplier_rate','party_amount','supplier_amount','created_at']},
  SupplierAccounts:{table:'supplier_accounts',columns:['id','ledger_no','owner_name','created_at','updated_at']},
  TruckEntries:{table:'truck_payments',columns:['id','trip_id','entry_date','truck_no','owner_name','bank_details','loading_point','unloading_point','weight','rate','commission','payable','notes','created_at','updated_at']},
  SupplierPayments:{table:'supplier_payments',columns:['id','receipt_no','trip_id','owner_name','truck_no','payment_date','amount','payment_mode','reference','notes','created_at','updated_at']},
  Expenses:{table:'expenses',columns:['id','trip_id','expense_date','category','amount','notes','created_at','updated_at']},
  Documents:{table:'truck_documents',columns:['id','truck_no','kind','file_name','file_type','expiry_date','notes','storage_key','storage_mode','file_size','created_at']},
  Bookings:{table:'workflow_bookings',columns:['id','booking_no','booking_date','party_name','truck_no','material','loading_point','unloading_point','expected_date','status','approval_status','approved_by','approved_at','dispatch_date','trip_id','notes','created_by','created_at','updated_at']},
  Settings:{table:'app_settings',columns:['setting_key','setting_value','updated_by','updated_at']}
};

async function advancedRows(env,config,companyId,where='',...args){
  const columns=config.columns.join(',');
  const suffix=where?` AND ${where.replace(/^\s*WHERE\s+/i,'')}`:'';
  return all(env,`SELECT ${columns} FROM ${config.table} WHERE company_id=?${suffix}`,companyId,...args);
}
async function advancedExportPayload(env,companyId=DEFAULT_COMPANY_ID){
  await ensureAdvancedTables(env);
  await ensureAccountingSchemaV665(env);
  await repairAccountingLinksV665(env,companyId);
  await ensureTripWeightColumns(env);
  const sheets={};
  for(const [name,config] of Object.entries(ADVANCED_EXPORT_TABLES)){
    try{sheets[name]=await advancedRows(env,config,companyId)}catch(_){sheets[name]=[]}
  }
  return {version:'V66.5',format:'MEERA_BACKUP_V2',companyId,exportedAt:new Date().toISOString(),capabilities:{atomicRestore:true,lockedPartyAllocations:true,documentMetadata:true,documentContentComplete:false},sheets};
}
async function createBackupSnapshot(env,type='SCHEDULED',periodKey='',companyId=DEFAULT_COMPANY_ID){
  const payload=await advancedExportPayload(env,companyId);
  const id=uid('BKP');
  await run(env,`INSERT INTO backup_snapshots(id,company_id,backup_type,period_key,payload) VALUES(?,?,?,?,?)`,id,companyId,type,periodKey,JSON.stringify(payload));
  await run(env,`DELETE FROM backup_snapshots WHERE company_id=? AND id NOT IN (SELECT id FROM backup_snapshots WHERE company_id=? ORDER BY created_at DESC LIMIT 30)`,companyId,companyId);
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
async function createMonthlyExport(env,monthKey,companyId=DEFAULT_COMPANY_ID){
  await ensureAdvancedTables(env);
  const range=monthRange(monthKey);if(!range)throw new Error('Invalid month');
  const payload=await advancedExportPayload(env,companyId);
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
  await run(env,`INSERT INTO monthly_exports(id,company_id,month_key,summary,payload,created_at) VALUES(COALESCE((SELECT id FROM monthly_exports WHERE company_id=? AND month_key=?),?),?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id,month_key) DO UPDATE SET summary=excluded.summary,payload=excluded.payload,created_at=CURRENT_TIMESTAMP`,companyId,monthKey,uid('MON'),companyId,monthKey,JSON.stringify(summary),JSON.stringify(payload));
  return {monthKey,summary};
}

async function advancedHealth(env,companyId=DEFAULT_COMPANY_ID){
  await ensureAdvancedTables(env);
  const count=async table=>num((await first(env,`SELECT COUNT(*) count FROM ${table} WHERE company_id=?`,companyId))?.count);
  const counts={};
  for(const table of ['trips','invoices','invoice_items','party_accounts','trucks','truck_documents','workflow_bookings','approval_requests','recycle_bin','backup_snapshots']){
    try{counts[table]=await count(table)}catch(_){counts[table]=-1}
  }
  const duplicateTrips=await all(env,`SELECT trip_no,COUNT(*) count FROM trips WHERE company_id=? AND COALESCE(TRIM(trip_no),'')<>'' GROUP BY trip_no HAVING COUNT(*)>1`,companyId);
  const orphanItems=await first(env,`SELECT COUNT(*) count FROM invoice_items ii LEFT JOIN invoices i ON i.id=ii.invoice_id AND i.company_id=ii.company_id WHERE ii.company_id=? AND i.id IS NULL`,companyId);
  const orphanTrips=await first(env,`SELECT COUNT(*) count FROM trips t LEFT JOIN trucks m ON m.company_id=t.company_id AND m.truck_no=t.truck_no WHERE t.company_id=? AND COALESCE(TRIM(t.truck_no),'')<>'' AND m.id IS NULL`,companyId);
  const expiredDocs=await first(env,`SELECT COUNT(*) count FROM truck_documents WHERE company_id=? AND COALESCE(expiry_date,'')<>'' AND expiry_date<date('now')`,companyId);
  const pendingApprovals=await first(env,`SELECT COUNT(*) count FROM approval_requests WHERE company_id=? AND status='PENDING'`,companyId);
  const latestBackup=await first(env,`SELECT id,backup_type,created_at FROM backup_snapshots WHERE company_id=? ORDER BY created_at DESC LIMIT 1`,companyId);
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

let documentStorageV62Promise=null;
async function ensureDocumentStorageV62(env){
  if(documentStorageV62Promise)return documentStorageV62Promise;
  documentStorageV62Promise=(async()=>{
    const row=await first(env,`SELECT sql FROM sqlite_master WHERE type='table' AND name='truck_documents'`);
    const sql=String(row?.sql||'');
    if(!sql)return true;
    const columns=[
      ['storage_key',`ALTER TABLE truck_documents ADD COLUMN storage_key TEXT DEFAULT ''`],
      ['storage_mode',`ALTER TABLE truck_documents ADD COLUMN storage_mode TEXT DEFAULT 'D1'`],
      ['file_size',`ALTER TABLE truck_documents ADD COLUMN file_size INTEGER DEFAULT 0`]
    ];
    const missing=columns.filter(([name])=>!new RegExp(`\\b${name}\\b`,'i').test(sql));
    if(missing.length)await env.DB.batch(missing.map(([,ddl])=>env.DB.prepare(ddl)));
    await run(env,`UPDATE truck_documents SET storage_mode='D1' WHERE storage_mode IS NULL OR TRIM(storage_mode)=''`);
    await safe(env,`CREATE INDEX IF NOT EXISTS idx_truck_documents_storage_v62 ON truck_documents(company_id,storage_mode,created_at)`);
    return true;
  })().catch(error=>{documentStorageV62Promise=null;throw error});
  return documentStorageV62Promise;
}
function documentStorageModeV62(env){
  return env?.DOCS&&typeof env.DOCS.put==='function'&&typeof env.DOCS.get==='function'?'R2':'D1';
}
function safeObjectNameV62(value='file'){
  return String(value||'file').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'file';
}
function decodeDataUrlV62(dataUrl=''){
  const value=String(dataUrl||'');
  const match=value.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if(!match)return {type:'application/octet-stream',bytes:new TextEncoder().encode(value)};
  const type=match[1]||'application/octet-stream';
  if(match[2]){
    const binary=atob(match[3]||'');
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return {type,bytes};
  }
  return {type,bytes:new TextEncoder().encode(decodeURIComponent(match[3]||''))};
}
function bytesToDataUrlV62(bytes,type='application/octet-stream'){
  const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<arr.length;i+=chunk)binary+=String.fromCharCode(...arr.subarray(i,i+chunk));
  return `data:${type||'application/octet-stream'};base64,${btoa(binary)}`;
}
async function saveDocumentBlobV62(env,companyId,documentId,fileName,fileType,source){
  const mode=documentStorageModeV62(env);
  let bytes,type=fileType||'application/octet-stream';
  if(source&&typeof source.arrayBuffer==='function'){
    type=source.type||type;
    bytes=new Uint8Array(await source.arrayBuffer());
  }else{
    const decoded=decodeDataUrlV62(source||'');
    type=type||decoded.type;bytes=decoded.bytes;
  }
  const size=bytes?.byteLength||0;
  const max=mode==='R2'?10*1024*1024:2200000;
  if(size>max){
    const error=new Error(mode==='R2'?'File is too large. Maximum 10 MB.':'File is too large for D1 fallback. Configure R2 DOCS or upload a compressed file under about 2 MB.');
    error.status=413;throw error;
  }
  if(mode==='R2'){
    const key=`${companyId}/${documentId}/${Date.now()}-${safeObjectNameV62(fileName)}`;
    await env.DOCS.put(key,bytes,{httpMetadata:{contentType:type||'application/octet-stream'}});
    return {storageMode:'R2',storageKey:key,fileData:'',fileSize:size,fileType:type};
  }
  return {storageMode:'D1',storageKey:'',fileData:bytesToDataUrlV62(bytes,type),fileSize:size,fileType:type};
}
async function documentBinaryResponseV62(env,user,id){
  await ensureDocumentStorageV62(env);
  const companyId=companyIdOf(user);
  const d=await first(env,`SELECT * FROM truck_documents WHERE id=? AND company_id=?`,id,companyId);
  if(!d)return json({error:'File not found'},404);
  const type=d.file_type||'application/octet-stream';
  const headers={...HEADERS,'content-type':type,'cache-control':'private,max-age=120','content-disposition':`inline; filename="${safeObjectNameV62(d.file_name||'document')}"`};
  if(String(d.storage_mode||'D1').toUpperCase()==='R2'&&d.storage_key&&env?.DOCS){
    const obj=await env.DOCS.get(d.storage_key);
    if(!obj)return json({error:'Cloud document object not found'},404);
    return new Response(obj.body,{status:200,headers});
  }
  const decoded=decodeDataUrlV62(d.file_data||'');
  return new Response(decoded.bytes,{status:200,headers:{...headers,'content-type':d.file_type||decoded.type}});
}
async function notificationFeedV62(env,user){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);
  await ensureDocumentStorageV62(env);
  const access=await subscriptionAccess(env,user);
  const items=[];

  const parties=await all(env,`
    SELECT p.party_name,
      COALESCE((SELECT SUM(total) FROM invoices i WHERE i.company_id=p.company_id AND i.party_name=p.party_name),0) billed,
      COALESCE((SELECT SUM(amount) FROM party_payments r WHERE r.company_id=p.company_id AND r.party_name=p.party_name),0) received
    FROM party_accounts p WHERE p.company_id=?`,companyId);
  for(const p of parties){
    const pending=round2(num(p.billed)-num(p.received));
    if(pending>0.01)items.push({
      id:`PARTY:${p.party_name}`,kind:'PARTY_OUTSTANDING',severity:'warning',title:p.party_name,
      text:`Party outstanding ${pending.toLocaleString('en-IN',{minimumFractionDigits:2})}`,amount:pending,action:'parties'
    });
  }

  const supplierNames=await all(env,`
    SELECT owner_name FROM supplier_accounts WHERE company_id=?
    UNION SELECT owner_name FROM truck_payments WHERE company_id=?
    UNION SELECT owner_name FROM supplier_payments WHERE company_id=?
    UNION SELECT supplier_name owner_name FROM pm_bills WHERE company_id=?`,companyId,companyId,companyId,companyId);
  for(const r of supplierNames){
    const name=upper(r.owner_name||'');if(!name)continue;
    const freight=num((await first(env,`SELECT SUM(payable) total FROM truck_payments WHERE company_id=? AND owner_name=?`,companyId,name))?.total);
    const pm=num((await first(env,`SELECT SUM(supplier_total) total FROM pm_bills WHERE company_id=? AND supplier_name=?`,companyId,name))?.total);
    const paid=num((await first(env,`SELECT SUM(amount) total FROM supplier_payments WHERE company_id=? AND owner_name=?`,companyId,name))?.total);
    const pending=round2(freight+pm-paid);
    if(pending>0.01)items.push({
      id:`SUPPLIER:${name}`,kind:'SUPPLIER_PENDING',severity:'info',title:name,
      text:`Supplier payment pending ${pending.toLocaleString('en-IN',{minimumFractionDigits:2})}`,amount:pending,action:'suppliers'
    });
  }

  const docs=await all(env,`SELECT id,truck_no,kind,file_name,expiry_date FROM truck_documents
    WHERE company_id=? AND COALESCE(expiry_date,'')<>'' AND expiry_date<=date('now','+30 day') ORDER BY expiry_date LIMIT 50`,companyId);
  const today=new Date().toISOString().slice(0,10);
  for(const d of docs){
    const expired=String(d.expiry_date)<today;
    items.push({
      id:`DOC:${d.id}`,kind:'DOCUMENT_EXPIRY',severity:expired?'critical':'warning',
      title:`${d.truck_no} · ${d.kind}`,text:`${expired?'Expired':'Expiry'} ${d.expiry_date} · ${d.file_name||'Document'}`,
      dueDate:d.expiry_date,action:'gallery',entityId:d.id
    });
  }

  const approvals=await all(env,`SELECT id,entity_type,entity_id,action,requested_by,created_at FROM approval_requests
    WHERE company_id=? AND status='PENDING' ORDER BY created_at LIMIT 30`,companyId);
  for(const a of approvals)items.push({
    id:`APPROVAL:${a.id}`,kind:'APPROVAL_PENDING',severity:'warning',title:'Approval Pending',
    text:`${a.entity_type} · ${a.action} · requested by ${a.requested_by||'-'}`,action:'approvals',entityId:a.id
  });

  if(access.subscription?.status==='TRIAL'&&Number(access.daysRemaining)<=7){
    items.push({
      id:'SUBSCRIPTION:TRIAL',kind:'SUBSCRIPTION',severity:Number(access.daysRemaining)<=2?'critical':'warning',
      title:'Free Trial',text:`${access.daysRemaining??0} day(s) remaining`,action:'saas'
    });
  }else if(access.readOnly){
    items.push({id:'SUBSCRIPTION:EXPIRED',kind:'SUBSCRIPTION',severity:'critical',title:'Subscription Expired',text:access.accessMessage||'Read Only Mode',action:'saas'});
  }

  const rank={critical:0,warning:1,info:2};
  items.sort((a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||num(b.amount)-num(a.amount));
  return {
    count:items.length,
    urgent:items.filter(x=>x.severity==='critical'||x.severity==='warning').length,
    items:items.slice(0,100),
    storage:{mode:documentStorageModeV62(env),r2Configured:documentStorageModeV62(env)==='R2'},
    checkedAt:new Date().toISOString()
  };
}


async function trashEntity(env,user,entityType,entityId){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);
  const config=TRASH_MAP[entityType];if(!config)throw new Error('Unsupported recycle entity');
  const main=await first(env,`SELECT * FROM ${config.table} WHERE id=? AND company_id=?`,entityId,companyId);
  if(!main)throw new Error('Record not found');
  const children=[];
  for(const child of config.children||[])children.push({table:child.table,rows:await all(env,`SELECT * FROM ${child.table} WHERE ${child.fk}=? AND company_id=?`,entityId,companyId)});
  const recycleId=uid('BIN');
  await run(env,`INSERT INTO recycle_bin(id,company_id,entity_type,entity_id,label,payload,deleted_by) VALUES(?,?,?,?,?,?,?)`,recycleId,companyId,entityType,entityId,String(main[config.label]||entityId),JSON.stringify({main,children}),user?.username||'');
  for(const child of config.children||[])await run(env,`DELETE FROM ${child.table} WHERE ${child.fk}=?`,entityId);
  await run(env,`DELETE FROM ${config.table} WHERE id=?`,entityId);
  await audit(env,user,'RECYCLE',entityType,entityId,{recycleId});
  return {ok:true,recycleId};
}
async function insertObject(env,table,row){
  row={...(row||{})};
  if(row.company_id&&row.id){
    let existing=null;
    try{existing=await first(env,`SELECT company_id FROM ${table} WHERE id=? LIMIT 1`,row.id)}catch(_){}
    if(existing?.company_id&&existing.company_id!==row.company_id)row.id=uid('IMP');
  }
  const keys=Object.keys(row).filter(k=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
  if(!keys.length)return;
  await run(env,`INSERT OR REPLACE INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,...keys.map(k=>row[k]));
}
async function restoreRecycle(env,user,recycleId){
  const companyId=companyIdOf(user);
  const item=await first(env,`SELECT * FROM recycle_bin WHERE id=? AND company_id=?`,recycleId,companyId);if(!item)throw new Error('Recycle item not found');
  const config=TRASH_MAP[item.entity_type];if(!config)throw new Error('Unsupported recycle entity');
  const payload=JSON.parse(item.payload||'{}');
  await insertObject(env,config.table,payload.main||{});
  for(const child of payload.children||[])for(const row of child.rows||[])await insertObject(env,child.table,row);
  await run(env,`DELETE FROM recycle_bin WHERE id=? AND company_id=?`,recycleId,companyId);
  await audit(env,user,'RESTORE',item.entity_type,item.entity_id,{recycleId});
  return {ok:true};
}

function nextBookingNo(rows){
  let max=0;for(const row of rows){const m=String(row.booking_no||'').match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1]))}
  return `BK ${String(max+1).padStart(3,'0')}`;
}
async function bookingAction(env,user,id,action,body={}){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);
  const booking=await first(env,`SELECT * FROM workflow_bookings WHERE id=? AND company_id=?`,id,companyId);if(!booking)throw new Error('Booking not found');
  if(action==='submit'){
    await run(env,`UPDATE workflow_bookings SET status='PENDING_APPROVAL',approval_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?`,id);
    const existing=await first(env,`SELECT id FROM approval_requests WHERE company_id=? AND entity_type='BOOKING' AND entity_id=? AND status='PENDING'`,companyId,id);
    if(!existing)await run(env,`INSERT INTO approval_requests(id,company_id,entity_type,entity_id,action,status,requested_by,notes) VALUES(?,?,?,?,?,?,?,?)`,uid('APR'),companyId,'BOOKING',id,'APPROVE_DISPATCH','PENDING',user.username,body.notes||'');
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
    const tripId=uid('TRIP'),tripNo=await reserveNextTripNumber(env,companyId);
    await run(env,`INSERT INTO trips(id,company_id,trip_no,trip_date,party_name,truck_no,material,loading_point,unloading_point,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,tripId,companyId,tripNo,booking.dispatch_date||booking.booking_date,booking.party_name,booking.truck_no,booking.material,booking.loading_point,booking.unloading_point,'BOOKED',`Created from ${booking.booking_no}. ${booking.notes||''}`);
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
  const companyId=companyIdOf(user);
  const req=await first(env,`SELECT * FROM approval_requests WHERE id=? AND company_id=?`,id,companyId);if(!req)throw new Error('Approval request not found');
  const finalStatus=status==='APPROVED'?'APPROVED':'REJECTED';
  await run(env,`UPDATE approval_requests SET status=?,approved_by=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,finalStatus,user.username,notes||req.notes||'',id);
  if(req.entity_type==='BOOKING'){
    await run(env,`UPDATE workflow_bookings SET approval_status=?,status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,finalStatus,finalStatus,user.username,req.entity_id,companyId);
  }
  await audit(env,user,finalStatus,'approval',id,{entityId:req.entity_id});
  return {ok:true,status:finalStatus};
}

async function importAdvancedSheets(env,user,sheets={}){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);
  await ensureTripWeightColumns(env);
  const result={};
  for(const [sheetName,rows] of Object.entries(sheets||{})){
    const config=ADVANCED_EXPORT_TABLES[sheetName];if(!config||!Array.isArray(rows)){continue}
    let count=0;
    for(const raw of rows){
      const row={};for(const col of config.columns)if(raw[col]!==undefined&&raw[col]!==null&&raw[col]!=='')row[col]=raw[col];
      if(!row.id)row.id=uid(sheetName.slice(0,3).toUpperCase());row.company_id=companyId;
      try{await insertObject(env,config.table,row);count++}catch(_){/* skip invalid row but continue import */}
    }
    result[sheetName]=count;
  }
  await audit(env,user,'IMPORT','excel','bulk',result);
  return result;
}

const LEGACY_BACKUP_KEYS_V665={
  Parties:'parties',PartyPayments:'partyPayments',Trucks:'trucks',Routes:'routes',Materials:'materials',
  Trips:'trips',Invoices:'invoices',InvoiceItems:'invoiceItems',PMBills:'pmBills',PMBillItems:'pmBillItems',
  SupplierAccounts:'supplierAccounts',TruckEntries:'truckEntries',SupplierPayments:'supplierPayments',
  Expenses:'expenses',Documents:'documents'
};
const RESTORE_DELETE_ORDER_V665=['PartyPaymentAllocations','PMBillItems','InvoiceItems','SupplierPayments','TruckEntries','Expenses','PMBills','Invoices','Trips','Documents','SupplierAccounts','Materials','Routes','Trucks','PartyPayments','Parties','Bookings','Settings'];
const RESTORE_INSERT_ORDER_V665=['Parties','Trucks','Routes','Materials','SupplierAccounts','Invoices','Trips','InvoiceItems','PartyPayments','PartyPaymentAllocations','PMBills','PMBillItems','TruckEntries','SupplierPayments','Expenses','Documents','Bookings','Settings'];

function backupSheetsV665(input={}){
  const root=input?.payload||input?.data||input||{};
  if(root?.sheets&&typeof root.sheets==='object')return {root,sheets:{...root.sheets},legacy:false};
  const sheets={};
  for(const [sheet,key] of Object.entries(LEGACY_BACKUP_KEYS_V665))if(Array.isArray(root[key]))sheets[sheet]=root[key];
  if((!sheets.InvoiceItems||!sheets.InvoiceItems.length)&&Array.isArray(sheets.Invoices))sheets.InvoiceItems=sheets.Invoices.flatMap(inv=>(inv.items||[]).map(item=>({...item,invoice_id:item.invoice_id||inv.id})));
  return {root,sheets,legacy:true};
}
function normalizeBackupSheetsV665(input,companyId){
  const parsed=backupSheetsV665(input),sheets={},warnings=[];
  for(const [sheetName,rawRows] of Object.entries(parsed.sheets||{})){
    const config=ADVANCED_EXPORT_TABLES[sheetName];if(!config||!Array.isArray(rawRows))continue;
    sheets[sheetName]=rawRows.map(raw=>{
      const row={};
      for(const col of config.columns)if(raw?.[col]!==undefined&&raw?.[col]!==null)row[col]=raw[col];
      if(config.columns.includes('id')&&!clean(row.id))row.id=uid(sheetName.slice(0,3).toUpperCase());
      row.company_id=companyId;
      if(config.columns.includes('created_at')&&!row.created_at)row.created_at=new Date().toISOString();
      if(config.columns.includes('updated_at')&&!row.updated_at)row.updated_at=row.created_at||new Date().toISOString();
      return row;
    });
  }

  const invoices=sheets.Invoices??=[],trips=sheets.Trips??=[],items=sheets.InvoiceItems??=[],entries=sheets.TruckEntries??=[],trucks=sheets.Trucks??=[];
  sheets.Trips=trips;sheets.InvoiceItems=items;sheets.TruckEntries=entries;sheets.Trucks=trucks;
  const recovered=recoverLegacyInvoiceLinesV665(companyId,invoices,items,trips,trucks);
  const tripById=new Map(trips.map(x=>[String(x.id),x]));
  for(const item of items){
    const trip=tripById.get(String(item.trip_id||''));
    if(trip){trip.invoice_id=item.invoice_id;trip.invoice_item_id=item.id}
  }
  const linkedByTrip=new Map(),removedIds=new Set();
  for(const entry of entries){
    if(entry.trip_id&&tripById.has(String(entry.trip_id))){const list=linkedByTrip.get(String(entry.trip_id))||[];list.push(entry);linkedByTrip.set(String(entry.trip_id),list)}
  }
  let relinked=0,duplicatesRemoved=0,orphansCleared=0;
  for(const [tripId,list] of linkedByTrip){
    if(list.length<=1)continue;
    list.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
    const keep=list[0];
    for(const extra of list.slice(1)){
      if(sameTruckEntryBusinessV665(keep,extra)){removedIds.add(String(extra.id));duplicatesRemoved++}
      else{extra.trip_id='';orphansCleared++}
    }
    linkedByTrip.set(tripId,[keep]);
  }
  for(const entry of entries){
    if(removedIds.has(String(entry.id))||(entry.trip_id&&tripById.has(String(entry.trip_id))))continue;
    const matches=trips.map(trip=>({trip,score:truckEntryTripScoreV665(entry,trip)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
    if(!matches.length){if(entry.trip_id){entry.trip_id='';orphansCleared++}continue}
    if(matches.length>1&&matches[0].score===matches[1].score)continue;
    const trip=matches[0].trip,existing=(linkedByTrip.get(String(trip.id))||[])[0];
    if(existing&&sameTruckEntryBusinessV665(existing,entry)){removedIds.add(String(entry.id));duplicatesRemoved++}
    else if(!existing){entry.trip_id=trip.id;linkedByTrip.set(String(trip.id),[entry]);relinked++}
    else if(entry.trip_id){entry.trip_id='';orphansCleared++}
  }
  if(removedIds.size)sheets.TruckEntries=entries.filter(x=>!removedIds.has(String(x.id)));

  if(Array.isArray(sheets.Documents)&&parsed.root?.capabilities?.documentContentComplete!==true){
    delete sheets.Documents;
    warnings.push('Backup did not contain complete document file objects; existing document records and R2 files were preserved.');
  }
  if(!sheets.PartyPaymentAllocations)sheets.PartyPaymentAllocations=[];
  return {root:parsed.root,sheets,legacy:parsed.legacy,warnings,repairs:{relinked,duplicatesRemoved,orphansCleared,recoveredInvoiceLines:recovered.items.length,recoveredTrucks:recovered.trucks.length}};
}
function validateBackupSheetsV665(sheets={}){
  const errors=[],warnings=[],ids={};
  for(const [name,rows] of Object.entries(sheets)){
    const config=ADVANCED_EXPORT_TABLES[name];if(!config||!Array.isArray(rows))continue;
    const seen=new Set();
    for(const row of rows){
      if(config.columns.includes('id')){
        const id=clean(row.id);if(!id)errors.push(`${name}: missing id`);else if(seen.has(id))errors.push(`${name}: duplicate id ${id}`);else seen.add(id);
      }
    }
    ids[name]=seen;
  }
  for(const invoice of sheets.Invoices||[])if(!clean(invoice.invoice_no)||!clean(invoice.party_name))errors.push('Invoices: invoice number and party are required.');
  for(const item of sheets.InvoiceItems||[]){
    if(!ids.Invoices?.has(clean(item.invoice_id)))errors.push(`InvoiceItems: ${item.id} has no parent invoice.`);
    if(item.trip_id&&!ids.Trips?.has(clean(item.trip_id)))warnings.push(`InvoiceItems: ${item.id} had a missing Trip link; review after restore.`);
  }
  for(const row of sheets.PartyPaymentAllocations||[]){
    if(!ids.PartyPayments?.has(clean(row.payment_id))||!ids.Invoices?.has(clean(row.invoice_id)))errors.push(`PartyPaymentAllocations: ${row.id} has a missing payment or invoice.`);
  }
  for(const row of sheets.TruckEntries||[])if(row.trip_id&&!ids.Trips?.has(clean(row.trip_id)))warnings.push(`TruckEntries: ${row.id} has an unresolved Trip link.`);
  for(const row of sheets.SupplierPayments||[])if(row.trip_id&&!ids.Trips?.has(clean(row.trip_id)))warnings.push(`SupplierPayments: ${row.id} has a missing Trip link; payment was kept.`);
  for(const invoice of sheets.Invoices||[])if(!(sheets.InvoiceItems||[]).some(x=>String(x.invoice_id)===String(invoice.id)))warnings.push(`${invoice.invoice_no}: invoice has no truck line; totals were preserved.`);
  return {ok:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
function backupSummaryV665(sheets={}){
  const sum=(rows,key)=>(rows||[]).reduce((a,x)=>a+num(x[key]),0);
  return {
    parties:(sheets.Parties||[]).length,invoices:(sheets.Invoices||[]).length,invoiceItems:(sheets.InvoiceItems||[]).length,
    trips:(sheets.Trips||[]).length,partyPayments:(sheets.PartyPayments||[]).length,truckEntries:(sheets.TruckEntries||[]).length,
    supplierPayments:(sheets.SupplierPayments||[]).length,documents:(sheets.Documents||[]).length,
    billing:round2(sum(sheets.Invoices,'total')),partyReceived:round2(sum(sheets.PartyPayments,'amount')),
    supplierPayable:round2(sum(sheets.TruckEntries,'payable')+sum(sheets.PMBills,'supplier_total')),
    supplierPaid:round2(sum(sheets.SupplierPayments,'amount'))
  };
}
function jsonInsertStatementV665(env,sheetName,rows,mode='replace'){
  const config=ADVANCED_EXPORT_TABLES[sheetName];if(!config||!rows?.length)return null;
  const columns=['company_id',...config.columns];
  const select=columns.map(col=>`json_extract(value,'$.${col}')`).join(',');
  const verb=mode==='merge'?'INSERT OR IGNORE':'INSERT OR REPLACE';
  return env.DB.prepare(`${verb} INTO ${config.table}(${columns.join(',')}) SELECT ${select} FROM json_each(?)`).bind(JSON.stringify(rows));
}
async function assertRestoreTenantIsolationV665(env,sheets,companyId){
  for(const [sheetName,rows] of Object.entries(sheets||{})){
    const config=ADVANCED_EXPORT_TABLES[sheetName];
    if(!config||!config.columns.includes('id')||!rows?.length)continue;
    const ids=rows.map(x=>clean(x.id)).filter(Boolean);
    if(!ids.length)continue;
    const collision=await first(env,`SELECT id,company_id FROM ${config.table} WHERE id IN (SELECT value FROM json_each(?)) AND company_id<>? LIMIT 1`,JSON.stringify(ids),companyId);
    if(collision){const error=new Error(`${sheetName}: backup ID belongs to another company. Restore stopped before changing data.`);error.status=409;throw error}
  }
}
async function restoreBackupV665(env,user,input,mode='merge'){
  const companyId=companyIdOf(user);
  await ensureAdvancedTables(env);await ensureAccountingSchemaV665(env);await ensureTripWeightColumns(env);
  const normalized=normalizeBackupSheetsV665(input,companyId),validation=validateBackupSheetsV665(normalized.sheets);
  if(!validation.ok){const error=new Error(`Backup validation failed: ${validation.errors.slice(0,8).join(' | ')}`);error.status=400;throw error}
  await assertRestoreTenantIsolationV665(env,normalized.sheets,companyId);
  const before=await advancedExportPayload(env,companyId);
  const safetyId=uid('BKP');
  await run(env,`INSERT INTO backup_snapshots(id,company_id,backup_type,period_key,payload) VALUES(?,?,?,?,?)`,safetyId,companyId,'PRE_RESTORE',new Date().toISOString().slice(0,10),JSON.stringify(before));
  const statements=[];
  if(mode==='replace'){
    for(const sheetName of RESTORE_DELETE_ORDER_V665){
      if(!Object.prototype.hasOwnProperty.call(normalized.sheets,sheetName))continue;
      const config=ADVANCED_EXPORT_TABLES[sheetName];if(config)statements.push(env.DB.prepare(`DELETE FROM ${config.table} WHERE company_id=?`).bind(companyId));
    }
  }
  for(const sheetName of RESTORE_INSERT_ORDER_V665){
    const statement=jsonInsertStatementV665(env,sheetName,normalized.sheets[sheetName]||[],mode);if(statement)statements.push(statement);
  }
  if(statements.length)await env.DB.batch(statements);
  repairedAccountingCompaniesV665.delete(companyId);
  const linkRepair=await repairAccountingLinksV665(env,companyId,{force:true});
  await ensureAllPartyLedgerNumbers(env,companyId);
  const [invoices,items,payments]=await Promise.all([
    all(env,`SELECT * FROM invoices WHERE company_id=?`,companyId),all(env,`SELECT * FROM invoice_items WHERE company_id=?`,companyId),all(env,`SELECT * FROM party_payments WHERE company_id=?`,companyId)
  ]);
  await partyPaymentAllocationV665(env,companyId,invoices,items,payments);
  const after=await advancedExportPayload(env,companyId),expected=backupSummaryV665(normalized.sheets),actual=backupSummaryV665(after.sheets);
  const repairs={...normalized.repairs,...linkRepair,
    recoveredInvoiceLines:num(normalized.repairs.recoveredInvoiceLines)+num(linkRepair.recoveredInvoiceLines),
    recoveredTrucks:num(normalized.repairs.recoveredTrucks)+num(linkRepair.recoveredTrucks)};
  await audit(env,user,'RESTORE','backup',safetyId,{mode,expected,actual,repairs});
  return {ok:true,format:'MEERA_BACKUP_V2',mode,safetyBackupId:safetyId,expected,actual,repairs,warnings:[...normalized.warnings,...validation.warnings]};
}

async function runScheduledTasks(env,scheduledTime=Date.now()){
  await ensureDatabase(env);await ensureAdvancedTables(env);
  const d=new Date(scheduledTime),day=d.getUTCDate(),dateKey=d.toISOString().slice(0,10);
  const companies=await all(env,`SELECT id FROM companies WHERE status='ACTIVE' ORDER BY id`);
  for(const company of companies){
    const companyId=company.id;
    const settings=await readAppSettings(env,companyId);
    if(settings.automaticBackups!==false)await createBackupSnapshot(env,'SCHEDULED',dateKey,companyId);
    if(day===1){
      const prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));
      await createMonthlyExport(env,prev.toISOString().slice(0,7),companyId);
    }
  }
}


const V59_RESOURCE_FEATURE={
  'system-health':'reports',
  'accounting-audit':'reports',
  'approvals':'approvals',
  'excel-export':'excel',
  'excel-import':'excel',
  'monthly-exports':'excel',
  'documents':'documents',
  'document-content':'documents',
  'backups':'reports'
};
async function enforceSubscriptionWriteV59(env,user,resource,method){
  const access=await subscriptionAccess(env,user);
  if(access.readOnly){
    const error=new Error(access.accessMessage||'Subscription expired');
    error.status=402;throw error;
  }
  const feature=V59_RESOURCE_FEATURE[resource]||'';
  if(feature&&!subscriptionFeatureAllowedV59(access,feature)){
    const error=new Error(`Your ${access.subscription?.plan_name||'plan'} does not include ${feature}. Upgrade required.`);
    error.status=402;throw error;
  }
  if(method==='POST'&&resource==='trips'){
    const max=Number(access.limits?.trips||0),used=Number(access.usage?.trips||0);
    if(max&&used>=max){
      const error=new Error(`Monthly Trip limit reached (${used}/${max}). Upgrade your plan to continue.`);
      error.status=402;throw error;
    }
  }
  if(method==='POST'&&resource==='invoices'){
    const max=Number(access.limits?.invoices||0),used=Number(access.usage?.invoices||0);
    if(max&&used>=max){
      const error=new Error(`Monthly Invoice limit reached (${used}/${max}). Upgrade your plan to continue.`);
      error.status=402;throw error;
    }
  }
  return access;
}

export default {
  async fetch(req,env,ctx){
    if(req.method==='OPTIONS')return json({ok:true});
    try{
      const url=new URL(req.url);
      const parts=pathParts(url.pathname);
      const resource=parts[0]||'';
      const id=decodeURIComponent(parts[1]||'');

      if(resource==='health')return new Response(JSON.stringify({ok:true,service:'Meera Logistics ERP API',version:'V62-Cloud-Docs-Notifications'}),{headers:{...HEADERS,'cache-control':'public,max-age=15'}});
      if(resource==='saas-plans'&&req.method==='GET'){
        await ensureDatabase(env);
        await ensureSubscriptionRequestsV61(env);
        const plans=await all(env,`SELECT id,plan_name,monthly_price,yearly_price,max_users,max_trips_month,max_invoices_month,max_storage_mb,features_json,play_product_id_monthly,play_product_id_yearly FROM saas_plans WHERE active=1 ORDER BY sort_order`);
        return json(plans.map(p=>({...p,features:JSON.parse(p.features_json||'{}'),features_json:undefined})));
      }


      if(resource==='register-company'&&req.method==='POST'){
        await ensureDatabase(env);
        await ensureSubscriptionRequestsV61(env);
        const tenantReady=await first(env,`SELECT value FROM app_meta WHERE key='tenant_unique_v52'`);
        if(tenantReady?.value!=='1')return json({error:'Multi-company setup is finishing automatically. Please retry shortly.'},503);
        const b=await requestBody(req);
        const companyName=upper(b.companyName),username=clean(b.username),password=String(b.password||'');
        const mobile=clean(b.mobile),email=clean(b.email),fullName=upper(b.fullName||companyName);
        if(!companyName||!fullName||!mobile||!username||password.length<6)
          return json({error:'Company, Owner Name, Mobile, Username and minimum 6 character Password required'},400);
        const codeBase=companyName.replace(/[^A-Z0-9]/g,'').slice(0,8)||'COMPANY';
        let code=codeBase,attempt=1;
        while(await first(env,`SELECT id FROM companies WHERE company_code=?`,code))code=`${codeBase}${++attempt}`;
        if(await first(env,`SELECT id FROM users WHERE LOWER(username)=LOWER(?)`,username))
          return json({error:'Username already exists'},409);

        const companyId=uid('CMP'),subId=uid('SUB');
        const trialStart=new Date(),trialEnd=new Date(trialStart.getTime()+14*86400000);
        await run(env,`INSERT INTO companies(id,company_code,company_name,legal_name,gst_no,pan_no,mobile,email,address,status)
          VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE')`,
          companyId,code,companyName,companyName,upper(b.gstNo),upper(b.panNo),mobile,email,b.address||'');
        await run(env,`INSERT INTO company_subscriptions(
          id,company_id,plan_id,status,source,trial_started_at,trial_ends_at,current_period_start,current_period_end
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
          subId,companyId,'TRIAL','TRIAL','SELF_SIGNUP',
          trialStart.toISOString().slice(0,10),trialEnd.toISOString().slice(0,10),
          trialStart.toISOString().slice(0,10),trialEnd.toISOString().slice(0,10));
        await run(env,`INSERT INTO users(username,password_hash,role,active,company_id,full_name,email,mobile,updated_at)
          VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
          username,await sha256(password),'OWNER',1,companyId,fullName,email,mobile);
        const owner=await first(env,`SELECT id,username,role,company_id,full_name,email,mobile FROM users WHERE LOWER(username)=LOWER(?)`,username);
        owner.permissions=permissionsForRole(owner.role);
        const initialSettings={...DEFAULT_APP_SETTINGS,companyName,address:b.address||'',phone:mobile,email,gstNo:upper(b.gstNo),pan:upper(b.panNo),authorizedPartner:fullName};
        await run(env,`INSERT INTO app_settings(company_id,setting_key,setting_value,updated_by,updated_at)
          VALUES(?,'APP',?,?,CURRENT_TIMESTAMP)`,companyId,JSON.stringify(initialSettings),username);

        const token=crypto.randomUUID()+crypto.randomUUID();
        await run(env,`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 day'))`,token,owner.id);
        return json({
          ok:true,token,user:owner,companyId,companyCode:code,
          trialEndsAt:trialEnd.toISOString().slice(0,10),
          message:'Company created. 14-day trial activated.'
        });
      }

      // Login fast path: query the existing users table first. Only run the full
      // schema initializer if this is a brand-new database.
      if(resource==='login'&&req.method==='POST'){
        await ensureDatabase(env);
        if(ctx?.waitUntil)ctx.waitUntil(progressTenantUpgradeV52(env,1).catch(()=>{}));
        const b=await requestBody(req);
        const hash=await sha256(b.password||'');
        const user=await first(env,`SELECT id,username,role,company_id,full_name,email,mobile FROM users WHERE LOWER(username)=LOWER(?) AND password_hash=? AND active=1`,clean(b.username),hash);
        if(user){
          const company=await first(env,`SELECT status FROM companies WHERE id=?`,user.company_id||DEFAULT_COMPANY_ID);
          if(company&&company.status!=='ACTIVE')return json({error:'This company account is suspended. Contact support.'},403);
        }
        if(user)user.permissions=permissionsForRole(user.role);
        if(!user)return json({error:'Invalid username or password'},401);
        const token=crypto.randomUUID();
        await run(env,`DELETE FROM sessions WHERE expires_at<=datetime('now')`);
        await run(env,`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))`,token,user.id);
        return json({token,user});
      }

      await ensureDatabase(env);
      if(ctx?.waitUntil)ctx.waitUntil(progressTenantUpgradeV52(env,1).catch(()=>{}));
      const user=await auth(req,env);
      if(!user)return json({error:'Unauthorized'},401);

      const companyId=companyIdOf(user);
      if(id&&TENANT_RESOURCE_TABLE[resource]&&!['download','restore'].includes(id))await requireTenantRecord(env,user,resource,id);


      if(resource==='super-admin'){
        await ensureSubscriptionRequestsV61(env);
        if(!await isPlatformAdminV60(env,user))return json({error:'Platform administrator access required'},403);
        if(req.method==='GET')return json(await platformDashboardV60(env));
        if(req.method==='POST'&&id==='company-status'){
          const b=await requestBody(req),targetId=clean(b.companyId),status=upper(b.status);
          if(!targetId||!['ACTIVE','SUSPENDED'].includes(status))return json({error:'Company and valid status required'},400);
          if(targetId===DEFAULT_COMPANY_ID&&status!=='ACTIVE')return json({error:'Primary Meera Logistics company cannot be suspended'},400);
          const company=await first(env,`SELECT id,company_name,status FROM companies WHERE id=?`,targetId);
          if(!company)return json({error:'Company not found'},404);
          await run(env,`UPDATE companies SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,status,targetId);
          if(status!=='ACTIVE')await run(env,`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=?)`,targetId);
          await platformAuditV60(env,user,'COMPANY_STATUS',targetId,'',{from:company.status,to:status});
          return json({ok:true,status});
        }
        if(req.method==='POST'&&id==='extend-trial'){
          const b=await requestBody(req),targetId=clean(b.companyId),days=Math.max(1,Math.min(30,Number(b.days||7)));
          const sub=await first(env,`SELECT * FROM company_subscriptions WHERE company_id=?`,targetId);
          if(!sub)return json({error:'Subscription not found'},404);
          if(sub.plan_id!=='TRIAL'&&sub.status!=='TRIAL')return json({error:'Trial extension is only available for Trial companies'},409);
          const today=new Date();const oldEnd=sub.trial_ends_at?new Date(`${sub.trial_ends_at}T23:59:59Z`):today;
          const base=oldEnd.getTime()>today.getTime()?oldEnd:today;
          const next=new Date(base.getTime()+days*86400000).toISOString().slice(0,10);
          await run(env,`UPDATE company_subscriptions SET plan_id='TRIAL',status='TRIAL',trial_ends_at=?,current_period_end=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`,next,next,targetId);
          await platformAuditV60(env,user,'EXTEND_TRIAL',targetId,'',{days,trialEndsAt:next});
          return json({ok:true,trialEndsAt:next});
        }
        if(req.method==='POST'&&id==='request-review'){
          const b=await requestBody(req),requestId=clean(b.requestId),status=upper(b.status);
          if(!['REVIEWED','REJECTED'].includes(status))return json({error:'Use REVIEWED or REJECTED'},400);
          const row=await first(env,`SELECT * FROM subscription_requests WHERE id=?`,requestId);
          if(!row)return json({error:'Subscription request not found'},404);
          await run(env,`UPDATE subscription_requests SET status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,status,b.notes||'',requestId);
          await platformAuditV60(env,user,'SUBSCRIPTION_REQUEST',row.company_id,requestId,{status,notes:b.notes||''});
          return json({ok:true,status});
        }
      }

      if(resource==='subscription-recovery-v61'&&req.method==='GET'){
        await ensureSubscriptionRequestsV61(env);
        const table=await first(env,`SELECT name FROM sqlite_master WHERE type='table' AND name='subscription_requests'`);
        const count=await first(env,`SELECT COUNT(*) count FROM subscription_requests`);
        return json({ok:!!table,table:'subscription_requests',rows:Number(count?.count||0),version:'V62-Cloud-Docs-Notifications'});
      }

      if(resource==='migration-status'&&req.method==='GET'){
        const stage=await first(env,`SELECT value FROM app_meta WHERE key='tenant_stage_v52'`);
        const ready=await first(env,`SELECT value FROM app_meta WHERE key='tenant_unique_v52'`);
        return json({schemaVersion:'53',stage:Number(stage?.value||0),total:V52_TENANT_REBUILDS.length,ready:ready?.value==='1'});
      }

      if(req.method==='GET'&&V59_RESOURCE_FEATURE[resource]){
        const feature=V59_RESOURCE_FEATURE[resource];
        if(!subscriptionFeatureAllowedV59(subscriptionState,feature))
          return json({error:`Your ${subscriptionState.subscription?.plan_name||'plan'} does not include ${feature}. Upgrade required.`},402);
      }

      if(resource==='saas-context'&&req.method==='GET')return json(await subscriptionAccess(env,user));

      if(resource==='company-profile'){
        if(req.method==='GET')return json((await saasContext(env,user)).company);
        if(req.method==='PUT'){
          if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
          const b=await requestBody(req),companyId=user.company_id||DEFAULT_COMPANY_ID;
          await run(env,`UPDATE companies SET company_name=?,legal_name=?,gst_no=?,pan_no=?,mobile=?,email=?,address=?,
            invoice_prefix=?,non_gst_prefix=?,trip_prefix=?,supplier_prefix=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            upper(b.companyName),upper(b.legalName||b.companyName),upper(b.gstNo),upper(b.panNo),clean(b.mobile),clean(b.email),b.address||'',
            upper(b.invoicePrefix||'ML'),upper(b.nonGstPrefix||'JAY'),upper(b.tripPrefix||'TR'),upper(b.supplierPrefix||'PML'),companyId);
          await audit(env,user,'UPDATE','company',companyId,b);
          return json({ok:true,company:(await saasContext(env,user)).company});
        }
      }

      if(resource==='subscription'&&req.method==='GET')return json(await subscriptionAccess(env,user));
      if(resource==='subscription-request'){
        await ensureSubscriptionRequestsV61(env);
        if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
        if(req.method==='GET'){
          return json(await all(env,`SELECT * FROM subscription_requests WHERE company_id=? ORDER BY created_at DESC LIMIT 20`,companyId));
        }
        if(req.method==='POST'){
          const b=await requestBody(req),planId=upper(b.planId),cycle=upper(b.billingCycle||'MONTHLY');
          if(!['BASIC','PRO','BUSINESS'].includes(planId))return json({error:'Select Basic, Pro or Business plan'},400);
          if(!['MONTHLY','YEARLY'].includes(cycle))return json({error:'Invalid billing cycle'},400);
          const plan=await first(env,`SELECT id FROM saas_plans WHERE id=? AND active=1`,planId);
          if(!plan)return json({error:'Plan not available'},404);
          const existing=await first(env,`SELECT id FROM subscription_requests WHERE company_id=? AND status='PENDING' LIMIT 1`,companyId);
          if(existing)return json({error:'A plan request is already pending'},409);
          const requestId=uid('SRQ');
          await run(env,`INSERT INTO subscription_requests(id,company_id,requested_plan_id,billing_cycle,status,notes,requested_by)
            VALUES(?,?,?,?, 'PENDING',?,?)`,requestId,companyId,planId,cycle,b.notes||'',user.username||'');
          await audit(env,user,'CREATE','subscription_request',requestId,{planId,cycle});
          return json({ok:true,id:requestId,status:'PENDING'});
        }
      }

      if(resource==='team-users'){
        const companyId=user.company_id||DEFAULT_COMPANY_ID;
        if(req.method==='GET'){
          if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
          return json(await all(env,`SELECT id,username,role,full_name,email,mobile,active,created_at,updated_at FROM users WHERE company_id=? ORDER BY active DESC,username`,companyId));
        }
        if(req.method==='POST'){
          if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
          const b=await requestBody(req),username=clean(b.username),role=upper(b.role||'VIEWER');
          if(!username||!b.password)return json({error:'Username and password required'},400);
          if(!ROLE_PERMISSIONS[role])return json({error:'Invalid role'},400);
          const ctx=await subscriptionAccess(env,user);
          if(ctx.readOnly)return json({error:'Subscription expired. Team changes are locked.'},402);
          const current=Number((await first(env,`SELECT COUNT(*) count FROM users WHERE company_id=? AND active=1`,companyId))?.count||0);
          const max=Number(ctx.subscription?.max_users||1);
          if(current>=max)return json({error:`Your ${ctx.subscription?.plan_name||'plan'} allows ${max} active user(s). Upgrade required.`},402);
          try{
            await run(env,`INSERT INTO users(username,password_hash,role,active,company_id,full_name,email,mobile,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
              username,await sha256(b.password),role,1,companyId,upper(b.fullName),clean(b.email),clean(b.mobile));
            await audit(env,user,'CREATE','team_user',username,{role});
            return json({ok:true});
          }catch(e){
            if(/UNIQUE|constraint/i.test(String(e?.message||e)))return json({error:'Username already exists'},409);
            throw e;
          }
        }
        if(req.method==='PUT'&&id){
          if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
          const target=await first(env,`SELECT * FROM users WHERE id=? AND company_id=?`,id,companyId);
          if(!target)return json({error:'User not found'},404);
          const b=await requestBody(req),role=upper(b.role||target.role);
          if(!ROLE_PERMISSIONS[role])return json({error:'Invalid role'},400);
          await run(env,`UPDATE users SET role=?,full_name=?,email=?,mobile=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
            role,upper(b.fullName||target.full_name),clean(b.email||target.email),clean(b.mobile||target.mobile),
            b.active===false||String(b.active)==='0'?0:1,id,companyId);
          if(b.password)await run(env,`UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,await sha256(b.password),id,companyId);
          await audit(env,user,'UPDATE','team_user',id,{role,active:b.active});
          return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          if(!['OWNER','ADMIN'].includes(upper(user.role)))return json({error:'Owner/Admin permission required'},403);
          if(String(id)===String(user.id))return json({error:'You cannot disable your own login'},400);
          await run(env,`UPDATE users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,id,companyId);
          await run(env,`DELETE FROM sessions WHERE user_id=?`,id);
          await audit(env,user,'DISABLE','team_user',id,{});
          return json({ok:true});
        }
      }

      if(resource==='logout'&&req.method==='POST'){
        const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
        if(token)await run(env,`DELETE FROM sessions WHERE token=?`,token);
        return json({ok:true});
      }

      const writeRequest=!['GET','HEAD','OPTIONS'].includes(req.method);
      if(writeRequest&&!['company-profile','team-users','subscription-request','super-admin'].includes(resource)){
        try{await enforceSubscriptionWriteV59(env,user,resource,req.method)}
        catch(error){return json({error:String(error?.message||error)},Number(error?.status)||402)}
        if(!canWriteResource(user,resource))return json({error:'Your staff role does not allow this action.'},403);
      }

      // V43 advanced operations are initialized only when these tools are opened.
      if(['advanced-data','workflow-bookings','approvals','recycle-bin','system-health','backups','monthly-exports','excel-export','excel-import','settings'].includes(resource))await ensureAdvancedTables(env);

      if(resource==='settings'){
        if(req.method==='GET')return json(await readAppSettings(env,companyId));
        if(req.method==='PUT'){
          const b=await requestBody(req),result=await writeAppSettings(env,user,b),companyId=user.company_id||DEFAULT_COMPANY_ID;
          await run(env,`UPDATE companies SET company_name=?,gst_no=?,pan_no=?,mobile=?,email=?,address=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            upper(b.companyName||'MEERA LOGISTICS'),upper(b.gstNo),upper(b.pan||b.panNo),clean(b.phone||b.mobile),clean(b.email),b.address||'',companyId);
          return json(result);
        }
      }

      if(resource==='advanced-data'&&req.method==='GET'){
        await ensureDocumentStorageV62(env);
        const [bookings,approvals,recycle,backups,monthly]=await Promise.all([
          all(env,`SELECT * FROM workflow_bookings WHERE company_id=? ORDER BY booking_date DESC,created_at DESC`,companyId),
          all(env,`SELECT * FROM approval_requests WHERE company_id=? ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,created_at DESC`,companyId),
          all(env,`SELECT id,entity_type,entity_id,label,deleted_by,deleted_at FROM recycle_bin WHERE company_id=? ORDER BY deleted_at DESC LIMIT 200`,companyId),
          all(env,`SELECT id,backup_type,period_key,created_at FROM backup_snapshots WHERE company_id=? ORDER BY created_at DESC LIMIT 30`,companyId),
          all(env,`SELECT id,month_key,summary,created_at FROM monthly_exports WHERE company_id=? ORDER BY month_key DESC LIMIT 36`,companyId)
        ]);
        const [trips,invoices,documents]=await Promise.all([
          all(env,`SELECT id,trip_no,trip_date,party_name,truck_no,loading_point,unloading_point,status FROM trips WHERE company_id=? ORDER BY trip_date DESC`,companyId),
          all(env,`SELECT id,invoice_no,invoice_date,party_name,total FROM invoices WHERE company_id=? ORDER BY invoice_date DESC`,companyId),
          all(env,`SELECT id,truck_no,kind,file_name,file_type,expiry_date,notes,storage_mode,file_size,created_at FROM truck_documents WHERE company_id=? ORDER BY created_at DESC`,companyId)
        ]);
        return json({bookings,approvals,recycle,backups,monthly,trips,invoices,documents});
      }

      if(resource==='system-health'&&req.method==='GET')return json(await advancedHealth(env,companyId));

      if(resource==='workflow-bookings'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT * FROM workflow_bookings WHERE company_id=? ORDER BY booking_date DESC,created_at DESC`,companyId));
        if(req.method==='POST'&&!id){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          const rows=await all(env,`SELECT booking_no FROM workflow_bookings WHERE company_id=?`,companyId),newId=uid('BKG'),bookingNo=clean(b.bookingNo)||nextBookingNo(rows);
          await run(env,`INSERT INTO workflow_bookings(id,company_id,booking_no,booking_date,party_name,truck_no,material,loading_point,unloading_point,expected_date,status,approval_status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,'DRAFT','NOT_REQUIRED',?,?)`,newId,companyId,bookingNo,b.bookingDate||new Date().toISOString().slice(0,10),upper(b.partyName),upper(b.truckNo),upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),b.expectedDate||'',b.notes||'',user.username);
          await audit(env,user,'CREATE','booking',newId,b);return json({ok:true,id:newId,bookingNo});
        }
        if(req.method==='PUT'&&id&&!action){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          await run(env,`UPDATE workflow_bookings SET booking_date=?,party_name=?,truck_no=?,material=?,loading_point=?,unloading_point=?,expected_date=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,b.bookingDate,upper(b.partyName),upper(b.truckNo),upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),b.expectedDate||'',b.notes||'',id);
          await audit(env,user,'UPDATE','booking',id,b);return json({ok:true});
        }
        if(req.method==='POST'&&id&&action)return json(await bookingAction(env,user,id,action,await requestBody(req)));
      }

      if(resource==='approvals'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT * FROM approval_requests WHERE company_id=? ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,created_at DESC`,companyId));
        if(req.method==='POST'&&id&&['approve','reject'].includes(action))return json(await approveRequest(env,user,id,action==='approve'?'APPROVED':'REJECTED',(await requestBody(req)).notes||''));
      }

      if(resource==='recycle-bin'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET')return json(await all(env,`SELECT id,entity_type,entity_id,label,deleted_by,deleted_at FROM recycle_bin WHERE company_id=? ORDER BY deleted_at DESC LIMIT 300`,companyId));
        if(req.method==='POST'&&!id){const b=await requestBody(req);return json(await trashEntity(env,user,b.entityType,b.entityId));}
        if(req.method==='POST'&&id&&action==='restore')return json(await restoreRecycle(env,user,id));
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM recycle_bin WHERE id=? AND company_id=?`,id,companyId);return json({ok:true})}
      }

      if(resource==='backups'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET'&&!id)return json(await all(env,`SELECT id,backup_type,period_key,created_at FROM backup_snapshots WHERE company_id=? ORDER BY created_at DESC LIMIT 30`,companyId));
        if(req.method==='POST'&&!id)return json(await createBackupSnapshot(env,'MANUAL',new Date().toISOString().slice(0,10),companyId));
        if(req.method==='GET'&&id&&action==='download'){
          const item=await first(env,`SELECT * FROM backup_snapshots WHERE id=? AND company_id=?`,id,companyId);if(!item)return json({error:'Backup not found'},404);return json({id:item.id,createdAt:item.created_at,payload:JSON.parse(item.payload)});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM backup_snapshots WHERE id=? AND company_id=?`,id,companyId);return json({ok:true})}
      }

      if(resource==='monthly-exports'){
        const action=decodeURIComponent(parts[2]||'');
        if(req.method==='GET'&&!id)return json(await all(env,`SELECT id,month_key,summary,created_at FROM monthly_exports WHERE company_id=? ORDER BY month_key DESC LIMIT 36`,companyId));
        if(req.method==='POST'&&!id){const b=await requestBody(req);return json(await createMonthlyExport(env,b.monthKey||new Date().toISOString().slice(0,7),companyId))}
        if(req.method==='GET'&&id&&action==='download'){
          const item=await first(env,`SELECT * FROM monthly_exports WHERE id=? AND company_id=?`,id,companyId);if(!item)return json({error:'Monthly export not found'},404);return json({id:item.id,monthKey:item.month_key,summary:JSON.parse(item.summary||'{}'),payload:JSON.parse(item.payload)});
        }
      }

      if(resource==='excel-export'&&req.method==='GET')return json(await advancedExportPayload(env,companyId));
      if(resource==='excel-import'&&req.method==='POST')return json({ok:true,imported:await importAdvancedSheets(env,user,(await requestBody(req)).sheets||{})});

      if(resource==='bootstrap'&&req.method==='GET')return json(await bootstrap(env,user));

      if(resource==='party-ledger'&&req.method==='GET'&&id){
        await ensureAccountingSchemaV665(env);
        await repairAccountingLinksV665(env,companyId);
        const name=upper(id),key=accountKey(name);
        const party=(await all(env,`SELECT * FROM party_accounts WHERE company_id=?`,companyId)).find(x=>accountKey(x.party_name)===key)||null;
        const invoices=(await all(env,`SELECT * FROM invoices WHERE company_id=? ORDER BY invoice_date,created_at`,companyId)).filter(x=>accountKey(x.party_name)===key);
        const invoiceIds=invoices.map(x=>x.id);
        const items=invoiceIds.length?await all(env,`SELECT * FROM invoice_items WHERE company_id=? AND invoice_id IN (${invoiceIds.map(()=>'?').join(',')})`,companyId,...invoiceIds):[];
        const allPayments=await all(env,`SELECT * FROM party_payments WHERE company_id=? ORDER BY payment_date,created_at`,companyId);
        const payments=allPayments.filter(x=>accountKey(x.party_name)===key);
        const allInvoices=await all(env,`SELECT * FROM invoices WHERE company_id=?`,companyId);
        const allItems=await all(env,`SELECT * FROM invoice_items WHERE company_id=?`,companyId);
        const allocation=await partyPaymentAllocationV665(env,companyId,allInvoices,allItems,allPayments);
        for(const inv of invoices){
          const a=allocation.invoiceAllocations[String(inv.id)]||{};
          inv.received_amount=round2(a.received||0);
          inv.pending_amount=round2(a.pending??num(inv.total));
          inv.round_off=round2(a.round_off||0);
        }
        const lines=[
          ...invoices.map(x=>({date:x.invoice_date,type:'INVOICE',reference:x.invoice_no,debit:num(x.total),credit:0,notes:x.lr_no||''})),
          ...invoices.filter(x=>num(x.round_off)>0).map(x=>({date:x.invoice_date,type:'ROUND OFF',reference:x.invoice_no,debit:0,credit:num(x.round_off),notes:'Automatic settlement adjustment'})),
          ...payments.map(x=>({date:x.payment_date,type:'PAYMENT',reference:x.receipt_no||x.reference||x.id,debit:0,credit:num(x.amount),notes:x.notes||''}))
        ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        let balance=0;for(const x of lines){balance=round2(balance+x.debit-x.credit);x.balance=settledBalanceV665(balance)}
        balance=settledBalanceV665(balance);
        return json({party,invoices,payments,lines,balance,invoiceAllocations:allocation.invoiceAllocations,unallocatedCredit:round2(allocation.creditsByParty[key]||0)});
      }
      if(resource==='suppliers'){
        if(req.method==='GET')return json(await all(env,`SELECT * FROM supplier_accounts WHERE company_id=? ORDER BY CAST(REPLACE(ledger_no,'PML ','') AS INTEGER),owner_name`,companyId));
        if(req.method==='POST'){
          const b=await requestBody(req),name=upper(b.supplierName||b.ownerName);
          if(!name)return json({error:'Supplier name required'},400);
          const ledgerNo=await ensureSupplierAccountForName(env,name,companyId);
          const account=await first(env,`SELECT * FROM supplier_accounts WHERE company_id=? AND owner_name=?`,companyId,name);
          await audit(env,user,'CREATE','supplier',account?.id||'',{supplierName:name});
          return json({ok:true,id:account?.id||'',ledgerNo});
        }
        if(req.method==='PUT'&&id){
          const b=await requestBody(req),name=upper(b.supplierName||b.ownerName);
          if(!name)return json({error:'Supplier name required'},400);
          const old=await first(env,`SELECT * FROM supplier_accounts WHERE id=? AND company_id=?`,id,companyId);
          if(!old)return json({error:'Supplier not found'},404);
          const duplicate=await first(env,`SELECT id FROM supplier_accounts WHERE company_id=? AND owner_name=? AND id<>?`,companyId,name,id);
          if(duplicate)return json({error:'Supplier name already exists'},409);
          await run(env,`UPDATE supplier_accounts SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,name,id,companyId);
          if(upper(old.owner_name)!==name){
            await run(env,`UPDATE trucks SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND owner_name=?`,name,companyId,upper(old.owner_name));
            await run(env,`UPDATE trips SET supplier_name=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND supplier_name=?`,name,companyId,upper(old.owner_name));
            await run(env,`UPDATE truck_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND owner_name=?`,name,companyId,upper(old.owner_name));
            await run(env,`UPDATE supplier_payments SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND owner_name=?`,name,companyId,upper(old.owner_name));
            await run(env,`UPDATE pm_bills SET supplier_name=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND supplier_name=?`,name,companyId,upper(old.owner_name));
          }
          await audit(env,user,'UPDATE','supplier',id,{oldName:old.owner_name,supplierName:name});return json({ok:true});
        }
      }

      if(resource==='supplier-ledger'&&req.method==='GET'&&id){
        await repairAccountingLinksV665(env,companyId);
        const name=upper(id),key=accountKey(name);
        const entries=(await all(env,`SELECT * FROM truck_payments WHERE company_id=? ORDER BY entry_date,created_at`,companyId)).filter(x=>accountKey(x.owner_name)===key);
        const payments=(await all(env,`SELECT * FROM supplier_payments WHERE company_id=? ORDER BY payment_date,created_at`,companyId)).filter(x=>accountKey(x.owner_name)===key);
        const pmBills=(await all(env,`SELECT * FROM pm_bills WHERE company_id=? ORDER BY bill_date,created_at`,companyId)).filter(x=>accountKey(x.supplier_name)===key);
        const lines=[
          ...entries.map(x=>({date:x.entry_date,type:'FREIGHT',reference:x.truck_no,debit:num(x.payable),credit:0,notes:x.loading_point+' → '+x.unloading_point})),
          ...pmBills.map(x=>({date:x.bill_date,type:'PM BILL',reference:x.bill_no,debit:num(x.supplier_total),credit:0,notes:'Non-GST supplier payable'})),
          ...payments.map(x=>({date:x.payment_date,type:'PAYMENT',reference:x.receipt_no||x.reference||x.id,debit:0,credit:num(x.amount),notes:x.notes||''}))
        ].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        let balance=0;for(const x of lines){balance=round2(balance+x.debit-x.credit);x.balance=settledBalanceV665(balance)}
        return json({entries,payments,pmBills,lines,balance:settledBalanceV665(balance)});
      }

      if(resource==='accounting-audit'&&req.method==='GET')return json(await accountingAuditV58(env,user));

      if(resource==='export'&&req.method==='GET'){
        const payload=await advancedExportPayload(env,companyId);
        payload.summary=backupSummaryV665(payload.sheets);
        payload.restoreNotes=['Business data and locked payment allocations are included.','Document metadata is included; R2 file objects remain in the configured DOCS bucket.','Login passwords and subscription entitlement are intentionally not overwritten by restore.'];
        return json(payload);
      }

      if(resource==='import'&&req.method==='POST'){
        const b=await requestBody(req);
        const data=b.data||b;
        if(!data||typeof data!=='object')return json({error:'Invalid backup file'},400);
        const mode=b.mode==='replace'?'replace':'merge';
        return json(await restoreBackupV665(env,user,data,mode));
      }

      // PARTY MASTER
      if(resource==='parties'){
        if(req.method==='POST'){
          const b=await requestBody(req),name=upper(b.partyName),newId=uid('PA');
          if(!name)return json({error:'Party name required'},400);
          const existingName=await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND party_name=? LIMIT 1`,companyId,name);
          if(existingName)return json({error:'Party name already exists'},409);
          try{
            const ledgerNo=await normalizeRequestedPartyLedger(env,b.ledgerNo,'',companyId);
            await run(env,`INSERT INTO party_accounts(id,company_id,ledger_no,party_name,address,gst_no,mobile,email) VALUES(?,?,?,?,?,?,?,?)`,newId,companyId,ledgerNo,name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'');
            await audit(env,user,'CREATE','party',newId,{...b,ledgerNo});
            return json({ok:true,id:newId,ledgerNo});
          }catch(error){
            const message=String(error?.message||error);
            if(/UNIQUE|constraint|already exists/i.test(message))return json({error:message.includes('already exists')?message:'Party ledger number already exists. Please try again.'},409);
            throw error;
          }
        }
        if(req.method==='PUT'&&id){
          const b=await requestBody(req),old=await first(env,`SELECT party_name,ledger_no FROM party_accounts WHERE id=? AND company_id=?`,id,companyId),name=upper(b.partyName);
          if(!old)return json({error:'Party not found'},404);
          if(!name)return json({error:'Party name required'},400);
          const duplicateName=await first(env,`SELECT id FROM party_accounts WHERE company_id=? AND party_name=? AND id<>? LIMIT 1`,companyId,name,id);
          if(duplicateName)return json({error:'Party name already exists'},409);
          try{
            const ledgerNo=String(b.ledgerNo||old.ledger_no||'').trim()||await normalizeRequestedPartyLedger(env,'',id,companyId);
            if(ledgerNo!==String(old.ledger_no||'').trim())await normalizeRequestedPartyLedger(env,ledgerNo,id,companyId);
            await run(env,`UPDATE party_accounts SET ledger_no=?,party_name=?,address=?,gst_no=?,mobile=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,ledgerNo,name,b.address||'',upper(b.gstNo),b.mobile||'',b.email||'',id,companyId);
          }catch(error){
            const message=String(error?.message||error);
            if(/UNIQUE|constraint|already exists/i.test(message))return json({error:message.includes('already exists')?message:'Party ledger number already exists. Please try again.'},409);
            throw error;
          }
          if(old&&old.party_name!==name){
            await run(env,`UPDATE invoices SET party_name=? WHERE company_id=? AND party_name=?`,name,companyId,old.party_name);
            await run(env,`UPDATE trips SET party_name=? WHERE company_id=? AND party_name=?`,name,companyId,old.party_name);
            await run(env,`UPDATE party_payments SET party_name=? WHERE company_id=? AND party_name=?`,name,companyId,old.party_name);
          }
          await audit(env,user,'UPDATE','party',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          const p=await first(env,`SELECT party_name FROM party_accounts WHERE id=? AND company_id=?`,id,companyId);
          if(p){
            const used=await first(env,`SELECT (SELECT COUNT(*) FROM invoices WHERE company_id=? AND party_name=?)+(SELECT COUNT(*) FROM trips WHERE company_id=? AND party_name=?)+(SELECT COUNT(*) FROM party_payments WHERE company_id=? AND party_name=?) AS c`,companyId,p.party_name,companyId,p.party_name,companyId,p.party_name);
            if(num(used?.c)>0)return json({error:'Party has linked invoices, trips or payments'},409);
          }
          await run(env,`DELETE FROM party_accounts WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','party',id,{});return json({ok:true});
        }
      }

      // PARTY PAYMENTS
      if(resource==='party-payments'){
        await ensureAccountingSchemaV665(env);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          const partyName=upper(b.partyName),invoiceId=clean(b.invoiceId),tripId=clean(b.tripId);
          if(invoiceId){
            const inv=await first(env,`SELECT id,party_name,total FROM invoices WHERE id=? AND company_id=?`,invoiceId,companyId);
            if(!inv)return json({error:'Selected invoice not found for this company'},404);
            if(accountKey(inv.party_name)!==accountKey(partyName))return json({error:'Selected invoice belongs to a different party'},409);
          }
          if(tripId){
            const trip=await first(env,`SELECT id,party_name,invoice_id FROM trips WHERE id=? AND company_id=?`,tripId,companyId);
            if(!trip)return json({error:'Selected trip not found for this company'},404);
            if(accountKey(trip.party_name)!==accountKey(partyName))return json({error:'Selected trip belongs to a different party'},409);
          }
          if(req.method==='POST'){
            const newId=uid('PP'),receipt=`PR-${Date.now().toString().slice(-8)}`;
            await run(env,`INSERT INTO party_payments(id,company_id,receipt_no,invoice_id,trip_id,party_name,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
              newId,companyId,receipt,invoiceId,tripId,partyName,b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'');
            await audit(env,user,'CREATE','party_payment',newId,b);return json({ok:true,id:newId,receipt});
          }
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM party_payment_allocations WHERE payment_id=? AND company_id=?`).bind(id,companyId),
            env.DB.prepare(`UPDATE party_payments SET invoice_id=?,trip_id=?,party_name=?,payment_date=?,amount=?,payment_mode=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(
              invoiceId,tripId,partyName,b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'',id,companyId)
          ]);
          await audit(env,user,'UPDATE','party_payment',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM party_payment_allocations WHERE payment_id=? AND company_id=?`).bind(id,companyId),
            env.DB.prepare(`DELETE FROM party_payments WHERE id=? AND company_id=?`).bind(id,companyId)
          ]);
          await audit(env,user,'DELETE','party_payment',id,{});return json({ok:true})
        }
      }

      // TRUCKS
      if(resource==='trucks'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req),no=upper(b.truckNo);
          if(req.method==='POST'){
            const newId=uid('TRK');await run(env,`INSERT INTO trucks(id,company_id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?,?)`,newId,companyId,no,upper(b.ownerName),b.ownerMobile||'',b.bankDetails||'');
            await audit(env,user,'CREATE','truck',newId,b);return json({ok:true,id:newId});
          }
          const old=await first(env,`SELECT truck_no FROM trucks WHERE id=? AND company_id=?`,id,companyId);
          await run(env,`UPDATE trucks SET truck_no=?,owner_name=?,owner_mobile=?,bank_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,no,upper(b.ownerName),b.ownerMobile||'',b.bankDetails||'',id,companyId);
          if(old&&old.truck_no!==no){
            for(const table of ['trips','invoice_items','truck_payments','supplier_payments','truck_documents'])await run(env,`UPDATE ${table} SET truck_no=? WHERE company_id=? AND truck_no=?`,no,companyId,old.truck_no);
          }
          await audit(env,user,'UPDATE','truck',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){
          const t=await first(env,`SELECT truck_no FROM trucks WHERE id=? AND company_id=?`,id,companyId);
          if(t){
            const used=await first(env,`SELECT (SELECT COUNT(*) FROM trips WHERE company_id=? AND truck_no=?)+(SELECT COUNT(*) FROM truck_payments WHERE company_id=? AND truck_no=?) AS c`,companyId,t.truck_no,companyId,t.truck_no);
            if(num(used?.c)>0)return json({error:'Truck has linked trips or supplier entries'},409);
          }
          await run(env,`DELETE FROM trucks WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','truck',id,{});return json({ok:true});
        }
      }

      // TRIPS
      if(resource==='trips'){
        await ensureTripWeightColumns(env);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          if(req.method==='POST'){
            const duplicate=await first(env,`SELECT id FROM trips WHERE company_id=? AND trip_date=? AND party_name=? AND truck_no=? AND loading_point=? AND unloading_point=? AND ABS(weight-?)<0.001`,
              companyId,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.loadingPoint),upper(b.unloadingPoint),num(b.weight));
            if(duplicate)return json({error:'Duplicate trip detected'},409);
            const newId=uid('TRIP');
            const tripNo=await reserveNextTripNumber(env,companyId);
            await run(env,`INSERT INTO trips(
              id,company_id,trip_no,trip_date,party_name,truck_no,driver_name,driver_mobile,material,
              loading_point,unloading_point,lr_number,loading_weight,unloading_weight,shortage,
              billing_weight,supplier_name,weight,rate,status,notes,pod_file_name,pod_data
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              newId,companyId,tripNo,b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),
              b.driverMobile||'',upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),
              clean(b.lrNumber),round2(b.loadingWeight),round2(b.unloadingWeight),
              round2(Math.max(0,num(b.loadingWeight)-num(b.unloadingWeight))),
              round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),upper(b.supplierName),
              round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),round2(b.rate),
              upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||''
            );
            if(upper(b.supplierName)){
              await ensureSupplierAccountForName(env,b.supplierName,companyId);
              await run(env,`UPDATE truck_payments SET owner_name=?,truck_no=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND trip_id=?`,upper(b.supplierName),upper(b.truckNo),companyId,newId);
              await run(env,`UPDATE supplier_payments SET owner_name=?,truck_no=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND trip_id=?`,upper(b.supplierName),upper(b.truckNo),companyId,newId);
            }
            await audit(env,user,'CREATE','trip',newId,b);
            return json({ok:true,id:newId,tripNo});
          }

          const old=await first(env,`SELECT * FROM trips WHERE id=? AND company_id=?`,id,companyId);
          await run(env,`UPDATE trips SET
            trip_date=?,party_name=?,truck_no=?,driver_name=?,driver_mobile=?,material=?,
            loading_point=?,unloading_point=?,lr_number=?,loading_weight=?,unloading_weight=?,
            shortage=?,billing_weight=?,supplier_name=?,weight=?,rate=?,status=?,notes=?,pod_file_name=?,
            pod_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
            b.tripDate,upper(b.partyName),upper(b.truckNo),upper(b.driverName),b.driverMobile||'',
            upper(b.material),upper(b.loadingPoint),upper(b.unloadingPoint),clean(b.lrNumber),
            round2(b.loadingWeight),round2(b.unloadingWeight),
            round2(Math.max(0,num(b.loadingWeight)-num(b.unloadingWeight))),
            round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),upper(b.supplierName),
            round2(b.billingWeight||b.unloadingWeight||b.loadingWeight),round2(b.rate),
            upper(b.status||'BOOKED'),b.notes||'',b.podFileName||'',b.podData||'',id,companyId
          );
          if(upper(b.supplierName)){
            await ensureSupplierAccountForName(env,b.supplierName,companyId);
            await run(env,`UPDATE truck_payments SET owner_name=?,truck_no=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND trip_id=?`,upper(b.supplierName),upper(b.truckNo),companyId,id);
            await run(env,`UPDATE supplier_payments SET owner_name=?,truck_no=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND trip_id=?`,upper(b.supplierName),upper(b.truckNo),companyId,id);
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
              weight=?,rate=?,amount=? WHERE id=? AND company_id=?`,
              clean(b.lrNumber),upper(b.truckNo),description,loadingWeight,unloadingWeight,shortage,
              billingWeight,round2(b.rate),amount,old.invoice_item_id,companyId
            );
            if(old.invoice_id){
              await run(env,`UPDATE invoices SET party_name=?,material=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
                upper(b.partyName),upper(b.material),old.invoice_id,companyId);
              await run(env,`UPDATE invoices SET loading_date=COALESCE(
                (SELECT MIN(trip_date) FROM trips WHERE invoice_id=? AND company_id=?),loading_date
              ) WHERE id=? AND company_id=?`,old.invoice_id,companyId,old.invoice_id,companyId);
              await recalcInvoiceById(env,old.invoice_id,companyId);
            }
          }

          await audit(env,user,'UPDATE','trip',id,b);
          return json({ok:true});
        }

        if(req.method==='DELETE'&&id){
          const trip=await first(env,`SELECT * FROM trips WHERE id=? AND company_id=?`,id,companyId);
          if(!trip)return json({ok:true});
          if(trip.invoice_id){
            const count=await first(env,`SELECT COUNT(*) count FROM invoice_items WHERE invoice_id=? AND company_id=?`,trip.invoice_id,companyId);
            if(num(count?.count)<=1){
              return json({error:'This is the last trip of the linked invoice. Delete the invoice, or add another truck line first.'},409);
            }
            await run(env,`DELETE FROM invoice_items WHERE trip_id=? AND company_id=?`,id,companyId);
            await recalcInvoiceById(env,trip.invoice_id,companyId);
          }
          await run(env,`DELETE FROM truck_payments WHERE trip_id=? AND company_id=?`,id,companyId);
          await run(env,`DELETE FROM trips WHERE id=? AND company_id=?`,id,companyId);
          await audit(env,user,'DELETE','trip',id,{});
          return json({ok:true});
        }
      }

      // INVOICES
      if(resource==='invoices'){
        await ensureTripWeightColumns(env);
        await ensureAccountingSchemaV665(env);
        await repairAccountingLinksV665(env,companyId);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          const invoiceType=upper(b.invoiceType||'GST');
          const sgst=invoiceType==='NON_GST'?0:num(b.sgst);
          const cgst=invoiceType==='NON_GST'?0:num(b.cgst);
          const rawItems=Array.isArray(b.items)?b.items:[];
          const items=rawItems.map(x=>{
            const loading=round2(x.loadingWeight ?? x.loading_weight ?? x.weight);
            const unloading=round2(x.unloadingWeight ?? x.unloading_weight ?? x.weight);
            const shortage=round2(Math.max(0,loading-unloading));
            const billing=round2(x.weight ?? x.billingWeight ?? unloading);
            return {
              ...x,
              loadingDate:clean(x.loadingDate||x.loading_date||b.loadingDate||b.invoiceDate),
              lrNumber:clean(x.lrNumber||x.lr_number),
              loadingWeight:loading,
              unloadingWeight:unloading,
              shortage,
              weight:billing,
              rate:round2(x.rate),
              supplierName:upper(x.supplierName||x.supplier_name||''),
              supplierRate:round2(x.supplierRate??x.supplier_rate),
              commission:round2(x.commission),
              supplierAdvance:round2(x.supplierAdvance??x.supplier_advance)
            };
          }).filter(x=>num(x.weight)>0 && clean(x.truckNo));
          if(!items.length)return json({error:'At least one truck line is required'},400);
          const invoiceLoadingDate=items[0]?.loadingDate||b.loadingDate||b.invoiceDate;

          const freightSubtotal=round2(items.reduce((a,x)=>a+num(x.weight)*num(x.rate),0));
          const subtotal=round2(freightSubtotal+num(b.diesel)+num(b.munshi));
          const gstAmount=invoiceType==='NON_GST'?0:round2(subtotal*(sgst+cgst)/100);
          const total=round2(subtotal+gstAmount);
          let invoiceId=id;

          if(req.method==='POST'){
            invoiceId=uid('INV');
            try{
              await run(env,`INSERT INTO invoices(
                id,company_id,invoice_no,invoice_type,invoice_date,party_name,party_address,party_gst,
                lr_no,material,loading_date,sgst,cgst,diesel,munshi,subtotal,gst_amount,total,comments
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                invoiceId,companyId,clean(b.invoiceNo),invoiceType,b.invoiceDate,upper(b.partyName),b.partyAddress||'',
                upper(b.partyGst),b.lrNo||'',upper(b.material),invoiceLoadingDate||'',
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
              gst_amount=?,total=?,comments=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
              clean(b.invoiceNo),invoiceType,b.invoiceDate,upper(b.partyName),b.partyAddress||'',
              upper(b.partyGst),b.lrNo||'',upper(b.material),invoiceLoadingDate||'',
              sgst,cgst,num(b.diesel),num(b.munshi),subtotal,gstAmount,total,b.comments||'',invoiceId,companyId
            );
          }

          const oldItems=await all(env,`SELECT id,trip_id FROM invoice_items WHERE invoice_id=? AND company_id=?`,invoiceId,companyId);
          const usedTripIds=new Set();
          await run(env,`DELETE FROM invoice_items WHERE invoice_id=? AND company_id=?`,invoiceId,companyId);

          for(const x of items){
            const itemId=uid('II');
            let tripId=x.tripId||'';
            let trip=tripId?await first(env,`SELECT * FROM trips WHERE id=? AND company_id=?`,tripId,companyId):null;
            const route=splitRoute(x.description);

            if(!trip){
              tripId=uid('TRIP');
              const tripNo=await reserveNextTripNumber(env,companyId);
              await run(env,`INSERT INTO trips(
                id,company_id,trip_no,invoice_id,invoice_item_id,trip_date,party_name,truck_no,driver_name,
                driver_mobile,material,loading_point,unloading_point,lr_number,loading_weight,
                unloading_weight,shortage,billing_weight,weight,rate,status,notes
              ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                tripId,companyId,tripNo,invoiceId,itemId,x.loadingDate||b.invoiceDate,upper(b.partyName),
                upper(x.truckNo),'','',upper(b.material),route.loading,route.unloading,
                x.lrNumber,x.loadingWeight,x.unloadingWeight,x.shortage,x.weight,x.weight,x.rate,
                'BOOKED',`Created from invoice ${clean(b.invoiceNo)}`
              );
            }else{
              await run(env,`UPDATE trips SET
                invoice_id=?,invoice_item_id=?,trip_date=?,party_name=?,truck_no=?,material=?,
                loading_point=?,unloading_point=?,lr_number=?,loading_weight=?,unloading_weight=?,
                shortage=?,billing_weight=?,weight=?,rate=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
                invoiceId,itemId,x.loadingDate||b.invoiceDate,upper(b.partyName),upper(x.truckNo),
                upper(b.material),route.loading,route.unloading,x.lrNumber,x.loadingWeight,
                x.unloadingWeight,x.shortage,x.weight,x.weight,x.rate,tripId,companyId
              );
            }
            usedTripIds.add(String(tripId));

            await run(env,`INSERT INTO invoice_items(
              id,company_id,invoice_id,trip_id,lr_number,truck_no,description,loading_weight,unloading_weight,
              shortage,weight,rate,amount
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              itemId,companyId,invoiceId,tripId,x.lrNumber,upper(x.truckNo),upper(x.description),x.loadingWeight,
              x.unloadingWeight,x.shortage,x.weight,x.rate,round2(x.weight*x.rate)
            );

            // V66.4: Supplier / Truck Malik is Trip-wise even inside one multi-truck invoice.
            if(x.supplierName){
              await ensureSupplierAccountForName(env,x.supplierName,companyId);

              let truckMaster=await first(env,`SELECT * FROM trucks WHERE company_id=? AND truck_no=?`,companyId,upper(x.truckNo));
              if(!truckMaster){
                const truckId=uid('TRK');
                await run(env,`INSERT INTO trucks(id,company_id,truck_no,owner_name,owner_mobile,bank_details) VALUES(?,?,?,?,?,?)`,
                  truckId,companyId,upper(x.truckNo),upper(x.supplierName),'',''
                );
                truckMaster={id:truckId,bank_details:''};
              }else if(upper(truckMaster.owner_name)!==upper(x.supplierName)){
                await run(env,`UPDATE trucks SET owner_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
                  upper(x.supplierName),truckMaster.id,companyId
                );
              }

              const supplierWeight=round2(num(x.unloadingWeight)||num(x.loadingWeight)||num(x.weight));
              const supplierPayable=round2(supplierWeight*num(x.supplierRate)-num(x.commission));
              const oldEntry=await findTruckEntryForTripV665(env,companyId,tripId,{
                id:tripId,trip_date:x.loadingDate||b.invoiceDate,truck_no:upper(x.truckNo),supplier_name:upper(x.supplierName),
                loading_point:route.loading,unloading_point:route.unloading,unloading_weight:supplierWeight,weight:supplierWeight
              });
              if(oldEntry){
                await run(env,`UPDATE truck_payments SET
                  entry_date=?,truck_no=?,owner_name=?,bank_details=?,loading_point=?,unloading_point=?,
                  weight=?,rate=?,commission=?,payable=?,notes=?,updated_at=CURRENT_TIMESTAMP
                  WHERE id=? AND company_id=?`,
                  x.loadingDate||b.invoiceDate,upper(x.truckNo),upper(x.supplierName),truckMaster.bank_details||'',
                  route.loading,route.unloading,supplierWeight,x.supplierRate,x.commission,supplierPayable,
                  `Invoice ${clean(b.invoiceNo)} · Trip ${tripId}`,oldEntry.id,companyId
                );
              }else{
                const entryId=uid('TE');
                await run(env,`INSERT INTO truck_payments(
                  id,company_id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,
                  weight,rate,commission,payable,notes
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                  entryId,companyId,tripId,x.loadingDate||b.invoiceDate,upper(x.truckNo),upper(x.supplierName),
                  truckMaster.bank_details||'',route.loading,route.unloading,supplierWeight,x.supplierRate,
                  x.commission,supplierPayable,`Invoice ${clean(b.invoiceNo)} · Trip ${tripId}`
                );
              }

              const oldAdvance=await first(env,`SELECT * FROM supplier_payments
                WHERE company_id=? AND trip_id=? AND (UPPER(reference)='TRIP ADVANCE' OR UPPER(notes) LIKE 'ADVANCE FOR %')
                ORDER BY created_at LIMIT 1`,companyId,tripId);
              if(num(x.supplierAdvance)>0){
                if(oldAdvance){
                  await run(env,`UPDATE supplier_payments SET owner_name=?,truck_no=?,payment_date=?,amount=?,
                    payment_mode='BANK',reference='TRIP ADVANCE',notes=?,updated_at=CURRENT_TIMESTAMP
                    WHERE id=? AND company_id=?`,
                    upper(x.supplierName),upper(x.truckNo),x.loadingDate||b.invoiceDate,x.supplierAdvance,
                    `Advance for ${tripId}`,oldAdvance.id,companyId
                  );
                }else{
                  const advanceId=uid('SP'),receipt=`SP-${Date.now().toString().slice(-8)}`;
                  await run(env,`INSERT INTO supplier_payments(
                    id,company_id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes
                  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
                    advanceId,companyId,receipt,tripId,upper(x.supplierName),upper(x.truckNo),
                    x.loadingDate||b.invoiceDate,x.supplierAdvance,'BANK','TRIP ADVANCE',`Advance for ${tripId}`
                  );
                }
              }else if(oldAdvance){
                await run(env,`DELETE FROM supplier_payments WHERE id=? AND company_id=?`,oldAdvance.id,companyId);
              }
            }
          }

          // Remove trips whose truck lines were removed from the invoice.
          for(const old of oldItems){
            if(old.trip_id && !usedTripIds.has(String(old.trip_id))){
              await run(env,`DELETE FROM truck_payments WHERE trip_id=? AND company_id=?`,old.trip_id,companyId);
              await run(env,`DELETE FROM supplier_payments WHERE trip_id=? AND company_id=?`,old.trip_id,companyId);
              await run(env,`DELETE FROM trips WHERE id=? AND company_id=?`,old.trip_id,companyId);
            }
          }

          await audit(env,user,req.method==='POST'?'CREATE':'UPDATE','invoice',invoiceId,b);
          return json({ok:true,id:invoiceId,total});
        }

        if(req.method==='DELETE'&&id){
          const linked=await all(env,`SELECT trip_id FROM invoice_items WHERE invoice_id=? AND company_id=?`,id,companyId);
          for(const row of linked){
            if(row.trip_id){
              await run(env,`DELETE FROM truck_payments WHERE trip_id=? AND company_id=?`,row.trip_id,companyId);
              await run(env,`DELETE FROM trips WHERE id=? AND company_id=?`,row.trip_id,companyId);
            }
          }
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM party_payment_allocations WHERE invoice_id=? AND company_id=?`).bind(id,companyId),
            env.DB.prepare(`DELETE FROM invoice_items WHERE invoice_id=? AND company_id=?`).bind(id,companyId),
            env.DB.prepare(`DELETE FROM invoices WHERE id=? AND company_id=?`).bind(id,companyId)
          ]);
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
              await run(env,`INSERT INTO pm_bills(id,company_id,bill_no,bill_date,party_name,party_address,supplier_name,notes,subtotal,supplier_total,profit) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
                newId,companyId,clean(b.billNo),b.billDate,upper(b.partyName),b.partyAddress||'',upper(b.supplierName),b.notes||'',subtotal,supplierTotal,profit);
            }catch(e){
              if(/UNIQUE/i.test(String(e.message)))return json({error:'PM bill number already exists'},409);
              throw e;
            }
            for(const x of items){
              const partyAmount=round2(num(x.weight)*num(x.partyRate));
              const supplierAmount=round2(num(x.weight)*num(x.supplierRate));
              await run(env,`INSERT INTO pm_bill_items(id,company_id,bill_id,truck_no,loading_point,unloading_point,weight,party_rate,supplier_rate,party_amount,supplier_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
                uid('PMI'),companyId,newId,upper(x.truckNo),upper(x.loadingPoint),upper(x.unloadingPoint),round2(x.weight),round2(x.partyRate),round2(x.supplierRate),partyAmount,supplierAmount);
            }
            await audit(env,user,'CREATE','pm_bill',newId,b);
            return json({ok:true,id:newId,total:subtotal,profit});
          }

          await run(env,`UPDATE pm_bills SET bill_no=?,bill_date=?,party_name=?,party_address=?,supplier_name=?,notes=?,subtotal=?,supplier_total=?,profit=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,
            clean(b.billNo),b.billDate,upper(b.partyName),b.partyAddress||'',upper(b.supplierName),b.notes||'',subtotal,supplierTotal,profit,id,companyId);
          await run(env,`DELETE FROM pm_bill_items WHERE bill_id=? AND company_id=?`,id,companyId);
          for(const x of items){
            const partyAmount=round2(num(x.weight)*num(x.partyRate));
            const supplierAmount=round2(num(x.weight)*num(x.supplierRate));
            await run(env,`INSERT INTO pm_bill_items(id,company_id,bill_id,truck_no,loading_point,unloading_point,weight,party_rate,supplier_rate,party_amount,supplier_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
              uid('PMI'),companyId,id,upper(x.truckNo),upper(x.loadingPoint),upper(x.unloadingPoint),round2(x.weight),round2(x.partyRate),round2(x.supplierRate),partyAmount,supplierAmount);
          }
          await audit(env,user,'UPDATE','pm_bill',id,b);
          return json({ok:true,total:subtotal,profit});
        }

        if(req.method==='DELETE'&&id){
          await run(env,`DELETE FROM pm_bill_items WHERE bill_id=? AND company_id=?`,id,companyId);
          await run(env,`DELETE FROM pm_bills WHERE id=? AND company_id=?`,id,companyId);
          await audit(env,user,'DELETE','pm_bill',id,{});
          return json({ok:true});
        }
      }

      // TRUCK PAYABLE ENTRIES
      if(resource==='truck-entries'){
        await ensureAccountingSchemaV665(env);
        await repairAccountingLinksV665(env,companyId);
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          const tripId=clean(b.tripId);
          if(tripId&&!await first(env,`SELECT id FROM trips WHERE id=? AND company_id=?`,tripId,companyId))return json({error:'Selected Trip was not found for this company'},404);
          const payable=round2(num(b.weight)*num(b.rate)-num(b.commission));
          if(req.method==='POST'){
            const existing=tripId?await first(env,`SELECT id FROM truck_payments WHERE company_id=? AND trip_id=?`,companyId,tripId):null;
            if(existing){
              await run(env,`UPDATE truck_payments SET entry_date=?,truck_no=?,owner_name=?,bank_details=?,loading_point=?,unloading_point=?,weight=?,rate=?,commission=?,payable=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,b.entryDate,upper(b.truckNo),upper(b.ownerName),b.bankDetails||'',upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),round2(b.commission),payable,b.notes||'',existing.id,companyId);
              await audit(env,user,'UPDATE','truck_entry',existing.id,{...b,deduplicated:true});return json({ok:true,id:existing.id,payable,deduplicated:true});
            }
            const newId=uid('TE');await run(env,`INSERT INTO truck_payments(id,company_id,trip_id,entry_date,truck_no,owner_name,bank_details,loading_point,unloading_point,weight,rate,commission,payable,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,newId,companyId,b.tripId||'',b.entryDate,upper(b.truckNo),upper(b.ownerName),b.bankDetails||'',upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),round2(b.commission),payable,b.notes||'');
            await audit(env,user,'CREATE','truck_entry',newId,b);return json({ok:true,id:newId,payable});
          }
          await run(env,`UPDATE truck_payments SET trip_id=?,entry_date=?,truck_no=?,owner_name=?,bank_details=?,loading_point=?,unloading_point=?,weight=?,rate=?,commission=?,payable=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,b.tripId||'',b.entryDate,upper(b.truckNo),upper(b.ownerName),b.bankDetails||'',upper(b.loadingPoint),upper(b.unloadingPoint),round2(b.weight),round2(b.rate),round2(b.commission),payable,b.notes||'',id);
          await audit(env,user,'UPDATE','truck_entry',id,b);return json({ok:true,payable});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM truck_payments WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','truck_entry',id,{});return json({ok:true})}
      }

      // SUPPLIER PAYMENTS
      if(resource==='supplier-payments'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);await upsertMasters(env,b,companyId);
          if(req.method==='POST'){
            const newId=uid('SP'),receipt=`SP-${Date.now().toString().slice(-8)}`;
            await run(env,`INSERT INTO supplier_payments(id,company_id,receipt_no,trip_id,owner_name,truck_no,payment_date,amount,payment_mode,reference,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,newId,companyId,receipt,b.tripId||'',upper(b.ownerName),upper(b.truckNo),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'');
            await audit(env,user,'CREATE','supplier_payment',newId,b);return json({ok:true,id:newId,receipt});
          }
          await run(env,`UPDATE supplier_payments SET trip_id=?,owner_name=?,truck_no=?,payment_date=?,amount=?,payment_mode=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,b.tripId||'',upper(b.ownerName),upper(b.truckNo),b.paymentDate,round2(b.amount),upper(b.paymentMode),b.reference||'',b.notes||'',id,companyId);
          await audit(env,user,'UPDATE','supplier_payment',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM supplier_payments WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','supplier_payment',id,{});return json({ok:true})}
      }

      // ROUTES & MATERIALS
      if(resource==='routes'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);
          if(req.method==='POST'){const newId=uid('RTE');await run(env,`INSERT INTO routes(id,company_id,loading_point,unloading_point) VALUES(?,?,?,?)`,newId,companyId,upper(b.loadingPoint),upper(b.unloadingPoint));await audit(env,user,'CREATE','route',newId,b);return json({ok:true,id:newId})}
          await run(env,`UPDATE routes SET loading_point=?,unloading_point=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,upper(b.loadingPoint),upper(b.unloadingPoint),id,companyId);await audit(env,user,'UPDATE','route',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM routes WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','route',id,{});return json({ok:true})}
      }
      if(resource==='materials'){
        if(req.method==='POST'){const b=await requestBody(req),newId=uid('MAT');await run(env,`INSERT INTO materials(id,company_id,material_name) VALUES(?,?,?)`,newId,companyId,upper(b.materialName));await audit(env,user,'CREATE','material',newId,b);return json({ok:true,id:newId})}
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM materials WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','material',id,{});return json({ok:true})}
      }

      // EXPENSES
      if(resource==='expenses'){
        if(req.method==='POST'||(req.method==='PUT'&&id)){
          const b=await requestBody(req);
          if(req.method==='POST'){const newId=uid('EXP');await run(env,`INSERT INTO expenses(id,company_id,trip_id,expense_date,category,amount,notes) VALUES(?,?,?,?,?,?,?)`,newId,companyId,b.tripId||'',b.expenseDate,upper(b.category),round2(b.amount),b.notes||'');await audit(env,user,'CREATE','expense',newId,b);return json({ok:true,id:newId})}
          await run(env,`UPDATE expenses SET trip_id=?,expense_date=?,category=?,amount=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`,b.tripId||'',b.expenseDate,upper(b.category),round2(b.amount),b.notes||'',id,companyId);await audit(env,user,'UPDATE','expense',id,b);return json({ok:true});
        }
        if(req.method==='DELETE'&&id){await run(env,`DELETE FROM expenses WHERE id=? AND company_id=?`,id,companyId);await audit(env,user,'DELETE','expense',id,{});return json({ok:true})}
      }

      // DOCUMENTS
      if(resource==='notifications'&&req.method==='GET')return json(await notificationFeedV62(env,user));

      if(resource==='document-storage-status'&&req.method==='GET'){
        await ensureDocumentStorageV62(env);
        const mode=documentStorageModeV62(env);
        const stats=await first(env,`SELECT COUNT(*) count,COALESCE(SUM(file_size),0) bytes FROM truck_documents WHERE company_id=?`,companyId);
        return json({mode,r2Configured:mode==='R2',documents:Number(stats?.count||0),bytes:Number(stats?.bytes||0),
          message:mode==='R2'?'Cloudflare R2 DOCS binding active.':'Safe D1 fallback active. Add Cloudflare R2 binding DOCS for scalable file storage.'});
      }

      if(resource==='document-content'&&req.method==='GET'&&id)return documentBinaryResponseV62(env,user,id);

      if(resource==='documents'){
        await ensureDocumentStorageV62(env);
        if(req.method==='POST'){
          const contentType=req.headers.get('content-type')||'';
          let b={},file=null;
          if(contentType.includes('multipart/form-data')){
            const fd=await req.formData();
            b={
              truckNo:fd.get('truckNo')||'',kind:fd.get('kind')||'',expiryDate:fd.get('expiryDate')||'',
              notes:fd.get('notes')||'',fileName:fd.get('fileName')||'',fileType:fd.get('fileType')||''
            };
            const candidate=fd.get('file');
            if(candidate&&typeof candidate.arrayBuffer==='function')file=candidate;
          }else{
            b=await requestBody(req);
          }
          if(!upper(b.truckNo)||!upper(b.kind))return json({error:'Truck Number and Document Type required'},400);
          if(!file&&!b.fileData)return json({error:'Document file required'},400);
          const newId=uid('DOC');
          const fileName=(file?.name||b.fileName||'document').toString();
          const fileType=(file?.type||b.fileType||'application/octet-stream').toString();
          const saved=await saveDocumentBlobV62(env,companyId,newId,fileName,fileType,file||b.fileData);
          await run(env,`INSERT INTO truck_documents(
            id,company_id,truck_no,kind,file_name,file_type,file_data,expiry_date,notes,storage_key,storage_mode,file_size
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            newId,companyId,upper(b.truckNo),upper(b.kind),fileName,saved.fileType,saved.fileData,b.expiryDate||'',b.notes||'',
            saved.storageKey,saved.storageMode,saved.fileSize);
          await audit(env,user,'CREATE','document',newId,{
            truckNo:upper(b.truckNo),kind:upper(b.kind),fileName,fileType:saved.fileType,fileSize:saved.fileSize,storageMode:saved.storageMode
          });
          return json({ok:true,id:newId,storageMode:saved.storageMode,fileSize:saved.fileSize});
        }
        if(req.method==='GET'&&id){
          const d=await first(env,`SELECT id,company_id,truck_no,kind,file_name,file_type,expiry_date,notes,storage_mode,file_size,created_at
            FROM truck_documents WHERE id=? AND company_id=?`,id,companyId);
          if(!d)return json({error:'File not found'},404);
          return json({...d,contentPath:`/document-content/${encodeURIComponent(d.id)}`});
        }
        if(req.method==='DELETE'&&id){
          const d=await first(env,`SELECT id,storage_key,storage_mode FROM truck_documents WHERE id=? AND company_id=?`,id,companyId);
          if(!d)return json({error:'File not found'},404);
          if(String(d.storage_mode||'').toUpperCase()==='R2'&&d.storage_key&&env?.DOCS){
            try{await env.DOCS.delete(d.storage_key)}catch(_){}
          }
          await run(env,`DELETE FROM truck_documents WHERE id=? AND company_id=?`,id,companyId);
          await audit(env,user,'DELETE','document',id,{storageMode:d.storage_mode||'D1'});
          return json({ok:true})
        }
      }

      return json({error:'Not found'},404);
    }catch(e){
      return json({error:String(e?.message||e)},Number(e?.status)||500);
    }
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(runScheduledTasks(env,controller?.scheduledTime||Date.now()));
  }
};
