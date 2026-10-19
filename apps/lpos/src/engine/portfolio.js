const MODEL_VERSION = 'web-v0.6.0';
const MAX_ASSETS = 12;
const WARN_THRESHOLD = 130;
const RESTORE_TARGET = 166;
const COST_PCT_DEFAULT = 0.2425; // V2.6: 0.1425% + illustrative 0.10%

const CATALOG = [
  {symbol:'0050', name:'元大台灣50', factor:1},
  {symbol:'006208', name:'富邦台50', factor:1},
  {symbol:'00631L', name:'元大台灣50正2', factor:2},
  {symbol:'00685L', name:'群益臺灣加權正2', factor:2},
  {symbol:'0056', name:'元大高股息', factor:1},
  {symbol:'00878', name:'國泰永續高股息', factor:1},
  {symbol:'00919', name:'群益台灣精選高息', factor:1},
  {symbol:'VT', name:'Vanguard Total World Stock ETF', factor:1},
];
const catalogFund = (symbol) => CATALOG.find(x => x.symbol === symbol) ?? null;
function makeFund(symbol, initialOwn=0, initialLoan=0){
  const found = catalogFund(symbol);
  return { id: symbol+'-'+Math.random().toString(36).slice(2,8), symbol,
    name:found?.name??symbol, factor:found?.factor??1,
    ownWeightPct:initialOwn, loanWeightPct:initialLoan,
    pledgePct:0, ltvPct:60, pledgeStatus:'assumed' };
}
function defaultScenario(){
  const a=makeFund('006208',50,50);a.pledgePct=100;
  const b=makeFund('00878',50,50);b.pledgePct=100;
  return {
    schemaVersion:1, scenarioName:'基準情境', ownCapital:1000000,
    ownCashPct:20, tradeCostPct:COST_PCT_DEFAULT,
    borrowUtilPct:100, loanInvestPct:100, originationFeePct:0,
    aprPct:4, termMonths:6, monthlyFreeCashFlow:20000,
    monthlyLivingExpense:20000, minReserveMonths:3,
    shockPct:30, funds:[a,b],
  };
}
function validateScenario(p){
  const errors=[];
  const warnings=[];
  if(!p || typeof p!=='object') return {errors:['設定物件格式不正確'],warnings};
  const check = (key, low, high, label, inclusiveZero=true) => {
    const n=p[key];
    if(typeof n!=='number'||!Number.isFinite(n)||n<low||n>high||(!inclusiveZero && n===0)) errors.push(`${label}必須介於 ${low} 至 ${high}`);
  };
  check('ownCapital',1,1e12,'自有資金');
  check('ownCashPct',0,100,'自有現金比例');
  check('tradeCostPct',0,20,'每筆買進成本率');
  check('borrowUtilPct',0,100,'借款動用比例');
  check('loanInvestPct',0,100,'借款再投資比例');
  check('originationFeePct',0,20,'借款開辦費比例');
  check('aprPct',0,50,'借款年利率');
  check('termMonths',1,360,'借款期數');
  check('monthlyFreeCashFlow',-1e9,1e9,'每月自由現金流');
  check('monthlyLivingExpense',0,1e9,'每月必要支出');
  check('minReserveMonths',0,36,'緊急預備月數');
  check('shockPct',0,100,'單次壓力下跌比例');
  if(!Number.isInteger(p.termMonths)) errors.push('借款月數必須是整數');
  if(!Number.isInteger(p.minReserveMonths)) errors.push('緊急預備月數必須是整數');
  if(!Array.isArray(p.funds) || p.funds.length===0 || p.funds.length>MAX_ASSETS){
    errors.push(`標的數量必須為 1 至 ${MAX_ASSETS} 個`);
    return {errors,warnings};
  }
  const seen=new Set(),seenSymbols=new Set();
  p.funds.forEach((f,i)=>{
    if(!f || typeof f!=='object') { errors.push(`第 ${i+1} 筆標的有誤`); return; }
    const tag = `標的 ${i+1}`;
    if(typeof f.symbol!=='string'||!/^[A-Z0-9._-]{1,16}$/.test(f.symbol)) errors.push(`${tag}代號無效`);
    if(typeof f.name!=='string'||f.name.length>80) errors.push(`${tag}名稱無效`);
    if(typeof f.id!=='string'||f.id.length>100||seen.has(f.id)) errors.push(`${tag}識別碼不正確或重複`);
    seen.add(f.id);
    if(seenSymbols.has(f.symbol))errors.push(`${tag}代號重複，請合併同一 ETF`);
    seenSymbols.add(f.symbol);
    if(f.factor!==1&&f.factor!==2) errors.push(`${tag}倍數只支援 1 或 2`);
    for(const key of ['ownWeightPct','loanWeightPct','pledgePct','ltvPct']){
      if(typeof f[key]!=='number'||!Number.isFinite(f[key])||f[key]<0||f[key]>100)errors.push(`${tag}的 ${key} 不在 0 至 100`);
    }
    if(f.pledgeStatus!=='assumed'&&f.pledgeStatus!=='blocked')errors.push(`${tag}的質押資格狀態無效`);
    if(f.pledgeStatus==='blocked'&&f.pledgePct>0)warnings.push(`${f.symbol}標示不可質押，其質押比例不計入擔保額度`);
    if(f.factor===2&&f.pledgePct>0)warnings.push(`${f.symbol} 是每日重設正二 ETF；質押資格與折算率未驗證，且單次下跌推算不等於多日真實報酬`);
    if(f.pledgePct>0&&f.pledgeStatus==='assumed')warnings.push(`${f.symbol} 的質押資格與可貸成數僅為情境假設，未取得券商核准`);
  });
  if(errors.length) return {errors,warnings};
  const totalOwn=p.funds.reduce((s,f)=>s+f.ownWeightPct,0);
  const totalBorrowed=p.funds.reduce((s,f)=>s+f.loanWeightPct,0);
  if(Math.abs(totalOwn-100)>1e-6)errors.push(`自有資金配置總和為 ${totalOwn.toFixed(1)}%，必須為 100%`);
  // Loan weights also need to sum to 100, because user may later increase credit draw.
  if(Math.abs(totalBorrowed-100)>1e-6)errors.push(`借款再投入配置總和為 ${totalBorrowed.toFixed(1)}%，必須為 100%`);
  if(p.aprPct===0&&p.borrowUtilPct>0)warnings.push('0% 融資利率是純假設；不是券商已承諾的報價');
  return {errors,warnings};
}

