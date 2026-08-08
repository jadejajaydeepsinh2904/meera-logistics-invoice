const text=value=>String(value??'').trim();
const upper=value=>text(value).replace(/\s+/g,' ').toUpperCase();
const key=value=>text(value).toLowerCase().replace(/\[\d+\]$/,'').replace(/[^a-z0-9%]+/g,' ').replace(/\s+/g,' ').trim();
const accountKey=value=>upper(value).replace(/[^A-Z0-9]/g,'');
const numberValue=value=>{
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const cleaned=text(value).replace(/,/g,'').replace(/₹/g,'').replace(/\b(?:rs|inr)\.?/gi,'').replace(/[^0-9.\-]/g,'');
  const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:0;
};

export const IMPORT_FIELDS=[
  ['invoiceNo','Bill / Invoice No.',true,['bill no','bill number','billno','invoice no','invoice number','invoiceno']],
  ['invoiceDate','Bill / Invoice Date',true,['bill date','billdate','invoice date','invoicedate','date']],
  ['loadingDate','Loading / Trip Date',false,['loading date','loding date','trip date','dispatch date','date']],
  ['invoiceType','Invoice Type',false,['invoice type','bill type','gst type','tax type']],
  ['partyName','Party / Transporter',false,['party name','party','transporter','customer name','bill to','company name','company']],
  ['partyNumber','Party / Ledger Number',false,['party number','party no','ledger no','party code','customer code']],
  ['partyGst','Party GST',false,['party gst','gst no','gst number','gstin']],
  ['partyAddress','Party Address',false,['party address','customer address','address']],
  ['lrNumber','LR Number',false,['lr number','lr no','lrno','bilty no','builty no']],
  ['truckNo','Truck / Gadi Number',true,['truck number','truck no','truckno','gadi number','gadi no','vehicle number','vehicle no']],
  ['loadingPoint','Loading Point',false,['loading point','loding point','loading p','loding p','load point','from']],
  ['unloadingPoint','Unloading Point',false,['unloading point','unloding point','unloading p','unloding p','unload point','to']],
  ['description','Route / Description',false,['description','route','particulars','details']],
  ['material','Material',false,['material','product','goods','item']],
  ['loadingWeight','Loading Weight',false,['loading weight','loding weight','load weight','gross weight']],
  ['unloadingWeight','Unloading Weight',false,['unloading weight','unloding weight','unload weight','net weight']],
  ['billingWeight','Billing Weight',false,['billing weight','weight ton','weight','quantity','qty']],
  ['rate','Rate',false,['rate per tone','rate per tonne','rate per ton','freight rate','rate']],
  ['lineAmount','Bhadhu / Amount',false,['bhadu','bhadhu','bhadu amount','amount','line amount','bill amount','freight amount','taxable amount']],
  ['sgst','SGST / First GST',false,['sgst 9%','sgst @9%','sgst','state gst']],
  ['cgst','CGST / Second GST',false,['cgst 9%','cgst @9%','cgst','central gst']],
  ['igst','IGST',false,['igst 18%','igst @18%','igst','integrated gst']],
  ['totalAmount','Grand Total',false,['grand total','invoice total','bill total','total']],
  ['diesel','Diesel',false,['diesel amount','diesel']],
  ['munshi','Munshi Charges',false,['munshi charges','munshi']],
  ['comments','Comments',false,['comments','notes','remark','remarks']],
  ['supplierName','Supplier / Truck Malik',false,['supplier name','supplier','truck malik','owner name']],
  ['supplierRate','Supplier Rate',false,['supplier rate','truck rate','hire rate']],
  ['commission','Commission',false,['commission']],
  ['supplierAdvance','Supplier Advance',false,['supplier advance','advance']]
];

const FIELD_ALIASES=Object.fromEntries(IMPORT_FIELDS.map(([field,,,aliases])=>[field,aliases]));

