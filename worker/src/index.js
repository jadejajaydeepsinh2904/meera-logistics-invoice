
const CORS={
  'content-type':'application/json',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,content-type',
  'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'
};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:CORS});
const uid=p=>`${p}-${crypto.randomUUID()}`;
const num=x=>Number(x||0);
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function auth(req,env){
  const t=(req.headers.get('authorization')||'').replace('Bearer ','');
  if(!t)return null;
  return await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.active=1`).bind(t).first();
}
async function body(req){return await req.json().catch(()=>({}))}
async function all(env,sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results}
async function run(env,sql,...args){return await env.DB.prepare(sql).bind(...args).run()}
function routeParts(path){return path.replace(/^\/api\/?/,'').split('/').filter(Boolean)}
function normalizeName(s=''){return String(s).trim().replace(/\s+/g,' ').toUpperCase()}
async function auditLog(env,userId,action,entity,entityId,payload){
  await run(env,`INSERT INTO audit_logs(id,user_id,action,entity,entity_id,payload,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    uid('AUD'),userId,action,entity,entityId,JSON.stringify(payload||{}));
}

export default {async fetch(req,env){
  if(req.method==='OPTIONS') return json({});
  const url=new URL(req.url), parts=routeParts(url.pathname), resource=parts[0]||'', rid=parts[1]||'';
  try{
    if(resource==='login'&&req.method==='POST'){
      const b=await body(req),hash=await sha256(b.password||'');
      const user=await env.DB.prepare('SELECT * FROM users WHERE username=? AND password_hash=? AND active=1').bind(b.username,hash).first();
      if(!user)return json({error:'Invalid username or password'},401);
      const token=crypto.randomUUID();
      await run(env,"INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))",token,user.id);
      return json({token,user:{id:user.id,username:user.username,role:user.role}});
    }

    const user=await auth(req,env);
    if(!user)return json({error:'Unauthorized'},401);

    if(resource==='bootstrap'&&req.method==='GET'){
      const [trips,invoices,partyAccounts,partyPayments,trucks,routes,truckPayments,expenses,materials,documents,audits]=await Promise.all([
        all(env,'SELECT * FROM trips ORDER BY trip_date DESC, created_at DESC'),
        all(env,'SELECT * FROM invoices ORDER BY invoice_date DESC, created_at DESC'),
        all(env,'SELECT * FROM party_accounts ORDER BY ledger_no'),
        all(env,'SELECT * FROM party_payments ORDER BY payment_date DESC, created_at DESC'),
        all(env,'SELECT * FROM trucks ORDER BY truck_no'),
        all(env,'SELECT * FROM routes ORDER BY loading_point, unloading_point'),
        all(env,'SELECT * FROM truck_payments ORDER BY entry_date DESC, created_at DESC'),
        all(env,'SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC'),
        all(env,'SELECT * FROM materials ORDER BY material_name'),
        all(env,'SELECT * FROM truck_documents ORDER BY created_at DESC'),
        all(env,'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100')
      ]);

      const pm={};
      for(const a of partyAccounts)pm[a.party_name]={...a,billed:0,received:0};
      for(const i of invoices){const n=i.party_name;pm[n]??={party_name:n,billed:0,received:0};pm[n].billed+=num(i.total)}
      for(const p of partyPayments){const n=p.party_name;pm[n]??={party_name:n,billed:0,received:0};pm[n].received+=num(p.amount)}
      const partyLedger=Object.values(pm).map(x=>({...x,outstanding:num(x.billed)-num(x.received)})).sort((a,b)=>b.outstanding-a.outstanding);

      const sm={};
      for(const x of truckPayments){
        const n=x.owner_name||'UNKNOWN';
        sm[n]??={owner_name:n,entry_count:0,payable:0,paid:0,pending:0,trucks:new Set()};
        sm[n].entry_count++;sm[n].payable+=num(x.payable);sm[n].paid+=num(x.paid_amount);sm[n].pending+=num(x.pending);sm[n].trucks.add(x.truck_no);
      }
      const supplierLedger=Object.values(sm).map(x=>({...x,truck_count:x.trucks.size,trucks:undefined})).sort((a,b)=>b.pending-a.pending);

      const totalBilling=invoices.reduce((a,x)=>a+num(x.total),0);
      const invoiceSubtotal=invoices.reduce((a,x)=>a+num(x.subtotal),0);
      const partyReceived=partyPayments.reduce((a,x)=>a+num(x.amount),0);
      const supplierPayable=truckPayments.reduce((a,x)=>a+num(x.payable),0);
      const supplierPaid=truckPayments.reduce((a,x)=>a+num(x.paid_amount),0);
      const supplierPending=truckPayments.reduce((a,x)=>a+num(x.pending),0);
      const expenseTotal=expenses.reduce((a,x)=>a+num(x.amount),0);
      const audit=[];
      for(const x of partyLedger)if(x.outstanding<-.01)audit.push(`${x.party_name}: payment exceeds billing by ${Math.abs(x.outstanding).toFixed(2)}`);
      for(const t of trips)if(!invoices.some(i=>String(i.trip_id||'')===String(t.id)))audit.push(`Trip ${t.id} (${t.truck_no}) has no linked invoice`);
      for(const i of invoices)if(i.trip_id&&!trips.some(t=>String(t.id)===String(i.trip_id)))audit.push(`Invoice ${i.invoice_no} links to missing trip ${i.trip_id}`);

      return json({
        user:{id:user.id,username:user.username,role:user.role},
        trips,invoices,partyAccounts,partyPayments,trucks,routes,truckPayments,expenses,materials,documents,
        partyLedger,supplierLedger,audit,audits,
        summary:{
          totalBilling,invoiceSubtotal,partyReceived,partyOutstanding:totalBilling-partyReceived,
          supplierPayable,supplierPaid,supplierPending,expenses:expenseTotal,
          estimatedProfit:invoiceSubtotal-supplierPayable-expenseTotal
        }
      });
    }

    if(resource==='export'&&req.method==='GET'){
      const data={
        trips:await all(env,'SELECT * FROM trips'),
        invoices:await all(env,'SELECT * FROM invoices'),
        partyAccounts:await all(env,'SELECT * FROM party_accounts'),
        partyPayments:await all(env,'SELECT * FROM party_payments'),
        trucks:await all(env,'SELECT * FROM trucks'),
        routes:await all(env,'SELECT * FROM routes'),
        truckPayments:await all(env,'SELECT * FROM truck_payments'),
        expenses:await all(env,'SELECT * FROM expenses'),
        materials:await all(env,'SELECT * FROM materials'),
        documents:await all(env,'SELECT * FROM truck_documents')
      };
      return json(data);
    }

    // Trips CRUD
    if(resource==='trips'){
      if(req.method==='POST'){
        const b=await body(req),id=uid('TRIP');
        const dup=await env.DB.prepare(`SELECT id FROM trips WHERE trip_date=? AND party_name=? AND truck_no=? AND loading_point=? AND unloading_point=? AND ABS(weight-?)<0.001`).bind(
          b.tripDate,normalizeName(b.partyName),normalizeName(b.truckNo),normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),num(b.weight)).first();
        if(dup)return json({error:'Duplicate trip detected'},409);
        await run(env,`INSERT INTO trips(id,trip_date,party_name,truck_no,loading_point,unloading_point,material,weight,rate,status,pod_file_name,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          id,b.tripDate,normalizeName(b.partyName),normalizeName(b.truckNo),normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),normalizeName(b.material),num(b.weight),num(b.rate),b.status||'BOOKED',b.podFileName||'');
        await auditLog(env,user.id,'CREATE','trip',id,b);return json({ok:true,id});
      }
      if(req.method==='PUT'&&rid){
        const b=await body(req);
        await run(env,`UPDATE trips SET trip_date=?,party_name=?,truck_no=?,loading_point=?,unloading_point=?,material=?,weight=?,rate=?,status=?,pod_file_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          b.tripDate,normalizeName(b.partyName),normalizeName(b.truckNo),normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),normalizeName(b.material),num(b.weight),num(b.rate),b.status||'BOOKED',b.podFileName||'',rid);
        await auditLog(env,user.id,'UPDATE','trip',rid,b);return json({ok:true});
      }
      if(req.method==='DELETE'&&rid){
        const linked=await env.DB.prepare('SELECT id FROM invoices WHERE trip_id=?').bind(rid).first();
        if(linked)return json({error:'Delete linked invoice first'},409);
        await run(env,'DELETE FROM trips WHERE id=?',rid);await auditLog(env,user.id,'DELETE','trip',rid,{});return json({ok:true});
      }
    }

    // Invoices CRUD
    if(resource==='invoices'){
      if(req.method==='POST'||(req.method==='PUT'&&rid)){
        const b=await body(req),subtotal=num(b.weight)*num(b.rate)+num(b.diesel)+num(b.munshi),gst=num(b.gstPercent),gstAmount=subtotal*gst/100,total=subtotal+gstAmount;
        if(req.method==='POST'){
          const id=uid('INV');
          try{
            await run(env,`INSERT INTO invoices(id,invoice_no,invoice_date,party_name,trip_id,lr_no,material,truck_no,weight,rate,diesel,munshi,subtotal,gst_percent,gst_amount,total,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
              id,b.invoiceNo,b.invoiceDate,normalizeName(b.partyName),b.tripId||'',b.lrNo||'',normalizeName(b.material),normalizeName(b.truckNo),num(b.weight),num(b.rate),num(b.diesel),num(b.munshi),subtotal,gst,gstAmount,total);
          }catch(e){if(String(e.message).includes('UNIQUE'))return json({error:'Invoice number already exists'},409);throw e}
          await auditLog(env,user.id,'CREATE','invoice',id,b);return json({ok:true,id,total});
        }else{
          await run(env,`UPDATE invoices SET invoice_no=?,invoice_date=?,party_name=?,trip_id=?,lr_no=?,material=?,truck_no=?,weight=?,rate=?,diesel=?,munshi=?,subtotal=?,gst_percent=?,gst_amount=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            b.invoiceNo,b.invoiceDate,normalizeName(b.partyName),b.tripId||'',b.lrNo||'',normalizeName(b.material),normalizeName(b.truckNo),num(b.weight),num(b.rate),num(b.diesel),num(b.munshi),subtotal,gst,gstAmount,total,rid);
          await auditLog(env,user.id,'UPDATE','invoice',rid,b);return json({ok:true,total});
        }
      }
      if(req.method==='DELETE'&&rid){
        await run(env,'DELETE FROM invoices WHERE id=?',rid);await auditLog(env,user.id,'DELETE','invoice',rid,{});return json({ok:true});
      }
    }

    // Party accounts CRUD
    if(resource==='party-accounts'){
      if(req.method==='POST'){const b=await body(req),id=uid('PA');await run(env,'INSERT INTO party_accounts(id,ledger_no,party_name) VALUES(?,?,?)',id,b.ledgerNo,normalizeName(b.partyName));await auditLog(env,user.id,'CREATE','party_account',id,b);return json({ok:true,id})}
      if(req.method==='PUT'&&rid){const b=await body(req);await run(env,'UPDATE party_accounts SET ledger_no=?,party_name=? WHERE id=?',b.ledgerNo,normalizeName(b.partyName),rid);await auditLog(env,user.id,'UPDATE','party_account',rid,b);return json({ok:true})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM party_accounts WHERE id=?',rid);await auditLog(env,user.id,'DELETE','party_account',rid,{});return json({ok:true})}
    }

    // Party payments CRUD
    if(resource==='party-payments'){
      if(req.method==='POST'){const b=await body(req),id=uid('PP');await run(env,'INSERT INTO party_payments(id,party_name,payment_date,amount,payment_mode,reference,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',id,normalizeName(b.partyName),b.paymentDate,num(b.amount),b.paymentMode,b.reference||'',b.notes||'');await auditLog(env,user.id,'CREATE','party_payment',id,b);return json({ok:true,id})}
      if(req.method==='PUT'&&rid){const b=await body(req);await run(env,'UPDATE party_payments SET party_name=?,payment_date=?,amount=?,payment_mode=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',normalizeName(b.partyName),b.paymentDate,num(b.amount),b.paymentMode,b.reference||'',b.notes||'',rid);await auditLog(env,user.id,'UPDATE','party_payment',rid,b);return json({ok:true})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM party_payments WHERE id=?',rid);await auditLog(env,user.id,'DELETE','party_payment',rid,{});return json({ok:true})}
    }

    // Truck payments CRUD
    if(resource==='truck-payments'){
      if(req.method==='POST'||(req.method==='PUT'&&rid)){
        const b=await body(req),payable=num(b.weight)*num(b.rate)-num(b.commission),paid=num(b.paidAmount),pending=payable-paid;
        if(req.method==='POST'){
          const id=uid('TP');
          await run(env,`INSERT INTO truck_payments(id,entry_date,truck_no,owner_name,loading_point,unloading_point,weight,rate,commission,payable,paid_amount,pending,notes,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            id,b.entryDate,normalizeName(b.truckNo),normalizeName(b.ownerName),normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),num(b.weight),num(b.rate),num(b.commission),payable,paid,pending,b.notes||'');
          await auditLog(env,user.id,'CREATE','truck_payment',id,b);return json({ok:true,id});
        }else{
          await run(env,`UPDATE truck_payments SET entry_date=?,truck_no=?,owner_name=?,loading_point=?,unloading_point=?,weight=?,rate=?,commission=?,payable=?,paid_amount=?,pending=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            b.entryDate,normalizeName(b.truckNo),normalizeName(b.ownerName),normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),num(b.weight),num(b.rate),num(b.commission),payable,paid,pending,b.notes||'',rid);
          await auditLog(env,user.id,'UPDATE','truck_payment',rid,b);return json({ok:true});
        }
      }
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM truck_payments WHERE id=?',rid);await auditLog(env,user.id,'DELETE','truck_payment',rid,{});return json({ok:true})}
    }

    // Trucks CRUD
    if(resource==='trucks'){
      if(req.method==='POST'){const b=await body(req),id=uid('TRK');await run(env,'INSERT INTO trucks(id,truck_no,owner_name,bank_details,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',id,normalizeName(b.truckNo),normalizeName(b.ownerName),b.bankDetails||'');await auditLog(env,user.id,'CREATE','truck',id,b);return json({ok:true,id})}
      if(req.method==='PUT'&&rid){const b=await body(req);await run(env,'UPDATE trucks SET truck_no=?,owner_name=?,bank_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',normalizeName(b.truckNo),normalizeName(b.ownerName),b.bankDetails||'',rid);await auditLog(env,user.id,'UPDATE','truck',rid,b);return json({ok:true})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM trucks WHERE id=?',rid);await auditLog(env,user.id,'DELETE','truck',rid,{});return json({ok:true})}
    }

    // Routes CRUD
    if(resource==='routes'){
      if(req.method==='POST'){const b=await body(req),id=uid('RTE');await run(env,'INSERT INTO routes(id,loading_point,unloading_point,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)',id,normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint));await auditLog(env,user.id,'CREATE','route',id,b);return json({ok:true,id})}
      if(req.method==='PUT'&&rid){const b=await body(req);await run(env,'UPDATE routes SET loading_point=?,unloading_point=? WHERE id=?',normalizeName(b.loadingPoint),normalizeName(b.unloadingPoint),rid);await auditLog(env,user.id,'UPDATE','route',rid,b);return json({ok:true})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM routes WHERE id=?',rid);await auditLog(env,user.id,'DELETE','route',rid,{});return json({ok:true})}
    }

    // Materials CRUD
    if(resource==='materials'){
      if(req.method==='POST'){const b=await body(req),id=uid('MAT');await run(env,'INSERT INTO materials(id,material_name,created_at) VALUES(?,?,CURRENT_TIMESTAMP)',id,normalizeName(b.materialName));await auditLog(env,user.id,'CREATE','material',id,b);return json({ok:true,id})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM materials WHERE id=?',rid);await auditLog(env,user.id,'DELETE','material',rid,{});return json({ok:true})}
    }

    // Expenses CRUD
    if(resource==='expenses'){
      if(req.method==='POST'){const b=await body(req),id=uid('EXP');await run(env,'INSERT INTO expenses(id,expense_date,category,amount,notes,created_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',id,b.expenseDate,normalizeName(b.category),num(b.amount),b.notes||'');await auditLog(env,user.id,'CREATE','expense',id,b);return json({ok:true,id})}
      if(req.method==='PUT'&&rid){const b=await body(req);await run(env,'UPDATE expenses SET expense_date=?,category=?,amount=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',b.expenseDate,normalizeName(b.category),num(b.amount),b.notes||'',rid);await auditLog(env,user.id,'UPDATE','expense',rid,b);return json({ok:true})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM expenses WHERE id=?',rid);await auditLog(env,user.id,'DELETE','expense',rid,{});return json({ok:true})}
    }

    // Document metadata CRUD (URL based; can point to R2/Drive)
    if(resource==='documents'){
      if(req.method==='POST'){const b=await body(req),id=uid('DOC');await run(env,'INSERT INTO truck_documents(id,truck_no,kind,file_name,file_url,expiry_date,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)',id,normalizeName(b.truckNo),normalizeName(b.kind),b.fileName||'',b.fileUrl||'',b.expiryDate||'');await auditLog(env,user.id,'CREATE','document',id,b);return json({ok:true,id})}
      if(req.method==='DELETE'&&rid){await run(env,'DELETE FROM truck_documents WHERE id=?',rid);await auditLog(env,user.id,'DELETE','document',rid,{});return json({ok:true})}
    }

    return json({error:'Not found'},404);
  }catch(e){return json({error:e.message||String(e)},500)}
}};
