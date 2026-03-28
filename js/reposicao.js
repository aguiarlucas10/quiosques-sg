// ══════════════════════════════════════════════════════════
//  REPOSICAO MODULE — Replenishment planning & unified mix
// ══════════════════════════════════════════════════════════

// ── State variables ────────────────────────────────────────
let repoInterval = 15;       // replenishment interval in days (default biweekly)
let repoMixLimits = {        // space constraints per kiosk
  relogios: 100,
  oculos: 30,
  semijoias: 20
};
let repoExpandedKiosks = {};  // tracks which kiosk sections are expanded

// ── Kiosk constants ────────────────────────────────────────
const REPO_KIOSK_NAMES = [
  'QUIOSQUE BALNEARIO SHOPPING',
  'QUIOSQUE MOOCA PLAZA SHOPPING',
  'QUIOSQUE GARTEN SHOPPING',
  'QUIOSQUE NEUMARKT SHOPPING'
];
const REPO_KIOSK_SHORT = { // full name -> abbreviation
  'QUIOSQUE BALNEARIO SHOPPING':    'BLN',
  'QUIOSQUE MOOCA PLAZA SHOPPING':  'MOO',
  'QUIOSQUE GARTEN SHOPPING':       'GAR',
  'QUIOSQUE NEUMARKT SHOPPING':     'NEU'
};
const REPO_SHORT_KIOSK = {}; // abbreviation -> full name
Object.entries(REPO_KIOSK_SHORT).forEach(([full, short]) => { REPO_SHORT_KIOSK[short] = full; });

// Category grouping for mix limits
const REPO_CAT_GROUPS = {
  relogios:  ['Relógio Feminino', 'Relógio Masculino'],
  oculos:    ['Óculos de Sol', 'Óculos de Grau'],
  semijoias: ['Semijoia Feminina', 'Semijoia Masculina']
};

// ── Helper: number of days with data ───────────────────────
function repoNDays() {
  const dr = window._store?.dateRange || [];
  return dr.length || 1;  // avoid division by zero
}

// ── Helper: resolve kiosk names present in analytics ───────
function repoKioskNames() {
  const kiosks = Object.keys(window._store?.kiosks || {});
  // Return only the 4 known kiosks that actually exist in the data
  return REPO_KIOSK_NAMES.filter(k => kiosks.includes(k));
}

// ── Helper: abbreviate kiosk name ──────────────────────────
function repoShort(kioskName) {
  return REPO_KIOSK_SHORT[kioskName] || sK(kioskName);
}

// ── Core velocity calculations ─────────────────────────────

function kioskVelocity(sku, kioskName) {
  const skuData = window._analytics?.skus?.[sku];
  if (!skuData) return 0;
  const sold = skuData.byKiosk?.[kioskName]?.sold || 0;
  return sold / repoNDays();
}

function globalVelocity(sku) {
  const skuData = window._analytics?.skus?.[sku];
  if (!skuData) return 0;
  return (skuData.totalSold || 0) / repoNDays();
}

function avgKioskVelocity(sku) {
  const skuData = window._analytics?.skus?.[sku];
  if (!skuData) return 0;
  const byKiosk = skuData.byKiosk || {};
  // Count kiosks that actually sold this product
  const activeKiosks = Object.values(byKiosk).filter(k => (k.sold || 0) > 0).length;
  if (activeKiosks === 0) return 0;
  return (skuData.totalSold || 0) / repoNDays() / activeKiosks;
}

// Potential velocity for products a kiosk doesn't carry
function potentialVelocity(sku, kioskName) {
  const actual = kioskVelocity(sku, kioskName);
  if (actual > 0) return actual; // has sales, use actual
  // No sales at this kiosk: conservative 70% of average
  return avgKioskVelocity(sku) * 0.7;
}

// Effective velocity for replenishment decisions
function effectiveVel(sku, kioskName) {
  const actual = kioskVelocity(sku, kioskName);
  const potential = potentialVelocity(sku, kioskName);
  return Math.max(actual, potential * 0.7);
}

