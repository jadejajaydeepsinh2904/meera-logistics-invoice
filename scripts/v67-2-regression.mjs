import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const advanced=read('public/src/advanced-v44.js');
const app=read('public/src/app.js');
const css=read('public/src/advanced-v44.css');
const index=read('public/index.html');

assert.ok(app.indexOf('window.ML_APP_DATA=d')<app.indexOf('window.ML_PLATFORM_ADMIN='),'Dashboard snapshot is exposed before notification decoration');
assert.match(css,/\.a43-online\{[\s\S]*?bottom:calc\(70px \+ [\s\S]*?pointer-events:none;/,'Mobile Online badge is above the tab bar and cannot intercept taps');
assert.match(css,/min-height:0!important/,'Android global button height is overridden for the status badge');

const openStart=advanced.indexOf('async function openNotificationsV62()');
const badgeStart=advanced.indexOf('let v62NotificationCache=',openStart);
assert.ok(openStart>=0&&badgeStart>openStart,'Notification opener exists');
const opener=advanced.slice(openStart,badgeStart);
assert.ok(opener.indexOf('renderNotificationsV672(host,cached')<opener.indexOf("await api('/notifications'"),'Cached alerts render before the network refresh');
assert.match(opener,/timeoutMs:8000/,'Notification refresh has a finite timeout');
assert.match(opener,/if\(!cached&&document\.body\.contains\(host\)\)/,'Cached alerts remain visible when refresh fails');

const localStart=advanced.indexOf('function localNotificationFeedV672()');
const renderStart=advanced.indexOf('function renderNotificationsV672(',localStart);
assert.ok(localStart>=0&&renderStart>localStart,'Local notification feed exists');
const context={window:{ML_APP_DATA:{
  partyLedger:[{party_name:'TEST PARTY',outstanding:100}],
  supplierLedger:[{owner_name:'TEST SUPPLIER',pending:50}],
  documents:[{id:'D1',truck_no:'GJ 00 AA 0000',kind:'RC',file_name:'RC.jpg',expiry_date:new Date().toISOString().slice(0,10)}],
  saas:{subscription:{status:'TRIAL'},daysRemaining:1}
}},Date,Number};
vm.createContext(context);
vm.runInContext(`${advanced.slice(localStart,renderStart)};result=localNotificationFeedV672();`,context);
assert.equal(context.result.count,4,'Local feed includes party, supplier, document and subscription alerts');
assert.equal(context.result.urgent,3,'Local feed marks the correct alerts important');

assert.match(index,/advanced-v44\.css\?v=672/);
assert.match(index,/app\.js\?v=691/);
assert.match(index,/advanced-v44\.js\?v=692/);

if(fs.existsSync(path.join(root,'android/app/src/main/assets/public')))for(const rel of ['index.html','src/app.js','src/advanced-v44.js','src/advanced-v44.css']){
  const source=read(`public/${rel}`);
  const copied=read(`android/app/src/main/assets/public/${rel}`);
  assert.equal(copied,source,`Android copied asset matches public/${rel}`);
}

console.log('V67.2 Online badge + Notifications regression passed');
