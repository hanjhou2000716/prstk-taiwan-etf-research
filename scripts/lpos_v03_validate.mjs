// Verify the exact LPOS V0.3 public release against PRStK's archived TWSE-derived adjusted-price paths.
// This validates accounting and availability; it does NOT certify dividend total return or live credit.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('site/lpos-portfolio-lab/legacy-v06.html','utf8');
assert.match(html,/Web V0\.3/);
assert.match(html,/調整價格代理/);
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline && inline.length>60000,'release must contain the complete audited inline calculator');
const app={innerHTML:'',addEventListener(){}};
const db=new Map();
const sandbox={
  document:{getElementById:id=>id==='app'?app:null,querySelector(){return null;},
    body:{appendChild(){},append(){}},createElement(){return {style:{},setAttribute(){},remove(){},click(){}}}},
  window:{scrollTo(){},confirm(){return true}},
  localStorage:{getItem:key=>db.get(key)||null,setItem:(key,value)=>db.set(key,value)},
  fetch:async()=>({ok:false,status:404}),setTimeout(){return 1},clearTimeout(){},
};
runInNewContext(inline+'\n;globalThis.__audited={makeFund,defaultScenario,calculateScenario,parsePublishedBuyHoldCsv,runDynamicBacktest,compareDynamicBacktests,sharedDates};',sandbox,{timeout:12000});
const e=sandbox.__audited;
const symbols=['006208','00631L','00685L'];
const series={};
for(const symbol of symbols){
 const csv=readFileSync('site/data/backtests/buy_hold_'+symbol+'.csv','utf8');
 series[symbol]=e.parsePublishedBuyHoldCsv(symbol,csv);
 assert.ok(series[symbol].rows.length>1500, symbol+' unexpectedly truncated');
 assert.equal(series[symbol].end,'2026-10-16');
}
const make=(symbol)=>{
 const p=e.defaultScenario();p.scenarioName='Source parity '+symbol;
 p.funds=[e.makeFund(symbol,100,100)];p.ownCashPct=0;p.tradeCostPct=0;
 p.originationFeePct=0;p.borrowUtilPct=0;p.loanInvestPct=100;
 p.monthlyFreeCashFlow=0;p.aprPct=0;return p;
};
const options={from:'2018-01-01',to:'2026-10-16',rebalance:'none',repayment:'repay_at_term',rfPct:0};
for(const symbol of symbols){
 const c=make(symbol);
 const r=e.runDynamicBacktest(c,series,options);
 assert.ok(r.period.sessions>1000,'common daily sessions missing for '+symbol);
 const rows=series[symbol].rows,navByDate=new Map(rows.map(x=>[x.date,x.nav]));
 const expected=c.ownCapital*navByDate.get(r.period.end)/navByDate.get(r.period.start);
 assert.ok(Math.abs(r.stats.endNetAssetTwd-expected)<0.1,
   symbol+' actual adjusted-price buy-and-hold parity failed: '+r.stats.endNetAssetTwd+' vs '+expected);
 assert.equal(r.stats.endUnpaidDebtTwd,0);
 assert.equal(r.flags.totalReturnVerified,false);
 assert.equal(r.flags.t2SettlementModeled,false);
 console.log(symbol,'rows:',rows.length,'period:',r.period.start,'to',r.period.end,'CAGR:',r.stats.cagrPct.toFixed(3));
}
const scenario=e.defaultScenario();
const a=e.makeFund('006208',60,60);a.pledgePct=100;a.ltvPct=60;
const b=e.makeFund('00685L',40,40);b.pledgePct=0;
scenario.funds=[a,b];scenario.aprPct=4;scenario.monthlyFreeCashFlow=20000;
const overlap=e.sharedDates([scenario],series,options);
const result=e.runDynamicBacktest(scenario,series,{...options,dates:overlap,rebalance:'quarterly'});
const unlevered=e.runDynamicBacktest({...scenario,borrowUtilPct:0},series,{...options,dates:overlap,rebalance:'quarterly'});
assert.equal(result.period.start,unlevered.period.start);
assert.ok(result.stats.interestPaidTwd>0);
assert.equal(result.stats.endUnpaidDebtTwd,0);
assert.equal(result.flags.loanRenewalVerified,false);
assert.ok(result.events.some(x=>x.type==='bullet_principal_repaid'));
const conditional=e.runDynamicBacktest(scenario,series,{...options,repayment:'conditional_rollover'});
assert.ok(conditional.stats.rolloverAssumedCount>0);
assert.ok(conditional.stats.endUnpaidDebtTwd>0);
const comparison=e.compareDynamicBacktests([{name:'pledge',scenario},{name:'cash',scenario:{...scenario,borrowUtilPct:0}}],series,options);
assert.equal(comparison.results[0].period.start,comparison.results[1].period.start);
assert.equal(comparison.results[0].period.end,comparison.results[1].period.end);
console.log('PASS LPOS Web V0.3: 3 public adjusted-price series, price-only parity, conditional rollover labels, source-matched comparison, no false total-return certification');