// Replenishment quantity
function repoQty(sku, kioskName) {
  const vel = effectiveVel(sku, kioskName);
  const qty = Math.ceil(vel * repoInterval);
  // Minimum 1 unit for any product in the mix
  return Math.max(qty, 1);
}

// ── Unified mix scoring and selection ──────────────────────

function computeUnifiedMix() {
  const skus = window._analytics?.skus || {};
  const nDays = repoNDays();
  const allKiosks = repoKioskNames();

  const scored = [];
  for (const [code, data] of Object.entries(skus)) {
    const cat = autoCategory(data.desc || '');
    const gVel = (data.totalSold || 0) / nDays;
    const avgPrice = (data.totalSold > 0) ? (data.revenue || 0) / data.totalSold : 0;
    const numKiosksPresent = Object.values(data.byKiosk || {}).filter(k => (k.sold || 0) > 0).length;

    // Score: velocity 60% + value 20% + distribution 20%
    const score = gVel * 0.6
                + avgPrice * 0.001 * 0.2
                + (numKiosksPresent / 4) * 0.2;

    scored.push({
      code,
      desc: data.desc || code,
      cat,
      score,
      gVel,
      avgPrice,
      revenue: data.revenue || 0,
      totalSold: data.totalSold || 0,
      totalReturned: data.totalReturned || 0,
      numKiosks: numKiosksPresent,
      byKiosk: data.byKiosk || {}
    });
  }

  // Sort by score descending within each group
  scored.sort((a, b) => b.score - a.score);

  // Select top N per category group
  const mix = { relogios: [], oculos: [], semijoias: [], outros: [] };

  for (const item of scored) {
    if (REPO_CAT_GROUPS.relogios.includes(item.cat)) {
      if (mix.relogios.length < repoMixLimits.relogios) mix.relogios.push(item);
    } else if (REPO_CAT_GROUPS.oculos.includes(item.cat)) {
      if (mix.oculos.length < repoMixLimits.oculos) mix.oculos.push(item);
    } else if (REPO_CAT_GROUPS.semijoias.includes(item.cat)) {
      if (mix.semijoias.length < repoMixLimits.semijoias) mix.semijoias.push(item);
    }
    // 'Outros' excluded from the unified mix
  }

  return mix;
}

// ── Replenishment type for a product at a kiosk ────────────
function repoType(sku, kioskName) {
  const skuData = window._analytics?.skus?.[sku];
  if (!skuData) return 'NOVO';
  const sold = skuData.byKiosk?.[kioskName]?.sold || 0;
  if (sold > 0) return 'PROVADO';
  // Check if it sells in any other kiosk
  const anyOther = Object.entries(skuData.byKiosk || {})
    .some(([k, v]) => k !== kioskName && (v.sold || 0) > 0);
  return anyOther ? 'OPORTUNIDADE' : 'NOVO';
}

// ── Configuration handlers ─────────────────────────────────

function recalcRepo() {
  const intEl = document.getElementById('repoIntervalInput');
  const relEl = document.getElementById('repoLimitRelogios');
  const ocEl  = document.getElementById('repoLimitOculos');
  const sjEl  = document.getElementById('repoLimitSemijoias');

  if (intEl) repoInterval = Math.max(1, Math.min(90, parseInt(intEl.value) || 15));
  if (relEl) repoMixLimits.relogios = Math.max(1, parseInt(relEl.value) || 100);
  if (ocEl)  repoMixLimits.oculos = Math.max(1, parseInt(ocEl.value) || 30);
  if (sjEl)  repoMixLimits.semijoias = Math.max(1, parseInt(sjEl.value) || 20);

  renderReposicao();
  toast('Reposição recalculada', 'ok');
}

function setRepoInterval(val) {
  repoInterval = Math.max(1, Math.min(90, parseInt(val) || 15));
  renderReposicao();
}

function setRepoLimit(group, val) {
  const n = Math.max(1, parseInt(val) || 1);
  if (repoMixLimits[group] !== undefined) {
    repoMixLimits[group] = n;
    renderReposicao();
  }
}

