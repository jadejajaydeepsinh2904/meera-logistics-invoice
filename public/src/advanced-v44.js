import {api,apiBlob} from './core/api.js';

const A43={overlay:null,data:null,bootstrap:null,month:new Date().toISOString().slice(0,7)};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate=v=>{if(!v)return '-';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:v};
const safeName=v=>String(v||'MEERA').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)};
const toast=(text,type='ok')=>{let t=document.querySelector('.a43-toast');if(!t){t=document.createElement('div');t.className='a43-toast';document.body.appendChild(t)}t.className=`a43-toast ${type}`;t.textContent=text;t.hidden=false;clearTimeout(t._timer);t._timer=setTimeout(()=>t.hidden=true,3200)};

async function loadAdvanced(force=false){
  if(!force&&A43.data)return A43.data;
  A43.data=await api('/advanced-data');
  return A43.data;
}
async function loadBootstrap(force=false){
  if(!force&&A43.bootstrap)return A43.bootstrap;
  A43.bootstrap=await api('/bootstrap');
  return A43.bootstrap;
}
function closeAdvanced(){A43.overlay?.remove();A43.overlay=null}
function modal(title,body,actions=''){
  closeAdvanced();
  const host=document.createElement('div');host.className='a43-overlay';
  host.innerHTML=`<section class="a43-modal"><header><div><b>${esc(title)}</b><small>Meera Logistics Smart Operations</small></div><div class="a43-head-actions">${actions}<button data-a43-close>Close</button></div></header><main>${body}</main></section>`;
  document.body.appendChild(host);A43.overlay=host;
  host.querySelector('[data-a43-close]').onclick=closeAdvanced;
  host.addEventListener('click',e=>{if(e.target===host)closeAdvanced()});
  return host;
}
function loading(title){return modal(title,'<div class="a43-loading">Loading…</div>')}
function statusBadge(v){const s=String(v||'').toUpperCase();return `<span class="a43-badge ${s.toLowerCase()}">${esc(s||'-')}</span>`}
function toolCard(icon,title,text,action){return `<button class="a43-tool-card" data-a43-tool="${action}"><span>${icon}</span><b>${esc(title)}</b><small>${esc(text)}</small></button>`}

function openTools(){
  const host=modal('Smart Tools',`<div class="a43-tools-grid">
    ${toolCard('📅','Calendar','Trips, bookings, invoices and expiry dates','calendar')}
    ${toolCard('🔔','Notifications','Outstanding, supplier pending, expiry, approvals and trial alerts','notifications')}
    ${toolCard('🚚','Booking Workflow','Booking → Approval → Dispatch → Trip','workflow')}
    ${toolCard('✅','Approvals','Pending booking approvals','approvals')}
    ${toolCard('♻️','Recycle Bin','Restore deleted records safely','recycle')}
    ${toolCard('🩺','System Health','Database and ledger diagnostics','health')}
    ${toolCard('📊','Excel Center','Full export, import and monthly files','excel')}
    ${toolCard('☁️','Scheduled Backups','Daily Cloudflare backup snapshots','backups')}
    ${toolCard('🖼️','Truck Gallery','Multiple document images per truck','gallery')}
    ${toolCard('🏢','Company & Plan','Company profile, subscription and usage','saas')}
    ${window.ML_PLATFORM_ADMIN?toolCard('🛡️','Super Admin','Companies, trials, plan requests and platform controls','superadmin'):''}
    ${toolCard('👥','Team & Access','Owner, Admin, Accountant, Operator and Viewer','team')}
    ${toolCard('⚙️','Settings','Company details, interface and backup defaults','settings')}
  </div><div class="a43-tip"><b>Command Palette:</b> keyboard par <kbd>Ctrl</kbd> + <kbd>K</kbd></div>`);
  host.querySelectorAll('[data-a43-tool]').forEach(b=>b.onclick=()=>openFeature(b.dataset.a43Tool));
}
async function openFeature(name){
  const map={calendar:openCalendar,notifications:openNotificationsV62,workflow:openWorkflow,approvals:openApprovals,recycle:openRecycle,health:openHealth,excel:openExcel,backups:openBackups,gallery:openGallery,saas:openSaasCenter,superadmin:openSuperAdminV60,team:openTeamAccess,settings:openSettings};
  return map[name]?.();
}



