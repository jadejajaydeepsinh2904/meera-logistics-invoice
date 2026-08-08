import assert from 'node:assert/strict';
import {parseWorkbookSheets,buildImportedInvoices,isoDate} from '../public/src/invoice-import-v691.js';

const parse=rows=>parseWorkbookSheets([{name:'Sheet1',rows}]);
const build=(parsed,options={})=>buildImportedInvoices(parsed.records,{fileName:'OLD-BILLS.xlsx',...options});

assert.equal(isoDate('05-Feb-2026'),'2026-02-05');
assert.equal(isoDate('04-06-2026'),'2026-06-04');
assert.equal(isoDate(new Date(2026,6,8)),'2026-07-08');

const jalaram=parse([
  ['JALARAM ENTERPRISE'],
  ['GST NO. 24BGWPT5640L1ZK'],
  ['BILL NO.','DATE','TRUCK NO.','AMOUNT','CGST @9%','SGST @9%','TOTAL'],
  ['MEE-92','05-Feb-2026','GJ 12 BW 5199',23480,2113,2113,27706],
  ['MEE-97','11-Feb-2026','GJ 18 AT 9065',18900,1701,1701,22302],
  ['MEE-124','06-Mar-2026','GJ 39 TB 1984',36162,3254,3254,42670]
]);
assert.equal(jalaram.sources.length,1);
assert.equal(jalaram.records.length,3);
const jalaramInvoices=build(jalaram);
assert.equal(jalaramInvoices.length,3);
assert.equal(jalaramInvoices[0].partyName,'JALARAM ENTERPRISE');
assert.equal(jalaramInvoices[0].partyGst,'24BGWPT5640L1ZK');
assert.equal(jalaramInvoices[0].invoiceDate,'2026-02-05');
assert.equal(jalaramInvoices[0].items[0].truckNo,'GJ 12 BW 5199');
assert.equal(jalaramInvoices[0].items[0].rate,23480);
assert.equal(jalaramInvoices[0].sgst,9);
assert.equal(jalaramInvoices[0].cgst,9);
assert.equal(jalaramInvoices[0].errors.length,0);

const detailed=parse([
  ['BILL NO.','BILL DATE','DATE','TRUCK NUMBER','LODING P','UNLODING P','TRANSPORTER','BHADU','GST 9%','GST 9%','TOTAL'],
  ['ML - 94','08-07-2026','30-06-2026','GJ 03 CU 0999','SAMGHOGHA','HADAMTADA','SHREE SATGURU TRANSPORT',30042.80,2703.85,2703.85,35450.50],
  ['ML - 95','08-07-2026','03-07-2026','GJ 03 CU 6679','SAMGHOGHA','HADAMTADA','SHREE SATGURU TRANSPORT',28940.80,2604.672,2604.672,34150.144],
  ['ML - 96','09-07-2026','07-07-2026','GJ 12 BZ 8848','ANKLESHWAR','KANDLA','SAANAVI ENTERPRISE',37800,3402,3402,44604]
]);
const detailedInvoices=build(detailed);
assert.equal(detailedInvoices.length,3);
assert.equal(detailedInvoices[0].invoiceDate,'2026-07-08');
assert.equal(detailedInvoices[0].loadingDate,'2026-06-30');
assert.equal(detailedInvoices[0].partyName,'SHREE SATGURU TRANSPORT');
assert.equal(detailedInvoices[0].items[0].description,'SAMGHOGHA TO HADAMTADA');
assert.equal(detailedInvoices[0].items[0].rate,30042.8);
assert.equal(detailedInvoices[0].sgst,9);
assert.equal(detailedInvoices[0].cgst,9);
assert.equal(detailedInvoices[0].errors.length,0);

