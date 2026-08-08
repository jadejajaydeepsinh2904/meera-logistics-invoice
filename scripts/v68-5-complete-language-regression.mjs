import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const languageSource=read('public/src/language-v683.js');
const index=read('public/index.html');
const advanced=read('public/src/advanced-v44.js');
const sw=read('public/sw-v69.js');
const androidApp=read('android/app/build.gradle');

function languageRuntime(language){
  const documentElement={dataset:{},style:{setProperty(){}}};
  const document={
    documentElement,body:null,
    querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener(){},dispatchEvent(){}
  };
  const window={alert(){},confirm(){return true},prompt(){return ''}};
  const context={
    window,document,
    localStorage:{getItem:()=>language,setItem(){}},
    MutationObserver:class{observe(){}},
    requestAnimationFrame:callback=>callback(),
    CustomEvent:class{}
  };
  vm.runInNewContext(languageSource,context,{filename:'language-v683.js'});
  return window.TransportLanguage;
}

const requiredLabels=[
  'Dashboard','Receive','Pay Supplier','Receive Payment','Party Payment History','Supplier Payment History',
  'Party Khata','Supplier Khata','Truck Fleet','Truck & Document','Master','Forms','Reports & Audit',
  'Settings','Company & Plan','Team & Access','Smart Tools','Notifications','Calendar','Scheduled Backups',
  'System Health','Excel Center','Truck Gallery','New Trip','New Invoice','Recent Entries','Ledger View',
  'Add Truck','Route Master','Material Master','Office Expenses','Run Full Accounting Audit',
  'Booking Workflow','Approvals','Recycle Bin','Company Settings','Subscription Plans','Add Staff Login',
  'Professional Calendar','New Booking','Excel Import / Export Center','Automatic daily backup',
  'Notifications & App Alerts','Enable Browser Alerts','Super Admin','Search truck or owner…',
  'No records found.','Cancel','Save','Delete','Download','Share','Print','Back','Online','Offline','Loading...'
];

for(const code of ['gu','hi']){
  const runtime=languageRuntime(code);
  for(const label of requiredLabels){
    assert.notEqual(runtime.text(label),label,`${code} translates ${label}`);
  }
  assert.equal(runtime.text('JASUBHAI'),'JASUBHAI',`${code} preserves an entered supplier name`);
  assert.equal(runtime.text('GJ 10 AB 5002'),'GJ 10 AB 5002',`${code} preserves an entered truck number`);
}

const gu=languageRuntime('gu');
assert.equal(gu.text('₹ Pay Supplier'),'₹ સપ્લાયરને ચૂકવો');
assert.equal(gu.text('← Back'),'← પાછા');
assert.equal(gu.text('5 transport trips'),'5 ટ્રાન્સપોર્ટ ટ્રિપ્સ');
assert.equal(gu.text('Supplier: JASUBHAI'),'સપ્લાયર: JASUBHAI');
assert.equal(gu.text('Search Truck Number…'),'શોધો ટ્રક નંબર…');
assert.equal(gu.text('Booking → Approval → Dispatch → Trip'),'બુકિંગ → મંજૂરી → ડિસ્પેચ → ટ્રિપ');
assert.equal(gu.route('DAHEJ → KANDLA'),'દહેજ → કંડલા');

const hi=languageRuntime('hi');
assert.equal(hi.text('₹ Pay Supplier'),'₹ सप्लायर को भुगतान करें');
assert.equal(hi.text('← Back'),'← वापस');
assert.equal(hi.text('5 transport trips'),'5 ट्रांसपोर्ट ट्रिप्स');
assert.equal(hi.text('Supplier: JASUBHAI'),'सप्लायर: JASUBHAI');
assert.equal(hi.text('Search Truck Number…'),'खोजें ट्रक नंबर…');
assert.equal(hi.route('DAHEJ → KANDLA'),'दहेज → कांडला');

assert.match(languageSource,/option&&!option\.hasAttribute\('value'\)/,'Data-bound option values are protected');
assert.match(languageSource,/installDialogTranslation/,'Alerts, confirms and prompts use the selected language');
assert.match(languageSource,/schedule\(document\.body\)/,'Every dynamically rendered UI branch is audited');
assert.match(languageSource,/\.transport-invoice,[\s\S]*?\.tds-sheet/,'Business document output remains unmodified');
assert.match(advanced,/TransportLanguage\?\.dateLocale\?\.\(\)/,'Calendar month follows the selected language');
assert.match(index,/language-v683\.js\?v=690/);
assert.match(index,/app\.js\?v=690/);
assert.match(index,/advanced-v44\.js\?v=685/);
assert.match(sw,/transport-v690-shell/);
assert.match(androidApp,/versionCode\s+8\b/);
assert.match(androidApp,/versionName\s+"1\.5\.0"/);

for(const rel of ['index.html','src/app.js','src/advanced-v44.js','src/language-v683.js','src/language-v683.css']){
  assert.equal(read(`android/app/src/main/assets/public/${rel}`),read(`public/${rel}`),`Android copied asset matches public/${rel}`);
}

console.log('V68.5 complete Gujarati + Hindi + English UI translation regression passed.');
