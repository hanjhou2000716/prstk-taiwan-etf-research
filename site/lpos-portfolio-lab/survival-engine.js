/* LPOS Portfolio Lab | Integrated Survival Engine v0.5
 * Pure deterministic daily research, never a representation of an approved loan.
 * Receivables are economic assets but NEVER same-day spendable cash.
 * Cash pledged as margin cure remains an asset but is not liquid.
 */
(function(global){
"use strict";
const EPS=1e-6;
const NUM=x=>Number(x);
const round=n=>Math.round(n*100)/100;
const stamp=s=>Date.parse(s+"T00:00:00Z");
const days=(a,b)=>(stamp(b)-stamp(a))/86400000;
const month=(a,b)=>(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7));
function addMonths(iso,count){
 const d=new Date(stamp(iso)); const initial=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count);
 const monthNum=d.getUTCMonth();d.setUTCMonth(monthNum+1);d.setUTCDate(0);
 d.setUTCDate(Math.min(initial,d.getUTCDate()));return d.toISOString().slice(0,10);
}
function validate(settings){
 const s={shockPct:0,shockMonth:2,unemploymentMonths:0,rateHikePct:0,horizonMonths:18,
   rollover:"deny",prefund:true,marginPolicy:"warning",...settings};
 if(!Number.isFinite(s.shockPct)||s.shockPct<0||s.shockPct>90)throw Error("股災額外下跌比例須在 0～90%");
 if(!Number.isInteger(s.shockMonth)||s.shockMonth<0||s.shockMonth>120)throw Error("衝擊月份不正確");
 if(!Number.isInteger(s.unemploymentMonths)||s.unemploymentMonths<0||s.unemploymentMonths>120)throw Error("無收入月數不正確");
 if(!Number.isFinite(s.rateHikePct)||s.rateHikePct<0||s.rateHikePct>20)throw Error("升息幅度須在 0～20 個百分點");
 if(!Number.isInteger(s.horizonMonths)||s.horizonMonths<1||s.horizonMonths>120)throw Error("觀測月份須在 1～120");
 if(!["deny","conditional"].includes(s.rollover))throw Error("到期模式設定有誤");
 if(typeof s.prefund!=="boolean")throw Error("T+2 預售設定有誤");
 if(!["warning","hypothetical_two_day_cure"].includes(s.marginPolicy))throw Error("質押追繳政策設定有誤");
 return s;
}
function scenarios(settings){
 const s=validate(settings);
 return [
  ["基準條件",{...s,shockPct:0,unemploymentMonths:0,rateHikePct:0}],
  ["股災 -35%",{...s,shockPct:35,unemploymentMonths:0,rateHikePct:0}],
  ["失業 12 月",{...s,shockPct:0,unemploymentMonths:12,rateHikePct:0}],
  ["到期不續借",{...s,shockPct:0,unemploymentMonths:0,rateHikePct:0,rollover:"deny"}],
  ["複合最差情境",{...s,shockPct:40,unemploymentMonths:12,rateHikePct:3,rollover:"deny"}]
 ];
}
function run(scenario,initial,series,dates,settings={}){
 const s=validate(settings);
 if(!initial?.valid)throw Error("請先修正組合參數，再執行生存研究");
 if(!Array.isArray(dates)||dates.length<30)throw Error("有效共同交易日少於 30 日");
 const start=dates[0],symbols=initial.legs.filter(l=>l.ownValue>EPS||l.loanValue>EPS).map(l=>l.symbol);
 if(!symbols.length)throw Error("缺少可研究的 ETF 持倉");
 const maps={};for(const sym of symbols){
  const rows=series[sym]?.rows;
  if(!rows?.length)throw Error(sym+" 沒有有效逐日價格");
  maps[sym]=new Map(rows.map(x=>[x.date,x.nav]));
 }
 const selected=dates.filter(d=>month(start,d)<=s.horizonMonths);
 const last=selected.at(-1);if(selected.length<30)throw Error("觀測期不足 30 個交易日");
 for(const d of selected)for(const sym of symbols)if(!(maps[sym].get(d)>0))throw Error(sym+" 缺少 "+d+" 價格");
 const positions={};for(const l of initial.legs.filter(l=>symbols.includes(l.symbol))){
  const p=maps[l.symbol].get(start);
  if(positions[l.symbol])throw Error("同一檔 ETF 不可重複持倉");
  positions[l.symbol]={factor:l.factor,own:l.ownValue/p,loan:l.loanValue/p,
   pledged:l.pledgeStatus==="blocked"?0:l.ownValue/p*l.pledgePct/100};
 }
 let cash=initial.liquidCash,restrictedCash=0,loan=initial.borrow,interest=0,interestPaid=0;
 let settledSales=0,saleFees=0,externalFlows=0,rollovers=0;
 let firstMargin=null,firstReserve=null,firstHard=null,marginDue=null;
 let marginWarnings=0,shockApplied=false,events=[],ledger=[],receivables=[];
 const fee=scenario.tradeCostPct/100, targetReserve=scenario.monthlyLivingExpense*scenario.minReserveMonths;
 const loanMaturity=addMonths(start,scenario.termMonths);
 let maturity=loanMaturity,prev=start;
 const monthEnds=new Set(selected.map((d,i)=> i===selected.length-1||selected[i+1].slice(0,7)!==d.slice(0,7) ? i : -1).filter(i=>i>=0));
 let nextMaturityIndex=loan>EPS?selected.findIndex(d=>d>=maturity):-1;
 function shockFactor(sym){return shockApplied?Math.max(.01,1-s.shockPct/100*positions[sym].factor):1;}
 function holdings(date){let total=0,collateral=0,bySym={};
  for(const sym of symbols){
    const x=positions[sym],p=maps[sym].get(date)*shockFactor(sym);
    bySym[sym]={p,own:x.own*p,loan:x.loan*p};
    total+=(x.own+x.loan)*p;collateral+=x.pledged*p;
  }return {total,collateral,bySym};
 }
 function pendingTotal(){return receivables.reduce((a,b)=>a+b.net,0)}
 function sale(need,date,k,why){
  if(need<=EPS)return 0;
  if(k+2>=selected.length){events.push({date,type:"cannot_settle_within_window",amount:round(need),why});return 0}
  const h=holdings(date);let remaining=need/(1-fee),gross=0;
  // Loan-funded shares are never automatically pledged. Sell unpledged equity next.
  for(const key of ["loan","free-own"]){
   for(const sym of symbols){
    const x=positions[sym],p=h.bySym[sym].p;
    const units=key==="loan"?x.loan:Math.max(0,x.own-x.pledged);
    const take=Math.max(0,Math.min(remaining,units*p));
    if(take>EPS){
     if(key==="loan")x.loan-=take/p;else x.own-=take/p;
     gross+=take;remaining-=take;
    }
   }
  }
  if(gross>EPS){
    let net=gross*(1-fee);saleFees+=gross*fee;
    receivables.push({settle:k+2,net,why});
    events.push({date,type:"sell_receivable_T2",why,gross:round(gross),net:round(net),settles:selected[k+2]});
  }
  if(remaining>EPS)events.push({date,type:"insufficient_unpledged_to_sell",why,unfilled:round(remaining)});
  return gross*(1-fee);
 }
 function recordFailure(date,type,due=0){
   if(firstHard)return;
   firstHard={date,type,required:round(due),cashAvailable:round(Math.max(0,cash)),unsettled:round(pendingTotal())};
   events.push({date,type:"hard_payment_failure",reason:type,required:round(due),cashAvailable:round(cash)});
 }
 function pay(due,date,label){if(due<=EPS)return true;
  if(cash+EPS<due){recordFailure(date,label,due);return false}cash-=due;return true}
 function monthFlow(k,date){let m=month(start,date);return m<s.unemploymentMonths?-scenario.monthlyLivingExpense:scenario.monthlyFreeCashFlow}
 for(let k=0;k<selected.length;k++){
  const date=selected[k],isMonthEnd=monthEnds.has(k),monthNo=month(start,date);
  for(let q=receivables.length-1;q>=0;q--)if(receivables[q].settle===k){
   cash+=receivables[q].net;settledSales+=receivables[q].net;
   events.push({date,type:"T2_cash_settled",amount:round(receivables[q].net)});
   receivables.splice(q,1);
  }
  if(k>0){let delta=days(prev,date);interest+=loan*(scenario.aprPct+(monthNo>=s.shockMonth?s.rateHikePct:0))/100*delta/365}
  if(!shockApplied&&s.shockPct>0&&monthNo>=s.shockMonth){
   shockApplied=true;events.push({date,type:"synthetic_market_level_shock",indexFallPct:s.shockPct,
     note:"正二使用約兩倍瞬時沖擊近似，非連續歷史正二報酬"});
  }
  // Known dated obligations can be prefunded TWO TRADING SESSIONS ahead.
  if(s.prefund&&k+2<selected.length){
   let dueK=k+2,dueDate=selected[dueK],dueMonth=month(start,dueDate);
   let monthly=monthEnds.has(dueK),bullet=loan>EPS&&s.rollover==="deny"&&dueK===nextMaturityIndex;
   if(monthly||bullet){
    let loanInterest=loan*(scenario.aprPct+(dueMonth>=s.shockMonth?s.rateHikePct:0))/100*days(date,dueDate)/365;
    let dueInterest=interest+loanInterest;
    let projectedFlow=monthly?monthFlow(dueK,dueDate):0;
    let cashExpected=cash+receivables.filter(r=>r.settle<=dueK).reduce((a,b)=>a+b.net,0)+projectedFlow;
    let required=(bullet?loan:0)+dueInterest;
    let gap=Math.max(0,required-cashExpected);
    if(gap>EPS)sale(gap,date,k,bullet?"maturity_prefund":"monthly_prefund");
   }
  }
  if(isMonthEnd){
   let flow=monthFlow(k,date);cash+=flow;externalFlows+=flow;
   events.push({date,type:"monthly_net_cash_flow",amount:round(flow),assumption:monthNo<s.unemploymentMonths?"income_zero_living_costs_continue":"net_surplus"});
   if(cash<-EPS){recordFailure(date,"essential_spending_shortfall",Math.abs(cash));break;}
   if(interest>EPS){if(!pay(interest,date,"interest_payment_shortfall"))break;interestPaid+=interest;interest=0}
  }
  if(loan>EPS && date>=maturity){
   if(s.rollover==="conditional"){
    rollovers++;events.push({date,type:"rollover_assumed_NOT_APPROVED",principal:round(loan)});
    maturity=addMonths(maturity,scenario.termMonths);
    while(maturity<=date)maturity=addMonths(maturity,scenario.termMonths);
    nextMaturityIndex=selected.findIndex(d=>d>=maturity);
   }else{
    const due=loan+interest;
    if(!pay(due,date,"bullet_maturity_shortfall"))break;
    interestPaid+=interest;interest=0;loan=0;events.push({date,type:"bullet_principal_repaid",amount:round(due)});
    nextMaturityIndex=-1;
   }
  }
  let h=holdings(date),ratio=loan>EPS?(h.collateral+restrictedCash)/loan*100:null;
  if(ratio!==null && ratio<130){
   marginWarnings++;
   if(!firstMargin)firstMargin=date;
   if(marginDue===null && s.marginPolicy==="hypothetical_two_day_cure"){
    marginDue=Math.min(k+2,selected.length-1);
    events.push({date,type:"hypothetical_margin_cure_deadline",deadline:selected[marginDue]});
   }
   if(marginWarnings===1)events.push({date,type:"margin_warning_below_130",ratioPct:round(ratio)});
  } else marginDue=null;
  if(marginDue!==null&&k>=marginDue&&loan>EPS){
   const need=Math.max(0,loan*1.66-(h.collateral+restrictedCash));
   if(need>EPS){
    if(cash+EPS<need){recordFailure(date,"hypothetical_margin_cure_shortfall",need);break;}
    cash-=need;restrictedCash+=need;
    events.push({date,type:"hypothetical_cash_collateral_topup",amount:round(need)});
   }
   marginDue=null;ratio=(h.collateral+restrictedCash)/loan*100;
  }
  if(!firstReserve&&cash<targetReserve-EPS)firstReserve=date;
  const receivable=pendingTotal();
  const equity=h.total+cash+restrictedCash+receivable-loan-interest;
  if(!Number.isFinite(equity)||equity<=0){recordFailure(date,"nonpositive_net_equity",Math.abs(equity));break}
  ledger.push({date,equity:round(equity),cash:round(cash),receivable:round(receivable),restrictedCash:round(restrictedCash),
    debt:round(loan),accruedInterest:round(interest),collateralValue:round(h.collateral),
    maintenancePct:ratio===null?null:round(ratio),portfolioValue:round(h.total)});
  prev=date;
 }
 const lastRow=ledger.at(-1)||null;
 return {model:"LPOS-integrated-survival-v0.5",evidence:"adjusted-price-only",
  period:{from:start,to:last,realizedTo:lastRow?.date||start,sessions:ledger.length,expectedSessions:selected.length},
  completed:!firstHard&&ledger.length===selected.length,conditionalOnLoanRollover:rollovers>0,
  unpaidLoan:lastRow?.debt??loan,firstHard,firstMargin,firstReserve,
  interestPaid:round(interestPaid),externalNetFlows:round(externalFlows),totalT2Settled:round(settledSales),
  totalSaleFees:round(saleFees),marginWarningDays:marginWarnings,rollovers,ledger,events,settings:s,
  flags:{totalReturnVerified:false,pledgeEligibilityVerified:false,actualLoanRenewalVerified:false,
    T2TradingSessionProxy:true,brokerMarginExecutionVerified:false,assumedRollover:rollovers>0,
    hypotheticalMarginCure:s.marginPolicy==="hypothetical_two_day_cure"}};
}
global.LPOSSurvival=Object.freeze({version:"0.5.0",validate,scenarios,run});
})(typeof window!=="undefined"?window:globalThis);
