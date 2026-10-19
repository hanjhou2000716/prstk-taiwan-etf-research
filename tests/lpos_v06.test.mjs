import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync('site/lpos-portfolio-lab/legacy-v06.html','utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const engine=readFileSync('site/lpos-portfolio-lab/survival-engine.js','utf8');
function harness(){
 const handlers={},db=new Map(),app={innerHTML:'',addEventListener(t,f){handlers[t]=f}};
 const win={scrollTo(){},confirm(){return true},addEventListener(){}};
 const c={window:win,document:{getElementById:id=>id==='app'?app:null,querySelector(){return null}},
  localStorage:{getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)},
  location:{hash:''},history:{replaceState(){}},fetch:async()=>({ok:false,status:404}),setTimeout(){},clearTimeout(){}};
 runInNewContext(engine,c);
 runInNewContext(code+`;globalThis.api={defaultScenario,makeFund,calculateScenario,validateScenario,validateAndParse,normalizeFunds,auditCapital,runDynamicBacktest,compareDynamicBacktests,changeFund,changeField,decisionOverview,runV03,runSurvival,backtestStamp,survivalStamp,
 get current(){return current},set current(v){current=v},get bt(){return v03State},get sv(){return survivalState},get controls(){return survivalSettings},
 setMarketLoader(fn){loadMarketSeries=fn},setDates(from,to){v03Settings.from=from;v03Settings.to=to}};`,c);
 return {a:c.api,E:win.LPOSSurvival,app,handlers};
}
function flatMarket(n=500){
 const dates=[],d=new Date('2024-01-02T00:00:00Z');
 while(dates.length<n){if(d.getUTCDay()%6)dates.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)}
 return {dates,series:{'006208':{rows:dates.map(date=>({date,nav:100}))}}};
}
function scenario(a){const p=a.defaultScenario();p.funds=[a.makeFund('006208',100,100)];p.funds[0].pledgePct=100;p.tradeCostPct=0;p.ownCashPct=20;p.monthlyFreeCashFlow=0;return p}
const close=(a,b,t=.03)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
test('independent fee-inclusive accounting and per-fund credit example',()=>{
 const {a}=harness(),p=scenario(a);p.tradeCostPct=1;p.originationFeePct=2;p.loanInvestPct=75;p.borrowUtilPct=50;
 const r=a.calculateScenario(p),own=800000/1.01,loan=own*.6*.5,usable=loan*.98,invest=usable*.75/1.01;
 close(r.ownMarket,own);close(r.borrow,loan);close(r.loanMarket,invest);close(r.liquidCash,200000+usable*.25);
 close(r.netAsset,own+invest+200000+usable*.25-loan);assert.ok(a.auditCapital(r).ok);
});
test('300 deterministic allocation/credit/cost scenarios conserve money',()=>{
 const {a}=harness();let seed=812;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let i=0;i<300;i++){
  const p=scenario(a);p.ownCapital=1000+rand()*1e8;p.ownCashPct=rand()*100;p.tradeCostPct=rand()*3;
  p.borrowUtilPct=rand()*100;p.originationFeePct=rand()*5;p.loanInvestPct=rand()*100;
  p.funds=[a.makeFund('006208',rand()*100,rand()*100),a.makeFund('00685L',rand()*100,rand()*100)];
  p.funds=a.normalizeFunds(a.normalizeFunds(p.funds,'ownWeightPct'),'loanWeightPct');
  for(const f of p.funds){f.pledgePct=rand()*100;f.ltvPct=rand()*80;f.pledgeStatus=rand()>.5?'blocked':'assumed'}
  const r=a.calculateScenario(p);assert.ok(r.valid);assert.ok(a.auditCapital(r).ok);close(r.accountingDifference,0,.001);
 }
});
test('invalid duplicate holdings, blank fields and malformed weight sums are rejected',()=>{
 const {a}=harness(),p=scenario(a);p.funds.push({...p.funds[0],id:'other'});assert.ok(!a.calculateScenario(p).valid);
 assert.throws(()=>a.validateAndParse(JSON.stringify(p)));
 a.current=scenario(a);a.changeField('aprPct','');assert.ok(!a.calculateScenario(a.current).valid);
 a.current=scenario(a);a.changeFund(a.current.funds[0].id,'ownWeightPct','');assert.ok(!a.calculateScenario(a.current).valid);
 p.funds.pop();p.funds[0].ownWeightPct=99.999;assert.ok(!a.calculateScenario(p).valid);
});
test('blocked collateral has zero capacity; editing one fund preserves others',()=>{
 const {a}=harness();a.current=a.defaultScenario();const other=JSON.stringify(a.current.funds[1]);
 a.changeFund(a.current.funds[0].id,'pledgeStatus','blocked');const r=a.calculateScenario(a.current);
 assert.equal(r.legs[0].capacity,0);assert.equal(JSON.stringify(a.current.funds[1]),other);
 a.changeFund(a.current.funds[0].id,'pledgeStatus','assumed');assert.ok(a.calculateScenario(a.current).legs[0].capacity>0);
});
test('ACT/365 accrued interest and every daily ledger balance match independently',()=>{
 const {a,E}=harness(),p=scenario(a),{dates,series}=flatMarket();p.aprPct=7;p.termMonths=36;
 const initial=a.calculateScenario(p),r=E.run(p,initial,series,dates,{horizonMonths:6,rollover:'deny'});
 for(const x of r.ledger)close(x.equity,x.portfolioValue+x.cash+x.receivable+x.restrictedCash-x.debt-x.accruedInterest);
 const elapsed=(Date.parse(r.period.realizedTo)-Date.parse(dates[0]))/86400000;
 close(r.interestPaid+r.ledger.at(-1).accruedInterest,initial.borrow*.07*elapsed/365);
 assert.equal(r.period.requestedEnd,'2024-07-02');assert.ok(r.period.to<=r.period.requestedEnd);assert.ok(r.horizonCovered);
 const short=E.run(p,initial,series,dates.slice(0,50),{horizonMonths:12});assert.equal(short.horizonCovered,false);
});
test('T+2 sales settle on exact second observed session; repayments do not create equity',()=>{
 const {a,E}=harness(),p=scenario(a),{dates,series}=flatMarket();p.termMonths=6;
 const r=E.run(p,a.calculateScenario(p),series,dates,{horizonMonths:9,prefund:true});assert.ok(r.completed);
 assert.equal(r.unpaidLoan,0);
 for(const ev of r.events.filter(x=>x.type==='sell_receivable_T2'))assert.equal(ev.settles,dates[dates.indexOf(ev.date)+2]);
 close(r.ledger.at(-1).equity,p.ownCapital-r.interestPaid-r.totalSaleFees);
 const fail=E.run(p,a.calculateScenario(p),series,dates,{horizonMonths:9,prefund:false});assert.ok(fail.firstHard);
 assert.equal(fail.period.realizedTo,fail.firstHard.date);assert.equal(fail.terminalSnapshot.date,fail.firstHard.date);
});
test('fair comparison rejects unequal capital/flows and suppresses failed-horizon ranking',()=>{
 const {a}=harness(),p=scenario(a),{series}=flatMarket();p.termMonths=36;
 const items=[{name:'A',scenario:p},{name:'B',scenario:{...p,borrowUtilPct:0}}];
 const options={rebalance:'none',from:'2024-01-02',to:'2024-12-31'};
 const r=a.compareDynamicBacktests(items,series,options);assert.ok(r.rankingEligible);assert.equal(r.results[0].period.end,r.results[1].period.end);
 assert.throws(()=>a.compareDynamicBacktests([items[0],{name:'B',scenario:{...p,ownCapital:2e6}}],series,options),/相同自有資金/);
 assert.throws(()=>a.compareDynamicBacktests([items[0],{name:'B',scenario:{...p,monthlyFreeCashFlow:1}}],series,options),/外部自由現金流/);
 const bad={...p,monthlyFreeCashFlow:-1e6},failure=a.compareDynamicBacktests([{name:'A',scenario:bad},{name:'B',scenario:{...bad,borrowUtilPct:0}}],series,options);
 assert.equal(failure.rankingEligible,false);assert.ok(failure.results.every(x=>x.comparableCagrPct===null));
});
test('external deposits are excluded from TWR and initial fees enter drawdown',()=>{
 const {a}=harness(),p=scenario(a),{series}=flatMarket();p.borrowUtilPct=0;p.aprPct=0;p.monthlyFreeCashFlow=10000;
 const r=a.runDynamicBacktest(p,series,{rebalance:'none'});close(r.stats.cagrPct,0,.000001);assert.ok(r.stats.capitalInjectionsNetTwd>0);
 p.tradeCostPct=1;p.monthlyFreeCashFlow=0;const fee=a.runDynamicBacktest(p,series,{rebalance:'none'});
 close(fee.stats.mddPct,(a.calculateScenario(p).netAsset/p.ownCapital-1)*100,.000001);
});
test('async results retain original request stamp when user edits while data loads',async()=>{
 const {a}=harness(),{series}=flatMarket();a.current=scenario(a);a.setDates('2024-01-02','2024-12-31');
 let release;a.setMarketLoader(()=>new Promise(resolve=>{release=resolve}));
 const stamp=a.backtestStamp(),promise=a.runV03();a.changeField('ownCapital',2000000);release(series);await promise;
 assert.equal(a.bt.stamp,stamp);assert.notEqual(a.bt.stamp,a.backtestStamp());assert.match(a.decisionOverview(a.calculateScenario(a.current)),/舊結果已隱藏/);
 const svStamp=a.survivalStamp(),svPromise=a.runSurvival();a.changeField('ownCapital',3000000);release(series);await svPromise;
 assert.equal(a.sv.stamp,svStamp);assert.notEqual(a.sv.stamp,a.survivalStamp());
});
