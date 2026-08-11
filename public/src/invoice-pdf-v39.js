const encoder=new TextEncoder();
const PAGE_W=841.89;
const PAGE_H=595.28;

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
const money=value=>`Rs. ${Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const number3=value=>Number(value||0).toFixed(3);
const formatDate=value=>{
  if(!value)return '-';
  const parts=String(value).split('-');
  return parts.length===3?`${parts[2]}-${parts[1]}-${parts[0]}`:String(value);
};
const invoiceType=invoice=>(invoice.invoice_type||'GST')==='NON_GST'?'NON-GST':'GST';

const DEFAULT_COMPANY_SETTINGS={
  companyName:'MEERA LOGISTICS',
  address:'OFFICE NO.101, MOMAI COMPLEX, BEDI BANDAR ROAD, JAMNAGAR',
  phone:'9558959579',
  email:'meera.logistics99@gmail.com',
  gstNo:'24ACFFM2544N1Z1'
};
function companySettings(data){
  let local={};
  if(typeof window!=='undefined'&&window.ML_SETTINGS)local=window.ML_SETTINGS;
  else try{local=JSON.parse(localStorage.getItem('ml_app_settings_v44')||'{}')}catch{}
  const c=data?.saas?.company||{};
  const tenant=c.id?{
    companyName:c.company_name||'',
    address:c.address||'',
    phone:c.mobile||'',
    email:c.email||'',
    gstNo:c.gst_no||''
  }:{};
  return {...DEFAULT_COMPANY_SETTINGS,...local,...tenant};
}


function jpegDimensions(bytes){
  let offset=2;
  while(offset+9<bytes.length){
    if(bytes[offset]!==0xFF){offset++;continue}
    const marker=bytes[offset+1];
    offset+=2;
    if(marker===0xD8||marker===0xD9)continue;
    const length=(bytes[offset]<<8)|bytes[offset+1];
    if(length<2)break;
    if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker)){
      return {height:(bytes[offset+3]<<8)|bytes[offset+4],width:(bytes[offset+5]<<8)|bytes[offset+6]};
    }
    offset+=length;
  }
  throw new Error('Invalid JPEG asset.');
}
async function fetchBytes(url){
  const response=await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw new Error(`Unable to load asset: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function loadAssets(provided){
  if(provided?.logo&&provided?.stamp){
    return {
      logo:{bytes:provided.logo, ...jpegDimensions(provided.logo)},
      stamp:{bytes:provided.stamp, ...jpegDimensions(provided.stamp)}
    };
  }
  const [logoBytes,stampBytes]=await Promise.all([
    fetchBytes(new URL('/assets/meera-logo-pdf.jpg',location.origin)),
    fetchBytes(new URL('/assets/meera-partner-stamp-pdf.jpg',location.origin))
  ]);
  return {
    logo:{bytes:logoBytes,...jpegDimensions(logoBytes)},
    stamp:{bytes:stampBytes,...jpegDimensions(stampBytes)}
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
  wrappedText(value,x,y,width,size=8,{font='F1',align='left',leading=size*1.2,maxLines=3,color=[0,0,0]}={}){
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
  image(name,x,y,w,h){this.cmd(`q ${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(y)} cm /${name} Do Q`)}
  toBytes(){return encoder.encode(this.commands.join('\n'))}
}

function drawCell(pdf,{x,y,w,h,text='',font='F1',size=7.5,align='center',fill=null,color=[0,0,0],padding=3,wrap=false,maxLines=2}){
  pdf.strokeColor(0.15,0.15,0.15);pdf.lineWidth(0.5);pdf.rect(x,y,w,h,{fill,stroke:true});
  const baseline=y+h/2-size*0.34;
  if(wrap){
    const top=y+h-size-2;
    pdf.wrappedText(text,x+padding,top,w-padding*2,size,{font,align,leading:size*1.05,maxLines,color});
  }else{
    const tx=align==='left'?x+padding:align==='right'?x+w-padding:x+w/2;
    pdf.text(text,tx,baseline,size,{font,align,color});
  }
}

function pdfObject(id,body){return concatBytes([`${id} 0 obj\n`,body,'\nendobj\n'])}
function streamObject(id,dict,stream){
  return concatBytes([`${id} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`,stream,'\nendstream\nendobj\n']);
}
function buildPdfFile(content,assets){
  const objects=[];
  objects[1]=pdfObject(1,'<< /Type /Catalog /Pages 2 0 R >>');
  objects[2]=pdfObject(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects[3]=pdfObject(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 6 0 R /Stamp 7 0 R >> >> /Contents 8 0 R >>`);
  objects[4]=pdfObject(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects[5]=pdfObject(5,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects[6]=streamObject(6,`/Type /XObject /Subtype /Image /Width ${assets.logo.width} /Height ${assets.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,assets.logo.bytes);
  objects[7]=streamObject(7,`/Type /XObject /Subtype /Image /Width ${assets.stamp.width} /Height ${assets.stamp.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,assets.stamp.bytes);
  objects[8]=streamObject(8,'',content);

  const header=concatBytes([encoder.encode('%PDF-1.4\n%'),new Uint8Array([0xE2,0xE3,0xCF,0xD3]),encoder.encode('\n')]);
  const chunks=[header];
  const offsets=[0];
  let length=header.length;
  for(let id=1;id<=8;id++){
    offsets[id]=length;chunks.push(objects[id]);length+=objects[id].length;
  }
  const xrefOffset=length;
  let xref=`xref\n0 9\n0000000000 65535 f \n`;
  for(let id=1;id<=8;id++)xref+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  const trailer=`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref+trailer));
  return concatBytes(chunks);
}

function createInvoiceContent(invoice,data){
  const company=companySettings(data);
  const pdf=new CanvasPdf();
  const items=invoice.items||[];
  const nonGst=invoiceType(invoice)==='NON-GST';
  const loadingTotal=items.reduce((sum,item)=>sum+Number(item.loading_weight??item.weight??0),0);
  const unloadingTotal=items.reduce((sum,item)=>sum+Number(item.unloading_weight??item.weight??0),0);
  const shortageTotal=items.reduce((sum,item)=>sum+Number(item.shortage??Math.max(0,Number(item.loading_weight||0)-Number(item.unloading_weight||0))),0);
  const freightTotal=items.reduce((sum,item)=>sum+Number(item.amount??Number(item.weight||0)*Number(item.rate||0)),0);
  const taxable=Number(invoice.subtotal||freightTotal)+Number(invoice.diesel||0)+Number(invoice.munshi||0);
  const sgstAmount=nonGst?0:taxable*Number(invoice.sgst||0)/100;
  const cgstAmount=nonGst?0:taxable*Number(invoice.cgst||0)/100;
  const partyGst=invoice.party_gst||(data.parties||[]).find(p=>String(p.party_name||'').trim().toUpperCase()===String(invoice.party_name||'').trim().toUpperCase())?.gst_no||'-';
  const tripById=new Map((data.trips||[]).map(trip=>[String(trip.id),trip]));
  const itemLoadingDate=item=>item.loading_date||item.loadingDate||tripById.get(String(item.trip_id||item.tripId||''))?.trip_date||invoice.loading_date||invoice.invoice_date;
  const loadingDates=[...new Set(items.map(itemLoadingDate).filter(Boolean))];
  const loadingDateSummary=loadingDates.length===1?formatDate(loadingDates[0]):'TRIP-WISE BELOW';

  pdf.strokeColor(0.12,0.24,0.46);pdf.lineWidth(1.2);pdf.rect(8,8,PAGE_W-16,PAGE_H-16);

  const isMeera=!data?.saas?.company?.id||data.saas.company.id==='CMP-MEERA';
  if(isMeera)pdf.image('Logo',24,502,62,62);
  pdf.text(company.companyName,isMeera?104:24,536,isMeera?25:22,{font:'F2'});
  drawCell(pdf,{x:607,y:536,w:207,h:25,text:invoice.invoice_no||'-',font:'F2',size:12,color:[0.72,0.36,0.10]});
  drawCell(pdf,{x:607,y:511,w:207,h:25,text:nonGst?'Non-GST Transport Invoice':'Transport Invoice',font:'F2',size:11,color:[0.72,0.36,0.10]});

  const infoX=24,infoY=434,infoW=390,infoH=58,infoRow=14.5,infoLabel=100;
  const infoRows=[
    ['Address',company.address],
    ['Phone',company.phone],
    ['Email',company.email],
    ['GST No.',company.gstNo]
  ];
  infoRows.forEach((row,index)=>{
    const y=infoY+infoH-(index+1)*infoRow;
    drawCell(pdf,{x:infoX,y,w:infoLabel,h:infoRow,text:row[0],font:'F2',size:7.5,align:'left',fill:[0.91,0.94,0.97]});
    drawCell(pdf,{x:infoX+infoLabel,y,w:infoW-infoLabel,h:infoRow,text:row[1],font:'F2',size:index===0?6.8:7.5,align:'center'});
  });

  const summaryX=600,summaryY=416,summaryW=214,summaryH=87,summaryRow=14.5,summaryLabel=116;
  const summaryRows=[
    ['INVOICE DATE',formatDate(invoice.invoice_date)],
    ['MATERIAL',invoice.material||'-'],
    ['LOADING DATE',loadingDateSummary],
    ['LOADING WEIGHT',number3(loadingTotal)],
    ['UNLOADING WEIGHT',number3(unloadingTotal)],
    ['SHORTAGE',number3(shortageTotal)]
  ];
  summaryRows.forEach((row,index)=>{
    const y=summaryY+summaryH-(index+1)*summaryRow;
    drawCell(pdf,{x:summaryX,y,w:summaryLabel,h:summaryRow,text:row[0],font:'F2',size:7.3,align:'left',fill:[0.91,0.94,0.97]});
    drawCell(pdf,{x:summaryX+summaryLabel,y,w:summaryW-summaryLabel,h:summaryRow,text:row[1],font:'F2',size:7.7,align:'center'});
  });

  const billX=24,billY=330,billW=505,captionH=18,billRow=15.5,billLabel=105;
  drawCell(pdf,{x:billX,y:billY+billRow*4,w:billW,h:captionH,text:'Bill To',font:'F2',size:10,fill:[0.84,0.91,0.96]});
  const billRows=[
    ['Name',invoice.party_name||'-'],
    ['Company',invoice.party_name||'-'],
    ['Address',invoice.party_address||'-'],
    ['GST No.',partyGst]
  ];
  billRows.forEach((row,index)=>{
    const y=billY+billRow*(3-index);
    drawCell(pdf,{x:billX,y,w:billLabel,h:billRow,text:row[0],font:'F2',size:7.3,align:'left',fill:[0.94,0.96,0.98]});
    drawCell(pdf,{x:billX+billLabel,y,w:billW-billLabel,h:billRow,text:row[1],font:'F2',size:index===2?6.8:7.4,align:'center',wrap:index===2,maxLines:2});
  });

  const tableX=24,tableW=790,tableTop=314,headerH=18;
  const totalsRows=nonGst?4:6;
  const totalsHeight=totalsRows*15;
  const bottomY=105;
  const bottomTop=bottomY+Math.max(63,totalsHeight);
  const rowCount=Math.max(1,items.length);
  const rowH=Math.max(7.5,Math.min(18,(tableTop-bottomTop-headerH-10)/rowCount));
  const fontSize=Math.max(5.2,Math.min(7.5,rowH*0.44));
  const columns=[
    ['SR.',24],['LOADING DATE',58],['LR NO.',56],['TRUCK NO.',80],['DESCRIPTION',158],['LOADING WT.',65],['UNLOADING WT.',65],['DIFF.',44],['WEIGHT / TON',65],['RATE PER TON',78],['TOTAL',97]
  ];
  let x=tableX;
  columns.forEach(([label,width])=>{
    drawCell(pdf,{x,y:tableTop-headerH,w:width,h:headerH,text:label,font:'F2',size:6.2,fill:[0.27,0.55,0.77],color:[1,1,1]});x+=width;
  });
  items.forEach((item,index)=>{
    const y=tableTop-headerH-(index+1)*rowH;
    const values=[
      String(index+1),formatDate(itemLoadingDate(item)),item.lr_number||invoice.lr_no||'-',item.truck_no||'-',item.description||'-',
      number3(item.loading_weight??item.weight),number3(item.unloading_weight??item.weight),
      number3(item.shortage??Math.max(0,Number(item.loading_weight||0)-Number(item.unloading_weight||0))),
      number3(item.weight),money(item.rate),money(item.amount??Number(item.weight||0)*Number(item.rate||0))
    ];
    let cx=tableX;
    columns.forEach(([label,width],colIndex)=>{
      drawCell(pdf,{x:cx,y,w:width,h:rowH,text:values[colIndex],font:'F2',size:colIndex===4?Math.max(4.8,fontSize-0.6):colIndex===1?Math.max(5,fontSize-0.3):fontSize,wrap:colIndex===4,maxLines:2});cx+=width;
    });
  });

  const commentsX=24,commentsW=420,commentsH=Math.max(63,totalsHeight);
  drawCell(pdf,{x:commentsX,y:bottomY+commentsH-18,w:commentsW,h:18,text:'Comments',font:'F2',size:8.5,fill:[0.84,0.91,0.96]});
  pdf.strokeColor(0.15,0.15,0.15);pdf.lineWidth(0.5);pdf.rect(commentsX,bottomY,commentsW,commentsH-18);
  const commentLines=String(invoice.comments||'1. Payment due within 30 days.\n2. Mention invoice number in payment reference.').split(/\\n|\n/).filter(Boolean);
  commentLines.slice(0,4).forEach((line,index)=>pdf.text(line,commentsX+7,bottomY+commentsH-32-index*11,7,{font:index<2?'F2':'F1'}));

  const totalsX=590,totalsW=224,totalsLabel=120,totalRow=15;
  const totals=[['Total',freightTotal]];
  if(!nonGst){totals.push([`SGST ${Number(invoice.sgst||0)}%`,sgstAmount],[`CGST ${Number(invoice.cgst||0)}%`,cgstAmount])}
  totals.push(['Diesel',Number(invoice.diesel||0)],['Munshi Charges',Number(invoice.munshi||0)],['Total',Number(invoice.total||freightTotal+sgstAmount+cgstAmount+Number(invoice.diesel||0)+Number(invoice.munshi||0))]);
  totals.forEach((row,index)=>{
    const y=bottomY+totals.length*totalRow-(index+1)*totalRow;
    const isGrand=index===totals.length-1;
    drawCell(pdf,{x:totalsX,y,w:totalsLabel,h:totalRow,text:row[0],font:'F2',size:7.5,align:'left',fill:isGrand?[0.90,0.93,0.96]:null});
    drawCell(pdf,{x:totalsX+totalsLabel,y,w:totalsW-totalsLabel,h:totalRow,text:money(row[1]),font:'F2',size:7.5,align:'right',fill:isGrand?[0.20,0.48,0.78]:null,color:isGrand?[1,1,1]:[0,0,0]});
  });

  const lineY=35;
  pdf.strokeColor(0.25,0.25,0.25);pdf.lineWidth(0.6);
  pdf.line(105,lineY,360,lineY);pdf.line(535,lineY,790,lineY);
  pdf.text('Signature of the Customer',232,lineY-12,7.5,{font:'F2',align:'center'});
  if(isMeera)pdf.image('Stamp',602,lineY+7,122,51);
  pdf.text('Signature of the Supplier',662,lineY-12,7.5,{font:'F2',align:'center'});

  return pdf.toBytes();
}

export async function createInvoicePdfBlob(invoice,data,providedAssets=null){
  const assets=await loadAssets(providedAssets);
  const content=createInvoiceContent(invoice,data);
  const file=buildPdfFile(content,assets);
  return new Blob([file],{type:'application/pdf'});
}

export function safeInvoicePdfName(invoice){
  const clean=value=>String(value||'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
  return `${clean(invoice.invoice_no||'INVOICE')} - ${clean(invoice.party_name||'PARTY')}.pdf`;
}