const legacyList=parse([
  ['BILL NO.','BILL DATE','DATE','TRUCK NUMBER','LODING P','UNLODING P','TRANSPORTER','BHADU','GST 9%','GST 9%','TOTAL'],
  ['ML - 54','04-06-2026','04-06-2026','GJ 03 CU 3890','DAHEJ','SANAND','SAANAVI ENTERPRISE',25848,2326.32,2326.32,30500.64],
  ['ML - 55','06-06-2026','06-06-2026','GJ 10 TY 1299','DAHEJ','PIPAVAV','SAANAVI ENTERPRISE',31500,2835,2835,37170]
]);
const legacyInvoices=build(legacyList,{existingInvoices:[{invoice_no:'ML-54'}]});
assert.equal(legacyInvoices[0].duplicate,true);
assert.equal(legacyInvoices[1].duplicate,false);
assert.equal(legacyInvoices[1].partyName,'SAANAVI ENTERPRISE');

const formatted=parse([
  ['MEERA LOGISTICS','','','','ML - 14'],
  ['','','','','Transport Invoice'],
  ['Address','OFFICE NO.101, MOMAI COMPLEX'],
  ['','','INVOICE DATE','04-04-2026'],
  ['','','LR NO.',''],
  ['','','MATERIAL','SULPHURE'],
  ['','','LOADING DATE','04-04-2026'],
  ['','','LOADING WEIGHT',31.380],
  ['','','UNLOADING WEIGHT',31.380],
  ['Bill To'],
  ['Name','B R ROADLINES (INDIA) PVT. LTD.'],
  ['Company','B R ROADLINES (INDIA) PVT. LTD.'],
  ['Address','SMITH HOUSE, 35, DR. MAHESHWARI ROAD'],
  ['GST NO.','27AAFCB2765D2ZT'],
  ['TRUCK NO.','DESCRIPTION','WEIGHT/TON','','RATE PER TONE','','TOTAL'],
  ['GJ 37 V 6492','ESSAR TO VAGRA',31.38,'₹',1350,'₹',42363],
  ['IGST','','₹',7625.34],
  ['Total','','₹',49988.34]
]);
assert.equal(formatted.sources[0].format,'FORM');
const formattedInvoice=build(formatted)[0];
assert.equal(formattedInvoice.invoiceNo,'ML - 14');
assert.equal(formattedInvoice.partyName,'B R ROADLINES (INDIA) PVT. LTD.');
assert.equal(formattedInvoice.partyGst,'27AAFCB2765D2ZT');
assert.equal(formattedInvoice.items[0].truckNo,'GJ 37 V 6492');
assert.equal(formattedInvoice.items[0].weight,31.38);
assert.equal(formattedInvoice.items[0].rate,1350);
assert.equal(formattedInvoice.invoiceType,'IGST');
assert.ok(Math.abs(formattedInvoice.cgst-18)<0.01);
assert.equal(formattedInvoice.sgst,0);
assert.equal(formattedInvoice.expectedTotal,49988.34);
assert.equal(formattedInvoice.warnings.length,0);
assert.equal(formattedInvoice.errors.length,0);

const multiSheet=parseWorkbookSheets([
  {name:'Jalaram',rows:jalaram.sources.length?[
    ['JALARAM ENTERPRISE'],['GST NO. 24BGWPT5640L1ZK'],['BILL NO.','DATE','TRUCK NO.','AMOUNT','CGST @9%','SGST @9%','TOTAL'],['MEE-200','01-Apr-2026','GJ 12 AA 1001',10000,900,900,11800]
  ]:[]},
  {name:'Saanavi',rows:[['BILL NO.','BILL DATE','DATE','TRUCK NUMBER','LODING P','UNLODING P','TRANSPORTER','BHADU','GST 9%','GST 9%','TOTAL'],['ML - 201','02-04-2026','01-04-2026','GJ 12 AA 1002','DAHEJ','KANDLA','SAANAVI ENTERPRISE',20000,1800,1800,23600]]}
]);
assert.equal(multiSheet.sources.length,2);
assert.equal(build(multiSheet).length,2);

console.log('V69.1 old Excel screenshots, multi-sheet parsing, GST/IGST and duplicate protection regression passed.');
