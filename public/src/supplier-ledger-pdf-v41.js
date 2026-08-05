const encoder=new TextEncoder();
const PAGE_W=595.28;
const PAGE_H=841.89;

const toBytes=value=>typeof value==='string'?encoder.encode(value):value;
const concatBytes=chunks=>{
  const arrays=chunks.map(toBytes);
  const length=arrays.reduce((sum,item)=>sum+item.length,0);
  const out=new Uint8Array(length);
  let offset=0;
  for(const item of arrays){out.set(item,offset);offset+=item.length}
  return out;
};
const cleanAscii=value=>String(value??'')
  .normalize('NFKD')
  .replace(/[\u2013\u2014\u2192]/g,'-')
  .replace(/[^\x20-\x7E]/g,'?');
const pdfEscape=value=>cleanAscii(value).replace(/([\\()])/g,'\\$1');
const fmt=value=>Number(value||0).toFixed(2).replace(/\.00$/,'');
const num=value=>Number(value||0);
const round2=value=>Math.round((num(value)+Number.EPSILON)*100)/100;
const money=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
const money2=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const number3=value=>Number(value||0).toFixed(3);
const safeName=value=>String(value||'SUPPLIER').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();

function formatDate(value){
  if(!value)return '-';
  const text=String(value).slice(0,10);
  const [year,month,day]=text.split('-').map(Number);
  if(!year||!month||!day)return text;
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function tripInvoiceLookup(bootstrap={}){
  const itemByTrip=new Map();
  const invoiceByTrip=new Map();
  for(const invoice of bootstrap.invoices||[]){
    for(const item of invoice.items||[]){
      if(item.trip_id){itemByTrip.set(String(item.trip_id),item);invoiceByTrip.set(String(item.trip_id),invoice)}
    }
  }
  return {itemByTrip,invoiceByTrip};
}
function classifyPayment(payment){
  const note=`${payment.notes||''} ${payment.reference||''}`.toUpperCase();
  return note.includes('ADVANCE')?'advance':'payment';
}
function linkedCharge(expense){
  const text=`${expense.category||''} ${expense.notes||''}`.toUpperCase();
  return /SUPPLIER\s*CHARGE|TRUCK\s*CHARGE|MALIK\s*CHARGE/.test(text);
}

export function buildSupplierLedgerModel(payload={},name='',bootstrap={}){
  const summary=(bootstrap.supplierLedger||[]).find(item=>String(item.owner_name||'').toUpperCase()===String(name||'').toUpperCase())||{};
  const supplierAccount=(bootstrap.supplierAccounts||[]).find(item=>String(item.owner_name||'').toUpperCase()===String(name||'').toUpperCase())||{};
  const ownerName=summary.owner_name||supplierAccount.owner_name||name||'SUPPLIER';
  const ledgerNo=summary.ledger_no||supplierAccount.ledger_no||'';
  const tripById=new Map((bootstrap.trips||[]).map(item=>[String(item.id),item]));
  const {itemByTrip,invoiceByTrip}=tripInvoiceLookup(bootstrap);
  const paymentsByTrip=new Map();
  const unlinkedPayments=[];
  for(const payment of payload.payments||[]){
    const tripId=String(payment.trip_id||'').trim();
    if(tripId){
      if(!paymentsByTrip.has(tripId))paymentsByTrip.set(tripId,[]);
      paymentsByTrip.get(tripId).push(payment);
    }else unlinkedPayments.push(payment);
  }
  const expensesByTrip=new Map();
  for(const expense of bootstrap.expenses||[]){
    if(!linkedCharge(expense))continue;
    const tripId=String(expense.trip_id||'').trim();
    if(!tripId)continue;
    if(!expensesByTrip.has(tripId))expensesByTrip.set(tripId,[]);
    expensesByTrip.get(tripId).push(expense);
  }

  const rows=[];
  for(const entry of payload.entries||[]){
    const tripId=String(entry.trip_id||'');
    const trip=tripById.get(tripId)||{};
    const item=itemByTrip.get(tripId)||{};
    const invoice=invoiceByTrip.get(tripId)||{};
    const linked=paymentsByTrip.get(tripId)||[];
    const advance=linked.filter(p=>classifyPayment(p)==='advance').reduce((sum,p)=>sum+num(p.amount),0);
    const payments=linked.filter(p=>classifyPayment(p)!=='advance').reduce((sum,p)=>sum+num(p.amount),0);
    const charges=(expensesByTrip.get(tripId)||[]).reduce((sum,e)=>sum+num(e.amount),0);
    const deduction=num(entry.commission);
    const weight=num(entry.weight||trip.billing_weight||trip.weight);
    const rate=num(entry.rate);
    const calculated=round2(weight*rate);
    const hireCost=calculated||round2(num(entry.payable)+deduction);
    const totalDue=round2(hireCost+charges-advance-deduction-payments);
    rows.push({
      kind:'TRIP',
      sortDate:entry.entry_date||trip.trip_date||'',
      lrNumber:item.lr_number||invoice.lr_no||trip.lr_number||'-',
      tripDate:entry.entry_date||trip.trip_date||'',
      truckNo:entry.truck_no||trip.truck_no||'-',
      route:`${entry.loading_point||trip.loading_point||'-'} to ${entry.unloading_point||trip.unloading_point||'-'}`,
      material:trip.material||invoice.material||'Market',
      rateText:`Rs. ${money(rate)} x ${number3(weight)} T`,
      hireCost,advance,charges,deduction,payments,totalDue,
      tripId
    });
  }

  for(const bill of payload.pmBills||[]){
    const items=(bill.items&&bill.items.length?bill.items:[null]);
    items.forEach((item,index)=>{
      const weight=num(item?.weight);
      const rate=num(item?.supplier_rate);
      const hireCost=round2(item?num(item.supplier_amount):num(bill.supplier_total));
      rows.push({
        kind:'PM_BILL',
        sortDate:bill.bill_date||'',
        lrNumber:bill.bill_no||'-',
        tripDate:bill.bill_date||'',
        truckNo:item?.truck_no||'-',
        route:item?`${item.loading_point||'-'} to ${item.unloading_point||'-'}`:'PM Bill',
        material:'NON-GST BILL',
        rateText:item?`Rs. ${money(rate)} x ${number3(weight)} T`:'-',
        hireCost,advance:0,charges:0,deduction:0,payments:0,totalDue:hireCost,
        billId:bill.id,
        rowKey:`${bill.id||bill.bill_no||'PM'}-${index}`
      });
    });
  }

  rows.sort((a,b)=>String(b.sortDate).localeCompare(String(a.sortDate))||String(a.truckNo).localeCompare(String(b.truckNo)));

  // Allocate general supplier payments FIFO so the row-wise due matches the supplier balance.
  for(const payment of unlinkedPayments.sort((a,b)=>String(a.payment_date).localeCompare(String(b.payment_date)))){
    let remaining=num(payment.amount);
    for(const row of rows){
      if(remaining<=0)break;
      const available=Math.max(0,num(row.totalDue));
      if(!available)continue;
      const applied=Math.min(available,remaining);
      if(classifyPayment(payment)==='advance')row.advance=round2(row.advance+applied);
      else row.payments=round2(row.payments+applied);
      row.totalDue=round2(row.totalDue-applied);
      remaining=round2(remaining-applied);
    }
    if(remaining>0){
      rows.push({
        kind:'PAYMENT',sortDate:payment.payment_date||'',lrNumber:payment.receipt_no||'-',tripDate:payment.payment_date||'',truckNo:payment.truck_no||'-',
        route:'GENERAL SUPPLIER PAYMENT',material:'PAYMENT',rateText:'-',hireCost:0,
        advance:classifyPayment(payment)==='advance'?remaining:0,charges:0,deduction:0,payments:classifyPayment(payment)==='advance'?0:remaining,
        totalDue:-remaining
      });
    }
  }

  const dates=[
    ...(payload.entries||[]).map(x=>x.entry_date),
    ...(payload.payments||[]).map(x=>x.payment_date),
    ...(payload.pmBills||[]).map(x=>x.bill_date)
  ].filter(Boolean).sort();
  const asOn=new Date().toISOString().slice(0,10);
  const calculatedDue=round2(rows.reduce((sum,row)=>sum+num(row.totalDue),0));
  const apiBalance=Number.isFinite(Number(payload.balance))?round2(payload.balance):calculatedDue;
  return {
    ownerName,ledgerNo,asOn,fromDate:dates[0]||'',toDate:dates[dates.length-1]||'',
    tripCount:(payload.entries||[]).length,pmBillCount:(payload.pmBills||[]).length,
    rows,totalDue:apiBalance,calculatedDue
  };
}

class CanvasPdf{
  constructor(){this.commands=[]}
  cmd(value){this.commands.push(value)}
  strokeColor(r,g,b){this.cmd(`${r} ${g} ${b} RG`)}
  fillColor(r,g,b){this.cmd(`${r} ${g} ${b} rg`)}
  lineWidth(width){this.cmd(`${fmt(width)} w`)}
  line(x1,y1,x2,y2){this.cmd(`${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`)}
  rect(x,y,w,h,{fill=null,stroke=true}={}){
    if(fill)this.fillColor(...fill);
    this.cmd(`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re ${fill&&stroke?'B':fill?'f':'S'}`);
  }
  text(value,x,y,size=8,{font='F1',align='left',color=[0,0,0]}={}){
    const text=cleanAscii(value);
    const estimate=text.length*size*(font==='F2'?0.56:0.52);
    let tx=x;
    if(align==='center')tx=x-estimate/2;
    if(align==='right')tx=x-estimate;
    this.cmd(`BT /${font} ${fmt(size)} Tf ${color.join(' ')} rg 1 0 0 1 ${fmt(tx)} ${fmt(y)} Tm (${pdfEscape(text)}) Tj ET`);
  }
  wrappedText(value,x,y,width,size=6,{font='F1',align='left',leading=size*1.15,maxLines=2,color=[0,0,0]}={}){
    const words=cleanAscii(value).split(/\s+/).filter(Boolean);
    const chars=Math.max(4,Math.floor(width/(size*0.52)));
    const lines=[];let current='';
    for(const word of words){
      const test=current?`${current} ${word}`:word;
      if(test.length<=chars){current=test;continue}
      if(current)lines.push(current);
      current=word;
      if(lines.length>=maxLines-1)break;
    }
    if(current&&lines.length<maxLines)lines.push(current);
    lines.slice(0,maxLines).forEach((line,index)=>{
      const py=y-index*leading;
      if(align==='center')this.text(line,x+width/2,py,size,{font,align:'center',color});
      else if(align==='right')this.text(line,x+width,py,size,{font,align:'right',color});
      else this.text(line,x,py,size,{font,align:'left',color});
    });
  }
  toBytes(){return encoder.encode(this.commands.join('\n'))}
}
function drawCell(pdf,{x,y,w,h,text='',font='F1',size=5.1,align='left',fill=null,padding=2,wrap=false,maxLines=2,color=[0,0,0]}){
  pdf.strokeColor(0.77,0.81,0.86);pdf.lineWidth(0.45);pdf.rect(x,y,w,h,{fill,stroke:true});
  if(wrap)pdf.wrappedText(text,x+padding,y+h-size-3,w-padding*2,size,{font,align,leading:size*1.12,maxLines,color});
  else{
    const tx=align==='left'?x+padding:align==='right'?x+w-padding:x+w/2;
    pdf.text(text,tx,y+h/2-size*0.34,size,{font,align,color});
  }
}
const columns=[
  ['S.No.',18],['LR Number',36],['Trip Date',38],['Truck No',50],['Route',55],['Material',40],['Rate',58],
  ['Truck Hire Cost',48],['Advance',38],['Charges',36],['Deduction',40],['Payments',40],['Total Due',46]
];
const tableX=26;
const tableWidth=columns.reduce((sum,item)=>sum+item[1],0);
function drawHeader(pdf,model,pageNo,totalPages,firstPage){
  if(firstPage){
    pdf.text('MEERA LOGISTICS',PAGE_W/2,813,13,{font:'F2',align:'center',color:[0.05,0.12,0.22]});
    pdf.text(`${model.ledgerNo?model.ledgerNo+' - ':''}${model.ownerName}`,PAGE_W-27,813,8.5,{font:'F2',align:'right',color:[0.05,0.12,0.22]});
    pdf.text(`Supplier Ledger Details as on ${formatDate(model.asOn)}`,PAGE_W/2,794,7.2,{font:'F1',align:'center',color:[0.15,0.20,0.28]});
    pdf.strokeColor(0.85,0.88,0.92);pdf.lineWidth(0.6);pdf.line(26,777,PAGE_W-26,777);
    pdf.text('Total Due :',26,758,8,{font:'F2',color:[0.05,0.12,0.22]});
    const summary=`${model.tripCount} Trips${model.pmBillCount?` + ${model.pmBillCount} PM Bills`:''}  |  Rs. ${money(Math.round(model.totalDue))}`;
    pdf.text(summary,PAGE_W-27,758,8,{font:'F2',align:'right',color:[0.05,0.12,0.22]});
    return 740;
  }
  pdf.text('MEERA LOGISTICS',26,813,10,{font:'F2',color:[0.05,0.12,0.22]});
  pdf.text(`${model.ledgerNo?model.ledgerNo+' - ':''}${model.ownerName}`,PAGE_W-27,813,8,{font:'F2',align:'right',color:[0.05,0.12,0.22]});
  pdf.text(`Supplier Ledger - Page ${pageNo} of ${totalPages}`,PAGE_W/2,795,7,{align:'center'});
  return 777;
}
function drawTableHeader(pdf,top){
  let x=tableX;const h=25;
  for(const [label,w] of columns){
    drawCell(pdf,{x,y:top-h,w,h,text:label,font:'F2',size:4.7,align:'center',fill:[0.04,0.14,0.29],color:[1,1,1],wrap:true,maxLines:2,padding:1});
    x+=w;
  }
  return top-h;
}
function drawDataRow(pdf,row,index,y,h){
  const values=[
    String(index+1),row.lrNumber||'-',formatDate(row.tripDate),row.truckNo||'-',row.route||'-',row.material||'-',row.rateText||'-',
    `Rs. ${money(Math.round(row.hireCost))}`,`Rs. ${money(Math.round(row.advance))}`,`Rs. ${money(Math.round(row.charges))}`,`Rs. ${money(Math.round(row.deduction))}`,
    `Rs. ${money(Math.round(row.payments))}`,`Rs. ${money(Math.round(row.totalDue))}`
  ];
  let x=tableX;
  columns.forEach(([label,w],i)=>{
    drawCell(pdf,{x,y,w,h,text:values[i],font:i===3||i===12?'F2':'F1',size:i===6?4.6:4.75,
      align:i>=7?'right':i===0?'center':'left',wrap:i>=1&&i<=6,maxLines:2,padding:1.5});
    x+=w;
  });
}
function footer(pdf,pageNo,totalPages){
  pdf.text(`Page ${pageNo}${totalPages>1?` of ${totalPages}`:''}`,26,24,6,{font:'F1',color:[0.35,0.40,0.48]});
  pdf.text('Automatically generated supplier ledger - Meera Logistics',PAGE_W/2,24,6,{align:'center',color:[0.35,0.40,0.48]});
}
function createPage(model,rows,pageNo,totalPages,startIndex){
  const pdf=new CanvasPdf();
  let y=drawHeader(pdf,model,pageNo,totalPages,pageNo===1);
  y=drawTableHeader(pdf,y);
  const rowH=29;
  rows.forEach((row,index)=>{y-=rowH;drawDataRow(pdf,row,startIndex+index,y,rowH)});
  footer(pdf,pageNo,totalPages);
  return pdf.toBytes();
}
function pdfObject(id,body){return concatBytes([`${id} 0 obj\n`,body,'\nendobj\n'])}
function streamObject(id,dict,stream){return concatBytes([`${id} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`,stream,'\nendstream\nendobj\n'])}
function buildPdfFile(pageContents){
  const count=pageContents.length;
  const firstPageId=3, fontRegularId=firstPageId+count, fontBoldId=fontRegularId+1, firstContentId=fontBoldId+1;
  const lastId=firstContentId+count-1,objects=[];
  objects[1]=pdfObject(1,'<< /Type /Catalog /Pages 2 0 R >>');
  const kids=Array.from({length:count},(_,index)=>`${firstPageId+index} 0 R`).join(' ');
  objects[2]=pdfObject(2,`<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);
  for(let index=0;index<count;index++){
    const pageId=firstPageId+index,contentId=firstContentId+index;
    objects[pageId]=pdfObject(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  }
  objects[fontRegularId]=pdfObject(fontRegularId,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects[fontBoldId]=pdfObject(fontBoldId,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pageContents.forEach((content,index)=>{objects[firstContentId+index]=streamObject(firstContentId+index,'',content)});
  const headerBytes=concatBytes([encoder.encode('%PDF-1.4\n%'),new Uint8Array([0xE2,0xE3,0xCF,0xD3]),encoder.encode('\n')]);
  const chunks=[headerBytes],offsets=[0];let length=headerBytes.length;
  for(let id=1;id<=lastId;id++){offsets[id]=length;chunks.push(objects[id]);length+=objects[id].length}
  const xrefOffset=length;let xref=`xref\n0 ${lastId+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=lastId;id++)xref+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  chunks.push(encoder.encode(`${xref}trailer\n<< /Size ${lastId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return concatBytes(chunks);
}

export function createSupplierLedgerPdfBlob(payload,name='',bootstrap={}){
  const model=buildSupplierLedgerModel(payload,name,bootstrap);
  const firstCapacity=19,nextCapacity=23,pages=[];let index=0;
  pages.push(model.rows.slice(index,index+firstCapacity));index+=firstCapacity;
  while(index<model.rows.length){pages.push(model.rows.slice(index,index+nextCapacity));index+=nextCapacity}
  if(!pages.length)pages.push([]);
  let startIndex=0;
  const contents=pages.map((rows,pageIndex)=>{
    const bytes=createPage(model,rows,pageIndex+1,pages.length,startIndex);startIndex+=rows.length;return bytes;
  });
  return new Blob([buildPdfFile(contents)],{type:'application/pdf'});
}
export function supplierLedgerPdfName(payload,name='',bootstrap={}){
  const model=buildSupplierLedgerModel(payload,name,bootstrap);
  return `${safeName(model.ledgerNo?`${model.ledgerNo} - ${model.ownerName}`:model.ownerName)} SUPPLIER LEDGER.pdf`;
}
