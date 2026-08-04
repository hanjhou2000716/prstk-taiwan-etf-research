export function parseCsv(text){
  const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(',');
  return lines.map(line=>{const cells=line.split(','); return Object.fromEntries(header.map((key,i)=>[key,cells[i]]));}).filter(row=>row.date);
}

export function alignSeries(seriesById, mode='common_period'){
  const entries=Object.entries(seriesById).filter(([,rows])=>rows?.length);
  if(!entries.length) return {rows:[],start:null,end:null,missing:0};
  const dates=entries.map(([,rows])=>new Set(rows.map(row=>row.date)));
  const keys=mode==='full_available' ? [...new Set(entries.flatMap(([,rows])=>rows.map(row=>row.date)))].sort() : [...dates.reduce((a,b)=>new Set([...a].filter(x=>b.has(x))))].sort();
  const lookups=Object.fromEntries(entries.map(([id,rows])=>[id,Object.fromEntries(rows.map(row=>[row.date,row]))]));
  const rows=keys.map(date=>({date,values:Object.fromEntries(entries.map(([id])=>[id,lookups[id][date]||null]))}));
  return {rows,start:keys[0]||null,end:keys.at(-1)||null,missing:rows.reduce((n,row)=>n+Object.values(row.values).filter(v=>!v).length,0)};
}

export function slicePeriod(aligned,{mode='all',startDate='',endDate='',tradingDaysPerYear=252}={}){
  let rows=aligned.rows||[]; if(startDate) rows=rows.filter(row=>row.date>=startDate); if(endDate) rows=rows.filter(row=>row.date<=endDate);
  if(mode&&mode!=='all'&&mode!=='custom'){const days=Number(mode)*tradingDaysPerYear; if(rows.length>days+1) rows=rows.slice(-(days+1));}
  return {...aligned,rows,start:rows[0]?.date||null,end:rows.at(-1)?.date||null};
}