function planFeatureList(features={}){
  const labels={calendar:'Calendar',trip:'Trips',invoice:'Invoices',ledger:'Ledgers',reports:'Reports',approvals:'Approval',excel:'Excel',offline:'Offline/PWA',documents:'Documents',team:'Team',prioritySupport:'Priority Support'};
  return Object.entries(features).filter(([,v])=>v).map(([k])=>`<span class="v49-chip">${esc(labels[k]||k)}</span>`).join('');
}
function v59PlanPrice(p,cycle='MONTHLY'){
  const n=Number(cycle==='YEARLY'?p.yearly_price:p.monthly_price||0);
  return n>0?`₹${n.toLocaleString('en-IN')}${cycle==='YEARLY'?'/year':'/month'}`:'Price via Play Billing';
}
async function openSaasCenter(){
  const host=loading('Company & Subscription');
  try{
    const [ctx,plans,requests]=await Promise.all([api('/saas-context'),api('/saas-plans'),api('/subscription-request').catch(()=>[])]);
    const c=ctx.company||{},s=ctx.subscription||{},u=ctx.usage||{},pending=ctx.pendingRequest||requests?.find?.(x=>x.status==='PENDING');
    const days=ctx.daysRemaining;
    host.querySelector('main').innerHTML=`
      <div class="v49-summary-grid">
        <div class="v49-summary"><small>COMPANY</small><b>${esc(c.company_name||'-')}</b><span>${esc(c.company_code||'')}</span></div>
        <div class="v49-summary"><small>CURRENT PLAN</small><b>${esc(s.plan_name||s.plan_id||'-')}</b><span>${esc(s.status||'-')}${s.status==='TRIAL'&&days!==null?` · ${days} days left`:''}</span></div>
        <div class="v49-summary"><small>YOUR ROLE</small><b>${esc(ctx.role||'-')}</b><span>${(ctx.permissions||[]).includes('*')?'Full access':'Limited access'}</span></div>
        <div class="v49-summary"><small>THIS MONTH</small><b>${u.trips||0}/${s.max_trips_month||0} Trips · ${u.invoices||0}/${s.max_invoices_month||0} Bills</b><span>${u.users||0}/${s.max_users||1} users</span></div>
      </div>
      ${ctx.readOnly?`<div class="v59-plan-alert expired"><b>Read Only Mode</b><span>${esc(ctx.accessMessage||'Subscription expired.')}</span></div>`:
        s.status==='TRIAL'?`<div class="v59-plan-alert trial"><b>14-Day Trial</b><span>${esc(ctx.accessMessage||'')} · Your existing data stays safe after trial expiry.</span></div>`:''}
      ${pending?`<div class="v59-plan-alert pending"><b>Plan request pending</b><span>${esc(pending.requested_plan_id)} · ${esc(pending.billing_cycle)} · requested ${esc(pending.created_at||'')}</span></div>`:''}
      <form id="v49CompanyForm" class="a43-form a44-settings-form">
        <div class="a44-settings-section wide"><b>Company Profile</b><small>This company workspace is isolated from every other transporter.</small></div>
        ${settingField('Company Name','companyName',c.company_name||'')}
        ${settingField('Legal Name','legalName',c.legal_name||'')}
        ${settingField('GST Number','gstNo',c.gst_no||'')}
        ${settingField('PAN Number','panNo',c.pan_no||'')}
        ${settingField('Mobile','mobile',c.mobile||'')}
        ${settingField('Email','email',c.email||'','email')}
        <label class="wide"><span>Address</span><textarea name="address">${esc(c.address||'')}</textarea></label>
        ${settingField('GST Invoice Prefix','invoicePrefix',c.invoice_prefix||'ML')}
        ${settingField('Non-GST Prefix','nonGstPrefix',c.non_gst_prefix||'JAY')}
        ${settingField('Trip Prefix','tripPrefix',c.trip_prefix||'TR')}
        ${settingField('Supplier Prefix','supplierPrefix',c.supplier_prefix||'PML')}
        <div class="a43-form-actions wide"><button class="primary">Save Company</button></div>
      </form>
      <div class="a44-settings-section"><b>Subscription Plans</b><small>Usage limits are enforced now. Paid purchase activation will connect to Google Play Billing in the Android billing phase.</small></div>
      <div class="v49-plan-grid">${plans.map(p=>`
        <div class="v49-plan ${p.id===s.plan_id?'current':''}">
          <small>${esc(p.id)}</small><h3>${esc(p.plan_name)}</h3>
          <div class="v59-plan-price">${v59PlanPrice(p)}</div>
          <p>${p.max_users} users · ${p.max_trips_month>=999999?'Unlimited':p.max_trips_month} trips/month · ${p.max_invoices_month>=999999?'Unlimited':p.max_invoices_month} invoices/month · ${p.max_storage_mb} MB storage</p>
          <div class="v49-chips">${planFeatureList(p.features||{})}</div>
          ${p.id===s.plan_id?`<button type="button" disabled>Current Plan</button>`:
            p.id==='TRIAL'?`<button type="button" disabled>Trial only</button>`:
            `<button type="button" data-v59-request-plan="${p.id}" ${pending?'disabled':''}>${pending?'Request Pending':'Request '+esc(p.plan_name)}</button>`}
        </div>`).join('')}</div>
      <div class="v49-note"><b>Billing status:</b> Plan limits, expiry and read-only mode are live. Plan request does not activate paid access by itself; secure Google Play purchase verification will activate it later.</div>`;
    host.querySelector('#v49CompanyForm').onsubmit=async e=>{
      e.preventDefault();
      try{
        await api('/company-profile',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});
        toast('Company profile saved');closeAdvanced();openSaasCenter();
      }catch(err){alert(err.message)}
    };
    host.querySelectorAll('[data-v59-request-plan]').forEach(btn=>btn.onclick=async()=>{
      const planId=btn.dataset.v59RequestPlan;
      const cycle=confirm(`Request ${planId} YEARLY plan?\nPress Cancel for MONTHLY.`)?'YEARLY':'MONTHLY';
      btn.disabled=true;
      try{
        await api('/subscription-request',{method:'POST',body:JSON.stringify({planId,billingCycle:cycle})});
        toast('Plan request submitted');closeAdvanced();openSaasCenter();
      }catch(err){alert(err.message);btn.disabled=false}
    });
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
async function openTeamAccess(){
  const host=loading('Team & Access');
  try{
    const [users,ctx]=await Promise.all([api('/team-users'),api('/saas-context')]),s=ctx.subscription||{};
    host.querySelector('main').innerHTML=`
      <div class="v49-note"><b>${esc(s.plan_name||'Plan')}</b> · Active users ${ctx.usage?.users||0}/${s.max_users||1}. Staff ને Owner password આપ્યા વગર role પ્રમાણે access આપી શકાય.</div>
      <div class="a43-table-wrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Mobile</th><th>Action</th></tr></thead><tbody>
        ${users.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.full_name||'-')}</td><td><b>${esc(u.role)}</b></td><td>${u.active?'Active':'Disabled'}</td><td>${esc(u.mobile||'-')}</td><td><button type="button" data-v49-edit-user="${u.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="6">No team users</td></tr>'}
      </tbody></table></div>
      <form id="v49TeamForm" class="a43-form a44-settings-form">
        <div class="a44-settings-section wide"><b>Add Staff Login</b><small>Owner/Admin only</small></div>
        ${settingField('Username','username','')}
        ${settingField('Full Name','fullName','')}
        ${settingField('Mobile','mobile','')}
        ${settingField('Email','email','','email')}
        <label><span>Role</span><select name="role"><option>ADMIN</option><option>ACCOUNTANT</option><option>OPERATOR</option><option>VIEWER</option></select></label>
        <label><span>Temporary Password</span><input name="password" type="password" minlength="6" required></label>
        <div class="a43-form-actions wide"><button class="primary">Create Staff Login</button></div>
      </form>`;
    host.querySelector('#v49TeamForm').onsubmit=async e=>{
      e.preventDefault();
      try{await api('/team-users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});toast('Staff login created');closeAdvanced();openTeamAccess()}
      catch(err){alert(err.message)}
    };
    host.querySelectorAll('[data-v49-edit-user]').forEach(btn=>btn.onclick=()=>{
      const u=users.find(x=>String(x.id)===String(btn.dataset.v49EditUser));if(!u)return;
      const edit=modal('Edit Staff Access',`<form id="v49EditForm" class="a43-form a44-settings-form">
        ${settingField('Full Name','fullName',u.full_name||'')}
        ${settingField('Mobile','mobile',u.mobile||'')}
        ${settingField('Email','email',u.email||'','email')}
        <label><span>Role</span><select name="role">${['ADMIN','ACCOUNTANT','OPERATOR','VIEWER'].map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></label>
        <label><span>Status</span><select name="active"><option value="1" ${u.active?'selected':''}>Active</option><option value="0" ${!u.active?'selected':''}>Disabled</option></select></label>
        <label><span>New Password (optional)</span><input name="password" type="password" minlength="6"></label>
        <div class="a43-form-actions wide"><button class="primary">Save Access</button></div>
      </form>`);
      edit.querySelector('#v49EditForm').onsubmit=async e=>{
        e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.active=body.active==='1';
        try{await api('/team-users/'+u.id,{method:'PUT',body:JSON.stringify(body)});toast('Staff access updated');closeAdvanced();openTeamAccess()}
        catch(err){alert(err.message)}
      };
    });
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}



function v60CompanyStatus(c){
  if(c.status!=='ACTIVE')return `<span class="v60-pill suspended">SUSPENDED</span>`;
  if(c.subscription_expired)return `<span class="v60-pill expired">EXPIRED</span>`;
  if(c.subscription_status==='TRIAL')return `<span class="v60-pill trial">TRIAL · ${c.days_remaining??0}d</span>`;
  return `<span class="v60-pill active">${esc(c.subscription_status||'ACTIVE')}</span>`;
}
function v60AdminCompanyRows(data,query=''){
  const q=String(query||'').trim().toLowerCase();
  return (data.companies||[]).filter(c=>!q||[
    c.company_name,c.company_code,c.owner_name,c.owner_username,c.mobile,c.email,c.plan_id,c.subscription_status,c.status
  ].some(v=>String(v||'').toLowerCase().includes(q))).map(c=>`
    <tr>
      <td><b>${esc(c.company_name||'-')}</b><small>${esc(c.company_code||'')}</small></td>
      <td>${esc(c.owner_name||'-')}<small>${esc(c.owner_username||'')} · ${esc(c.owner_mobile||c.mobile||'-')}</small></td>
      <td><b>${esc(c.plan_id||'-')}</b><small>${esc(c.subscription_status||'-')}${c.source?` · ${esc(c.source)}`:''}</small></td>
      <td>${v60CompanyStatus(c)}<small>${c.trial_ends_at?`Trial end ${esc(c.trial_ends_at)}`:c.current_period_end?`Period end ${esc(c.current_period_end)}`:''}</small></td>
      <td><b>${Number(c.month_trips||0)} Trips · ${Number(c.month_invoices||0)} Bills</b><small>${Number(c.active_users||0)} active user(s)</small></td>
      <td><div class="v60-admin-actions">
        ${c.id!=='CMP-MEERA'?`<button type="button" data-v60-company-status="${esc(c.id)}" data-v60-next-status="${c.status==='ACTIVE'?'SUSPENDED':'ACTIVE'}">${c.status==='ACTIVE'?'Suspend':'Enable'}</button>`:'<button type="button" disabled>Primary</button>'}
        ${c.subscription_status==='TRIAL'?`<button type="button" data-v60-extend="${esc(c.id)}" data-v60-days="7">+7 Days</button><button type="button" data-v60-extend="${esc(c.id)}" data-v60-days="14">+14 Days</button>`:''}
      </div></td>
    </tr>`).join('')||'<tr><td colspan="6">No company found.</td></tr>';
}
async function openSuperAdminV60(){
  const host=loading('Super Admin');
  try{
    const data=await api('/super-admin'),s=data.summary||{};
    host.querySelector('main').innerHTML=`
      <div class="v60-admin-head">
        <div><h2>Transport ERP · Super Admin</h2><small>Platform-level company, trial and subscription support controls.</small></div>
        <button type="button" data-v60-refresh>Refresh</button>
      </div>
      <div class="v60-metrics">
        <div><small>TOTAL COMPANIES</small><b>${s.totalCompanies||0}</b></div>
        <div><small>ACTIVE</small><b>${s.activeCompanies||0}</b></div>
        <div><small>LIVE TRIALS</small><b>${s.trials||0}</b></div>
        <div><small>EXPIRED</small><b>${s.expired||0}</b></div>
        <div><small>SUSPENDED</small><b>${s.suspended||0}</b></div>
        <div><small>PLAN REQUESTS</small><b>${s.pendingRequests||0}</b></div>
      </div>
      <div class="v60-admin-section">
        <div class="a44-settings-section"><b>Companies</b><small>Search, suspend/enable and extend Trial. Meera Logistics primary company is protected.</small></div>
        <input class="v60-admin-search" data-v60-search placeholder="Search company, owner, mobile or plan…">
        <div class="a43-table-wrap"><table class="v60-company-table"><thead><tr><th>Company</th><th>Owner</th><th>Plan</th><th>Status</th><th>This Month</th><th>Support Action</th></tr></thead><tbody data-v60-company-body>${v60AdminCompanyRows(data)}</tbody></table></div>
      </div>
      <div class="v60-admin-section">
        <div class="a44-settings-section"><b>Subscription Requests</b><small>Review support requests. Paid plan is NOT activated here; Google Play purchase verification remains required.</small></div>
        <div class="a43-table-wrap"><table><thead><tr><th>Company</th><th>Requested Plan</th><th>Cycle</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>
          ${(data.requests||[]).map(r=>`<tr>
            <td><b>${esc(r.company_name||'-')}</b><small>${esc(r.company_code||'')} · ${esc(r.company_mobile||'-')}</small></td>
            <td><b>${esc(r.requested_plan_id)}</b></td><td>${esc(r.billing_cycle)}</td><td>${esc(r.status)}</td><td>${esc(r.created_at||'')}</td>
            <td>${r.status==='PENDING'?`<div class="v60-admin-actions"><button type="button" data-v60-review="${esc(r.id)}" data-v60-review-status="REVIEWED">Mark Reviewed</button><button type="button" data-v60-review="${esc(r.id)}" data-v60-review-status="REJECTED">Reject</button></div>`:'-'}</td>
          </tr>`).join('')||'<tr><td colspan="6">No subscription requests.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="v60-admin-section">
        <div class="a44-settings-section"><b>Recent Platform Actions</b><small>Super Admin activity log</small></div>
        ${(data.recentAudit||[]).slice(0,30).map(a=>`<div class="audit-item"><b>${esc(a.action)} · ${esc(a.company_id||'-')}</b><small>${esc(a.admin_username)} · ${esc(a.created_at||'')}</small></div>`).join('')||'<div class="notice">No platform actions yet.</div>'}
      </div>
      <div class="v49-note"><b>Billing safety:</b> V60 can review plan requests, suspend/enable companies and extend trials. It deliberately cannot grant a paid plan without verified Google Play Billing.</div>`;
    const refresh=()=>{closeAdvanced();openSuperAdminV60()};
    host.querySelector('[data-v60-refresh]').onclick=refresh;
    const search=host.querySelector('[data-v60-search]'),body=host.querySelector('[data-v60-company-body]');
    search.oninput=()=>{body.innerHTML=v60AdminCompanyRows(data,search.value);wireRows()};
    const wireRows=()=>{
      body.querySelectorAll('[data-v60-company-status]').forEach(btn=>btn.onclick=async()=>{
        const companyId=btn.dataset.v60CompanyStatus,status=btn.dataset.v60NextStatus;
        if(!confirm(`${status==='SUSPENDED'?'Suspend':'Enable'} this company?`))return;
        btn.disabled=true;
        try{await api('/super-admin/company-status',{method:'POST',body:JSON.stringify({companyId,status})});toast(`Company ${status.toLowerCase()}`);refresh()}
        catch(err){alert(err.message);btn.disabled=false}
      });
      body.querySelectorAll('[data-v60-extend]').forEach(btn=>btn.onclick=async()=>{
        const companyId=btn.dataset.v60Extend,days=Number(btn.dataset.v60Days||7);
        if(!confirm(`Extend this Trial by ${days} days?`))return;
        btn.disabled=true;
        try{await api('/super-admin/extend-trial',{method:'POST',body:JSON.stringify({companyId,days})});toast(`Trial extended ${days} days`);refresh()}
        catch(err){alert(err.message);btn.disabled=false}
      });
    };
    wireRows();
    host.querySelectorAll('[data-v60-review]').forEach(btn=>btn.onclick=async()=>{
      const requestId=btn.dataset.v60Review,status=btn.dataset.v60ReviewStatus;
      const notes=prompt(status==='REJECTED'?'Reason / support note':'Support note (optional)','')||'';
      btn.disabled=true;
      try{await api('/super-admin/request-review',{method:'POST',body:JSON.stringify({requestId,status,notes})});toast(`Request ${status.toLowerCase()}`);refresh()}
      catch(err){alert(err.message);btn.disabled=false}
    });
  }catch(e){
    host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`;
  }
}


const SETTINGS_CACHE='ml_app_settings_v44';
const defaultSettings={
  companyName:'MEERA LOGISTICS',
  address:'OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR',
  phone:'9558959579',email:'meera.logistics99@gmail.com',gstNo:'24ACFFM2544N1Z1',pan:'ACFFM2544N',
  authorizedPartner:'J. K. JADEJA',defaultSgst:9,defaultCgst:9,
  defaultComments:'1. Payment due within 30 days.\n2. Mention invoice number in payment reference.',
  compactMode:'COMFORTABLE',showOnlineStatus:true,automaticBackups:true
};
function cachedSettings(){try{return {...defaultSettings,...JSON.parse(localStorage.getItem(SETTINGS_CACHE)||'{}')}}catch{return {...defaultSettings}}}
function applySettings(settings){
  const value={...defaultSettings,...settings};
  window.ML_SETTINGS=value;
  document.documentElement.classList.toggle('ml-compact',value.compactMode==='COMPACT');
  const online=document.querySelector('.a43-online');if(online)online.hidden=value.showOnlineStatus===false;
  try{localStorage.setItem(SETTINGS_CACHE,JSON.stringify(value))}catch{}
  return value;
}
async function hydrateSettings(){applySettings(cachedSettings());try{applySettings(await api('/settings'))}catch{}}
function settingField(label,name,value,type='text',wide=false){return `<label class="${wide?'wide':''}"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value??'')}"></label>`}
async function openSettings(){
  const host=loading('Settings');
  try{
    const s=applySettings(await api('/settings'));
    host.querySelector('main').innerHTML=`<form class="a43-form a44-settings-form">
      <div class="a44-settings-section wide"><b>Company Settings</b><small>Across devices save thase</small></div>
      ${settingField('Company Name','companyName',s.companyName)}
      ${settingField('Authorized Partner','authorizedPartner',s.authorizedPartner)}
      ${settingField('Phone','phone',s.phone)}
      ${settingField('Email','email',s.email,'email')}
      ${settingField('GST Number','gstNo',s.gstNo)}
      ${settingField('PAN','pan',s.pan)}
      <label class="wide"><span>Company Address</span><textarea name="address">${esc(s.address)}</textarea></label>
      <div class="a44-settings-section wide"><b>Invoice Defaults</b><small>New entries mate default values</small></div>
      ${settingField('Default SGST %','defaultSgst',s.defaultSgst,'number')}
      ${settingField('Default CGST %','defaultCgst',s.defaultCgst,'number')}
      <label class="wide"><span>Default Payment Terms</span><textarea name="defaultComments">${esc(s.defaultComments)}</textarea></label>
      <div class="a44-settings-section wide"><b>Interface & Safety</b></div>
      <label><span>Interface Density</span><select name="compactMode"><option value="COMFORTABLE" ${s.compactMode==='COMFORTABLE'?'selected':''}>Comfortable</option><option value="COMPACT" ${s.compactMode==='COMPACT'?'selected':''}>Compact</option></select></label>
      <label class="a44-check"><input type="checkbox" name="showOnlineStatus" ${s.showOnlineStatus!==false?'checked':''}><span>Show Online/Offline Status</span></label>
      <label class="a44-check"><input type="checkbox" name="automaticBackups" ${s.automaticBackups!==false?'checked':''}><span>Enable Scheduled Backups</span></label>
      <div class="a43-form-actions"><button type="button" data-a44-reset>Reset Defaults</button><button class="primary">Save Settings</button></div>
    </form>`;
    const form=host.querySelector('form');
    host.querySelector('[data-a44-reset]').onclick=async()=>{
      if(!confirm('Settings default par reset karva?'))return;
      try{applySettings(await api('/settings',{method:'PUT',body:JSON.stringify(defaultSettings)}));toast('Default settings restored');closeAdvanced();decorate()}
      catch(err){alert(err.message)}
    };
    form.onsubmit=async e=>{
      e.preventDefault();const btn=e.submitter;btn.disabled=true;
      const fd=new FormData(form),body=Object.fromEntries(fd.entries());
      body.defaultSgst=Number(body.defaultSgst||0);body.defaultCgst=Number(body.defaultCgst||0);
      body.showOnlineStatus=form.querySelector('[name=showOnlineStatus]').checked;body.automaticBackups=form.querySelector('[name=automaticBackups]').checked;
      try{applySettings(await api('/settings',{method:'PUT',body:JSON.stringify(body)}));toast('Settings saved');closeAdvanced();decorate()}
      catch(err){alert(err.message)}finally{btn.disabled=false}
    };
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// CREATIVE CALENDAR
function calendarEvents(data,month){
  const events=[];
  for(const b of data.bookings||[])if(String(b.booking_date||'').startsWith(month))events.push({date:b.booking_date,type:'BOOKING',title:`${b.booking_no} · ${b.party_name}`,sub:b.status});
  for(const t of data.trips||[])if(String(t.trip_date||'').startsWith(month))events.push({date:t.trip_date,type:'TRIP',title:`${t.trip_no} · ${t.truck_no}`,sub:`${t.loading_point} → ${t.unloading_point}`});
  for(const i of data.invoices||[])if(String(i.invoice_date||'').startsWith(month))events.push({date:i.invoice_date,type:'INVOICE',title:`${i.invoice_no} · ${i.party_name}`,sub:money(i.total)});
  for(const d of data.documents||[])if(String(d.expiry_date||'').startsWith(month))events.push({date:d.expiry_date,type:'EXPIRY',title:`${d.truck_no} · ${d.kind}`,sub:'Document expiry'});
  return events;
}
function calendarHtml(data,month){
  const [year,mon]=month.split('-').map(Number);const first=new Date(year,mon-1,1);const days=new Date(year,mon,0).getDate();const lead=first.getDay();
  const events=calendarEvents(data,month);const byDay={};for(const e of events)(byDay[Number(e.date.slice(-2))]??=[]).push(e);
  const cells=[];for(let i=0;i<lead;i++)cells.push('<div class="a43-day muted"></div>');
  for(let day=1;day<=days;day++)cells.push(`<div class="a43-day ${new Date().toISOString().slice(0,10)===`${month}-${String(day).padStart(2,'0')}`?'today':''}"><b>${day}</b><div>${(byDay[day]||[]).slice(0,5).map(e=>`<button class="a43-event ${e.type.toLowerCase()}" title="${esc(e.sub)}"><span>${esc(e.type)}</span>${esc(e.title)}</button>`).join('')}</div>${(byDay[day]||[]).length>5?`<small>+${(byDay[day]||[]).length-5} more</small>`:''}</div>`);
  return `<div class="a43-calendar-head"><button data-cal-prev>‹</button><h2>${first.toLocaleString('en-IN',{month:'long',year:'numeric'})}</h2><button data-cal-next>›</button></div><div class="a43-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<b>${x}</b>`).join('')}</div><div class="a43-calendar">${cells.join('')}</div><div class="a43-legend"><span class="booking">Booking</span><span class="trip">Trip</span><span class="invoice">Invoice</span><span class="expiry">Expiry</span></div>`;
}
async function openCalendar(){
  const host=loading('Professional Calendar');
  try{const data=await loadAdvanced(true);host.querySelector('main').innerHTML=calendarHtml(data,A43.month);wireCalendar(host,data)}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
function wireCalendar(host,data){
  const move=n=>{const [y,m]=A43.month.split('-').map(Number);A43.month=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);host.querySelector('main').innerHTML=calendarHtml(data,A43.month);wireCalendar(host,data)};
  host.querySelector('[data-cal-prev]').onclick=()=>move(-1);host.querySelector('[data-cal-next]').onclick=()=>move(1);
}

// BOOKING / APPROVAL / DISPATCH / TRIP
async function bookingForm(existing=null){
  const b=await loadBootstrap();
  const opt=(rows,key,val='')=>`<option value="">Select</option>`+rows.map(x=>`<option ${String(x[key])===String(val)?'selected':''}>${esc(x[key])}</option>`).join('');
  const x=existing||{};
  const host=modal(existing?'Edit Booking':'New Booking',`<form class="a43-form" id="a43BookingForm">
    <label><span>Booking Date</span><input type="date" name="bookingDate" value="${esc(x.booking_date||new Date().toISOString().slice(0,10))}" required></label>
    <label><span>Expected Delivery</span><input type="date" name="expectedDate" value="${esc(x.expected_date||'')}"></label>
    <label><span>Party</span><select name="partyName" required>${opt(b.parties,'party_name',x.party_name)}</select></label>
    <label><span>Truck</span><select name="truckNo" data-master-type="truck" required>${opt(b.trucks,'truck_no',x.truck_no)}<option value="__ADD_NEW__">＋ New Truck Add</option></select></label>
    <label><span>Material</span><select name="material" required>${opt(b.materials,'material_name',x.material)}</select></label>
    <label><span>Loading Point</span><select name="loadingPoint" required>${opt(b.routes,'loading_point',x.loading_point)}</select></label>
    <label><span>Unloading Point</span><select name="unloadingPoint" required>${opt(b.routes,'unloading_point',x.unloading_point)}</select></label>
    <label class="wide"><span>Notes</span><textarea name="notes">${esc(x.notes||'')}</textarea></label>
    <div class="a43-form-actions"><button type="button" data-a43-close-form>Cancel</button><button class="primary">Save Booking</button></div>
  </form>`);
  window.ML_WIRE_MASTER_SELECTS?.(host);
  host.querySelector('[data-a43-close-form]').onclick=closeAdvanced;
  host.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));await api('/workflow-bookings'+(x.id?'/'+x.id:''),{method:x.id?'PUT':'POST',body:JSON.stringify(body)});A43.data=null;toast('Booking saved');openWorkflow()}catch(err){alert(err.message)}finally{btn.disabled=false}};
}
function bookingActions(b){
  const buttons=[];
  if(b.status==='DRAFT'||b.status==='REJECTED')buttons.push(`<button data-book-action="submit" data-id="${b.id}">Send Approval</button>`);
  if(b.approval_status==='APPROVED'&&b.status==='APPROVED')buttons.push(`<button data-book-action="dispatch" data-id="${b.id}">Dispatch</button>`);
  if(['DISPATCHED','APPROVED'].includes(b.status)&&b.approval_status==='APPROVED')buttons.push(`<button class="primary" data-book-action="convert" data-id="${b.id}">Create Trip</button>`);
  if(!['CONVERTED','COMPLETED'].includes(b.status))buttons.push(`<button data-edit-booking="${b.id}">Edit</button><button class="danger" data-trash-booking="${b.id}">Delete</button>`);
  if(b.status==='CONVERTED')buttons.push(`<button data-book-action="complete" data-id="${b.id}">Complete</button>`);
  return buttons.join('');
}
async function openWorkflow(){
  const host=loading('Booking → Dispatch → Trip');
  try{
    const data=await loadAdvanced(true);const bookings=data.bookings||[];
    host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-new-booking>+ New Booking</button>');
    host.querySelector('main').innerHTML=`<div class="a43-flow"><span>1. Booking</span><i>→</i><span>2. Approval</span><i>→</i><span>3. Dispatch</span><i>→</i><span>4. Trip</span></div><div class="a43-bookings">${bookings.length?bookings.map(b=>`<article><div><b>${esc(b.booking_no)}</b>${statusBadge(b.status)}${statusBadge(b.approval_status)}</div><h3>${esc(b.party_name)}</h3><p><b>${esc(b.truck_no||'-')}</b> · ${esc(b.material||'-')}</p><p>${esc(b.loading_point)} → ${esc(b.unloading_point)}</p><small>${fmtDate(b.booking_date)}${b.expected_date?' · Expected '+fmtDate(b.expected_date):''}${b.trip_id?' · Trip linked':''}</small><footer>${bookingActions(b)}</footer></article>`).join(''):'<div class="a43-empty">No bookings. Create the first booking.</div>'}</div>`;
    host.querySelector('[data-new-booking]').onclick=()=>bookingForm();
    host.querySelectorAll('[data-edit-booking]').forEach(x=>x.onclick=()=>bookingForm(bookings.find(b=>b.id===x.dataset.editBooking)));
    host.querySelectorAll('[data-trash-booking]').forEach(x=>x.onclick=()=>moveToRecycle('booking',x.dataset.trashBooking,openWorkflow));
    host.querySelectorAll('[data-book-action]').forEach(x=>x.onclick=async()=>{x.disabled=true;try{const res=await api(`/workflow-bookings/${x.dataset.id}/${x.dataset.bookAction}`,{method:'POST',body:'{}'});toast(res.tripNo?`Trip ${res.tripNo} created`:'Workflow updated');A43.data=null;openWorkflow()}catch(e){alert(e.message)}finally{x.disabled=false}});
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
async function openApprovals(){
  const host=loading('Approval System');
  try{const data=await loadAdvanced(true),rows=data.approvals||[];host.querySelector('main').innerHTML=`<div class="a43-approvals">${rows.length?rows.map(a=>`<article><div><b>${esc(a.action)}</b>${statusBadge(a.status)}</div><p>${esc(a.entity_type)} · ${esc(a.entity_id)}</p><small>Requested by ${esc(a.requested_by||'-')} · ${fmtDate(a.created_at)}</small>${a.status==='PENDING'?`<footer><button class="primary" data-approve="${a.id}">Approve</button><button class="danger" data-reject="${a.id}">Reject</button></footer>`:''}</article>`).join(''):'<div class="a43-empty">No approval requests.</div>'}</div>`;host.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approvalDecision(b.dataset.approve,'approve'));host.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>approvalDecision(b.dataset.reject,'reject'))}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
async function approvalDecision(id,action){try{await api(`/approvals/${id}/${action}`,{method:'POST',body:JSON.stringify({notes:''})});A43.data=null;toast(`Request ${action}d`);openApprovals()}catch(e){alert(e.message)}}

// RECYCLE BIN
async function moveToRecycle(entityType,entityId,after){
  if(!confirm('Delete karine Recycle Bin ma mukvu chhe? Pachhi restore kari sakase.'))return;
  try{await api('/recycle-bin',{method:'POST',body:JSON.stringify({entityType,entityId})});A43.data=null;A43.bootstrap=null;toast('Moved to Recycle Bin');after?.();document.getElementById('refreshBtn')?.click()}catch(e){alert(e.message)}
}
async function openRecycle(){
  const host=loading('Recycle Bin');
  try{const rows=await api('/recycle-bin');host.querySelector('main').innerHTML=`<div class="a43-recycle">${rows.length?rows.map(x=>`<article><div><b>${esc(x.label||x.entity_id)}</b>${statusBadge(x.entity_type)}</div><small>Deleted ${fmtDate(x.deleted_at)} by ${esc(x.deleted_by||'-')}</small><footer><button class="primary" data-restore="${x.id}">Restore</button><button class="danger" data-purge="${x.id}">Delete Forever</button></footer></article>`).join(''):'<div class="a43-empty">Recycle Bin is empty.</div>'}</div>`;host.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{await api(`/recycle-bin/${b.dataset.restore}/restore`,{method:'POST',body:'{}'});toast('Record restored');A43.data=null;A43.bootstrap=null;openRecycle();document.getElementById('refreshBtn')?.click()});host.querySelectorAll('[data-purge]').forEach(b=>b.onclick=async()=>{if(confirm('Permanent delete? Aa pachhi restore nahi thay.')){await api(`/recycle-bin/${b.dataset.purge}`,{method:'DELETE'});openRecycle()}})}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
const DELETE_MAP={'delete-trip':'trip','delete-invoice':'invoice','delete-pm-bill':'pm-bill','delete-party':'party','delete-party-payment':'party-payment','delete-truck':'truck','delete-truck-entry':'truck-entry','delete-supplier-payment':'supplier-payment','delete-route':'route','delete-material':'material','delete-expense':'expense','delete-document':'document'};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');const entity=DELETE_MAP[b?.dataset.action];if(!entity)return;e.preventDefault();e.stopImmediatePropagation();moveToRecycle(entity,b.dataset.id)},true);

// SYSTEM HEALTH
async function openHealth(){
  const host=loading('System Health Dashboard');
  try{const h=await api('/system-health');host.querySelector('main').innerHTML=`<div class="a43-health-score ${h.ok?'good':'warn'}"><strong>${h.ok?'HEALTHY':'ATTENTION'}</strong><span>${fmtDate(h.checkedAt)}</span></div><div class="a43-health-grid">${h.checks.map(c=>`<article class="${c.status.toLowerCase()}"><span>${c.status==='OK'?'✓':c.status==='WARNING'?'!':'i'}</span><div><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div></article>`).join('')}</div><h3>Database Records</h3><div class="a43-counts">${Object.entries(h.counts).map(([k,v])=>`<div><small>${esc(k.replaceAll('_',' '))}</small><b>${v}</b></div>`).join('')}</div>`}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// EXCEL XML (.xls) IMPORT / EXPORT
function xmlEsc(v){return String(v??'').replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[c]))}
function workbookXml(payload){
  const sheets=payload.sheets||payload;let body='';
  for(const [name,rows0] of Object.entries(sheets)){const rows=Array.isArray(rows0)?rows0:[];const headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];body+=`<Worksheet ss:Name="${xmlEsc(String(name).slice(0,31))}"><Table><Row>${headers.map(h=>`<Cell><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join('')}</Row>${rows.map(r=>`<Row>${headers.map(h=>{const value=r[h]??'';const numType=typeof value==='number'||(/^[-+]?\d+(\.\d+)?$/.test(String(value))&&String(value)!=='');return `<Cell><Data ss:Type="${numType?'Number':'String'}">${xmlEsc(value)}</Data></Cell>`}).join('')}</Row>`).join('')}</Table></Worksheet>`}
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}
function downloadWorkbook(payload,name){downloadBlob(new Blob([workbookXml(payload)],{type:'application/vnd.ms-excel;charset=utf-8'}),safeName(name)+'.xls')}
function parseWorkbookXml(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');const sheets={};
  [...doc.getElementsByTagNameNS('*','Worksheet')].forEach(ws=>{const name=ws.getAttribute('ss:Name')||ws.getAttribute('Name')||'Sheet';const rows=[...ws.getElementsByTagNameNS('*','Row')].map(row=>[...row.getElementsByTagNameNS('*','Cell')].map(cell=>cell.getElementsByTagNameNS('*','Data')[0]?.textContent||''));if(!rows.length)return;const heads=rows.shift();sheets[name]=rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(heads.map((h,i)=>[h,r[i]??''])))});return {sheets};
}
function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++}else if(c==='"')q=!q;else if(c===','&&!q){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x!==''))rows.push(row);const h=rows.shift()||[];return rows.map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])))}
async function openExcel(){
  const host=loading('Excel Import / Export Center');
  try{const data=await loadAdvanced(true);host.querySelector('main').innerHTML=`<div class="a43-excel-grid"><article><h3>Full Excel Export</h3><p>Party, Truck, Trip, Invoice, Payments, Expenses ane Booking badha sheets sathe.</p><button class="primary" data-export-all>Download Full Excel</button></article><article><h3>Full Excel Import</h3><p>V43 export kareli .xls, CSV athva JSON backup merge karo.</p><select data-import-sheet><option>Parties</option><option>Trucks</option><option>Routes</option><option>Materials</option><option>Bookings</option><option>Trips</option><option>Invoices</option><option>InvoiceItems</option><option>PartyPayments</option><option>SupplierPayments</option><option>TruckEntries</option><option>Expenses</option></select><input type="file" data-import-file accept=".xls,.xml,.csv,.json"><button data-import-btn>Import</button></article><article class="wide"><h3>Monthly Excel Generation</h3><div class="a43-month-controls"><input type="month" value="${new Date().toISOString().slice(0,7)}" data-month-key><button data-generate-month>Generate Month</button></div><div class="a43-month-list">${(data.monthly||[]).map(m=>{const s=JSON.parse(m.summary||'{}');return `<div><b>${m.month_key}</b><small>${s.invoices||0} invoices · ${s.trips||0} trips · ${money(s.billing||0)}</small><button data-month-download="${m.id}">Download</button></div>`}).join('')||'<p>No monthly files generated yet.</p>'}</div></article></div>`;
    host.querySelector('[data-export-all]').onclick=async()=>downloadWorkbook(await api('/excel-export'),'MEERA LOGISTICS FULL DATA '+new Date().toISOString().slice(0,10));
    host.querySelector('[data-import-btn]').onclick=async()=>{const file=host.querySelector('[data-import-file]').files[0];if(!file)return alert('Select Excel/CSV/JSON file.');const text=await file.text();let payload;if(file.name.toLowerCase().endsWith('.json'))payload=JSON.parse(text).payload||JSON.parse(text);else if(file.name.toLowerCase().endsWith('.csv'))payload={sheets:{[host.querySelector('[data-import-sheet]').value]:parseCsv(text)}};else payload=parseWorkbookXml(text);const res=await api('/excel-import',{method:'POST',body:JSON.stringify(payload)});toast('Excel import complete');alert(JSON.stringify(res.imported,null,2));A43.bootstrap=null};
    host.querySelector('[data-generate-month]').onclick=async()=>{const monthKey=host.querySelector('[data-month-key]').value;await api('/monthly-exports',{method:'POST',body:JSON.stringify({monthKey})});toast('Monthly Excel generated');A43.data=null;openExcel()};
    host.querySelectorAll('[data-month-download]').forEach(b=>b.onclick=async()=>{const x=await api(`/monthly-exports/${b.dataset.monthDownload}/download`);downloadWorkbook(x.payload,`MEERA LOGISTICS ${x.monthKey}`)});
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// SCHEDULED BACKUPS
async function openBackups(){
  const host=loading('Scheduled Backups');
  try{const rows=await api('/backups');host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-backup-now>Backup Now</button>');host.querySelector('main').innerHTML=`<div class="a43-backups"><div class="a43-backup-info"><b>Automatic daily backup</b><small>Cloudflare Cron: every day 20:00 UTC (01:30 AM India). Last 30 snapshots retained.</small></div>${rows.length?rows.map(x=>`<article><div><b>${esc(x.backup_type)} Backup</b><small>${esc(x.period_key||'')} · ${fmtDate(x.created_at)}</small></div><footer><button data-backup-download="${x.id}">Download JSON</button><button class="danger" data-backup-delete="${x.id}">Delete</button></footer></article>`).join(''):'<div class="a43-empty">No backup snapshot yet. Click Backup Now.</div>'}</div>`;host.querySelector('[data-backup-now]').onclick=async()=>{await api('/backups',{method:'POST',body:'{}'});toast('Backup created');openBackups()};host.querySelectorAll('[data-backup-download]').forEach(b=>b.onclick=async()=>{const x=await api(`/backups/${b.dataset.backupDownload}/download`);downloadBlob(new Blob([JSON.stringify(x.payload,null,2)],{type:'application/json'}),`MEERA LOGISTICS BACKUP ${x.createdAt.slice(0,10)}.json`)});host.querySelectorAll('[data-backup-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this backup?')){await api(`/backups/${b.dataset.backupDelete}`,{method:'DELETE'});openBackups()}})}catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}

// MULTI IMAGE TRUCK DOCUMENT GALLERY
function readCompressed(file,max=1400,quality=.76){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{let w=img.width,h=img.height;if(Math.max(w,h)>max){const r=max/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality))};img.src=reader.result};reader.readAsDataURL(file)})}
async function openGallery(){
  const host=loading('Truck Documents Gallery');
  try{
    const [data,b,storage]=await Promise.all([loadAdvanced(true),loadBootstrap(true),api('/document-storage-status')]);
    const docs=data.documents||[];
    host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button class="primary" data-gallery-upload>+ Upload Documents</button>');
    host.querySelector('main').innerHTML=`
      <div class="v62-storage-status ${storage.r2Configured?'cloud':'fallback'}"><b>${storage.r2Configured?'☁️ Cloudflare R2 Active':'💾 D1 Fallback Active'}</b><span>${esc(storage.message||'')} · ${storage.documents||0} docs · ${Number(storage.bytes||0).toLocaleString('en-IN')} bytes</span></div>
      <div class="a43-gallery-filter"><select data-gallery-truck><option value="">All Trucks</option>${b.trucks.map(t=>`<option>${esc(t.truck_no)}</option>`).join('')}</select><input placeholder="Search document…" data-gallery-search></div>
      <div class="a43-gallery">${docs.length?docs.map(d=>`<article data-truck="${esc(d.truck_no)}" data-text="${esc((d.file_name+' '+d.kind).toLowerCase())}">
        <div class="a43-doc-icon">${d.file_type==='application/pdf'?'📄':'🖼️'}</div><b>${esc(d.truck_no)}</b><span>${esc(d.kind)}</span>
        <small>${esc(d.file_name||'Document')}${d.expiry_date?' · Exp '+fmtDate(d.expiry_date):''}</small>
        <small>${esc(d.storage_mode||'D1')} · ${Number(d.file_size||0).toLocaleString('en-IN')} bytes</small>
        <footer><button data-doc-view="${d.id}">View</button><button class="danger" data-doc-delete="${d.id}">Delete</button></footer>
      </article>`).join(''):'<div class="a43-empty">No truck documents.</div>'}</div>`;
    const filter=()=>{const truck=host.querySelector('[data-gallery-truck]').value,q=host.querySelector('[data-gallery-search]').value.toLowerCase();host.querySelectorAll('.a43-gallery article').forEach(x=>x.hidden=!!((truck&&x.dataset.truck!==truck)||(q&&!x.dataset.text.includes(q))))};
    host.querySelector('[data-gallery-truck]').onchange=filter;host.querySelector('[data-gallery-search]').oninput=filter;
    host.querySelector('[data-gallery-upload]').onclick=()=>galleryUploadForm(b.trucks);
    host.querySelectorAll('[data-doc-view]').forEach(x=>x.onclick=async()=>{
      try{
        const d=await api('/documents/'+x.dataset.docView),blob=await apiBlob('/document-content/'+x.dataset.docView),url=URL.createObjectURL(blob);
        const content=d.file_type==='application/pdf'?`<iframe class="v62-doc-frame" src="${url}"></iframe>`:`<img class="a43-full-image" src="${url}">`;
        const m=modal(`${d.truck_no} · ${d.kind}`,`${content}<p>${esc(d.notes||'')}</p><small>${esc(d.storage_mode||'D1')} · ${Number(d.file_size||blob.size||0).toLocaleString('en-IN')} bytes</small>`);
        setTimeout(()=>{if(!document.body.contains(m))URL.revokeObjectURL(url)},600000);
      }catch(err){alert(err.message)}
    });
    host.querySelectorAll('[data-doc-delete]').forEach(x=>x.onclick=()=>moveToRecycle('document',x.dataset.docDelete,openGallery));
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
function galleryUploadForm(trucks){
  const host=modal('Upload Multiple Truck Documents',`<form class="a43-form" id="galleryUpload">
    <label><span>Truck</span><select name="truckNo" data-master-type="truck" required><option value="">Select Truck</option>${trucks.map(t=>`<option>${esc(t.truck_no)}</option>`).join('')}<option value="__ADD_NEW__">＋ New Truck Add</option></select></label>
    <label><span>Document Type</span><select name="kind"><option>RC</option><option>PAN</option><option>CHEQUE</option><option>BUILTY</option><option>POD</option><option>INSURANCE</option><option>FITNESS</option><option>PERMIT</option><option>OTHER</option></select></label>
    <label><span>Expiry Date</span><input type="date" name="expiryDate"></label>
    <label class="wide"><span>Images / PDFs (multiple)</span><input type="file" name="files" accept="image/*,.pdf" multiple required></label>
    <label class="wide"><span>Notes</span><textarea name="notes"></textarea></label>
    <div class="v49-note wide"><b>Cloud-ready:</b> R2 binding active hoy to files directly cloud storage ma jai. D1 fallback ma large files automatically reject thase.</div>
    <div class="a43-form-actions"><button type="button" data-a43-close-form>Cancel</button><button class="primary">Upload All</button></div>
  </form>`);
  window.ML_WIRE_MASTER_SELECTS?.(host);
  host.querySelector('[data-a43-close-form]').onclick=closeAdvanced;
  host.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const btn=e.submitter,form=e.target,files=[...form.files.files];btn.disabled=true;
    try{
      let n=0;
      for(const file of files){
        btn.textContent=`Uploading ${n}/${files.length}`;
        const fd=new FormData();
        fd.append('truckNo',form.truckNo.value);fd.append('kind',form.kind.value);fd.append('expiryDate',form.expiryDate.value||'');
        fd.append('notes',form.notes.value||'');fd.append('fileName',file.name);fd.append('fileType',file.type||'application/octet-stream');fd.append('file',file,file.name);
        await api('/documents',{method:'POST',body:fd});n++;
      }
      btn.textContent=`Uploaded ${n}/${files.length}`;toast(`${n} documents uploaded`);A43.data=null;A43.bootstrap=null;openGallery();
    }catch(err){alert(err.message)}finally{btn.disabled=false}
  };
}

function v62NotificationIcon(item){
  if(item.kind==='DOCUMENT_EXPIRY')return '📄';
  if(item.kind==='PARTY_OUTSTANDING')return '💰';
  if(item.kind==='SUPPLIER_PENDING')return '🚚';
  if(item.kind==='APPROVAL_PENDING')return '✅';
  if(item.kind==='SUBSCRIPTION')return '⏳';
  return '🔔';
}
function v62OpenNotification(item){
  closeAdvanced();
  if(item.action==='gallery')return openGallery();
  if(item.action==='approvals')return openApprovals();
  if(item.action==='saas')return openSaasCenter();
  const panel=document.querySelector(`[data-panel="${item.action}"]`);
  if(panel)panel.click();
}
async function enableBrowserAlertsV62(){
  if(!('Notification'in window))return alert('Browser notification support available nathi.');
  const permission=await Notification.requestPermission();
  if(permission==='granted')toast('Browser alerts enabled');
  else alert('Notification permission allow thayu nathi.');
}
async function showUrgentBrowserAlertV62(feed){
  if(!('Notification'in window)||Notification.permission!=='granted'||!feed?.urgent)return;
  const key=`ml_v62_alert_${new Date().toISOString().slice(0,10)}`;
  if(localStorage.getItem(key))return;
  localStorage.setItem(key,'1');
  const title=`Transport ERP · ${feed.urgent} important alert(s)`;
  const body=(feed.items||[]).filter(x=>x.severity!=='info').slice(0,2).map(x=>x.title+' — '+x.text).join('\n');
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg)await reg.showNotification(title,{body,tag:'transport-v62-daily',data:{url:'/'}});
    else new Notification(title,{body});
  }catch{}
}
async function openNotificationsV62(){
  const host=loading('Notifications & App Alerts');
  try{
    const feed=await api('/notifications');
    const rows=feed.items||[];
    host.querySelector('.a43-head-actions').insertAdjacentHTML('afterbegin','<button data-v62-enable-alerts>Enable Browser Alerts</button>');
    host.querySelector('main').innerHTML=`
      <div class="v62-notification-summary">
        <div><small>ALL ALERTS</small><b>${feed.count||0}</b></div><div><small>IMPORTANT</small><b>${feed.urgent||0}</b></div>
        <div><small>FILE STORAGE</small><b>${esc(feed.storage?.mode||'D1')}</b></div>
      </div>
      <div class="v62-storage-status ${feed.storage?.r2Configured?'cloud':'fallback'}">
        <b>${feed.storage?.r2Configured?'☁️ R2 Cloud Storage Ready':'💾 D1 File Fallback'}</b>
        <span>${feed.storage?.r2Configured?'Documents are stored outside D1 in Cloudflare R2.':'ERP works normally; add DOCS R2 binding before commercial scale.'}</span>
      </div>
      <div class="v62-notification-list">${rows.length?rows.map((x,i)=>`
        <button type="button" class="v62-notification ${esc(x.severity||'info')}" data-v62-notification="${i}">
          <span class="v62-notification-icon">${v62NotificationIcon(x)}</span>
          <span><b>${esc(x.title)}</b><small>${esc(x.text)}</small></span><em>Open ›</em>
        </button>`).join(''):'<div class="a43-empty">No current alerts.</div>'}</div>`;
    host.querySelector('[data-v62-enable-alerts]').onclick=enableBrowserAlertsV62;
    host.querySelectorAll('[data-v62-notification]').forEach(btn=>btn.onclick=()=>v62OpenNotification(rows[Number(btn.dataset.v62Notification)]));
    showUrgentBrowserAlertV62(feed);
  }catch(e){host.querySelector('main').innerHTML=`<div class="a43-error">${esc(e.message)}</div>`}
}
let v62NotificationCache={at:0,count:0,urgent:0};
async function refreshNotificationBadgeV62(force=false){
  if(!document.querySelector('.erp'))return;
  if(!force&&Date.now()-v62NotificationCache.at<60000)return v62NotificationCache;
  try{
    const feed=await api('/notifications');
    v62NotificationCache={at:Date.now(),count:Number(feed.count||0),urgent:Number(feed.urgent||0)};
    const b=document.querySelector('[data-v62-notifications-top]');
    if(b)b.innerHTML=`🔔 Alerts${feed.urgent?` <span class="v62-badge">${feed.urgent}</span>`:''}`;
    showUrgentBrowserAlertV62(feed);
  }catch{}
  return v62NotificationCache;
}

