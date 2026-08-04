(function(){
  const run=document.querySelector('#run');if(!run)return;
  const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='匯出比較結果';button.style.marginLeft='10px';run.insertAdjacentElement('afterend',button);
  button.addEventListener('click',()=>{const table=[...document.querySelectorAll('#table tr')].map(row=>[...row.children].map(cell=>cell.textContent.trim()));const correlation=[...document.querySelectorAll('#corrBody tr')].map(row=>[...row.children].map(cell=>cell.textContent.trim()));const payload={generated_at:new Date().toISOString(),period:document.querySelector('#period')?.value,table,correlation};const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));link.download='prstk-strategy-comparison.json';link.click();URL.revokeObjectURL(link.href)});
})();
