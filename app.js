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
  .replace(/[\u2013\u2014]/g,'-')
  .replace(/[^\x20-\x7E]/g,'?');
const pdfEscape=value=>cleanAscii(value).replace(/([\\()])/g,'\\$1');
const fmt=value=>Number(value||0).toFixed(2).replace(/\.00$/,'');
const amount=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

function formatDate(value){
  if(!value)return '-';
  const [year,month,day]=String(value).slice(0,10).split('-').map(Number);
  if(!year||!month||!day)return String(value);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(day).padStart(2,'0')} ${months[month-1]} ${String(year).slice(-2)}`;
}
function voucherNumber(value){
  const match=String(value||'').match(/(\d+)\s*$/);
  return match?match[1]:'-';
}
function balanceText(value){
  const number=Number(value||0);
  return `${amount(Math.abs(number))} ${number<0?'Dr':'Cr'}`;
}
function safeName(value){
  return String(value||'PARTY').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
}

export function buildPartyLedgerModel(payload,name=''){
  const party=payload?.party||{};
  let running=0;
  const rows=(payload?.lines||[]).map(line=>{
    const isInvoice=String(line.type||'').toUpperCase()==='INVOICE';
    const debit=isInvoice?0:Number(line.credit||0);
    const credit=isInvoice?Number(line.debit||0):0;
    running+=credit-debit;
    return {
      date:line.date||'',
      particulars:isInvoice?'Dr PURCHASE ACCOUNT':'Cr RECEIPT / BANK ACCOUNT',
      vchType:isInvoice?'Purchase':'Receipt',
      vchRef:line.reference||'-',
      vchNo:voucherNumber(line.reference),
      debit,
      credit,
      balance:running,
      sourceType:isInvoice?'INVOICE':'PAYMENT'
    };
  });
  const dates=rows.map(row=>row.date).filter(Boolean).sort();
  return {
    partyName:party.party_name||name||'PARTY',
    address:party.address||'',
    gstNo:party.gst_no||'-',
    fromDate:dates[0]||'',
    toDate:dates[dates.length-1]||dates[0]||'',
    rows,
    debitTotal:rows.reduce((sum,row)=>sum+row.debit,0),
    creditTotal:rows.reduce((sum,row)=>sum+row.credit,0),
    closing:running
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
  text(value,x,y,size=9,{font='F1',align='left',color=[0,0,0]}={}){
    const text=cleanAscii(value);
    const estimate=text.length*size*(font==='F2'?0.56:0.52);
    let tx=x;
    if(align==='center')tx=x-estimate/2;
    if(align==='right')tx=x-estimate;
    this.cmd(`BT /${font} ${fmt(size)} Tf ${color.join(' ')} rg 1 0 0 1 ${fmt(tx)} ${fmt(y)} Tm (${pdfEscape(text)}) Tj ET`);
  }
  wrappedText(value,x,y,width,size=8,{font='F1',align='left',leading=size*1.25,maxLines=3,color=[0,0,0]}={}){
    const words=cleanAscii(value).split(/\s+/).filter(Boolean);
    const chars=Math.max(5,Math.floor(width/(size*0.52)));
    const lines=[];
    let current='';
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

function drawCell(pdf,{x,y,w,h,text='',font='F1',size=7.4,align='center',fill=null,padding=3,wrap=false,maxLines=2}){
  pdf.strokeColor(0.12,0.12,0.12);pdf.lineWidth(0.55);pdf.rect(x,y,w,h,{fill,stroke:true});
  if(wrap){
    pdf.wrappedText(text,x+padding,y+h-size-3,w-padding*2,size,{font,align,leading:size*1.05,maxLines});
  }else{
    const tx=align==='left'?x+padding:align==='right'?x+w-padding:x+w/2;
    pdf.text(text,tx,y+h/2-size*0.34,size,{font,align});
  }
}

function header(pdf,model,pageNo,totalPages,firstPage){
  if(firstPage){
    pdf.text(model.partyName,PAGE_W/2,807,18,{font:'F2',align:'center'});
    if(model.address)pdf.wrappedText(model.address,70,785,PAGE_W-140,9,{font:'F1',align:'center',maxLines:2,leading:11});
    pdf.text(`GST NO.: ${model.gstNo||'-'}`,PAGE_W/2,748,9.5,{font:'F1',align:'center'});
    pdf.text('Meera Logistics',PAGE_W/2,715,12.5,{font:'F2',align:'center'});
    pdf.text('Ledger Account',PAGE_W/2,699,12,{font:'F1',align:'center'});
    pdf.text('Shop No-101, Momai Complex',PAGE_W/2,677,9,{font:'F1',align:'center'});
    pdf.text('Bedi Bandar Road, Jamnagar',PAGE_W/2,664,9,{font:'F1',align:'center'});
    const range=model.fromDate?`${formatDate(model.fromDate)} To ${formatDate(model.toDate)}`:'No Transactions';
    pdf.text(range,PAGE_W/2,628,10,{font:'F1',align:'center'});
    pdf.text(`Page ${pageNo}${totalPages>1?` of ${totalPages}`:''}`,PAGE_W-28,590,8,{font:'F1',align:'right'});
    return 574;
  }
  pdf.text(model.partyName,PAGE_W/2,809,15,{font:'F2',align:'center'});
  pdf.text('Meera Logistics - Ledger Account',PAGE_W/2,790,10,{font:'F2',align:'center'});
  if(model.fromDate)pdf.text(`${formatDate(model.fromDate)} To ${formatDate(model.toDate)}`,PAGE_W/2,774,8.5,{align:'center'});
  pdf.text(`Page ${pageNo} of ${totalPages}`,PAGE_W-28,753,8,{align:'right'});
  return 739;
}

const columns=[
  ['Date',57],['Particulars',139],['Vch Type',57],['Vch Ref.',52],['Vch No.',40],['Debit',61],['Credit',61],['Balance',79]
];
const tableX=24;

function drawTableHeader(pdf,top){
  let x=tableX;
  const h=22;
  for(const [label,width] of columns){
    drawCell(pdf,{x,y:top-h,w:width,h,text:label,font:'F1',size:8,fill:[0.96,0.96,0.96]});
    x+=width;
  }
  return top-h;
}
function drawDataRow(pdf,row,y,h){
  const values=[
    formatDate(row.date),row.particulars,row.vchType,row.vchRef,row.vchNo,
    row.debit?amount(row.debit):'-',row.credit?amount(row.credit):'-',balanceText(row.balance)
  ];
  let x=tableX;
  columns.forEach(([label,width],index)=>{
    drawCell(pdf,{x,y,w:width,h,text:values[index],font:index===1?'F1':'F1',size:index===1?7.1:7.2,align:index>=5?'right':index===1?'left':'center',wrap:index===1,maxLines:2});
    x+=width;
  });
}
function drawClosingRow(pdf,model,y,h){
  const firstWidth=columns.slice(0,5).reduce((sum,item)=>sum+item[1],0);
  drawCell(pdf,{x:tableX,y,w:firstWidth,h,text:'Closing Balance',font:'F2',size:8,align:'center'});
  let x=tableX+firstWidth;
  const values=[amount(model.debitTotal),amount(model.creditTotal),balanceText(model.closing)];
  columns.slice(5).forEach(([label,width],index)=>{
    drawCell(pdf,{x,y,w:width,h,text:values[index],font:'F2',size:7.6,align:'right'});x+=width;
  });
}

function createPage(model,rows,pageNo,totalPages,firstPage,isLast){
  const pdf=new CanvasPdf();
  const top=header(pdf,model,pageNo,totalPages,firstPage);
  let y=drawTableHeader(pdf,top);
  const rowH=24;
  rows.forEach(row=>{y-=rowH;drawDataRow(pdf,row,y,rowH)});
  if(isLast){y-=rowH;drawClosingRow(pdf,model,y,rowH)}
  return pdf.toBytes();
}

function pdfObject(id,body){return concatBytes([`${id} 0 obj\n`,body,'\nendobj\n'])}
function streamObject(id,dict,stream){
  return concatBytes([`${id} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`,stream,'\nendstream\nendobj\n']);
}
function buildPdfFile(pageContents){
  const count=pageContents.length;
  const firstPageId=3;
  const fontRegularId=firstPageId+count;
  const fontBoldId=fontRegularId+1;
  const firstContentId=fontBoldId+1;
  const lastId=firstContentId+count-1;
  const objects=[];
  objects[1]=pdfObject(1,'<< /Type /Catalog /Pages 2 0 R >>');
  const kids=Array.from({length:count},(_,index)=>`${firstPageId+index} 0 R`).join(' ');
  objects[2]=pdfObject(2,`<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);
  for(let index=0;index<count;index++){
    const pageId=firstPageId+index;
    const contentId=firstContentId+index;
    objects[pageId]=pdfObject(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  }
  objects[fontRegularId]=pdfObject(fontRegularId,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects[fontBoldId]=pdfObject(fontBoldId,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pageContents.forEach((content,index)=>{objects[firstContentId+index]=streamObject(firstContentId+index,'',content)});

  const headerBytes=concatBytes([encoder.encode('%PDF-1.4\n%'),new Uint8Array([0xE2,0xE3,0xCF,0xD3]),encoder.encode('\n')]);
  const chunks=[headerBytes];
  const offsets=[0];
  let length=headerBytes.length;
  for(let id=1;id<=lastId;id++){
    offsets[id]=length;chunks.push(objects[id]);length+=objects[id].length;
  }
  const xrefOffset=length;
  let xref=`xref\n0 ${lastId+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=lastId;id++)xref+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  const trailer=`trailer\n<< /Size ${lastId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref+trailer));
  return concatBytes(chunks);
}

export function createPartyLedgerPdfBlob(payload,name=''){
  const model=buildPartyLedgerModel(payload,name);
  const firstCapacity=20;
  const nextCapacity=27;
  const pages=[];
  let index=0;
  pages.push(model.rows.slice(index,index+firstCapacity));
  index+=firstCapacity;
  while(index<model.rows.length){pages.push(model.rows.slice(index,index+nextCapacity));index+=nextCapacity}
  if(!pages.length)pages.push([]);
  const contents=pages.map((rows,pageIndex)=>createPage(model,rows,pageIndex+1,pages.length,pageIndex===0,pageIndex===pages.length-1));
  return new Blob([buildPdfFile(contents)],{type:'application/pdf'});
}

export function partyLedgerPdfName(payload,name=''){
  const partyName=payload?.party?.party_name||name||'PARTY';
  return `${safeName(partyName)} PARTY LEDGER.pdf`;
}