export function isoDate(value,parseExcelDate=null){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if(typeof value==='number'&&parseExcelDate){const d=parseExcelDate(value);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}
  const raw=text(value);if(!raw)return '';
  if(/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)){const [y,m,d]=raw.split(/[-T]/);return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}
  const match=raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if(match){const year=match[3].length===2?`20${match[3]}`:match[3];return `${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`}
  const named=raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/);
  if(named){const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],month=months.indexOf(named[2].slice(0,3).toLowerCase());if(month>=0){const year=named[3].length===2?`20${named[3]}`:named[3];return `${year}-${String(month+1).padStart(2,'0')}-${named[1].padStart(2,'0')}`}}
  const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?'':`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
}

function uniqueHeaders(row){
  const counts=new Map();
  return row.map((value,index)=>{
    const label=text(value)||`Column ${index+1}`;
    const base=key(label)||`column ${index+1}`;
    const count=(counts.get(base)||0)+1;counts.set(base,count);
    return {index,label:count===1?label:`${label} [${count}]`,originalLabel:label,baseKey:base};
  });
}

function headerScore(row){
  const keys=row.map(key).filter(Boolean);
  const has=aliases=>keys.some(item=>aliases.some(alias=>item===key(alias)));
  let score=0;
  if(has(FIELD_ALIASES.invoiceNo))score+=7;
  if(has(FIELD_ALIASES.truckNo))score+=4;
  if(has(FIELD_ALIASES.invoiceDate))score+=2;
  if(has(FIELD_ALIASES.lineAmount)||has(FIELD_ALIASES.totalAmount))score+=2;
  if(has(FIELD_ALIASES.loadingPoint)||has(FIELD_ALIASES.unloadingPoint))score+=1;
  return score;
}

function findHeader(headers,aliases,used=new Set()){
  const candidates=headers.filter(header=>!used.has(header.index));
  for(const alias of aliases){const aliasKey=key(alias),found=candidates.find(header=>header.baseKey===aliasKey);if(found)return found}
  for(const alias of aliases){
    const aliasKey=key(alias);if(aliasKey.length<4)continue;
    const found=candidates.find(header=>header.baseKey.includes(aliasKey)||aliasKey.includes(header.baseKey));if(found)return found;
  }
  return null;
}

function inferMapping(headers){
  const mapping={};
  const reserved=new Set();
  const invoiceDateExplicit=findHeader(headers,['bill date','invoice date']);
  const genericDate=findHeader(headers,['date']);
  const loadingDateExplicit=findHeader(headers,['loading date','loding date','trip date','dispatch date']);
  mapping.invoiceDate=(invoiceDateExplicit||genericDate)?.index??-1;
  mapping.loadingDate=(loadingDateExplicit||(invoiceDateExplicit?genericDate:null)||invoiceDateExplicit||genericDate)?.index??-1;
  if(mapping.invoiceDate>=0)reserved.add(mapping.invoiceDate);
  for(const [field,,,aliases] of IMPORT_FIELDS){
    if(field==='invoiceDate'||field==='loadingDate'||field==='sgst'||field==='cgst'||field==='igst')continue;
    const found=findHeader(headers,aliases,reserved);
    mapping[field]=found?.index??-1;
    if(found&&['invoiceNo','truckNo','lineAmount','totalAmount'].includes(field))reserved.add(found.index);
  }
  const usedTax=new Set();
  for(const tax of ['sgst','cgst','igst']){
    const found=findHeader(headers,FIELD_ALIASES[tax],usedTax);mapping[tax]=found?.index??-1;if(found)usedTax.add(found.index);
  }
  const genericGst=headers.filter(header=>!usedTax.has(header.index)&&/^gst(?:\s|$)/.test(header.baseKey));
  if(mapping.sgst<0&&genericGst.length){mapping.sgst=genericGst.shift().index;usedTax.add(mapping.sgst)}
  if(mapping.cgst<0&&genericGst.length){mapping.cgst=genericGst.shift().index;usedTax.add(mapping.cgst)}
  return mapping;
}

const gstPattern=/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;
const ignoredTitle=/^(?:MEERA LOGISTICS|TRANSPORT INVOICE|TAX INVOICE|BILL TO|GST NO|GST NUMBER|INVOICE)$/i;
function metadataBefore(matrix,start,end,sheetName){
  const values=matrix.slice(Math.max(start,end-14),end).flat().map(text).filter(Boolean);
  const partyGst=(values.join(' ').match(gstPattern)||[])[0]||'';
  const titleCandidates=values.filter(value=>/[A-Z]/i.test(value)&&!ignoredTitle.test(value)&&!gstPattern.test(value)&&!/^(?:bill|invoice|truck|date|amount|cgst|sgst|igst|total)\b/i.test(value)&&value.length>=4&&value.length<=100);
  let partyName=[...titleCandidates].reverse().find(value=>/enterprise|transport|roadlines|logistics|company|industries|traders|pvt|ltd/i.test(value))||'';
  if(!partyName&&!/^sheet\d*$/i.test(text(sheetName)))partyName=text(sheetName);
  return {partyName:upper(partyName),partyGst:upper(partyGst)};
}

function valueAt(row,index){return index>=0?(row[index]??''):''}
function canonicalFromTable(source){
  const out=[];let last={};
  for(let offset=0;offset<source.rows.length;offset++){
    const row=source.rows[offset];
    const raw={};for(const field of Object.keys(source.mapping))raw[field]=valueAt(row,source.mapping[field]);
    const hasUseful=text(raw.invoiceNo)||text(raw.truckNo)||numberValue(raw.lineAmount)||numberValue(raw.totalAmount);
    if(!hasUseful)continue;
    if(text(raw.invoiceNo))last={invoiceNo:raw.invoiceNo,invoiceDate:raw.invoiceDate,loadingDate:raw.loadingDate,partyName:raw.partyName,partyNumber:raw.partyNumber,partyGst:raw.partyGst,partyAddress:raw.partyAddress,material:raw.material};
    else if(text(raw.truckNo)&&last.invoiceNo)raw.invoiceNo=last.invoiceNo;
    for(const field of ['invoiceDate','loadingDate','partyName','partyNumber','partyGst','partyAddress','material'])if(!text(raw[field])&&text(last[field]))raw[field]=last[field];
    const headerLabel=field=>source.headers.find(header=>header.index===source.mapping[field])?.originalLabel||'';
    out.push({...raw,partyName:raw.partyName||source.metadata.partyName,partyGst:raw.partyGst||source.metadata.partyGst,
      sgstHeader:headerLabel('sgst'),cgstHeader:headerLabel('cgst'),igstHeader:headerLabel('igst'),
      sourceSheet:source.sheetName,sourceRow:source.headerRow+offset+2,sourceFormat:'LIST'});
  }
  return out;
}

function rowContains(row,needle){const target=key(needle);return row.some(value=>key(value)===target||key(value).includes(target))}
function findLabel(matrix,label,{start=0,end=matrix.length}={}){
  const target=key(label);
  for(let r=start;r<end;r++)for(let c=0;c<(matrix[r]||[]).length;c++){const current=key(matrix[r][c]);if(current===target||current.startsWith(target+' '))return {r,c}}
  return null;
}
function rightValue(matrix,position){
  if(!position)return '';
  const row=matrix[position.r]||[];
  for(let c=position.c+1;c<row.length;c++)if(text(row[c])&&!/^(?:₹|rs\.?|inr|-)$/i.test(text(row[c])))return row[c];
  return '';
}
function findValueAfterLabel(matrix,label,options){return rightValue(matrix,findLabel(matrix,label,options))}
function taxCell(matrix,label){
  const pos=findLabel(matrix,label);if(!pos)return {value:'',header:''};
  return {value:rightValue(matrix,pos),header:text(matrix[pos.r][pos.c])};
}
function looksTruck(value){return /^[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4}$/i.test(text(value).replace(/\s+/g,' '))}
function firstMatch(matrix,regex){for(const row of matrix)for(const value of row){const match=text(value).match(regex);if(match)return match[0]}return ''}

function formattedInvoiceRecords(sheetName,matrix){
  const all=matrix.flat().map(text).filter(Boolean),joined=upper(all.join(' | '));
  if(!joined.includes('TRANSPORT INVOICE')||!joined.includes('BILL TO')||!joined.includes('TRUCK NO'))return [];
  const invoiceNo=firstMatch(matrix,/\b(?:ML|MEE)\s*-\s*\d+\b/i);
  const invoiceDate=findValueAfterLabel(matrix,'invoice date');
  const loadingDate=findValueAfterLabel(matrix,'loading date')||invoiceDate;
  const lrNumber=findValueAfterLabel(matrix,'lr no');
  const material=findValueAfterLabel(matrix,'material');
  const loadingWeight=findValueAfterLabel(matrix,'loading weight');
  const unloadingWeight=findValueAfterLabel(matrix,'unloading weight');
  const billTo=findLabel(matrix,'bill to');
  const lineHeader=matrix.findIndex(row=>rowContains(row,'truck no')&&rowContains(row,'description'));
  const partyStart=billTo?billTo.r+1:0,partyEnd=lineHeader>partyStart?lineHeader:matrix.length;
  const partyName=findValueAfterLabel(matrix,'name',{start:partyStart,end:partyEnd})||findValueAfterLabel(matrix,'company',{start:partyStart,end:partyEnd});
  const partyAddress=findValueAfterLabel(matrix,'address',{start:partyStart,end:partyEnd});
  const partyGst=findValueAfterLabel(matrix,'gst no',{start:partyStart,end:partyEnd});
  const sgst=taxCell(matrix,'sgst'),cgst=taxCell(matrix,'cgst'),igst=taxCell(matrix,'igst');
  const grandTotal=[...matrix].reverse().find(row=>row.some(value=>key(value)==='total')&&row.some(value=>numberValue(value)>0));
  const totalAmount=grandTotal?[...grandTotal].reverse().map(numberValue).find(value=>value>0)||0:0;
  const records=[];
  if(lineHeader>=0){
    for(let r=lineHeader+1;r<matrix.length;r++){
      const row=matrix[r]||[],truckIndex=row.findIndex(looksTruck);if(truckIndex<0)continue;
      const values=row.map((value,index)=>({value,index})).filter(item=>text(item.value));
      const truckNo=row[truckIndex];
      const routeItem=values.find(item=>item.index>truckIndex&&/[A-Z]/i.test(text(item.value))&&!/^(?:rs|inr)$/i.test(text(item.value))&&!looksTruck(item.value));
      const numerics=values.filter(item=>item.index>truckIndex&&numberValue(item.value)!==0).map(item=>numberValue(item.value));
      const lineAmount=numerics.at(-1)||0,rate=numerics.length>=2?numerics.at(-2):0,billingWeight=numerics.length>=3?numerics.at(-3):numberValue(unloadingWeight)||numberValue(loadingWeight);
      records.push({invoiceNo,invoiceDate,loadingDate,partyName,partyGst,partyAddress,lrNumber,truckNo,description:routeItem?.value||'',material,
        loadingWeight,billingWeight,unloadingWeight,rate,lineAmount,totalAmount,sgst:sgst.value,cgst:cgst.value,igst:igst.value,sgstHeader:sgst.header,cgstHeader:cgst.header,igstHeader:igst.header,
        sourceSheet:sheetName,sourceRow:r+1,sourceFormat:'FORM'});
    }
  }
  return records;
}

export function parseWorkbookSheets(sheets){
  const sources=[],records=[],warnings=[];
  for(const sheet of sheets){
    const matrix=(sheet.rows||[]).map(row=>Array.isArray(row)?row:[row]);if(!matrix.length)continue;
    const formRecords=formattedInvoiceRecords(sheet.name,matrix);
    if(formRecords.length){records.push(...formRecords);sources.push({sheetName:sheet.name,format:'FORM',rows:formRecords.length,metadata:{partyName:upper(formRecords[0].partyName),partyGst:upper(formRecords[0].partyGst)}});continue}
    const headerRows=matrix.map((row,index)=>({index,score:headerScore(row)})).filter(item=>item.score>=9).map(item=>item.index);
    if(!headerRows.length){warnings.push(`${sheet.name}: Bill/Truck header row not found`);continue}
    headerRows.forEach((headerRow,position)=>{
      const next=headerRows[position+1]??matrix.length,headers=uniqueHeaders(matrix[headerRow]||[]),mapping=inferMapping(headers);
      const previous=position?headerRows[position-1]+1:0,metadata=metadataBefore(matrix,previous,headerRow,sheet.name);
      const source={sheetName:sheet.name,format:'LIST',headerRow,headers,mapping,metadata,rows:matrix.slice(headerRow+1,next)};
      const parsed=canonicalFromTable(source);if(parsed.length){sources.push({...source,rows:parsed.length});records.push(...parsed)}
    });
  }
  return {sources,records,warnings};
}

function percentFromHeader(header){const match=text(header).match(/(?:@\s*)?(\d+(?:\.\d+)?)\s*%/);return match?numberValue(match[1]):0}
function taxRate(value,header,subtotal){
  const fromHeader=percentFromHeader(header);if(fromHeader)return fromHeader;
  const amount=numberValue(value);if(!amount)return 0;
  if(/%/.test(text(value))||amount<=30)return amount;
  return subtotal>0?Math.round((amount/subtotal*100)*1000)/1000:0;
}
function nearly(a,b,tolerance=1){return Math.abs(Number(a||0)-Number(b||0))<=tolerance}

export function buildImportedInvoices(records,{parties=[],existingInvoices=[],parseExcelDate=null,fileName=''}={}){
  const groups=new Map();
  records.forEach((record,index)=>{
    const invoiceNo=text(record.invoiceNo),groupKey=accountKey(invoiceNo)||`ROW${index}`;
    let partyName=upper(record.partyName),partyNumber=text(record.partyNumber);
    if(!partyName&&partyNumber){const match=parties.find(p=>accountKey(p.ledger_no)===accountKey(partyNumber)||text(p.id)===partyNumber);partyName=upper(match?.party_name)}
    const party=parties.find(p=>accountKey(p.party_name)===accountKey(partyName))||{};
    const truckNo=upper(record.truckNo),loading=upper(record.loadingPoint),unloading=upper(record.unloadingPoint);
    let weight=numberValue(record.billingWeight)||numberValue(record.unloadingWeight)||numberValue(record.loadingWeight);
    const lineAmount=numberValue(record.lineAmount);let rate=numberValue(record.rate);
    if(!weight&&lineAmount){weight=1;rate=lineAmount}else if(weight&&!rate&&lineAmount)rate=lineAmount/weight;
    const loadingWeight=numberValue(record.loadingWeight)||weight,unloadingWeight=numberValue(record.unloadingWeight)||weight;
    const description=upper(record.description)||[loading,unloading].filter(Boolean).join(' TO ')||'-';
    if(!groups.has(groupKey))groups.set(groupKey,{invoiceNo,invoiceDate:isoDate(record.invoiceDate,parseExcelDate),loadingDate:isoDate(record.loadingDate||record.invoiceDate,parseExcelDate),invoiceType:upper(record.invoiceType),partyName,partyAddress:text(record.partyAddress||party.address),partyGst:upper(record.partyGst||party.gst_no),lrNo:text(record.lrNumber),material:upper(record.material),diesel:numberValue(record.diesel),munshi:numberValue(record.munshi),comments:text(record.comments),items:[],sourceRows:[],tax:{sgst:'',cgst:'',igst:'',sgstHeader:'',cgstHeader:'',igstHeader:'',totalAmount:0}});
    const group=groups.get(groupKey);
    if(!group.partyName&&partyName)group.partyName=partyName;if(!group.partyGst&&record.partyGst)group.partyGst=upper(record.partyGst);
    if(!group.invoiceDate)group.invoiceDate=isoDate(record.invoiceDate,parseExcelDate);if(!group.loadingDate)group.loadingDate=isoDate(record.loadingDate||record.invoiceDate,parseExcelDate);
    group.sourceRows.push(`${record.sourceSheet||'Sheet'}:${record.sourceRow||index+1}`);
    group.items.push({truckNo,description,loadingWeight,unloadingWeight,weight,rate,lrNumber:text(record.lrNumber),loadingDate:isoDate(record.loadingDate||record.invoiceDate,parseExcelDate),supplierName:upper(record.supplierName),supplierRate:numberValue(record.supplierRate),commission:numberValue(record.commission),supplierAdvance:numberValue(record.supplierAdvance)});
    for(const field of ['sgst','cgst','igst'])if(!text(group.tax[field])&&text(record[field])){group.tax[field]=record[field];group.tax[`${field}Header`]=record[`${field}Header`]||''}
    if(!group.tax.totalAmount&&numberValue(record.totalAmount))group.tax.totalAmount=numberValue(record.totalAmount);
  });
  return [...groups.values()].map(group=>{
    const subtotal=group.items.reduce((sum,item)=>sum+numberValue(item.weight)*numberValue(item.rate),0)+numberValue(group.diesel)+numberValue(group.munshi);
    let sgst=taxRate(group.tax.sgst,group.tax.sgstHeader,subtotal),cgst=taxRate(group.tax.cgst,group.tax.cgstHeader,subtotal),igst=taxRate(group.tax.igst,group.tax.igstHeader,subtotal);
    let invoiceType=group.invoiceType==='NON_GST'||group.invoiceType==='NON-GST'?'NON_GST':group.invoiceType==='IGST'?'IGST':'GST';
    if(igst>0){invoiceType='IGST';sgst=0;cgst=igst}
    else if(!sgst&&!cgst&&group.tax.totalAmount&&subtotal){
      const combined=Math.round(((group.tax.totalAmount-subtotal)/subtotal*100)*1000)/1000;
      if(combined>0.05){sgst=Math.round(combined/2*1000)/1000;cgst=Math.round((combined-sgst)*1000)/1000}else if(nearly(group.tax.totalAmount,subtotal))invoiceType='NON_GST';
    }else if(!sgst&&!cgst&&invoiceType==='GST'){sgst=9;cgst=9}
    if(invoiceType==='NON_GST'){sgst=0;cgst=0}
    const calculatedTotal=subtotal*(1+(sgst+cgst)/100),warnings=[];
    if(group.tax.totalAmount&&!nearly(group.tax.totalAmount,calculatedTotal,1.5))warnings.push(`Excel total ${group.tax.totalAmount.toFixed(2)} ≠ calculated ${calculatedTotal.toFixed(2)}`);
    const errors=[];
    if(!group.invoiceNo)errors.push('Bill No. missing');if(!group.invoiceDate)errors.push('Date missing');if(!group.partyName)errors.push('Party missing');
    if(group.items.some(item=>!item.truckNo))errors.push('Truck No. missing');if(group.items.some(item=>!item.weight||!item.rate))errors.push('Weight/Amount missing');
    const duplicate=existingInvoices.some(invoice=>accountKey(invoice.invoice_no||invoice.invoiceNo)===accountKey(group.invoiceNo));
    const sourceNote=`Imported from ${fileName||'old Excel'} (${group.sourceRows.join(', ')})`;
    return {...group,invoiceType,sgst,cgst,comments:[group.comments,invoiceType==='IGST'?'Original tax: IGST':null,sourceNote].filter(Boolean).join('\n'),errors,warnings,duplicate,expectedTotal:group.tax.totalAmount||0,calculatedTotal};
  });
}

export const importerInternals={key,numberValue,headerScore,inferMapping,formattedInvoiceRecords,taxRate};
