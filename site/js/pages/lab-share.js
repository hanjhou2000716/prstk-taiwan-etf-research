import{shareUrl,decodeState}from'../core/url-state.js';
const strategy=document.querySelector('#strategy');
if(strategy){
  const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='複製分享網址';button.id='shareExperiment';
  document.querySelector('#exportCsv')?.insertAdjacentElement('afterend',button);
  const state=decodeState(new URLSearchParams(location.search).get('state')||'');
  if(state){setTimeout(()=>{for(const [id,value] of Object.entries(state)){const el=document.querySelector(`#${id}`);if(el)el.value=value}document.querySelectorAll('.asset-weight').forEach(el=>{const value=state.weights?.find(x=>x.asset===el.dataset.asset);if(value)el.value=value.weight});document.querySelector('#run')?.click()},0)}
  button.addEventListener('click',async()=>{const state={strategy:strategy.value,period:document.querySelector('#period')?.value,periodMode:document.querySelector('#periodMode')?.value,startDate:document.querySelector('#startDate')?.value,endDate:document.querySelector('#endDate')?.value,riskFree:document.querySelector('#riskFree')?.value,fee:document.querySelector('#fee')?.value,capital:document.querySelector('#capital')?.value,experimentName:document.querySelector('#experimentName')?.value,weights:[...document.querySelectorAll('.asset-weight')].map(el=>({asset:el.dataset.asset,weight:el.value}))};const url=shareUrl(state);try{await navigator.clipboard.writeText(url);button.textContent='已複製分享網址';setTimeout(()=>button.textContent='複製分享網址',1800)}catch{prompt('請複製研究分享網址',url)}});
}