function toggleRepoKiosk(kioskName) {
  repoExpandedKiosks[kioskName] = !repoExpandedKiosks[kioskName];
  const body = document.getElementById('repoKiosk-' + repoShort(kioskName));
  const arrow = document.getElementById('repoArrow-' + repoShort(kioskName));
  if (body) body.style.display = repoExpandedKiosks[kioskName] ? 'block' : 'none';
  if (arrow) arrow.textContent = repoExpandedKiosks[kioskName] ? '▾' : '▸';
}

// ── Export CSV ─────────────────────────────────────────────

function exportRepoCSV() {
  const mix = computeUnifiedMix();
  const allItems = [...mix.relogios, ...mix.oculos, ...mix.semijoias];
  const kiosks = repoKioskNames();
  const nDays = repoNDays();

  const rows = [['Quiosque', 'SKU', 'Produto', 'Categoria', 'Vel/dia', 'Qtd Repor', 'Tipo']];

  for (const kName of kiosks) {
    const short = repoShort(kName);
    for (const item of allItems) {
      const vel = effectiveVel(item.code, kName);
      const qty = repoQty(item.code, kName);
      const tipo = repoType(item.code, kName);
      rows.push([
        short,
        item.code,
        item.desc,
        item.cat,
        vel.toFixed(3),
        qty,
        tipo
      ]);
    }
  }

  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
  a.download = 'reposicao_sg_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  toast('CSV exportado', 'ok');
}

// ── Main render function ───────────────────────────────────

