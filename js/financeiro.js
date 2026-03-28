// ══════════════════════════════════════════════════════════
//  MÓDULO FINANCEIRO — Conferência de caixa e conciliação
// ══════════════════════════════════════════════════════════

let finKiosk = '';   // filter by kiosk ('' = all)
let finMonth = '';   // filter by month YYYY-MM
let finDate  = null; // filter by specific date (null = whole month)
let finFlags = {};   // { [kiosk+'|'+date]: true } — OK flags, persisted in localStorage

function loadFinFlags() {
  try { finFlags = JSON.parse(localStorage.getItem('fin_flags')||'{}'); } catch { finFlags = {}; }
}
function saveFinFlag(key, val) {
  finFlags[key] = val;
  try { localStorage.setItem('fin_flags', JSON.stringify(finFlags)); } catch {}
}

function setFinKiosk(v) { finKiosk=v; renderFinanceiro(); }
function setFinMonth(v) { finMonth=v; finDate=null; renderFinanceiro(); }
function setFinDate(v)  { finDate=v||null; renderFinanceiro(); }

function renderFinanceiro() {
  const el = document.getElementById('financeiroBody');
  if (!el) return;
  loadFinFlags();

  const analytics = window._analytics;
  const payments = analytics?.payments || {};

  if (!Object.keys(payments).length) {
    el.innerHTML = `<div class="empty"><div class="ei">○</div>
      <div class="et">Sem dados financeiros</div>
      <div class="eh">Importe o relatório analítico para visualizar os recebimentos por forma de pagamento.</div>
    </div>`;
    return;
  }

  const ks = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  const months = availableMonths();
  if (!finMonth) finMonth = months[months.length-1] || '';

  // Build month options from payments data
  const payMonths = new Set();
  Object.values(payments).forEach(byDate =>
    Object.keys(byDate).forEach(d => payMonths.add(d.slice(0,7)))
  );
  const sortedMonths = [...payMonths].sort();

  // Build sorted days for selected month (from payment data)
  const payDaysInMonth = new Set();
  Object.values(payments).forEach(byDate =>
    Object.keys(byDate).filter(d => d.slice(0,7) === finMonth)
      .forEach(d => payDaysInMonth.add(d))
  );
  const sortedDays = [...payDaysInMonth].sort();

  // ── Toolbar ──
  let h = `<div class="fin-toolbar">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div class="geral-filter-item">
        <label class="geral-month-lbl">Mês</label>
        <select class="geral-month-sel" onchange="setFinMonth(this.value)">
          ${sortedMonths.map(m=>`<option value="${m}"${m===finMonth?' selected':''}>${monthLabel(m)}</option>`).join('')}
        </select>
      </div>
      <div class="geral-filter-item">
        <label class="geral-month-lbl">Data</label>
        <select class="geral-month-sel" onchange="setFinDate(this.value)" style="min-width:140px">
          <option value=""${!finDate?' selected':''}>Mês completo</option>
          ${sortedDays.map(d => {
            const [,m,dd] = d.split('-');
            return `<option value="${d}"${d===finDate?' selected':''}>${dd}/${m}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="geral-filter-item">
        <label class="geral-month-lbl">Quiosque</label>
        <select class="geral-month-sel" onchange="setFinKiosk(this.value)">
          <option value="">Todos</option>
          ${ks.map(kn=>`<option value="${kn}"${finKiosk===kn?' selected':''}>${sK(kn)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="font-size:.72rem;color:var(--muted)">✓ = conciliado</div>
  </div>`;

  // Collect rows for selected month+kiosk
  const rows = [];
  const kiosksToShow = finKiosk ? [finKiosk] : ks;
  kiosksToShow.forEach(kn => {
    const byDate = payments[kn] || {};
    Object.entries(byDate)
      .filter(([d]) => finDate ? d === finDate : d.slice(0,7) === finMonth)
      .sort(([a],[b]) => a.localeCompare(b))
      .forEach(([date, p]) => rows.push({ kiosk:kn, date, ...p }));
  });

  if (!rows.length) {
    h += `<div style="color:var(--muted);padding:20px">Nenhum dado para o período selecionado.</div>`;
    el.innerHTML = h;
    return;
  }

  // Totals
  const totals = { din:0, che:0, car:0, pix:0, vale:0, dep:0, total:0, n:0 };
  rows.forEach(r => { ['din','che','car','pix','vale','dep','total','n'].forEach(k=>totals[k]+=r[k]||0); });
  const okCount = rows.filter(r => finFlags[r.kiosk+'|'+r.date]).length;

  // KPI strip
  h += `<div class="fin-kpis">
    <div class="fin-kpi"><div class="fin-kpi-v">${R(totals.total)}</div><div class="fin-kpi-l">Total Recebido</div></div>
    <div class="fin-kpi"><div class="fin-kpi-v" style="color:#60a5fa">${R(totals.pix)}</div><div class="fin-kpi-l">PIX</div></div>
    <div class="fin-kpi"><div class="fin-kpi-v" style="color:#34d399">${R(totals.car)}</div><div class="fin-kpi-l">Cartão</div></div>
    <div class="fin-kpi"><div class="fin-kpi-v" style="color:#f59e0b">${R(totals.din)}</div><div class="fin-kpi-l">Dinheiro</div></div>
    <div class="fin-kpi"><div class="fin-kpi-v" style="color:#f472b6">${R(totals.vale)}</div><div class="fin-kpi-l">Vale/Troca</div></div>
    <div class="fin-kpi"><div class="fin-kpi-v">${okCount}/${rows.length}</div><div class="fin-kpi-l">Conferidos</div></div>
  </div>`;

  // Table
  const showKioskCol = !finKiosk;
  h += `<div class="tw tw-scroll"><table class="fin-table">
    <thead><tr>
      <th>Data</th>
      ${showKioskCol ? '<th>Quiosque</th>' : ''}
      <th class="num">Vendas</th>
      <th class="num" style="color:#f59e0b">Dinheiro</th>
      <th class="num" style="color:#34d399">Cartão</th>
      <th class="num" style="color:#60a5fa">PIX</th>
      <th class="num" style="color:#f472b6">Vale</th>
      <th class="num">Total</th>
      <th style="text-align:center;width:60px">OK</th>
    </tr></thead><tbody>`;

  let lastDate = '';
  rows.forEach(r => {
    const key   = r.kiosk+'|'+r.date;
    const isOk  = !!finFlags[key];
    const [y,m,d]= r.date.split('-');
    const dateLabel = d+'/'+m;
    const isNewDate = r.date !== lastDate;
    lastDate = r.date;

    h += `<tr class="fin-row${isOk?' fin-ok':''}">
      <td class="fin-date">${isNewDate ? dateLabel : ''}</td>
      ${showKioskCol ? `<td style="font-size:.8rem">${sK(r.kiosk)}</td>` : ''}
      <td class="num fin-mono">${r.n}</td>
      <td class="num fin-mono${r.din>0?' fin-has-val':''}">${r.din>0?R(r.din):'—'}</td>
      <td class="num fin-mono${r.car>0?' fin-has-val':''}">${r.car>0?R(r.car):'—'}</td>
      <td class="num fin-mono${r.pix>0?' fin-has-val':''}">${r.pix>0?R(r.pix):'—'}</td>
      <td class="num fin-mono${r.vale>0?' fin-has-val':''}">${r.vale>0?R(r.vale):'—'}</td>
      <td class="num fin-mono fin-total">${R(r.total)}</td>
      <td style="text-align:center">
        <button class="fin-flag${isOk?' on':''}" onclick="toggleFinFlag('${key}',this)"
          title="${isOk?'Conciliado — clique para desmarcar':'Clique para marcar como conferido'}">
          ${isOk ? '✓' : '○'}
        </button>
      </td>
    </tr>`;
  });

  // Totals row
  h += `<tr class="fin-totals">
    <td><strong>Total</strong></td>
    ${showKioskCol ? '<td></td>' : ''}
    <td class="num fin-mono">${totals.n}</td>
    <td class="num fin-mono">${totals.din>0?R(totals.din):'—'}</td>
    <td class="num fin-mono">${totals.car>0?R(totals.car):'—'}</td>
    <td class="num fin-mono">${R(totals.pix)}</td>
    <td class="num fin-mono">${totals.vale>0?R(totals.vale):'—'}</td>
    <td class="num fin-mono fin-total"><strong>${R(totals.total)}</strong></td>
    <td></td>
  </tr>`;

  h += `</tbody></table></div>`;
  h += `<div class="meta-line">Analítico: ${analytics?.importedAt||'—'} · ${analytics?.period||''}</div>`;
  el.innerHTML = h;
}

function toggleFinFlag(key, btn) {
  const isOk = !finFlags[key];
  saveFinFlag(key, isOk);
  btn.classList.toggle('on', isOk);
  btn.textContent = isOk ? '✓' : '○';
  btn.closest('tr').classList.toggle('fin-ok', isOk);
}
