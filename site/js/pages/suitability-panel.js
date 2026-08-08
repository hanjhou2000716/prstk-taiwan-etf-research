import { evaluateSuitability } from '../core/suitability-engine.js';

const [catalog, baseline] = await Promise.all([
  fetch('data/strategy-catalog.json').then(response => response.json()),
  fetch('data/baseline_metrics.json').then(response => response.json()),
]);
const byId = Object.fromEntries(baseline.map(row => [row.strategy, row]));
const section = document.createElement('section');
section.className = 'section';
section.innerHTML = `
  <div class="section-title">
    <h2>研究適配度矩陣</h2>
    <p>依使用者限制條件淘汰不符合策略；分數公式公開，僅供研究，不是個人化投資建議。</p>
  </div>
  <div class="toolbar">
    <label class="chip">最大可接受回撤
      <select id="fitMaxDrawdown"><option value="0.2">20%</option><option value="0.35" selected>35%</option><option value="0.6">60%</option></select>
    </label>
    <label class="chip"><input id="fitLeverage" type="checkbox" checked> 接受槓桿／正二</label>
    <label class="chip"><input id="fitPledge" type="checkbox"> 接受質押</label>
    <label class="chip"><input id="fitExperimental" type="checkbox"> 納入實驗策略</label>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table class="data-table"><thead><tr><th>策略</th><th>適配狀態</th><th>研究分數</th><th>歷史回撤</th><th>主要限制</th><th>模型證據</th></tr></thead><tbody id="suitabilityBody"></tbody></table>
  </div>
  <div class="note" style="margin-top:16px">分數組成：報酬 25%、回撤控制 25%、尾端風險 20%、恢復時間 15%、證據狀態 15%。硬限制優先於分數。</div>`;
document.querySelector('main').insertBefore(section, document.querySelector('.footer'));

const body = section.querySelector('#suitabilityBody');
const percent = value => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : '—';

function render() {
  const constraints = {
    maxDrawdown: Number(section.querySelector('#fitMaxDrawdown').value),
    acceptLeverage: section.querySelector('#fitLeverage').checked,
    acceptPledge: section.querySelector('#fitPledge').checked,
    includeExperimental: section.querySelector('#fitExperimental').checked,
  };
  body.replaceChildren(...catalog.strategies.map(strategy => {
    const metrics = byId[strategy.strategy_id];
    const result = evaluateSuitability(strategy, metrics, constraints);
    const row = document.createElement('tr');
    const reasons = [...result.hard_failures, ...result.reasons];
    row.innerHTML = `<td>${strategy.display_name}</td><td>${result.status === 'excluded' ? '排除' : '研究適配'}</td><td>${result.status === 'excluded' ? '—' : (result.score * 100).toFixed(1)}</td><td>${percent(metrics?.max_drawdown)}</td><td>${reasons.join('；') || '目前限制內無額外警示'}</td><td>${strategy.implementation_status}</td>`;
    return row;
  }));
}

section.querySelectorAll('input, select').forEach(control => control.addEventListener('change', render));
render();
