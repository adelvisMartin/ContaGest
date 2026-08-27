const FORMULA_PREFIX=/^[=+\-@]/;

export function sanitizeSpreadsheetCell(value='') {
  const text=String(value??'');
  return FORMULA_PREFIX.test(text.trimStart())?`'${text}`:text;
}

function csvCell(value) {
  const safe=sanitizeSpreadsheetCell(value).replace(/"/g,'""');
  return `"${safe}"`;
}

export function commercialCsv(rows=[],columns=[]) {
  const header=columns.map(column=>csvCell(column.label)).join(',');
  const body=rows.map(row=>columns.map(column=>csvCell(column.format?column.format(row[column.key],row):row[column.key])).join(',')).join('\r\n');
  return `\uFEFF${header}${body?`\r\n${body}`:''}`;
}

function latin1(value='') {
  const normalized=String(value)
    .replace(/[–—]/g,'-')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/…/g,'...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g,'?');
  const bytes=new Uint8Array(normalized.length);
  for(let i=0;i<normalized.length;i+=1)bytes[i]=normalized.charCodeAt(i)&0xff;
  return bytes;
}

function pdfEscape(value='') {
  return String(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ');
}

function clip(value,max=28) {
  const text=String(value??'').replace(/\s+/g,' ').trim();
  return text.length>max?`${text.slice(0,Math.max(1,max-3))}...`:text;
}

function wrapLine(value,width=94) {
  const text=String(value??'').trimEnd();
  if(!text)return [''];
  const lines=[];
  let rest=text;
  while(rest.length>width){
    let cut=rest.lastIndexOf(' ',width);
    if(cut<Math.floor(width*.55))cut=width;
    lines.push(rest.slice(0,cut).trimEnd());
    rest=rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

export function commercialPdfBytes({title='ContaGest · Reporte comercial',rows=[],columns=[]}={}) {
  const generated=new Date().toISOString();
  const headers=columns.map(column=>clip(column.label,column.pdfWidth||22)).join(' | ');
  const dataLines=rows.flatMap(row=>wrapLine(columns.map(column=>clip(column.format?column.format(row[column.key],row):row[column.key],column.pdfWidth||22)).join(' | ')));
  const lines=[title,`Generado: ${generated}`,`Registros: ${rows.length}`,'',headers,'-'.repeat(Math.min(94,Math.max(24,headers.length))),...dataLines];
  const pageSize=48;
  const pages=[];
  for(let i=0;i<lines.length;i+=pageSize)pages.push(lines.slice(i,i+pageSize));
  if(!pages.length)pages.push([title,'Sin registros.']);

  const pageObjectIds=pages.map((_,index)=>4+index*2);
  const objects=new Map();
  objects.set(1,'<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2,`<< /Type /Pages /Kids [${pageObjectIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.set(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  pages.forEach((pageLines,index)=>{
    const pageId=pageObjectIds[index];
    const contentId=pageId+1;
    const commands=['BT','/F1 9 Tf','40 802 Td','12 TL',...pageLines.flatMap(line=>[`(${pdfEscape(line)}) Tj`,'T*']),'ET'].join('\n');
    const commandLength=latin1(commands).length;
    objects.set(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId,`<< /Length ${commandLength} >>\nstream\n${commands}\nendstream`);
  });

  const maxId=Math.max(...objects.keys());
  const chunks=[];
  const offsets=new Array(maxId+1).fill(0);
  let offset=0;
  const append=(value)=>{const bytes=latin1(value);chunks.push(bytes);offset+=bytes.length;};
  append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  for(let id=1;id<=maxId;id+=1){
    offsets[id]=offset;
    append(`${id} 0 obj\n${objects.get(id)||'<<>>'}\nendobj\n`);
  }
  const xrefOffset=offset;
  append(`xref\n0 ${maxId+1}\n0000000000 65535 f \n`);
  for(let id=1;id<=maxId;id+=1)append(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  append(`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));
  let cursor=0;
  chunks.forEach(chunk=>{output.set(chunk,cursor);cursor+=chunk.length;});
  return output;
}

function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  anchor.rel='noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

export function downloadCommercialCsv(rows,columns,filename='contagest-comercial.csv') {
  downloadBlob(new Blob([commercialCsv(rows,columns)],{type:'text/csv;charset=utf-8'}),filename);
}

export function downloadCommercialPdf(rows,columns,filename='contagest-comercial.pdf',title='ContaGest · Reporte comercial') {
  downloadBlob(new Blob([commercialPdfBytes({title,rows,columns})],{type:'application/pdf'}),filename);
}
