(function(){
  const run=document.querySelector('#run');
  if(!run)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='button secondary';
  button.textContent='匯出目前結果';
  button.style.marginTop='10px';
  run.insertAdjacentElement('afterend',button);
  button.addEventListener('click',()=>{
    const matrix=[...document.querySelectorAll('#grid tr')].map(row=>[...row.children].map(cell=>cell.textContent.trim()));
    const payload={
      generated_at:new Date().toISOString(),
      parameters:{
        collateral:document.querySelector('#collateral')?.value,
        debt:document.querySelector('#debt')?.value,
        margin_call:document.querySelector('#call')?.value,
        rollover:document.querySelector('#rollover')?.value,
        monthly_cash:document.querySelector('#cash')?.value,
        scenario:document.querySelector('#scenario')?.value
      },
      summary:{
        current_maintenance:document.querySelector('#current')?.textContent,
        first_margin_call_day:document.querySelector('#firstCall')?.textContent,
        maximum_shortfall:document.querySelector('#shortfall')?.textContent,
        worst_maintenance:document.querySelector('#worst')?.textContent,
        model_forced_liquidation_threshold:'110%',
        note:'強制處分門檻為研究模型假設，非特定券商契約。'
      },
      matrix
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download='prstk-stress-test.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
})();