function renderReposicao() {
  const el = document.getElementById('reposicaoBody');
  if (!el) return;

  const skus = window._analytics?.skus || {};
  if (!Object.keys(skus).length) {
    el.innerHTML = '<div class="empty"><div class="ei">\u25CB</div>'
      + '<div class="et">Nenhum dado de produtos encontrado</div>'
      + '<div class="eh">Importe o relatório CSV para gerar o plano de reposição.</div></div>';
    return;
  }

  const kiosks = repoKioskNames();
  const nDays = repoNDays();
  const mix = computeUnifiedMix();
  const allMixItems = [...mix.relogios, ...mix.oculos, ...mix.semijoias];

  let h = '';

  // ─── 1. Configuration toolbar ────────────────────────────
  h += '<div class="geral-toolbar"><div class="geral-filters">';

  h += '<div class="geral-filter-item">'
    + '<label class="geral-month-lbl">Intervalo de reposição</label>'
    + '<input id="repoIntervalInput" type="number" class="geral-month-sel" value="' + repoInterval + '" min="1" max="90" style="width:60px;text-align:center"> '
    + '<span style="font-size:.82rem;color:var(--muted)">dias</span>'
    + '</div>';

  h += '<div class="geral-filter-item">'
    + '<label class="geral-month-lbl">Relógios</label>'
    + '<input id="repoLimitRelogios" type="number" class="geral-month-sel" value="' + repoMixLimits.relogios + '" min="1" style="width:60px;text-align:center">'
    + '</div>';

  h += '<div class="geral-filter-item">'
    + '<label class="geral-month-lbl">Óculos</label>'
    + '<input id="repoLimitOculos" type="number" class="geral-month-sel" value="' + repoMixLimits.oculos + '" min="1" style="width:60px;text-align:center">'
    + '</div>';

  h += '<div class="geral-filter-item">'
    + '<label class="geral-month-lbl">Semijoias</label>'
    + '<input id="repoLimitSemijoias" type="number" class="geral-month-sel" value="' + repoMixLimits.semijoias + '" min="1" style="width:60px;text-align:center">'
    + '</div>';

  h += '<div class="geral-filter-item">'
    + '<button class="btn-secondary" onclick="recalcRepo()" style="height:34px;padding:0 14px">Recalcular</button>'
    + '</div>';

  h += '<div class="geral-filter-item" style="margin-left:auto">'
    + '<button class="btn-secondary" onclick="exportRepoCSV()" style="height:34px;padding:0 14px">\u2913 Exportar CSV</button>'
    + '</div>';

  h += '</div></div>';

  // Info bar: period and data range
  h += '<div style="font-size:.78rem;color:var(--muted);padding:4px 0 12px">'
    + nDays + ' dias de dados \u00B7 '
    + kiosks.length + ' quiosques ativos \u00B7 '
    + Object.keys(skus).length + ' SKUs no catálogo'
    + '</div>';

  // ─── 2. Mix Ideal Único ──────────────────────────────────
  h += '<h2 class="h2">Mix Ideal Único</h2>';
  h += '<p style="font-size:.82rem;color:var(--muted);margin:-4px 0 12px">Mix unificado para todas as lojas, baseado em velocidade de venda, valor e distribuição.</p>';

  h += renderMixGroup('Relógios', mix.relogios, repoMixLimits.relogios, kiosks);
  h += renderMixGroup('Óculos', mix.oculos, repoMixLimits.oculos, kiosks);
  h += renderMixGroup('Semijoias', mix.semijoias, repoMixLimits.semijoias, kiosks);

  // ─── 3. Reposição por Quiosque ───────────────────────────
  h += '<h2 class="h2" style="margin-top:28px">Reposição por Quiosque</h2>';
  h += '<p style="font-size:.82rem;color:var(--muted);margin:-4px 0 12px">Quantidades para ' + repoInterval + ' dias, com base na velocidade efetiva de cada loja.</p>';

  kiosks.forEach((kName, ki) => {
    const short = repoShort(kName);
    const expanded = repoExpandedKiosks[kName] || false;
    const color = KC[ki % KC.length]?.line || '#fff';

    h += '<div class="repo-kiosk-section" style="margin-bottom:16px">';
    h += '<div class="repo-kiosk-header" onclick="toggleRepoKiosk(\'' + escapeHtml(kName) + '\')" '
      + 'style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 12px;'
      + 'background:rgba(255,255,255,.04);border-radius:8px;border:1px solid rgba(255,255,255,.08)">';
    h += '<span id="repoArrow-' + short + '" style="font-size:.9rem;color:var(--muted)">' + (expanded ? '▾' : '▸') + '</span>';
    h += '<span style="color:' + color + ';font-weight:600">' + escapeHtml(sK(kName)) + '</span>';
    h += '<span style="font-size:.78rem;color:var(--muted);margin-left:auto">' + short + '</span>';
    h += '</div>';

    h += '<div id="repoKiosk-' + short + '" style="display:' + (expanded ? 'block' : 'none') + '">';
    h += renderKioskRepoTable(kName, allMixItems, ki);
    h += '</div>';
    h += '</div>';
  });

  // ─── 4. Resumo de Reposição ──────────────────────────────
  h += '<h2 class="h2" style="margin-top:28px">Resumo de Reposição</h2>';
  h += '<div class="kpi-g">';

  kiosks.forEach((kName, ki) => {
    h += renderRepoSummaryCard(kName, allMixItems, ki);
  });

  h += '</div>';

  el.innerHTML = h;
}

// ── Render mix group table (Relógios, Óculos, Semijoias) ───

