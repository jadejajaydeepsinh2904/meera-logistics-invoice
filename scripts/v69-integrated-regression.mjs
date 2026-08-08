import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const app=read('public/src/app.js');
const fleet=read('public/src/fleet-v69.js');
const fleetCss=read('public/src/fleet-v69.css');
const language=read('public/src/language-v683.js');
const worker=read('worker/src/index.js');
const index=read('public/index.html');
const serviceWorker=read('public/sw-v69.js');
const partyLedger=read('public/src/party-ledger-v40.js');
const supplierLedger=read('public/src/supplier-ledger-v41.js');
const invoiceUi=read('public/src/invoice-v36.js');
const invoicePdf=read('public/src/invoice-pdf-v39.js');
const pkg=JSON.parse(read('package.json'));
const androidPath=path.join(root,'android/app/build.gradle');
const android=fs.existsSync(androidPath)?fs.readFileSync(androidPath,'utf8'):'';

function languageRuntime(code){
  const documentElement={dataset:{},style:{setProperty(){}}};
  const document={documentElement,body:null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},dispatchEvent(){}};
  const window={alert(){},confirm(){return true},prompt(){return ''}};
  vm.runInNewContext(language,{window,document,localStorage:{getItem:()=>code,setItem(){}},MutationObserver:class{observe(){}},requestAnimationFrame:callback=>callback(),CustomEvent:class{}},{filename:'language-v683.js'});
  return window.TransportLanguage;
}

assert.equal(pkg.version,'1.6.0');
assert.equal(pkg.dependencies.xlsx,'^0.18.5');
if(android){assert.match(android,/versionCode\s+9\b/);assert.match(android,/versionName\s+"1\.6\.0"/)}

for(const panel of ['drivers','myTrucks','truckExpenses','invoiceImport']){
  assert.match(app,new RegExp(`['"]${panel}['"]`),`${panel} is wired into main navigation`);
}
for(const action of ['add-driver','driver-entry','add-truck-expense','download-truck-expenses','run-invoice-import']){
  assert.match(fleet,new RegExp(action),`${action} action exists`);
}
assert.match(fleet,/XLSX\.read\(/,'XLSX files are parsed locally');
assert.match(fleet,/Automatic Excel Detection/,'Import automatically detects old Excel layouts');
assert.match(fleet,/duplicate Bill Numbers/i,'Import protects existing invoice numbers');
assert.match(fleet,/api\('\/invoices'/,'Mapped rows create real invoices through the existing invoice workflow');
assert.match(fleet,/invoice-import-v691\.js\?v=691/,'V69.1 importer is wired into the UI');
assert.match(app,/data-type-choice="IGST"/,'Invoice editor supports imported IGST invoices');
assert.match(invoiceUi,/IGST Transport Invoice/,'Invoice preview preserves IGST');
assert.match(invoicePdf,/IGST Transport Invoice/,'Invoice PDF preserves IGST');
assert.match(fleetCss,/\.v69-driver-list/);
assert.match(fleetCss,/\.v69-truck-grid/);
assert.match(fleetCss,/\.v69-mapping/);

for(const token of ['CREATE TABLE IF NOT EXISTS drivers','CREATE TABLE IF NOT EXISTS driver_ledger_entries','CREATE TABLE IF NOT EXISTS truck_expenses',"resource==='drivers'","resource==='driver-entries'","resource==='truck-expenses'",'drivers,driverEntries,truckExpenses']){
  assert.ok(worker.includes(token),`Worker includes ${token}`);
}
for(const sheet of ['Drivers','DriverEntries','TruckExpenses'])assert.match(worker,new RegExp(`${sheet}:\\{table:`),`${sheet} is included in export/backup`);

const gu=languageRuntime('gu');
assert.equal(gu.route('BHOJABEDI → RELIANCE'),'ભોજાબેડી → રિલાયન્સ');
assert.notEqual(gu.route('BAREJA'),'BAREJA','Unknown Roman route names receive Gujarati display transliteration');
assert.equal(gu.text('Driver Khata'),'ડ્રાઇવર ખાતું');
assert.equal(gu.text('Truck Expenses'),'ટ્રક ખર્ચ');
assert.equal(gu.text('Automatic Excel Detection'),'Excel ફોર્મેટ આપમેળે ઓળખાણ');
assert.equal(gu.text('IGST Invoice'),'IGST ઇન્વૉઇસ');
const hi=languageRuntime('hi');
assert.equal(hi.route('BHOJABEDI → RELIANCE'),'भोजाबेड़ी → रिलायंस');
assert.equal(hi.text('Automatic Excel Detection'),'Excel फॉर्मेट की अपने-आप पहचान');

assert.match(index,/vendor\/xlsx\.full\.min\.js\?v=690/);
assert.match(index,/fleet-v69\.css\?v=691/);
assert.match(index,/app\.js\?v=691/);
assert.match(serviceWorker,/transport-v692-shell/);
assert.match(serviceWorker,/fleet-v69\.js\?v=691/);
assert.match(serviceWorker,/invoice-import-v691\.js\?v=691/);
assert.match(serviceWorker,/xlsx\.full\.min\.js\?v=690/);
assert.match(partyLedger,/Ledger downloaded successfully/);
assert.match(supplierLedger,/Ledger downloaded successfully/);

if(android)for(const relative of ['index.html','vendor/xlsx.full.min.js','src/app.js','src/fleet-v69.js','src/fleet-v69.css','src/language-v683.js','src/party-ledger-v40.js','src/supplier-ledger-v41.js'])assert.equal(read(`android/app/src/main/assets/public/${relative}`),read(`public/${relative}`),`Android asset matches ${relative}`);

console.log('V69.1 routes, Driver Khata, My Trucks, expenses, ledger downloads and automatic old Excel invoice import regression passed.');
