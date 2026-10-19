/* LPOS unified workspace UI semantics smoke, no browser privileges required */
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const main=readFileSync('site/lpos-portfolio-lab/legacy-v06.html','utf8');
const engine=readFileSync('site/lpos-portfolio-lab/survival-engine.js','utf8');
const inline=main.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline?.includes('async function runSurvival('));
const handlers={},watchers={};const app={
 html:'',addEventListener(type,fn){handlers[type]=fn},
 set innerHTML(value){this.html=String(value)},get innerHTML(){return this.html}
};
const storage=new Map();
const win={scrollTo(){},confirm(){return true},addEventListener(type,fn){watchers[type]=fn}};
const sandbox={
 window:win,localStorage:{getItem(key){return storage.get(key)||null},setItem(key,val){storage.set(key,val)}},
 document:{getElementById(id){return id==='app'?app:null},querySelector(){return null},
  createElement(){return {style:{},setAttribute(){},remove(){},click(){}}},
  body:{append(){},appendChild(){}}},
 history:{replaceState(){}},location:{hash:''},setTimeout(){return 1},clearTimeout(){},
 fetch:async url=>{
  if(String(url).includes('v3_observed_snapshots.json')){
   const obj=JSON.parse(readFileSync('site/lpos-portfolio-lab/research/v3_observed_snapshots.json','utf8'));
   return {ok:true,json:async()=>obj,text:async()=>JSON.stringify(obj)};
  }
  const name=String(url).match(/buy_hold_(006208|00631L|00685L)\.csv$/)?.[1];
  if(name){const raw=readFileSync('site/data/backtests/buy_hold_'+name+'.csv','utf8');
    return {ok:true,text:async()=>raw,json:async()=>JSON.parse(raw)};
  }
  return {ok:false,status:404};
 }
};
runInNewContext(engine,sandbox,{timeout:5000});
runInNewContext(inline+'\n;globalThis.__ui={get state(){return survivalState},get capital(){return current},get settings(){return survivalSettings},render,runSurvival};',sandbox,{timeout:15000});
assert.match(app.html,/研究總覽/);
assert.match(app.html,/01 投資配置/);
assert.match(app.html,/04 生存分析/);
function navigate(nav){handlers.click({target:{closest:()=>({dataset:{nav}})}})}
navigate('survival');
assert.match(app.html,/真正的多日生存能力檢驗/);
assert.match(app.html,/00878/);
assert.match(app.html,/套用有行情的 ETF 示範組合/);
handlers.click({target:{closest:()=>({dataset:{action:'survival-sample'}})}});
assert.ok(sandbox.__ui.capital.funds.every(x=>['006208','00685L'].includes(x.symbol)));
const update={dataset:{survival:'shockPct'},value:'40',matches:q=>q==='[data-survival]'};
handlers.change({target:update});
assert.equal(sandbox.__ui.settings.shockPct,40);
await sandbox.__ui.runSurvival('cases');
assert.equal(sandbox.__ui.state.status,'ready',sandbox.__ui.state.error||'missing reason');
assert.equal(sandbox.__ui.state.cases.length,5);
assert.ok(sandbox.__ui.state.result.ledger.length>30);
assert.match(app.html,/五組壓力劇本比較/);
assert.match(app.html,/T\+2 待交割/);
assert.match(app.html,/04｜真正的多日生存能力檢驗/);
navigate('backtest');
assert.match(app.html,/V3.0 Python 研究快照/);
assert.match(app.html,/自由歷史研究/);
navigate('compare');
assert.match(app.html,/儲存並比較 3 種策略/);
navigate('sources');
assert.match(app.html,/資料品質/);
console.log('PASS LPOS V0.5 UI smoke: 7 common navigation zones; shared fund state; survival controls, 5 cases and daily events; historic snapshots and comparison preserved.');
