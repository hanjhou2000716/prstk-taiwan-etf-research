/* CI: unified LPOS Web V0.5. No generated market-price surrogates enter historic claims. */
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const page=readFileSync('site/lpos-portfolio-lab/index.html','utf8');
const engine=readFileSync('site/lpos-portfolio-lab/survival-engine.js','utf8');
const redirect=readFileSync('site/lpos-portfolio-lab/v04/index.html','utf8');
assert.match(page,/web-v0\.5\.0/);
assert.match(page,/survival-engine\.js/);
assert.match(page,/\['survival','◎','04 生存分析'\]/);
assert.match(page,/function integratedSurvival/);
assert.match(page,/LPOSSurvival\.run\(current,config,series,dates,survivalSettings\)/);
assert.match(page,/function unifiedBacktest/);
assert.match(page,/export-workspace/);
assert.ok(!page.includes('href="./v04/index.html"'),'main website must not send users to disconnected V0.4');
assert.match(redirect,/index\.html#survival/);
const c={};runInNewContext(engine,c,{timeout:5000});
const E=c.LPOSSurvival;
assert.equal(E.version,'0.5.0');
const weekdays=[];const d=new Date('2025-01-02T00:00:00Z');
for(let i=0;weekdays.length<440;i++,d.setUTCDate(d.getUTCDate()+1)){
  if(d.getUTCDay()!==0&&d.getUTCDay()!==6)weekdays.push(d.toISOString().slice(0,10));
}
const market={ '006208':{rows:weekdays.map(date=>({date,nav:1}))}};
const initial={valid:true,liquidCash:200000,borrow:300000,
 legs:[{symbol:'006208',ownValue:800000,loanValue:300000,
 factor:1,pledgeStatus:'assumed',pledgePct:100}]};
const scenario={termMonths:6,tradeCostPct:0.15,aprPct:4,monthlyFreeCashFlow:0,
 monthlyLivingExpense:20000,minReserveMonths:0};
const base={horizonMonths:9,shockPct:0,shockMonth:2,unemploymentMonths:0,
 rateHikePct:0,rollover:'deny',marginPolicy:'warning'};
const prepaid=E.run(scenario,initial,market,weekdays,{...base,prefund:true});
assert.ok(prepaid.completed,'T+2 prefunding should allow a solvent principal payment');
assert.ok(prepaid.events.some(x=>x.type==='sell_receivable_T2'),'sale must become receivable');
assert.ok(prepaid.events.some(x=>x.type==='T2_cash_settled'),'sale must settle after two trading sessions');
assert.ok(prepaid.events.some(x=>x.type==='bullet_principal_repaid'),'principal must actually be repaid');
assert.equal(prepaid.ledger.at(-1).debt,0);
const noPrefund=E.run(scenario,initial,market,weekdays,{...base,prefund:false});
assert.equal(noPrefund.completed,false,'same-day resale proceeds cannot settle past-due debt');
assert.equal(noPrefund.firstHard.type,'bullet_maturity_shortfall');
const renewal=E.run(scenario,initial,market,weekdays,{...base,prefund:false,rollover:'conditional'});
assert.ok(renewal.completed,'conditional renewal simulation should complete while solvent');
assert.ok(renewal.conditionalOnLoanRollover);
assert.ok(renewal.unpaidLoan>0,'renewal must NOT extinguish debt');
const jobless=E.run({...scenario,termMonths:12,monthlyLivingExpense:20000},
 {valid:true,liquidCash:10000,borrow:0,legs:[{symbol:'006208',ownValue:990000,loanValue:0,
 factor:1,pledgeStatus:'blocked',pledgePct:0}]},market,weekdays,
 {...base,horizonMonths:3,unemploymentMonths:12,prefund:false});
assert.equal(jobless.completed,false);
assert.equal(jobless.firstHard.type,'essential_spending_shortfall');
const margin=E.run(scenario,initial,market,weekdays,
 {...base,horizonMonths:3,rollover:'conditional',shockPct:80,shockMonth:0,prefund:false});
assert.ok(margin.firstMargin,'130% breach must be reported');
assert.equal(margin.firstHard,null,'maintenance threshold crossing does not automatically mean default');
const cure=E.run(scenario,initial,market,weekdays,
 {...base,horizonMonths:3,rollover:'conditional',shockPct:80,shockMonth:0,
 marginPolicy:'hypothetical_two_day_cure',prefund:false});
assert.equal(cure.firstHard.type,'hypothetical_margin_cure_shortfall');
const suites=E.scenarios({...base,prefund:true});
assert.equal(suites.length,5);
for(const [name,opts] of suites)assert.ok(E.run(scenario,initial,market,weekdays,opts).ledger.length>=1,name);
const csv=readFileSync('site/data/backtests/buy_hold_006208.csv','utf8');
assert.match(csv,/2012-07-17/);
const source=readFileSync('site/lpos-portfolio-lab/research/v3_observed_snapshots.json','utf8');
assert.equal(JSON.parse(source).cases.length,10);
console.log('PASS LPOS V0.5 unified: one route, shared controls, T+2, bullet, conditional renewal, unemployment, margin policy, V0.2/V0.3 preservation');
