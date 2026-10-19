// Real browser integration tests, run against local release files or the published URL.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.LPOS_PLAYWRIGHT_MODULE||'playwright');
let server;
let base=process.env.LPOS_BASE_URL;
if(!base){
 const root=resolve('site');
 server=createServer(async(req,res)=>{
  try{const p=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root+sep))throw Error('outside root');
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.csv':'text/csv'})[extname(p)]||'application/octet-stream');
   res.end(await readFile(p));}catch{res.writeHead(404);res.end('not found')}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
}
const browser=await chromium.launch({headless:true,executablePath:process.env.PRSTK_BROWSER_PATH||undefined});
await mkdir('artifacts/lpos-v06',{recursive:true});
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const nav=async value=>{await page.locator(`[data-nav="${value}"]:visible`).first().click()};
  const act=async value=>{await page.locator(`[data-action="${value}"]:visible`).first().click()};
  const text=async re=>{await page.getByText(re).first().waitFor({state:'visible'})};
  const field=async (key,value)=>{const el=page.locator(`[data-field="${key}"]`);await el.fill(String(value));await el.dispatchEvent('change')};
  await page.goto(base+'/lpos-portfolio-lab/index.html');await text('Web V0.6 財務審計與公平比較');
  await nav('survival');await act('survival-sample');
  await nav('portfolio');
  assert.equal(await page.locator('[data-fund-field="ownWeightPct"]').count(),2);
  let eligibility=page.locator('[data-fund-field="pledgeStatus"]').first();await eligibility.selectOption('blocked');
  assert.equal(await page.locator('[data-fund-field="pledgePct"]').first().isDisabled(),true);
  await page.locator('[data-fund-field="pledgeStatus"]').first().selectOption('assumed');
  await page.locator('[data-fund-field="ownWeightPct"]').first().fill('70');await page.locator('[data-fund-field="ownWeightPct"]').first().dispatchEvent('change');
  await act('normalize-own');
  const weights=await page.locator('[data-fund-field="ownWeightPct"]').evaluateAll(es=>es.map(e=>Number(e.value)));
  assert.equal(weights.reduce((a,b)=>a+b,0),100);
  await nav('compare');await act('save-slot');
  await nav('financing');await field('ownCapital',2000000);
  await nav('compare');await act('v03-compare');await text(/A\/B\/C 同期比較須採相同自有資金/);
  await nav('financing');await field('ownCapital',1000000);await field('monthlyFreeCashFlow',21000);
  await nav('compare');await act('v03-compare');await text(/公平比較須採相同每月外部自由現金流/);
  await nav('financing');await field('monthlyFreeCashFlow',20000);
  await nav('compare');await page.locator('#save-slot').selectOption('B');await act('save-slot');
  await page.locator('#save-slot').selectOption('C');await act('save-slot');
  await act('v03-compare');await text('同期間時間加權 CAGR');
  await nav('overview');await act('decision-run');await text('五情境完成數（非機率）');
  await page.waitForFunction(()=>!document.querySelector('[data-action="decision-run"]').disabled);
  assert.ok(!(await page.locator('main').innerText()).includes('尚未完成有效研究'));
  await page.screenshot({path:`artifacts/lpos-v06/${name}-overview.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page-level overflow');
  await nav('financing');await field('aprPct',5);await nav('overview');await text('設定已變更，舊結果已隱藏。請重新計算。');
  for(const route of ['backtest','survival','compare','sources'])await nav(route);
  assert.deepEqual(errors,[]);
  await context.close();console.log('PASS LPOS V0.6 browser:',name,base);
 }
}finally{await browser.close();if(server)await new Promise(r=>server.close(r))}