/** Normalize weights to one decimal percentage-point, without remainder drift. */
function normalizeFunds(funds, field){
  if(!['ownWeightPct','loanWeightPct'].includes(field)) throw new Error('invalid allocation field');
  if(!Array.isArray(funds)||!funds.length)throw new Error('fund list must not be empty');
  const weights=funds.map(f=>Number.isFinite(f[field])?Math.max(0,f[field]):0);
  const total=weights.reduce((a,b)=>a+b,0);
  const units=total===0 ? weights.map(()=>1000/funds.length) : weights.map(v=>v/total*1000);
  const floors=units.map(Math.floor);
  const toAdd=1000-floors.reduce((a,b)=>a+b,0);
  const order=units.map((v,i)=>({i,frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac||a.i-b.i);
  for(let j=0;j<toAdd;j++)floors[order[j].i]++;
  return funds.map((f,i)=>({...f,[field]:floors[i]/10}));
}
function stressMultiplier(factor, marketFallPct){
  return Math.max(0, 1-factor*marketFallPct/100);
}
function finiteNonNegative(n){ return Number.isFinite(n)?Math.max(0,n):0; }

/** Pure one-snapshot capital allocation + one-step market stress. */
function calculateScenario(p, shockOverride=null){
  const chk=validateScenario(p);
  if(chk.errors.length)return {valid:false, errors:chk.errors, warnings:chk.warnings};
  const shock = shockOverride===null ? p.shockPct : shockOverride;
  if(!Number.isFinite(shock)||shock<0||shock>100)return {valid:false,errors:['壓力下跌比例需介於 0～100%'],warnings:chk.warnings};
  const ownInvestBudget=p.ownCapital*(1-p.ownCashPct/100);
  const ownCash=p.ownCapital-ownInvestBudget;
  const costFactor=1+p.tradeCostPct/100;
  const ownMarket=ownInvestBudget/costFactor;
  const ownTradeFees=ownInvestBudget-ownMarket;
  const legs=p.funds.map(f=>{
    const ownValue=ownMarket*f.ownWeightPct/100;
    const pledgedValue=f.pledgeStatus==='blocked'?0:ownValue*f.pledgePct/100;
    const capacity=pledgedValue*f.ltvPct/100;
    return { id:f.id,symbol:f.symbol, name:f.name,factor:f.factor,
      ownValue,pledgedValue,capacity, ownWeightPct:f.ownWeightPct,
      loanWeightPct:f.loanWeightPct,pledgePct:f.pledgePct,ltvPct:f.ltvPct,
      pledgeStatus:f.pledgeStatus};
  });
  const collateral=legs.reduce((s,f)=>s+f.pledgedValue,0);
  const loanCapacity=legs.reduce((s,f)=>s+f.capacity,0);
  const borrow=loanCapacity*p.borrowUtilPct/100;
  const loanFee=borrow*p.originationFeePct/100;
  const usableLoan=borrow-loanFee;
  const loanBudget=usableLoan*p.loanInvestPct/100;
  const borrowedCash=usableLoan-loanBudget;
  const loanMarket=loanBudget/costFactor;
  const loanTradeFees=loanBudget-loanMarket;
  const liquidCash=ownCash+borrowedCash;
  const assets=ownMarket+loanMarket+liquidCash;
  const netAsset=assets-borrow;
  const exposureEq=legs.reduce((s,f)=>{
    f.loanValue=loanMarket*f.loanWeightPct/100;
    f.totalValue=f.ownValue+f.loanValue;
    f.eqExposure=f.totalValue*f.factor;
    return s+f.eqExposure;
  },0);
  const holdingValue=ownMarket+loanMarket;
  const grossMarketExposurePct=netAsset>0?holdingValue/netAsset*100:null;
  const equityExposurePct=netAsset>0?exposureEq/netAsset*100:null;
  const maintenancePct=borrow>1e-8?collateral/borrow*100:null;
  const monthlyInterest=borrow*p.aprPct/1200;
  const projectedMonthlyFlow=p.monthlyFreeCashFlow-monthlyInterest;
  // Maturity: no market profits, no sale proceeds, no rollover and no refinancing.
  const maturityCash=liquidCash+projectedMonthlyFlow*p.termMonths;
  const maturityGap=Math.max(0,borrow-Math.max(0,maturityCash));
  const reserveTarget=p.monthlyLivingExpense*p.minReserveMonths;
  const earliestCashDeficitMonth=projectedMonthlyFlow<0 && liquidCash>=0 ? Math.floor(liquidCash/(-projectedMonthlyFlow))+1:null;
  const stressedLegs=legs.map(f=>{
    const mult=stressMultiplier(f.factor,shock);
    return {...f, stressFactor:mult, stressedOwnValue:f.ownValue*mult,
      stressedLoanValue:f.loanValue*mult,stressedCollateral:f.pledgedValue*mult};
  });
  const stressedHoldings=stressedLegs.reduce((s,f)=>s+f.stressedOwnValue+f.stressedLoanValue,0);
  const stressedCollateral=stressedLegs.reduce((s,f)=>s+f.stressedCollateral,0);
  const stressedAssets=stressedHoldings+liquidCash;
  const stressedNetAsset=stressedAssets-borrow;
  const stressedMaintenancePct=borrow>1e-8?stressedCollateral/borrow*100:null;
  const marginTrigger=borrow>0 && stressedMaintenancePct<WARN_THRESHOLD;
  const topUpCollateralValue=marginTrigger?Math.max(0,borrow*RESTORE_TARGET/100-stressedCollateral):0;
  const stressedEqExposure=stressedLegs.reduce((s,f)=>s+(f.stressedOwnValue+f.stressedLoanValue)*f.factor,0);
  const shockedExposurePct=stressedNetAsset>0?stressedEqExposure/stressedNetAsset*100:null;
  const fees=ownTradeFees+loanFee+loanTradeFees;
  const accountingDifference=netAsset-(p.ownCapital-fees);
  const warnings=[...chk.warnings];
  if(equityExposurePct!==null&&equityExposurePct>130) warnings.push(`初始股票等值曝險 ${equityExposurePct.toFixed(1)}% 高於參考的 130% 自有淨資產風險預算；此值不是券商維持率`);
  if(maintenancePct!==null&&maintenancePct<RESTORE_TARGET)warnings.push('初始擔保維持率低於參考的 166% 補繳目標，需審慎確認券商條款');
  if(marginTrigger)warnings.push(`下跌 ${shock}% 的簡化情境中維持率低於 130%，參考補到 166% 的擔保市值缺口約為 NT$ ${Math.ceil(topUpCollateralValue).toLocaleString('en-US')}`);
  if(maturityGap>0.005)warnings.push(`第 ${p.termMonths} 個月到期，單靠現金與假設每月自由現金流仍有 NT$ ${Math.ceil(maturityGap).toLocaleString('en-US')} 的本金缺口；沒有假設可續借或當天出售立即入帳`);
  if(liquidCash<reserveTarget)warnings.push(`流動現金不足 ${p.minReserveMonths} 個月必要開銷的預備金門檻`);
  if(earliestCashDeficitMonth!==null&&earliestCashDeficitMonth<=p.termMonths) warnings.push(`若市場不變、自由現金流持續負值，預估第 ${earliestCashDeficitMonth} 個月可能出現現金不足`);
  warnings.push('自由配置 V0.2 資金模型不計配息、報酬、匯率變動、借款展延、T+2 交割與實際清償順序；正二 ETF 壓力只做單步近似');
  return { valid:true, errors:[],warnings, config:p,shock,
    ownInvestBudget,ownCash,ownMarket,ownTradeFees,collateral,loanCapacity,
    borrow,loanFee,borrowedCash,loanBudget,loanMarket,loanTradeFees,liquidCash,
    assets,netAsset,exposureEq,holdingValue,equityExposurePct,grossMarketExposurePct,
    maintenancePct, monthlyInterest, projectedMonthlyFlow, maturityCash,maturityGap,
    earliestCashDeficitMonth, reserveTarget,fees,accountingDifference,
    stressedLegs,legs,stressedHoldings,stressedCollateral,stressedAssets,
    stressedNetAsset,stressedMaintenancePct,marginTrigger,topUpCollateralValue,
    stressedEqExposure,shockedExposurePct};
}

function validateAndParse(raw){
  if(typeof raw!=='string'||raw.length>100000)throw new Error('JSON 檔案太大或格式不正確');
  const p=JSON.parse(raw);
  if(!p||p.schemaVersion!==1)throw new Error('不支援的設定版本');
  // Ensure known canonical primitives are present, exclude unknown imported fields.
  const wanted=['schemaVersion','scenarioName','ownCapital','ownCashPct','tradeCostPct',
    'borrowUtilPct','loanInvestPct','originationFeePct','aprPct','termMonths',
    'monthlyFreeCashFlow','monthlyLivingExpense','minReserveMonths','shockPct'];
  const x=Object.fromEntries(wanted.map(k=>[k,p[k]]));
  x.scenarioName=typeof p.scenarioName==='string'?p.scenarioName.slice(0,60):'匯入方案';
  if(!Array.isArray(p.funds))throw new Error('標的陣列不存在');
  x.funds=p.funds.map((f,i)=>({
    id:typeof f?.id==='string'?f.id:`import-${i}`,symbol:f?.symbol,
    name:f?.name,factor:f?.factor,ownWeightPct:f?.ownWeightPct,
    loanWeightPct:f?.loanWeightPct,pledgePct:f?.pledgePct,
    ltvPct:f?.ltvPct,pledgeStatus:f?.pledgeStatus,
  }));
  const {errors}=validateScenario(x);
  if(errors.length)throw new Error(errors.join('；'));
  return x;
}
function serializeScenario(p){
  const {errors}=validateScenario(p);
  if(errors.length)throw new Error('無法匯出：'+errors.join('；'));
  return JSON.stringify(p,null,2);
}
function formatTwd(n){return Number.isFinite(n)?Math.round(n).toLocaleString('en-US'):'—';}
function formatPercent(n, digits=1){return Number.isFinite(n)?n.toFixed(digits)+'%':'—';}

;
/** LPOS V3.0 read-only Python-generated research bridge.
 * GitHub Pages cannot execute Python; snapshots are generated by the frozen
 * historical engine and checked against V2.4/V3.0 references during the build.
 * NEVER interpolate unsupported symbols, amounts, APRs, or sample intervals.
 */
const RESEARCH_ENGINE_STATUS={
  connected:true,version:'LPOS-V3.0/python-snapshot/web-v0.2.0',
  grade:'B_VENDOR_PLUS_MIXED_PAYOUTS',
  note:'已接入 V3.0 Python 研究引擎的版本化結果快照（非即時 Python API）。僅支援兩種既有 ETF 配置、5 種借款額度、固定 3.75% 假設利率；未取得官方完整日線或實際續借契約。'
};
let cache=null;
let pending=null;
function validateResearchBundle(data){
  if(!data||data.schemaVersion!==2||data.webVersion!=='0.2.0'||data.researchVersion!=='LPOS V3.0')throw Error('研究資料版本不符');
  if(!data.marketData||data.marketData.tradeSessions!==1366||data.marketData.start!=='2020-07-20'||data.marketData.end!=='2026-03-06')throw Error('研究行情範圍不符');
  if(data.marketData.officialRawDailyRowsArchived!==0||data.sourceGrade!=='B_VENDOR_PLUS_MIXED_PAYOUTS'||data.loanRenewalVerified!==false)throw Error('研究證據分級不正確');
  if(!Array.isArray(data.cases)||data.cases.length!==10||!Array.isArray(data.sourceAudit)||data.sourceAudit.length<5)throw Error('研究快照不足');
  const unique=new Set();
  for(const row of data.cases){
    if(!data.controls.portfolio.includes(row.portfolio)||!data.controls.loanTwd.includes(row.loanTwd))throw Error('快照包含未支援的策略');
    const key=row.portfolio+'_'+row.loanTwd;
    if(unique.has(key))throw Error('重複研究情境'); unique.add(key);
    if(!row.matchedFrozenV24||!Array.isArray(row.curveMonthly)||row.curveMonthly.length<60)throw Error('研究驗收紀錄不足');
    if(row.curveMonthly[0][0]!=='2020-07-20'||row.curveMonthly.at(-1)[0]!=='2026-03-06')throw Error('研究圖表日期錯誤');
    for(const k of ['cagr_pct','mdd_pct','sharpe_0rf','sortino_0rf'])if(!Number.isFinite(row.stats?.[k]))throw Error('研究績效數值不合法');
  }
  return data;
}
async function loadResearchBundle(){
  if(cache)return cache;
  if(!pending){
    if(typeof fetch!=='function')throw Error('本地檔案無法載入研究資料；請使用 GitHub Pages 或本機 HTTP 伺服器');
    pending=fetch('./research/v3_observed_snapshots.json',{cache:'no-store'})
      .then(res=>{if(!res.ok)throw Error('資料伺服器回應 '+res.status);return res.json();})
      .then(validateResearchBundle)
      .then(data=>{cache=data;return data;})
      .catch(err=>{pending=null;throw err;});
  }
  return pending;
}
function lookupResearchCase(data,portfolio,loanTwd){
  if(!data)return null;
  if(!data.controls.portfolio.includes(portfolio)||!data.controls.loanTwd.includes(loanTwd))return null;
  return data.cases.find(x=>x.portfolio===portfolio&&x.loanTwd===loanTwd)||null;
}
async function analyzeHistoricalScenario({portfolio,loanTwd,ownCapitalTwd=1000000,aprPct=3.75}={}){
  if(ownCapitalTwd!==1000000||aprPct!==3.75)return {ok:false,status:'unsupported_config',stats:null,navSeries:[],message:'目前 Python 快照僅支援自有資本 NT$100 萬、貸款利率 3.75%；不可將其他資金設定直接套入參考績效。'};
  try {
    const data=await loadResearchBundle();
    const row=lookupResearchCase(data,portfolio,loanTwd);
    if(!row)return {ok:false,status:'unsupported_config',stats:null,navSeries:[],message:'該標的／借款配置不在 V3.0 已驗證的十組快照內。'};
    return {ok:true,status:'python_snapshot',modelVersion:data.researchVersion,sourceGrade:data.sourceGrade,
      dataAsOf:data.marketData.end,stats:row.stats,
      navSeries:row.curveMonthly.map(x=>({date:x[0],equity:x[1],cash:x[2],receivable:x[3],marginRatioPct:x[4]})),
      assumptions:data.controls,sourceAudit:data.sourceAudit,
      evidenceNote:'僅歷史條件式假設，非實盤；圖表每月抽樣，指標基於逐交易日計算。'};
  }catch(err){return {ok:false,status:'unavailable',stats:null,navSeries:[],message:String(err.message||err)};}
}

;
/** LPOS Web V0.3 - deterministic adjusted-price path research.
 * Prices: PRStK research repository, TWSE-derived adjusted PRICE proxy only.
 * Not total return; no distributions/FX, official contracts, T+2, or live Python.
 * Pledge eligibility and loan rollover are unverified scenarios.
 */

const DYNAMIC_VERSION='LPOS-WEB-V0.3.0';
const PRICE_GRADE='TWSE_DERIVED_ADJUSTED_PRICE_PROXY_NOT_TOTAL_RETURN';
const ASSETS={
  '006208':{name:'富邦台50',factor:1},
  '00631L':{name:'元大台灣50正2',factor:2},
  '00685L':{name:'群益臺灣加權正2',factor:2},
};
const DAY_MS=86400000;
const TRADE_DAYS=252;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round2=n=>Math.round(n*100)/100;
const dayStamp=str=>{
  if(typeof str!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str))throw Error('日期格式無效');
  const t=Date.parse(str+'T00:00:00Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==str)throw Error('非法日期');
  return t;
};
const dayGap=(a,b)=>(dayStamp(b)-dayStamp(a))/DAY_MS;
function addMonths(date,months){
  const t=new Date(dayStamp(date)),m=t.getUTCMonth()+months;
  const year=t.getUTCFullYear()+Math.floor(m/12),month=(m%12+12)%12;
  const maxDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(t.getUTCDate(),maxDay))).toISOString().slice(0,10);
}
function parsePublishedBuyHoldCsv(symbol,text){
  if(!ASSETS[symbol])throw Error('不支援的行情代號 '+symbol);
  if(typeof text!=='string'||text.length>2500000)throw Error('行情檔太大或格式錯誤');
  const lines=text.replace(/^\ufeff/,'').trim().split(/\r?\n/);
  const head=lines.shift()?.split(',').map(x=>x.trim());
  const dateCol=head?.indexOf('date'),navCol=head?.indexOf('nav'),strategyCol=head?.indexOf('strategy');
  if(dateCol<0||navCol<0||strategyCol<0)throw Error(symbol+' 缺少必要 date / nav / strategy 欄位');
  if(lines.length<50||lines.length>13000)throw Error(symbol+' 行情筆數異常');
  const expected='buy_hold_'+symbol;let previous='';const rows=[];
  for(const line of lines){
    if(!line.trim())continue;
    const col=line.split(',');
    const date=col[dateCol]?.trim(),value=Number(col[navCol]?.trim());
    dayStamp(date);
    if(col[strategyCol]?.trim()!==expected||!finite(value)||value<=0||date<=previous)throw Error(symbol+' 日線有重複、順序錯誤或非正價格');
    rows.push({date,nav:value});previous=date;
  }
  if(rows.length<50)throw Error(symbol+' 有效行情不足');
  return {symbol,kind:PRICE_GRADE,sourcePath:`../data/backtests/buy_hold_${symbol}.csv`,rows,
    start:rows[0].date,end:rows.at(-1).date,count:rows.length};
}
const marketCache=new Map();
async function loadMarketSeries(symbols,{fetcher=globalThis.fetch,basePath='../data/backtests'}={}){
  const uniq=[...new Set(symbols)];
  const res={};
  for(const symbol of uniq){
    if(!ASSETS[symbol])throw Error(symbol+' 沒有可用的逐日調整價格；不可用其他 ETF 冒充');
    if(!marketCache.has(symbol)){
      const url=`${basePath}/buy_hold_${symbol}.csv`;
      const task=Promise.resolve().then(()=>fetcher(url,{cache:'no-store'}))
        .then(r=>{if(!r.ok)throw Error(symbol+' 行情伺服器回應 '+r.status);return r.text();})
        .then(text=>parsePublishedBuyHoldCsv(symbol,text));
      marketCache.set(symbol,task);
    }
    try{res[symbol]=await marketCache.get(symbol);}catch(err){marketCache.delete(symbol);throw err;}
  }
  return res;
}
function clearMarketCache(){marketCache.clear();}
function supportedSymbols(scenario){
  const active=scenario.funds.filter(f=>f.ownWeightPct>1e-9|| (scenario.borrowUtilPct>0&&scenario.loanInvestPct>0&&f.loanWeightPct>1e-9));
  const unsupported=active.filter(f=>!ASSETS[f.symbol]||f.factor!==ASSETS[f.symbol].factor).map(f=>f.symbol);
  return {symbols:[...new Set(active.map(f=>f.symbol))],unsupported};
}
function sharedDates(scenarios,series,{from='',to=''}={}){
  if(from)dayStamp(from);if(to)dayStamp(to);
  const symbols=[...new Set(scenarios.flatMap(p=>supportedSymbols(p).symbols))];
  for(const symbol of symbols)if(!series[symbol]?.rows)throw Error(symbol+' 沒有已驗證的逐日行情');
  if(!symbols.length)throw Error('沒有可用的 ETF 持倉');
  let common=new Set(series[symbols[0]].rows.map(x=>x.date));
  for(const sym of symbols.slice(1)){const dates=new Set(series[sym].rows.map(x=>x.date));common=new Set([...common].filter(x=>dates.has(x)));}
  const d=[...common].sort().filter(x=>(!from||x>=from)&&(!to||x<=to));
  if(d.length<30)throw Error('共同交易日少於 30 日；請調整時間窗或投資組合');
  return d;
}
function weightedStdev(values){
  if(values.length<2)return 0;
  const avg=values.reduce((a,b)=>a+b,0)/values.length;
  return Math.sqrt(values.reduce((a,b)=>a+(b-avg)**2,0)/(values.length-1));
}
function sharpeRatio(returns,rfPct){
  const sd=weightedStdev(returns);if(sd<1e-14)return null;
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  return Math.sqrt(TRADE_DAYS)*(mean-rfPct/100/TRADE_DAYS)/sd;
}
function drawdownStats(indexPath){
  let peak=1,maxDD=0,currentUnderwater=0,longest=0;
  for(const x of indexPath){peak=Math.max(peak,x);const dd=peak===0?0:x/peak-1;maxDD=Math.min(maxDD,dd);
    if(dd< -1e-10){currentUnderwater++;longest=Math.max(longest,currentUnderwater);}else currentUnderwater=0;
  }
  return {mddPct:maxDD*100,longestUnderwaterSessions:longest};
}
function canRebalance(freq,date,nextDate,startDate){
  if(freq==='none'||!nextDate||date.slice(0,7)===nextDate.slice(0,7))return false;
  const d=new Date(dayStamp(date)),s=new Date(dayStamp(startDate));
  const months=(d.getUTCFullYear()-s.getUTCFullYear())*12+d.getUTCMonth()-s.getUTCMonth()+1;
  const period={monthly:1,quarterly:3,semiannual:6,annual:12}[freq];
  if(!period)throw Error('不支援的再平衡設定');
  return months>0&&months%period===0;
}
function runDynamicBacktest(scenario,series,options={}){
  const rebalance=options.rebalance||'quarterly';
  const repayment=options.repayment||'repay_at_term';
  const rfPct=options.rfPct??0;
  if(!['none','monthly','quarterly','semiannual','annual'].includes(rebalance))throw Error('不支援的再平衡頻率');
  if(!['repay_at_term','conditional_rollover'].includes(repayment))throw Error('不支援的貸款到期模式');
  if(!finite(rfPct)||rfPct<0||rfPct>30)throw Error('無風險利率參數無效');
  const {symbols,unsupported}=supportedSymbols(scenario);
  if(unsupported.length)throw Error('不支援的 ETF 或倍數：'+[...new Set(unsupported)].join('、')+'；請移除或使用 V0.2 固定快照');
  const r=calculateScenario(scenario);
  if(!r.valid)throw Error('組合參數無效：'+r.errors.join('；'));
  const dates=options.dates||sharedDates([scenario],series,{from:options.from||'',to:options.to||''});
  if(!dates.length||dates.length<30)throw Error('回測交易日不足');
  const maps=Object.fromEntries(symbols.map(s=>[s,new Map(series[s].rows.map(x=>[x.date,x.nav]))]));
  if(dates.some((dt,i)=>i&&dates[i-1]>=dt))throw Error('共同交易日必須遞增且不重複');
  for(const dt of dates)for(const sym of symbols)if(!finite(maps[sym].get(dt))||maps[sym].get(dt)<=0)throw Error(sym+' 缺少 '+dt+' 的調整價格');
  const startDate=dates[0],endDate=dates.at(-1);
  const unit=Object.fromEntries(r.legs.filter(f=>symbols.includes(f.symbol)).map(f=>[f.symbol,{own:f.ownValue/maps[f.symbol].get(startDate),loan:f.loanValue/maps[f.symbol].get(startDate),pledgePct:f.pledgePct,eligible:f.pledgeStatus!=='blocked',factor:f.factor,ownWeightPct:f.ownWeightPct,loanWeightPct:f.loanWeightPct}]));
  let cash=r.liquidCash,debt=r.borrow,accruedInterest=0,interestPaid=0,externalNetFlows=0;
  let rebalanceFees=0,forcedSaleFees=0,turnover=0,forcedSales=0,hardFailure=null;
  let renewalAssumedCount=0,firstMarginDate=null,minMarginPct=null,marginSignalCount=0;
  let pledgedSaleRequiresRelease=false,unsettledProceedsUsed=false;
  let nextLoanMaturity=addMonths(startDate,scenario.termMonths);
  let index=r.netAsset/scenario.ownCapital;
  const initialNet=r.netAsset;
  if(initialNet<=0)throw Error('初始淨資產不合法');
  const path=[],events=[],dailyReturns=[];
  const costRate=scenario.tradeCostPct/100;
  const getValues=(date)=>Object.fromEntries(symbols.map(s=>{const q=unit[s],p=maps[s].get(date);return [s,{own:q.own*p,loan:q.loan*p,price:p}]}));
  const marketValue=values=>Object.values(values).reduce((s,v)=>s+v.own+v.loan,0);
  const postInterest=()=>{};
  function liquidateForCash(needed,date,reason){
    if(needed<=cash+1e-7)return true;
    const deficit=needed-cash;
    const grossNeed=deficit/(1-costRate);
    const values=getValues(date);
    // Sell non-pledged/loan units before own pledged units; settlement is instant proxy (not T+2).
    let remaining=grossNeed,sold=0,pledgedUsed=0;
    for(const key of ['loan','own']){
      for(const symbol of symbols){
        const leg=unit[symbol],price=values[symbol].price;
        const total=leg[key]*price;
        const take=Math.min(total,remaining);
        if(take>1e-10){leg[key]-=take/price;remaining-=take;sold+=take;
          if(key==='own'&&leg.pledgePct>0){pledgedUsed+=take*leg.pledgePct/100;}}
      }
    }
    cash+=sold*(1-costRate);
    const fee=sold*costRate;forcedSaleFees+=fee;forcedSales++;
    if(pledgedUsed>1e-7){pledgedSaleRequiresRelease=true;events.push({date,type:'pledged_sale_unverified',amount:round2(pledgedUsed),reason});}
    unsettledProceedsUsed=true;
    events.push({date,type:'forced_sale',reason,gross:round2(sold),fee:round2(fee)});
    return cash+1e-6>=needed;
  }
  function rebalancePool(date,key,weightKey){
    const values=getValues(date),pool=Object.values(values).reduce((s,v)=>s+v[key],0);
    if(pool<=1e-9)return;
    const target=Object.fromEntries(symbols.map(sym=>[sym,pool*unit[sym][weightKey]/100]));
    const turn=symbols.reduce((s,sym)=>s+Math.abs(values[sym][key]-target[sym]),0);
    const fee=turn*costRate;
    if(fee>=pool)throw Error('再平衡交易成本大於資產市值');
    const investable=pool-fee;
    for(const sym of symbols){unit[sym][key]=investable*unit[sym][weightKey]/100/values[sym].price;}
    turnover+=turn;rebalanceFees+=fee;
  }
  let previousDate=startDate,previousNAV=initialNet;
  for(let i=0;i<dates.length;i++){
    const date=dates[i],nextDate=dates[i+1]||null;
    if(i>0){
      const delta=dayGap(previousDate,date);
      if(delta<=0)throw Error('交易日順序不合法');
      accruedInterest+=debt*scenario.aprPct/100*delta/365;
    }
    const isMonthEnd=nextDate!==null&&date.slice(0,7)!==nextDate.slice(0,7);
    let dayFlow=0;
    // This cashflow occurs at the end of each fully observed calendar month.
    if(isMonthEnd){dayFlow=scenario.monthlyFreeCashFlow;cash+=dayFlow;externalNetFlows+=dayFlow;}
    if(i>0&&debt>0&&date>=nextLoanMaturity){
      if(repayment==='conditional_rollover'){
        renewalAssumedCount++;
        events.push({date,type:'rollover_assumed_unverified',principal:round2(debt)});
        nextLoanMaturity=addMonths(nextLoanMaturity,scenario.termMonths);
        while(nextLoanMaturity<=date)nextLoanMaturity=addMonths(nextLoanMaturity,scenario.termMonths);
      }else{
        // Accrued interest is payable before principal, no invisible overdrafts.
        const due=debt+accruedInterest;
        const preCash=cash;
        if(!liquidateForCash(due,date,'maturity')){hardFailure={date,type:'maturity_payment_failure',unpaid:round2(due-Math.max(0,cash))};
          events.push({...hardFailure});
        }else{
          cash-=due;interestPaid+=accruedInterest;accruedInterest=0;events.push({date,type:'bullet_principal_repaid',principal:round2(debt),cashBeforePayment:round2(preCash)});debt=0;
        }
      }
    }
    if(hardFailure)break;
    if(isMonthEnd&&accruedInterest>1e-9){
      if(!liquidateForCash(accruedInterest,date,'interest')){
        hardFailure={date,type:'interest_payment_failure',unpaid:round2(accruedInterest-Math.max(0,cash))};events.push({...hardFailure});break;
      }
      cash-=accruedInterest;interestPaid+=accruedInterest;accruedInterest=0;
    }
    if(cash< -1e-7){
      if(!liquidateForCash(0,date,'external_outflow')){
        hardFailure={date,type:'cash_shortfall',unpaid:round2(-cash)};events.push({...hardFailure});break;
      }
    }
    if(canRebalance(rebalance,date,nextDate,startDate)){
      rebalancePool(date,'own','ownWeightPct');
      rebalancePool(date,'loan','loanWeightPct');
      events.push({date,type:'scheduled_rebalance',frequency:rebalance});
    }
    const vals=getValues(date);
    const market=marketValue(vals);
    const collateral=debt>0?symbols.reduce((sum,sym)=>sum+(unit[sym].eligible?vals[sym].own*unit[sym].pledgePct/100:0),0):0;
    const maintenancePct=debt>1e-9?collateral/debt*100:null;
    const nav=market+cash-debt-accruedInterest;
    if(maintenancePct!==null){minMarginPct=minMarginPct===null?maintenancePct:Math.min(minMarginPct,maintenancePct);
      if(maintenancePct<130){marginSignalCount++;if(!firstMarginDate){firstMarginDate=date;events.push({date,type:'maintenance_under_130',marginPct:round2(maintenancePct)});}}
    }
    const eqExposure=nav>0?symbols.reduce((sum,sym)=>sum+(vals[sym].own+vals[sym].loan)*unit[sym].factor,0)/nav*100:null;
    if(nav<=0){hardFailure={date,type:'nonpositive_net_equity',nav:round2(nav)};events.push({...hardFailure});break;}
    if(i>0){const step=(nav-dayFlow)/previousNAV;
      if(!finite(step)||step<=0){hardFailure={date,type:'invalid_twr_step'};events.push({...hardFailure});break;}
      index*=step;dailyReturns.push(step-1);
    }
    const rec={date,nav:round2(nav),cash:round2(cash),debt:round2(debt),accruedInterest:round2(accruedInterest),
      holdings:round2(market),maintenancePct:maintenancePct===null?null:round2(maintenancePct),
      eqExposurePct:eqExposure===null?null:round2(eqExposure),twrIndex:index};
    path.push(rec);previousDate=date;previousNAV=nav;
  }
  if(path.length<2)throw Error('模型無法產生至少 2 個有效交易日');
  const elapsed=dayGap(path[0].date,path.at(-1).date);
  const cagrPct=elapsed>0?(Math.pow(index,365.25/elapsed)-1)*100:null;
  const dd=drawdownStats([1,...path.map(x=>x.twrIndex)]);
  const sumReturns=dailyReturns.reduce((a,b)=>a+b,0)/Math.max(1,dailyReturns.length);
  const downside=Math.sqrt(dailyReturns.reduce((a,b)=>a+Math.min(0,b-rfPct/100/TRADE_DAYS)**2,0)/Math.max(1,dailyReturns.length));
  const stats={cagrPct,mddPct:dd.mddPct,sharpe:sharpeRatio(dailyReturns,rfPct),
    sortino:downside>1e-14?Math.sqrt(TRADE_DAYS)*(sumReturns-rfPct/100/TRADE_DAYS)/downside:null,
    calmar:dd.mddPct< -1e-9?(cagrPct||0)/(-dd.mddPct):null,
    longestUnderwaterSessions:dd.longestUnderwaterSessions,
    startNetAssetTwd:initialNet,endNetAssetTwd:path.at(-1).nav,
    endUnpaidDebtTwd:path.at(-1).debt,interestPaidTwd:round2(interestPaid),
    rebalancingFeesTwd:round2(rebalanceFees),forcedSaleFeesTwd:round2(forcedSaleFees),
    capitalInjectionsNetTwd:round2(externalNetFlows),cashAtEndTwd:path.at(-1).cash,
    minMaintenancePct:minMarginPct,firstMarginSignal:firstMarginDate,
    marginSignalDays:marginSignalCount,rolloverAssumedCount:renewalAssumedCount,
    forcedSales,turnoverTwd:round2(turnover),startNominalExposurePct:r.equityExposurePct,
    hardFailure:hardFailure?.type||null,lastDate:path.at(-1).date,
    pledgedSaleRequiresRelease,unsettledProceedsUsed};
  return {ok:true,version:DYNAMIC_VERSION,priceGrade:PRICE_GRADE,
    period:{start:path[0].date,end:path.at(-1).date,marketEnd:endDate,sessions:path.length},
    symbols,options:{rebalance,repayment,rfPct,from:options.from||'',to:options.to||''},
    stats,path,events,flags:{
      totalReturnVerified:false,officialRawOHLCVIncluded:false,
      eligibilityVerified:false,loanRenewalVerified:false,t2SettlementModeled:false,
      marketExecutionVerified:false,hardFailure,pledgedSaleRequiresRelease,unsettledProceedsUsed,
    }};
}
function compareDynamicBacktests(items,series,options={}){
  if(!Array.isArray(items)||!items.length||items.length>4)throw Error('請提供 1 至 4 個組合');
  const firstCapital=items[0].scenario.ownCapital;
  if(items.some(x=>Math.abs(x.scenario.ownCapital-firstCapital)>0.01))throw Error('A/B/C 同期比較須採相同自有資金');
  const dates=sharedDates(items.map(x=>x.scenario),series,options);
  const firstFlow=items[0].scenario.monthlyFreeCashFlow;
  if(items.some(x=>x.scenario.monthlyFreeCashFlow!==firstFlow))throw Error('公平比較須採相同每月外部自由現金流；請修正各方案，模型不會偷偷改寫');
  const results=items.map(({name,scenario})=>({name,...runDynamicBacktest(scenario,series,{...options,dates})}));
  for(const r of results)r.fullPeriod=!r.flags.hardFailure&&r.period.sessions===dates.length;
  const rankingEligible=results.every(r=>r.fullPeriod);
  // Failed paths remain visible; no annualized ranking across unequal realized horizons.
  for(const r of results)r.comparableCagrPct=rankingEligible?r.stats.cagrPct:null;
  return {ok:true,version:DYNAMIC_VERSION,priceGrade:PRICE_GRADE,rankingEligible,ownCapital:firstCapital,monthlyFreeCashFlow:firstFlow,period:{start:dates[0],end:dates.at(-1),sessions:dates.length},results};
}
function backtestCsv(result){
  if(!result?.ok||!result.path)throw Error('沒有可匯出的歷史路徑');
  const header=['date','net_asset_twd','cash_twd','debt_twd','accrued_interest_twd','holdings_twd','maintenance_pct','equity_exposure_pct','twr_index'];
  const rows=result.path.map(x=>[x.date,x.nav,x.cash,x.debt,x.accruedInterest,x.holdings,x.maintenancePct??'',x.eqExposurePct??'',x.twrIndex].join(','));
  return '\ufeff'+header.join(',')+'\n'+rows.join('\n')+'\n';
}

;




export { MODEL_VERSION, MAX_ASSETS, COST_PCT_DEFAULT, CATALOG, catalogFund, makeFund, defaultScenario, validateScenario, normalizeFunds, stressMultiplier, calculateScenario, validateAndParse, serializeScenario, formatTwd, formatPercent, RESEARCH_ENGINE_STATUS, validateResearchBundle, loadResearchBundle, lookupResearchCase, analyzeHistoricalScenario, DYNAMIC_VERSION, PRICE_GRADE, ASSETS, parsePublishedBuyHoldCsv, loadMarketSeries, clearMarketCache, supportedSymbols, sharedDates, weightedStdev, sharpeRatio, drawdownStats, canRebalance, runDynamicBacktest, compareDynamicBacktests, backtestCsv };