// COMMAND PALETTE
async function openCommandPalette(){
  const host=modal('Command Palette',`<div class="a43-command"><input autofocus placeholder="Type command, invoice, trip, party, truck…" data-cmd-input><div data-cmd-results></div></div>`);
  const input=host.querySelector('[data-cmd-input]'),results=host.querySelector('[data-cmd-results]');let b=null;
  const actions=[['Company & Plan','saas'],['Team & Access','team'],['Notifications','notifications'],['Calendar','calendar'],['New Booking','new-booking'],['Booking Workflow','workflow'],['Approvals','approvals'],['Recycle Bin','recycle'],['System Health','health'],['Excel Center','excel'],['Scheduled Backups','backups'],['Truck Gallery','gallery'],['Settings','settings'],['New Trip','new-trip'],['New Invoice','new-invoice']];
  const render=async()=>{const q=input.value.trim().toUpperCase();if(!b)b=await loadBootstrap();const rows=actions.filter(x=>!q||x[0].toUpperCase().includes(q)).map(x=>({label:x[0],kind:'COMMAND',action:x[1]}));if(q){for(const i of b.invoices.filter(x=>String(x.invoice_no).toUpperCase().includes(q)||String(x.party_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${i.invoice_no} · ${i.party_name}`,kind:'INVOICE',id:i.id});for(const t of b.trips.filter(x=>String(x.trip_no).toUpperCase().includes(q)||String(x.truck_no).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${t.trip_no} · ${t.truck_no}`,kind:'TRIP',id:t.id});for(const p of b.parties.filter(x=>String(x.party_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:p.party_name,kind:'PARTY'});for(const t of b.trucks.filter(x=>String(x.truck_no).toUpperCase().includes(q)||String(x.owner_name).toUpperCase().includes(q)).slice(0,5))rows.push({label:`${t.truck_no} · ${t.owner_name}`,kind:'TRUCK'})}results.innerHTML=rows.slice(0,20).map((r,i)=>`<button data-cmd-i="${i}"><span>${esc(r.kind)}</span><b>${esc(r.label)}</b></button>`).join('')||'<p>No result</p>';results.querySelectorAll('button').forEach((el,i)=>el.onclick=()=>runCommand(rows[i]))};
  input.oninput=render;render();setTimeout(()=>input.focus(),50);
}
function triggerAction(action,id=''){closeAdvanced();const b=document.createElement('button');b.dataset.action=action;if(id)b.dataset.id=id;b.hidden=true;document.body.appendChild(b);b.click();b.remove()}
function runCommand(r){if(r.kind==='COMMAND'){if(r.action==='new-booking')return bookingForm();if(r.action==='new-trip')return triggerAction('new-trip');if(r.action==='new-invoice')return triggerAction('new-invoice');return openFeature(r.action)}if(r.kind==='INVOICE')return triggerAction('view-invoice',r.id);if(r.kind==='TRIP')return triggerAction('view-trip',r.id);if(r.kind==='PARTY'){closeAdvanced();document.querySelector('[data-panel="parties"]')?.click()}if(r.kind==='TRUCK'){closeAdvanced();document.querySelector('[data-panel="trucks"]')?.click()}}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandPalette()}if(e.key==='Escape')closeAdvanced()});