function renderMixGroup(groupLabel, items, limit, kiosks) {
  let h = '';
  h += '<div style="margin-bottom:18px">';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  h += '<span style="font-weight:600;font-size:.92rem">' + escapeHtml(groupLabel) + '</span>';
  h += '<span style="font-size:.78rem;color:var(--muted)">' + items.length + '/' + limit + ' no mix</span>';
  h += '</div>';

  if (!items.length) {
    h += '<div style="font-size:.82rem;color:var(--muted);padding:12px">Nenhum produto nesta categoria.</div>';
    h += '</div>';
    return h;
  }

  h += '<div class="tw-scroll"><table class="tw">';
  h += '<thead><tr>'
    + '<th style="width:32px">#</th>'
    + '<th>Produto</th>'
    + '<th>Categoria</th>'
    + '<th class="num">Score</th>'
    + '<th class="num">Vel Global</th>';

  kiosks.forEach(k => {
    h += '<th class="num">' + repoShort(k) + '</th>';
  });

  h += '<th class="num">Vendas</th>'
    + '<th style="width:48px;text-align:center">Mix</th>'
    + '</tr></thead><tbody>';

  items.forEach((item, idx) => {
    h += '<tr>';
    h += '<td class="mo" style="color:var(--muted)">' + (idx + 1) + '</td>';
    h += '<td>' + escapeHtml(item.desc) + '</td>';
    h += '<td style="font-size:.78rem">' + escapeHtml(item.cat) + '</td>';
    h += '<td class="num mo">' + item.score.toFixed(3) + '</td>';
    h += '<td class="num mo">' + item.gVel.toFixed(2) + '/d</td>';

    kiosks.forEach(k => {
      const vel = kioskVelocity(item.code, k);
      const cls = vel > 0 ? '' : ' style="color:var(--muted)"';
      h += '<td class="num mo"' + cls + '>' + vel.toFixed(2) + '</td>';
    });

    h += '<td class="num mo">' + (item.totalSold || 0) + '</td>';
    h += '<td style="text-align:center;color:var(--success)">&#10003;</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += '</div>';
  return h;
}

// ── Render per-kiosk replenishment table ───────────────────

function renderKioskRepoTable(kioskName, mixItems, kioskIdx) {
  if (!mixItems.length) {
    return '<div style="font-size:.82rem;color:var(--muted);padding:12px">Nenhum produto no mix.</div>';
  }

  // Group items by category group
  const groups = [
    { label: 'Relógios',  cats: REPO_CAT_GROUPS.relogios },
    { label: 'Óculos',    cats: REPO_CAT_GROUPS.oculos },
    { label: 'Semijoias', cats: REPO_CAT_GROUPS.semijoias }
  ];

  let totalUnits = 0;
  const subtotals = {};
  const rows = [];

  mixItems.forEach(item => {
    const vel = kioskVelocity(item.code, kioskName);
    const pot = potentialVelocity(item.code, kioskName);
    const eff = effectiveVel(item.code, kioskName);
    const qty = repoQty(item.code, kioskName);
    const tipo = repoType(item.code, kioskName);

    // Determine group key
    let grpKey = 'outros';
    for (const [gk, cats] of Object.entries(REPO_CAT_GROUPS)) {
      if (cats.includes(item.cat)) { grpKey = gk; break; }
    }

    subtotals[grpKey] = (subtotals[grpKey] || 0) + qty;
    totalUnits += qty;

    rows.push({ item, vel, pot, eff, qty, tipo, grpKey });
  });

  let h = '<div class="tw-scroll" style="margin-top:8px"><table class="tw">';
  h += '<thead><tr>'
    + '<th style="width:32px">#</th>'
    + '<th>Produto</th>'
    + '<th>Categoria</th>'
    + '<th class="num">Vel Real</th>'
    + '<th class="num">Vel Potencial</th>'
    + '<th class="num">Vel Efetiva</th>'
    + '<th class="num">Qtd Repor</th>'
    + '<th>Tipo</th>'
    + '</tr></thead><tbody>';

  let count = 0;
  for (const grp of groups) {
    const grpRows = rows.filter(r => grp.cats.includes(r.item.cat));
    if (!grpRows.length) continue;

    // Group sub-header
    const grpKey = Object.keys(REPO_CAT_GROUPS).find(k => REPO_CAT_GROUPS[k] === grp.cats) || '';
    h += '<tr style="background:rgba(255,255,255,.03)">'
      + '<td colspan="8" style="font-weight:600;font-size:.82rem;padding:6px 8px">'
      + escapeHtml(grp.label)
      + ' <span style="color:var(--muted);font-weight:400">(' + grpRows.length + ' SKUs, '
      + (subtotals[grpKey] || 0) + ' unid.)</span>'
      + '</td></tr>';

    grpRows.sort((a, b) => b.eff - a.eff);
    grpRows.forEach(r => {
      count++;
      const qtyColor = r.tipo === 'PROVADO' ? 'var(--success)' : (r.tipo === 'OPORTUNIDADE' ? '#f59e0b' : 'var(--muted)');
      const badgeCls = r.tipo === 'PROVADO' ? 'gbadge hit' : (r.tipo === 'OPORTUNIDADE' ? 'gbadge warn' : 'gbadge');

      h += '<tr>';
      h += '<td class="mo" style="color:var(--muted)">' + count + '</td>';
      h += '<td>' + escapeHtml(r.item.desc) + '</td>';
      h += '<td style="font-size:.78rem">' + escapeHtml(r.item.cat) + '</td>';
      h += '<td class="num mo">' + r.vel.toFixed(3) + '</td>';
      h += '<td class="num mo">' + r.pot.toFixed(3) + '</td>';
      h += '<td class="num mo">' + r.eff.toFixed(3) + '</td>';
      h += '<td class="num mo" style="color:' + qtyColor + ';font-weight:600">' + r.qty + '</td>';
      h += '<td><span class="' + badgeCls + '">' + r.tipo + '</span></td>';
      h += '</tr>';
    });
  }

  // Grand total row
  h += '<tr style="background:rgba(255,255,255,.06);font-weight:600">'
    + '<td colspan="6" style="text-align:right">Total</td>'
    + '<td class="num mo">' + totalUnits + '</td>'
    + '<td></td>'
    + '</tr>';

  h += '</tbody></table></div>';
  return h;
}

// ── Render summary card for a kiosk ────────────────────────

function renderRepoSummaryCard(kioskName, mixItems, kioskIdx) {
  const short = repoShort(kioskName);
  const color = KC[kioskIdx % KC.length]?.line || '#fff';

  let totalUnits = 0;
  let totalCost = 0;
  const catUnits = { relogios: 0, oculos: 0, semijoias: 0 };
  const priorities = [];

  mixItems.forEach(item => {
    const qty = repoQty(item.code, kioskName);
    const eff = effectiveVel(item.code, kioskName);
    totalUnits += qty;
    totalCost += qty * (item.avgPrice || 0);

    // Determine category group
    for (const [gk, cats] of Object.entries(REPO_CAT_GROUPS)) {
      if (cats.includes(item.cat)) {
        catUnits[gk] += qty;
        break;
      }
    }

    priorities.push({ desc: item.desc, vel: eff, qty, tipo: repoType(item.code, kioskName) });
  });

  // Top 5 by velocity
  priorities.sort((a, b) => b.vel - a.vel);
  const top5 = priorities.slice(0, 5);

  let h = '<div class="kpi" style="border-top:3px solid ' + color + '">';
  h += '<div class="kpi-l" style="color:' + color + '">' + escapeHtml(sK(kioskName)) + ' (' + short + ')</div>';
  h += '<div class="kpi-v">' + totalUnits + ' <span style="font-size:.7em;color:var(--muted)">unidades</span></div>';

  h += '<div style="font-size:.78rem;color:var(--muted);margin-top:6px">'
    + catUnits.relogios + ' relógios, '
    + catUnits.oculos + ' óculos, '
    + catUnits.semijoias + ' semijoias'
    + '</div>';

  h += '<div style="font-size:.82rem;margin-top:6px">'
    + 'Custo estimado: <span class="mo">' + R(totalCost) + '</span>'
    + '</div>';

  // Top 5 priority items
  if (top5.length) {
    h += '<div style="margin-top:10px;font-size:.78rem;color:var(--muted)">Top 5 prioridades:</div>';
    h += '<div style="font-size:.78rem;margin-top:4px">';
    top5.forEach((p, i) => {
      const badgeCls = p.tipo === 'PROVADO' ? 'gbadge hit' : (p.tipo === 'OPORTUNIDADE' ? 'gbadge warn' : 'gbadge');
      h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0">'
        + '<span style="color:var(--muted)">' + (i + 1) + '.</span> '
        + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(p.desc) + '</span> '
        + '<span class="mo">' + p.qty + 'un</span> '
        + '<span class="' + badgeCls + '" style="font-size:.68rem">' + p.tipo + '</span>'
        + '</div>';
    });
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── Global exports ─────────────────────────────────────────
window.renderReposicao = renderReposicao;
window.recalcRepo      = recalcRepo;
window.setRepoInterval = setRepoInterval;
window.setRepoLimit    = setRepoLimit;
window.exportRepoCSV   = exportRepoCSV;
window.toggleRepoKiosk = toggleRepoKiosk;