// UI DECORATION + PWA/OFFLINE
function decorate(){
  if(document.querySelector('.erp')&&!document.documentElement.dataset.a44SettingsHydrated){
    document.documentElement.dataset.a44SettingsHydrated='1';hydrateSettings();
  }
  // Enforce the exact compact sidebar requested earlier, even if old browser cache is present.
  document.querySelectorAll('.sidebar [data-panel]').forEach(b=>{if(['partyPayments','truckEntries','supplierPayments','expenses'].includes(b.dataset.panel))b.remove()});
  const sidebar=document.querySelector('.sidebar');
  if(sidebar&&!sidebar.querySelector('[data-a44-settings-side]'))sidebar.insertAdjacentHTML('beforeend','<div class="nav-group-title a44-settings-title">System</div><div class="nav a44-settings-nav"><button type="button" data-v49-saas-side><span class="dot"></span>Company & Plan</button><button type="button" data-v49-team-side><span class="dot"></span>Team & Access</button><button type="button" data-a44-settings-side><span class="dot"></span>Settings</button></div>');
  if(sidebar&&window.ML_PLATFORM_ADMIN&&!sidebar.querySelector('[data-v60-superadmin-side]')){
    const systemNav=sidebar.querySelector('.a44-settings-nav');
    systemNav?.insertAdjacentHTML('afterbegin','<button type="button" data-v60-superadmin-side><span class="dot"></span>Super Admin</button>');
  }
  const sideSaas=document.querySelector('[data-v49-saas-side]');if(sideSaas&&!sideSaas.dataset.v49Bound){sideSaas.dataset.v49Bound='1';sideSaas.addEventListener('click',openSaasCenter)}
  const sideSuper=document.querySelector('[data-v60-superadmin-side]');if(sideSuper&&!sideSuper.dataset.v60Bound){sideSuper.dataset.v60Bound='1';sideSuper.addEventListener('click',openSuperAdminV60)}
  const sideTeam=document.querySelector('[data-v49-team-side]');if(sideTeam&&!sideTeam.dataset.v49Bound){sideTeam.dataset.v49Bound='1';sideTeam.addEventListener('click',openTeamAccess)}
  const sideSettings=document.querySelector('[data-a44-settings-side]');if(sideSettings&&!sideSettings.dataset.a44Bound){sideSettings.dataset.a44Bound='1';sideSettings.addEventListener('click',openSettings)}
  const top=document.querySelector('.top-actions');
  if(top&&!top.querySelector('[data-a44-settings-top]'))top.insertAdjacentHTML('afterbegin','<button class="btn light" data-a44-settings-top>Settings</button>');
  if(top&&!top.querySelector('[data-v62-notifications-top]'))top.insertAdjacentHTML('afterbegin','<button class="btn light v62-alert-button" data-v62-notifications-top>🔔 Alerts</button>');
  if(top&&!top.querySelector('[data-a43-tools]'))top.insertAdjacentHTML('afterbegin','<button class="btn primary" data-a43-tools>Smart Tools</button>');
  const topSettings=document.querySelector('[data-a44-settings-top]');if(topSettings&&!topSettings.dataset.a44Bound){topSettings.dataset.a44Bound='1';topSettings.addEventListener('click',openSettings)}
  const topAlerts=document.querySelector('[data-v62-notifications-top]');if(topAlerts&&!topAlerts.dataset.v62Bound){topAlerts.dataset.v62Bound='1';topAlerts.addEventListener('click',openNotificationsV62);setTimeout(()=>refreshNotificationBadgeV62(),600)}
  const toolsBtn=document.querySelector('[data-a43-tools]');if(toolsBtn&&!toolsBtn.dataset.a43Bound){toolsBtn.dataset.a43Bound='1';toolsBtn.addEventListener('click',openTools)}
  const quick=document.querySelector('.quick-actions');
  if(quick&&!quick.querySelector('[data-a43-dashboard]'))quick.insertAdjacentHTML('beforeend','<button type="button" class="quick" data-a43-dashboard><b>📅 Smart Operations</b><small>Calendar, booking, approval, backup & health</small></button>');
  if(quick&&!quick.querySelector('[data-a44-settings-dashboard]'))quick.insertAdjacentHTML('beforeend','<button type="button" class="quick" data-a44-settings-dashboard><b>⚙️ Settings</b><small>Company and interface defaults</small></button>');
  const dashBtn=document.querySelector('[data-a43-dashboard]');if(dashBtn&&!dashBtn.dataset.a43Bound){dashBtn.dataset.a43Bound='1';dashBtn.addEventListener('click',openTools)}
  const dashSettings=document.querySelector('[data-a44-settings-dashboard]');if(dashSettings&&!dashSettings.dataset.a44Bound){dashSettings.dataset.a44Bound='1';dashSettings.addEventListener('click',openSettings)}
  if(!document.querySelector('.a43-online')){const s=document.createElement('button');s.className='a43-online';s.onclick=()=>navigator.serviceWorker?.controller?.postMessage({type:'SYNC_QUEUE'});document.body.appendChild(s)}
  const s=document.querySelector('.a43-online');if(s){s.textContent=navigator.onLine?'● Online':'● Offline · Changes queued';s.classList.toggle('offline',!navigator.onLine)}
}
new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.documentElement,{childList:true,subtree:true});applySettings(cachedSettings());decorate();hydrateSettings();
window.addEventListener('online',()=>{decorate();navigator.serviceWorker?.controller?.postMessage({type:'SYNC_QUEUE'});toast('Online — offline changes syncing')});window.addEventListener('offline',decorate);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw-v66-1.js?v=661').catch(()=>{});

document.addEventListener('ml-open-saas-v59',()=>openSaasCenter());

document.addEventListener('ml-open-notifications-v64',()=>openNotificationsV62());
