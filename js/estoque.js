// ══════════════════════════════════════════════════════════
//  ESTOQUE IMPORT — CSV/XLSX stock count importer
// ══════════════════════════════════════════════════════════

// Per-kiosk datetime of last count, keyed by kiosk name
// Stored in goals.inventory.countDates = { [kiosk]: 'YYYY-MM-DDTHH:MM' }

let _pendingStockImport = null;  // parsed rows before save

function loadStockFile(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const ext  = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onload = e => {
    let rows = [];
    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(e.target.result, { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' })
        .filter(r => r.some(c => String(c).trim()));
    } else {
      // CSV — try latin-1 / UTF-8
      let text = e.target.result;
      rows = text.split(/\r?\n/)
        .filter(l => l.trim())
        .map(l => l.split(/;|,|\t/).map(c => c.trim().replace(/^"|"$/g,'')));
    }
    parseStockImport(rows, file.name);
  };

  if (ext === 'xlsx' || ext === 'xls') reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'latin-1');  // default latin-1 for PDV exports
}

// ── Detect file format ──────────────────────────────────
function detectStockFormat(rows) {
  // Format A: PDV Contagem (Contada/Estoque header, semicolons, col[1]=SKU, col[8]=Contada)
  if (rows[0] && String(rows[0][0]).includes('Contada')) return 'pdv';
  // Check row[1] for 'Contagem' keyword
  for (let i = 0; i < 3; i++) {
    const r = rows[i]||[];
    if (r.some(c => String(c).toLowerCase().includes('contagem'))) return 'pdv';
  }
  // Format B: generic (header row with SKU, Quantidade, Quiosque)
  for (let i = 0; i < 5; i++) {
    const r = (rows[i]||[]).map(c => String(c).toLowerCase());
    if (r.some(c => c.includes('sku') || c === 'cod') &&
        r.some(c => c.includes('quant') || c === 'qty' || c === 'estoque')) {
      return 'generic';
    }
  }
  return 'generic';
}

// ── Main parser ─────────────────────────────────────────
function parseStockImport(rows, filename) {
  if (!rows.length) { showStockImportError('Arquivo vazio.'); return; }

  const fmt = detectStockFormat(rows);

  if (fmt === 'pdv') {
    parsePdvContagem(rows, filename);
  } else {
    parseGenericStock(rows, filename);
  }
}

// ── PDV Contagem format ─────────────────────────────────
// Row 0: Contada/Estoque header
// Row 2: col[4]=date, col[6]=kiosk, col[7]=responsible
// Row 5: column labels (col[9]=Contada, col[10]=Estoque)
// Data rows: col[1]=SKU, col[2]=desc, col[8]=Contada, col[10]=Estoque sistema
function parsePdvContagem(rows, filename) {
  // Extract header metadata
  const h2    = rows[2]||[];
  const rawDate  = String(h2[4]||'').trim();  // DD/MM/YYYY
  const rawKiosk = String(h2[6]||'').trim();
  const resp     = String(h2[7]||'').trim();

  // Parse date → YYYY-MM-DD
  let isoDate = new Date().toISOString().slice(0,10);
  const dm = rawDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dm) isoDate = `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;

  // Fuzzy match kiosk
  const kMatch = Object.keys(store.kiosks).find(k =>
    k.toLowerCase().includes(rawKiosk.toLowerCase().slice(0,10)) ||
    rawKiosk.toLowerCase().includes(sK(k).toLowerCase())
  ) || rawKiosk;

  // Build description → analytic SKU lookup map
  const descToAnalyticSku = {};
  const skusData = window._analytics?.skus||{};
  Object.entries(skusData).forEach(([sku, s]) => {
    descToAnalyticSku[s.desc.toLowerCase().trim()] = sku;
  });

  // Parse data rows
  const parsed = [];
  const unmatched = [];

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 9) continue;
    const rawSku  = String(r[1]||'').trim();
    const rawDesc = String(r[2]||'').trim();
    const contadaRaw = String(r[8]||'').trim();
    const estoqueRaw = String(r[10]||'').trim();
    if (!rawSku && !rawDesc) continue;

    const contada = contadaRaw !== '' ? parseInt(contadaRaw) : null;
    const estoqueAnt = estoqueRaw !== '' ? parseInt(estoqueRaw) : null;
    if (contada === null && estoqueAnt === null) continue;
    if (isNaN(contada) && isNaN(estoqueAnt)) continue;

    // Try to match to analytic SKU by description
    const descNorm = rawDesc.toLowerCase().trim();
    let analyticSku = descToAnalyticSku[descNorm];
    // Fuzzy: partial match
    if (!analyticSku) {
      analyticSku = Object.entries(descToAnalyticSku).find(([d]) =>
        d.includes(descNorm.slice(0,20)) || descNorm.includes(d.slice(0,20))
      )?.[1];
    }
    // Also try stripping description padding
    if (!analyticSku) {
      const descTrimmed = rawDesc.replace(/\s{2,}/g,' ').trim().toLowerCase();
      analyticSku = Object.entries(descToAnalyticSku).find(([d]) =>
        d.replace(/\s{2,}/g,' ').startsWith(descTrimmed.slice(0,25)) ||
        descTrimmed.startsWith(d.slice(0,25))
      )?.[1];
    }

    const row = {
      pdvSku:    rawSku,
      desc:      rawDesc.replace(/\s{2,}/g,' '),
      contada:   isNaN(contada) ? null : contada,
      estoqueAnt: isNaN(estoqueAnt) ? null : estoqueAnt,
      kiosk:     kMatch,
      analyticSku,
      matched:   !!analyticSku,
    };

    parsed.push(row);
    if (!analyticSku) unmatched.push(row);
  }

  if (!parsed.length) { showStockImportError('Nenhuma linha de produto encontrada.'); return; }

  _pendingStockImport = parsed;
  _stockImportMeta = { kiosk: kMatch, date: isoDate, responsible: resp, format: 'pdv', filename };
  renderPdvImportPreview(parsed, unmatched, kMatch, isoDate, resp);
}

// ── Generic format ──────────────────────────────────────
function parseGenericStock(rows, filename) {
  // Find header
  let headerRow=-1, colSku=0, colQty=1, colKiosk=2;
  for (let i=0; i<Math.min(5,rows.length); i++) {
    const r = rows[i].map(c => String(c).toLowerCase().trim());
    const si = r.findIndex(c => c.includes('sku')||c==='cod'||c==='código');
    const qi = r.findIndex(c => c.includes('quant')||c==='qty'||c==='estoque'||c.includes('contad'));
    const ki = r.findIndex(c => c.includes('quiosque')||c.includes('loja')||c.includes('kiosk'));
    if (si>=0 && qi>=0) { headerRow=i; colSku=si; colQty=qi; colKiosk=ki; break; }
  }
  const dataStart = headerRow>=0 ? headerRow+1 : 0;
  const parsed=[], errors=[];
  for (let i=dataStart; i<rows.length; i++) {
    const r = rows[i];
    const sku  = String(r[colSku]||'').trim();
    const qty  = parseFloat(String(r[colQty]||'').replace(',','.'));
    const kRaw = colKiosk>=0 ? String(r[colKiosk]||'').trim() : '';
    if (!sku) continue;
    if (isNaN(qty)) { errors.push(`Linha ${i+1}: quantidade inválida`); continue; }
    const kMatch = kRaw ? (Object.keys(store.kiosks).find(k =>
      k.toLowerCase().includes(kRaw.toLowerCase()) ||
      kRaw.toLowerCase().includes(sK(k).toLowerCase())
    ) || kRaw) : null;
    parsed.push({ pdvSku: sku, desc: sku, contada: Math.round(qty), kiosk: kMatch, analyticSku: sku, matched: true });
  }
  if (!parsed.length) { showStockImportError('Nenhuma linha válida encontrada.'); return; }
  _pendingStockImport = parsed;
  _stockImportMeta = { kiosk: null, date: new Date().toISOString().slice(0,10), format:'generic', filename };
  renderPdvImportPreview(parsed, [], null, _stockImportMeta.date, '');
}

// ── Preview UI ──────────────────────────────────────────
let _stockImportMeta = null;
let _stockImportSelection = null;  // Set of pdvSkus to import, null = all

function renderPdvImportPreview(rows, unmatched, kiosk, isoDate, responsible) {
  const el = document.getElementById('stockImportPreview');
  if (!el) return;

  const matched   = rows.filter(r => r.matched);
  const isoDateTime = isoDate + 'T' + new Date().toTimeString().slice(0,5);

  let h = `<div class="stock-preview">
    <div class="stock-preview-head">
      <div>
        <div style="font-size:.85rem;font-weight:600;margin-bottom:4px">
          ${kiosk ? sK(kiosk) : 'Quiosque não identificado'}
          ${responsible ? `<span style="color:var(--muted);font-weight:400;margin-left:8px;font-size:.78rem">· ${responsible}</span>` : ''}
        </div>
        <div style="font-size:.75rem;color:var(--muted)">
          ${rows.length} produtos · ${matched.length} vinculados ao analítico
          ${unmatched.length ? `· <span style="color:#f59e0b">${unmatched.length} sem correspondência</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:.75rem;color:var(--muted);white-space:nowrap">Data da contagem</label>
        <input type="datetime-local" id="pdvCountDate" value="${isoDateTime}"
          style="background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.78rem;padding:3px 8px;height:30px">
      </div>
    </div>`;

  // Mode selector
  h += `<div class="stock-preview-modes">
    <label class="stock-mode-opt">
      <input type="radio" name="importMode" value="all" checked onchange="setStockImportMode('all')">
      <span>Sobrescrever todos (${rows.length} produtos)</span>
    </label>
    <label class="stock-mode-opt">
      <input type="radio" name="importMode" value="select" onchange="setStockImportMode('select')">
      <span>Selecionar produtos manualmente</span>
    </label>
  </div>`;

  // Product table
  h += `<div class="stock-preview-table-wrap">
    <div id="stockSelToolbar" style="display:none;padding:8px 0 6px;display:none">
      <button class="btn-secondary" onclick="selectAllStock(true)" style="height:28px;padding:0 10px;font-size:.75rem">Todos</button>
      <button class="btn-secondary" onclick="selectAllStock(false)" style="height:28px;padding:0 10px;font-size:.75rem;margin-left:4px">Nenhum</button>
      <span id="stockSelCount" style="font-size:.75rem;color:var(--muted);margin-left:8px"></span>
    </div>
    <div class="tw tw-scroll" style="max-height:340px;overflow-y:auto">
    <table style="width:100%;font-size:.78rem;border-collapse:collapse">
      <thead><tr>
        <th id="stockChkHeader" style="width:32px;display:none;padding:6px 8px;border-bottom:1px solid var(--border)"></th>
        <th style="text-align:left;color:var(--muted);font-size:.62rem;letter-spacing:.07em;padding:6px 8px;border-bottom:1px solid var(--border)">PRODUTO</th>
        <th class="num" style="color:var(--muted);font-size:.62rem;letter-spacing:.07em;padding:6px 8px;border-bottom:1px solid var(--border)">CONTADA</th>
        <th class="num" style="color:var(--muted);font-size:.62rem;letter-spacing:.07em;padding:6px 8px;border-bottom:1px solid var(--border)">SISTEMA</th>
        <th class="num" style="color:var(--muted);font-size:.62rem;letter-spacing:.07em;padding:6px 8px;border-bottom:1px solid var(--border)">DIF.</th>
        <th style="color:var(--muted);font-size:.62rem;letter-spacing:.07em;padding:6px 8px;border-bottom:1px solid var(--border)">SKU ANALÍTICO</th>
      </tr></thead><tbody>`;

  rows.forEach((r, idx) => {
    const diff = (r.contada !== null && r.estoqueAnt !== null) ? r.contada - r.estoqueAnt : null;
    const diffColor = diff === null ? '' : diff > 0 ? 'color:var(--success)' : diff < 0 ? 'color:var(--danger)' : 'color:var(--muted)';
    const noMatch = !r.matched;
    h += `<tr style="${noMatch?'opacity:.5':''}">
      <td id="chk-cell-${idx}" class="stock-chk-cell" style="display:none;padding:5px 8px;text-align:center">
        <input type="checkbox" class="stock-row-chk" data-idx="${idx}" checked
          onchange="updateStockSelection()">
      </td>
      <td style="padding:5px 8px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.desc}">${r.desc}</td>
      <td class="num" style="padding:5px 8px;font-family:var(--mono);font-weight:600">${r.contada ?? '—'}</td>
      <td class="num" style="padding:5px 8px;font-family:var(--mono);color:var(--muted)">${r.estoqueAnt ?? '—'}</td>
      <td class="num" style="padding:5px 8px;font-family:var(--mono);${diffColor}">${diff !== null ? (diff>0?'+':'')+diff : '—'}</td>
      <td style="padding:5px 8px;font-family:var(--mono);font-size:.7rem;color:${noMatch?'var(--danger)':'var(--muted)'}">
        ${r.analyticSku || '<em>sem vínculo</em>'}
      </td>
    </tr>`;
  });

  h += `</tbody></table></div></div>`;

  // Actions
  h += `<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">
    <button class="btn-primary" id="btnConfirmStockImport" onclick="saveStockImport()"
      style="height:34px;padding:0 16px;font-size:.8rem">
      Salvar contagem
    </button>
    <button class="btn-secondary" onclick="cancelStockImport()"
      style="height:34px;padding:0 16px;font-size:.8rem">Cancelar</button>
    <span style="font-size:.72rem;color:var(--muted)" id="stockImportNote"></span>
  </div></div>`;

  el.innerHTML = h;
  el.style.display = 'block';
  _stockImportSelection = null;  // null = all
  updateStockImportNote();
}

function setStockImportMode(mode) {
  const chkCells   = document.querySelectorAll('.stock-chk-cell');
  const chkHeader  = document.getElementById('stockChkHeader');
  const selToolbar = document.getElementById('stockSelToolbar');
  const show = mode === 'select';
  chkCells.forEach(c => c.style.display = show ? 'table-cell' : 'none');
  if (chkHeader) chkHeader.style.display = show ? 'table-cell' : 'none';
  if (selToolbar) selToolbar.style.display = show ? 'flex' : 'none';
  if (!show) {
    _stockImportSelection = null;
    document.querySelectorAll('.stock-row-chk').forEach(c => c.checked = true);
  }
  updateStockImportNote();
}

function selectAllStock(checked) {
  document.querySelectorAll('.stock-row-chk').forEach(c => c.checked = checked);
  updateStockSelection();
}

function updateStockSelection() {
  const checked = [...document.querySelectorAll('.stock-row-chk:checked')].map(c => parseInt(c.dataset.idx));
  _stockImportSelection = checked;
  const ct = document.getElementById('stockSelCount');
  if (ct) ct.textContent = `${checked.length} selecionados`;
  updateStockImportNote();
}

function updateStockImportNote() {
  const note = document.getElementById('stockImportNote');
  if (!note || !_pendingStockImport) return;
  const total  = _pendingStockImport.length;
  const active = _stockImportSelection ? _stockImportSelection.length : total;
  note.textContent = `${active} de ${total} produtos serão salvos`;
}

function showStockImportError(msg) {
  const el = document.getElementById('stockImportPreview');
  if (el) { el.innerHTML = `<div style="color:var(--danger);font-size:.8rem;padding:8px 0">${msg}</div>`; el.style.display='block'; }
}

async function saveStockImport() {
  if (!_pendingStockImport?.length) return;

  const dtInput = document.getElementById('pdvCountDate');
  const dt = dtInput?.value || new Date().toISOString().slice(0,16);

  // Determine which rows to save
  const rowsToSave = _stockImportSelection !== null
    ? _stockImportSelection.map(i => _pendingStockImport[i]).filter(Boolean)
    : _pendingStockImport;

  if (!rowsToSave.length) { showStockImportError('Nenhum produto selecionado.'); return; }

  const inv = getInventory();
  if (!inv.stock)      inv.stock      = {};
  if (!inv.countDates) inv.countDates = {};

  const kiosk = _stockImportMeta?.kiosk || '';
  if (kiosk) inv.countDates[kiosk] = dt;

  let saved = 0;
  rowsToSave.forEach(r => {
    // Use analyticSku if available, else fall back to pdvSku
    const skuKey = r.analyticSku || r.pdvSku;
    if (!skuKey || r.contada === null) return;
    if (!inv.stock[skuKey]) inv.stock[skuKey] = {};
    if (!inv.stock[skuKey][kiosk]) inv.stock[skuKey][kiosk] = {};
    inv.stock[skuKey][kiosk].atual      = r.contada;
    inv.stock[skuKey][kiosk].countDate  = dt;
    saved++;
  });

  if (!goals.inventory) goals.inventory = { targetDays: estoqueTargetDays, stock:{}, countDates:{} };
  goals.inventory.stock      = inv.stock;
  goals.inventory.countDates = inv.countDates;

  try {
    await saveAllGoals();
    toast(`${saved} SKUs salvos · ${sK(kiosk)||'quiosque'} · ${dt.slice(0,10)}`, 'ok');
    _pendingStockImport = null;
    _stockImportMeta = null;
    _stockImportSelection = null;
    const el = document.getElementById('stockImportPreview');
    if (el) { el.style.display='none'; el.innerHTML=''; }
    renderEstoque();
  } catch(e) {
    showStockImportError('Erro ao salvar: ' + e.message);
  }
}

function cancelStockImport() {
  _pendingStockImport = null;
  _stockImportMeta = null;
  _stockImportSelection = null;
  const el = document.getElementById('stockImportPreview');
  if (el) { el.style.display='none'; el.innerHTML=''; }
}


// ══════════════════════════════════════════════════════════
//  ESTOQUE MODULE — Gestão de Reposição
// ══════════════════════════════════════════════════════════

// State
let estoqueFilter    = '';
let estoqueSortCol   = 'status';   // status|sku|desc|velocity|diasEst|reorder
let estoqueSortAsc   = false;
let estoqueKiosk     = '';         // '' = all, or kiosk name
let estoqueOnlyCrit  = false;      // show only critical/low
let estoqueTargetDays = 30;        // target days of stock to maintain

// Inventory config stored in goals.inventory = {
//   targetDays: number,
//   stock: { [sku]: { [kiosk]: { atual: number, padrao: number } } }
// }

function getInventory() {
  return goals.inventory || { targetDays: 30, stock: {} };
}

function setEstoqueFilter(v)    { estoqueFilter = v; renderEstoque(); }
function setEstoqueSort(col)    {
  if (estoqueSortCol === col) estoqueSortAsc = !estoqueSortAsc;
  else { estoqueSortCol = col; estoqueSortAsc = col==='sku'||col==='desc'; }
  renderEstoque();
}
function setEstoqueKiosk(v)     { estoqueKiosk = v; renderEstoque(); }
function setEstoqueOnlyCrit(v)  { estoqueOnlyCrit = v; renderEstoque(); }
function setEstoqueTargetDays(v){ estoqueTargetDays = parseInt(v)||30; renderEstoque(); }

function renderEstoque() {
  const el = document.getElementById('estoqueBody');
  if (!el) return;
  const analytics = window._analytics;
  if (!analytics?.skus || !Object.keys(analytics.skus).length) {
    el.innerHTML = `<div class="empty">
      <div class="ei">○</div><div class="et">Nenhum dado analítico</div>
      <div class="es">Importe o relatório Analítico (VENDEDOR.RPT) na aba Importar</div>
    </div>`;
    return;
  }

  const inv = getInventory();
  const ks  = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  const skusAll = Object.entries(analytics.skus);
  const dateRange = store.dateRange||[];
  const nDays = Math.max(1, dateRange.length);  // days with data

  // Build enriched SKU list
  const enriched = skusAll.map(([sku, s]) => {
    const kList = estoqueKiosk ? [estoqueKiosk] : ks;
    let totalSold=0, totalDays=0;
    const byKiosk = {};
    kList.forEach(kn => {
      const kb      = s.byKiosk?.[kn]||{};
      const sold    = kb.sold||0;
      const atual   = inv.stock?.[sku]?.[kn]?.atual ?? null;
      const padrao  = inv.stock?.[sku]?.[kn]?.padrao ?? null;
      const velocity= sold / nDays;   // units/day for this kiosk
      const diasEst = (atual !== null && velocity > 0) ? atual/velocity : null;
      const reorder = (padrao !== null && atual !== null) ? Math.max(0, padrao - atual) : null;
      byKiosk[kn] = { sold, atual, padrao, velocity, diasEst, reorder };
      totalSold += sold;
    });
    const velocity = totalSold / nDays;
    // Aggregate atual/diasEst across kiosks
    const atualArr  = kList.map(kn=>byKiosk[kn].atual).filter(v=>v!==null);
    const totalAtual = atualArr.length ? atualArr.reduce((a,b)=>a+b,0) : null;
    const diasEst    = totalAtual !== null && velocity > 0 ? totalAtual/velocity : null;
    const reorderArr = kList.map(kn=>byKiosk[kn].reorder).filter(v=>v!==null);
    const totalReorder = reorderArr.length ? reorderArr.reduce((a,b)=>a+b,0) : null;

    // Status
    let status = 'ok';
    if (diasEst !== null) {
      if (diasEst < 7)  status = 'critical';
      else if (diasEst < 14) status = 'low';
    } else if (totalAtual === null) {
      status = 'unset';
    }

    return { sku, s, totalSold, velocity, totalAtual, diasEst, totalReorder, status, byKiosk };
  });

  // Filter
  const q = estoqueFilter.toLowerCase();
  let filtered = enriched.filter(e => {
    if (q && !e.sku.toLowerCase().includes(q) && !e.s.desc.toLowerCase().includes(q)) return false;
    if (estoqueOnlyCrit && e.status !== 'critical' && e.status !== 'low') return false;
    return true;
  });

  // Sort
  const sortFns = {
    status:   (a,b) => { const ord={critical:0,low:1,ok:2,unset:3}; return (ord[a.status]||3)-(ord[b.status]||3); },
    sku:      (a,b) => a.sku.localeCompare(b.sku),
    desc:     (a,b) => a.s.desc.localeCompare(b.s.desc),
    velocity: (a,b) => b.velocity - a.velocity,
    diasEst:  (a,b) => { if(a.diasEst===null&&b.diasEst===null) return 0; if(a.diasEst===null) return 1; if(b.diasEst===null) return -1; return a.diasEst-b.diasEst; },
    sold:     (a,b) => b.totalSold - a.totalSold,
    reorder:  (a,b) => (b.totalReorder||0) - (a.totalReorder||0),
  };
  filtered.sort(sortFns[estoqueSortCol]||sortFns.status);
  if (estoqueSortAsc) filtered.reverse();

  // Metrics
  const totalSkus      = filtered.length;
  const criticalCount  = filtered.filter(e=>e.status==='critical').length;
  const lowCount       = filtered.filter(e=>e.status==='low').length;
  const unsetCount     = filtered.filter(e=>e.status==='unset').length;
  const si = a => a===estoqueSortCol?(estoqueSortAsc?'↑':'↓'):'';

  let h = '';

  // ── Stock Import Panel ────────────────────────────────
  h += `<div class="stock-import-panel">
    <div class="stock-import-header">
      <div>
        <div style="font-size:.82rem;margin-bottom:2px">Importar contagem de estoque</div>
        <div style="font-size:.72rem;color:var(--muted)">CSV ou XLSX com colunas: <code>SKU</code> · <code>Quantidade</code> · <code>Quiosque</code></div>
      </div>
      <label class="btn-secondary" style="cursor:pointer;padding:0 14px;line-height:34px;border-radius:6px;font-size:.8rem;white-space:nowrap">
        ↑ Selecionar arquivo
        <input type="file" accept=".csv,.xlsx,.xls,.txt" style="display:none"
          onchange="loadStockFile(event)">
      </label>
    </div>
    <div id="stockImportPreview" style="display:none;margin-top:12px"></div>
  </div>`;
  h += `<div class="est-toolbar">
    <div class="est-search-wrap">
      <input class="est-search" type="text" placeholder="Buscar SKU ou produto…"
        value="${estoqueFilter}" oninput="setEstoqueFilter(this.value)">
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="geral-month-sel" onchange="setEstoqueKiosk(this.value)" style="height:36px">
        <option value="">Todos os quiosques</option>
        ${ks.map(kn=>`<option value="${kn}"${estoqueKiosk===kn?' selected':''}>${sK(kn)}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${estoqueOnlyCrit?'checked':''} onchange="setEstoqueOnlyCrit(this.checked)">
        Críticos e baixos
      </label>
      <div style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);white-space:nowrap">
        Meta
        <input type="number" value="${estoqueTargetDays}" min="1" max="365"
          onchange="setEstoqueTargetDays(this.value)"
          style="width:52px;height:28px;padding:0 6px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;text-align:center">
        dias
      </div>
      <button class="btn-secondary" onclick="exportReposicao()" style="height:36px;padding:0 14px;font-size:.78rem">
        ↓ Exportar reposição
      </button>
    </div>
  </div>`;

  // ── KPI strip ─────────────────────────────────────────
  h += `<div class="est-kpis">
    <div class="est-kpi"><div class="est-kpi-n">${totalSkus}</div><div class="est-kpi-l">SKUs</div></div>
    <div class="est-kpi" style="color:var(--danger)"><div class="est-kpi-n">${criticalCount}</div><div class="est-kpi-l">Crítico <7d</div></div>
    <div class="est-kpi" style="color:#f59e0b"><div class="est-kpi-n">${lowCount}</div><div class="est-kpi-l">Baixo <14d</div></div>
    <div class="est-kpi" style="color:var(--muted)"><div class="est-kpi-n">${unsetCount}</div><div class="est-kpi-l">Sem estoque</div></div>
    <div class="est-kpi"><div class="est-kpi-n">${nDays}</div><div class="est-kpi-l">Dias de dados</div></div>
  </div>`;

  // ── Table ─────────────────────────────────────────────
  h += `<div class="tw tw-scroll" style="margin-top:12px"><table>
    <thead><tr>
      <th class="est-th" onclick="setEstoqueSort('status')" style="width:8px"></th>
      <th class="est-th" onclick="setEstoqueSort('sku')" style="cursor:pointer">SKU ${si('sku')}</th>
      <th class="est-th" onclick="setEstoqueSort('desc')" style="cursor:pointer">Produto ${si('desc')}</th>
      <th class="est-th num" onclick="setEstoqueSort('sold')" style="cursor:pointer">Vendas ${si('sold')}</th>
      <th class="est-th num" onclick="setEstoqueSort('velocity')" style="cursor:pointer">Un./dia ${si('velocity')}</th>
      <th class="est-th num" style="color:#60a5fa" onclick="setEstoqueSort('diasEst')" >Dias Est. ${si('diasEst')}</th>
      <th class="est-th num" style="color:#60a5fa">Est. Atual</th>
      <th class="est-th num">Meta ${estoqueTargetDays}d</th>
      <th class="est-th num" style="color:#34d399" onclick="setEstoqueSort('reorder')">Repor ${si('reorder')}</th>
      ${estoqueKiosk ? '' : `<th class="est-th" style="width:32px"></th>`}
    </tr></thead><tbody>`;

  filtered.forEach((e, idx) => {
    const detId = `ed-${idx}`;
    const statusDot = {critical:'🔴',low:'🟡',ok:'🟢',unset:'⚪'}[e.status]||'⚪';
    const metaEst = e.velocity > 0 ? Math.ceil(e.velocity * estoqueTargetDays) : null;
    const diasColor = e.diasEst !== null
      ? (e.diasEst < 7 ? 'var(--danger)' : e.diasEst < 14 ? '#f59e0b' : 'var(--success)')
      : 'var(--muted)';

    h += `<tr class="est-row" onclick="toggleEstoqueDetail('${detId}')" style="cursor:pointer">
      <td style="text-align:center;font-size:.7rem">${statusDot}</td>
      <td class="sku-code">${e.sku}</td>
      <td class="est-desc">${e.s.desc}</td>
      <td class="num est-num">${e.totalSold}</td>
      <td class="num est-num">${e.velocity >= 0.1 ? e.velocity.toFixed(1) : e.velocity > 0 ? '<0.1' : '—'}</td>
      <td class="num est-num" style="color:${diasColor};font-weight:600">
        ${e.diasEst !== null ? e.diasEst.toFixed(0)+'d' : '—'}
      </td>
      <td class="num est-num" style="color:#60a5fa">
        <span class="est-stock-edit" onclick="event.stopPropagation();openStockEdit('${e.sku}','${estoqueKiosk||''}',${idx})">
          ${e.totalAtual !== null ? e.totalAtual : '<span style="color:var(--muted);font-size:.72rem">+ definir</span>'}
        </span>
      </td>
      <td class="num est-num">${metaEst !== null ? metaEst : '—'}</td>
      <td class="num est-num" style="color:${(e.totalReorder||0)>0?'#34d399':'var(--muted)'}">
        ${e.totalReorder !== null ? (e.totalReorder > 0 ? `<strong>${e.totalReorder}</strong>` : '✓') : '—'}
      </td>
      ${estoqueKiosk ? '' : `<td style="text-align:center;font-size:.7rem;color:var(--muted)">▸</td>`}
    </tr>
    <tr id="${detId}" style="display:none">
      <td colspan="10" style="padding:0">
        <div class="est-detail" id="${detId}-inner"></div>
      </td>
    </tr>`;
  });

  h += `</tbody></table></div>`;
  h += `<div class="meta-line">Período: ${analytics.period||'—'} · Velocidade baseada em ${nDays} dias de dados</div>`;
  el.innerHTML = h;
}

function toggleEstoqueDetail(detId) {
  const row   = document.getElementById(detId);
  const inner = document.getElementById(detId+'-inner');
  if (!row) return;
  const open = row.style.display !== 'none';
  if (open) { row.style.display = 'none'; return; }
  row.style.display = '';

  const inv = getInventory();
  const ks  = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  // Find the SKU from the sibling row
  const sku = row.previousElementSibling?.cells?.[1]?.textContent?.trim();
  if (!sku) return;
  const s = window._analytics?.skus?.[sku];
  if (!s) { inner.innerHTML = '<div style="padding:12px;color:var(--muted)">Sem dados</div>'; return; }

  const dateRange = store.dateRange||[];
  const nDays = Math.max(1, dateRange.length);

  let h = `<div class="est-kiosk-grid">`;
  ks.forEach(kn => {
    const kb      = s.byKiosk?.[kn]||{};
    const sold    = kb.sold||0;
    const velocity= sold/nDays;
    const atual   = inv.stock?.[sku]?.[kn]?.atual ?? null;
    const padrao  = inv.stock?.[sku]?.[kn]?.padrao ?? null;
    const countDate = inv.stock?.[sku]?.[kn]?.countDate || inv.countDates?.[kn] || null;
    const diasEst = atual !== null && velocity > 0 ? atual/velocity : null;
    const metaEst = velocity > 0 ? Math.ceil(velocity * estoqueTargetDays) : null;
    const reorder = padrao !== null && atual !== null ? Math.max(0, padrao - atual) : null;
    const statusColor = diasEst === null ? 'var(--muted)' : diasEst < 7 ? 'var(--danger)' : diasEst < 14 ? '#f59e0b' : 'var(--success)';
    const kc = KC[ks.indexOf(kn)%KC.length];

    h += `<div class="est-kiosk-card" style="border-top:2px solid ${kc.line}">
      <div class="est-kiosk-name">${sK(kn)}${countDate?`<span style="font-size:.6rem;color:var(--muted);margin-left:6px;font-family:var(--mono)">contagem ${new Date(countDate).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>`:''}</div>
      <div class="est-kiosk-nums">
        <div class="est-kn"><div class="est-kn-l">Vendas</div><div class="est-kn-v">${sold}</div></div>
        <div class="est-kn"><div class="est-kn-l">Un./dia</div><div class="est-kn-v">${velocity>=0.1?velocity.toFixed(1):velocity>0?'<0.1':'—'}</div></div>
        <div class="est-kn"><div class="est-kn-l">Est. Atual</div>
          <div class="est-kn-v" style="color:#60a5fa">
            <input class="est-inline-input" type="number" min="0"
              value="${atual !== null ? atual : ''}" placeholder="—"
              onchange="setStockValue('${sku}','${kn}','atual',this.value)"
              onclick="event.stopPropagation()">
          </div>
        </div>
        <div class="est-kn"><div class="est-kn-l">Padrão</div>
          <div class="est-kn-v" style="color:var(--muted)">
            <input class="est-inline-input" type="number" min="0"
              value="${padrao !== null ? padrao : ''}" placeholder="—"
              onchange="setStockValue('${sku}','${kn}','padrao',this.value)"
              onclick="event.stopPropagation()">
          </div>
        </div>
        <div class="est-kn"><div class="est-kn-l">Dias Est.</div><div class="est-kn-v" style="color:${statusColor}">${diasEst!==null?diasEst.toFixed(0)+'d':'—'}</div></div>
        <div class="est-kn"><div class="est-kn-l">Meta ${estoqueTargetDays}d</div><div class="est-kn-v">${metaEst!==null?metaEst:'—'}</div></div>
        <div class="est-kn"><div class="est-kn-l">Repor</div><div class="est-kn-v" style="color:${reorder&&reorder>0?'#34d399':'var(--muted)'}">${reorder!==null?(reorder>0?reorder:'✓'):'—'}</div></div>
        ${kb.returned?`<div class="est-kn"><div class="est-kn-l">Devol.</div><div class="est-kn-v" style="color:var(--danger)">${kb.returned}</div></div>`:''}
      </div>
    </div>`;
  });
  h += `</div><div style="padding:6px 0 2px;text-align:right">
    <button class="btn-primary" style="height:30px;padding:0 14px;font-size:.75rem" onclick="saveInventory()">Salvar estoque</button>
  </div>`;
  inner.innerHTML = h;
}

// Stock editing
let _pendingStock = {};
function setStockValue(sku, kiosk, field, val) {
  const v = parseFloat(val);
  if (!_pendingStock[sku]) _pendingStock[sku] = {};
  if (!_pendingStock[sku][kiosk]) _pendingStock[sku][kiosk] = {};
  _pendingStock[sku][kiosk][field] = isNaN(v) ? null : Math.round(v);
}

async function saveInventory() {
  if (!Object.keys(_pendingStock).length) return;
  showStatus('Salvando estoque…', 'dim');
  try {
    if (!goals.inventory) goals.inventory = { targetDays: estoqueTargetDays, stock: {} };
    // Merge pending into goals.inventory.stock
    for (const [sku, kiosks] of Object.entries(_pendingStock)) {
      if (!goals.inventory.stock[sku]) goals.inventory.stock[sku] = {};
      for (const [kn, vals] of Object.entries(kiosks)) {
        if (!goals.inventory.stock[sku][kn]) goals.inventory.stock[sku][kn] = {};
        Object.assign(goals.inventory.stock[sku][kn], vals);
      }
    }
    goals.inventory.targetDays = estoqueTargetDays;
    await saveAllGoals();
    _pendingStock = {};
    toast('Estoque salvo ✓', 'ok');
    renderEstoque();
  } catch(e) {
    showStatus('Erro: '+e.message, 'err');
  }
}

function openStockEdit(sku, kiosk, idx) {
  // Expand the detail row inline instead of a popup
  const detId = `ed-${idx}`;
  const row = document.getElementById(detId);
  if (row) {
    if (row.style.display === 'none') {
      toggleEstoqueDetail(detId);
    }
    row.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
}

// Export replenishment list as CSV
function exportReposicao() {
  const analytics = window._analytics;
  if (!analytics?.skus) return;
  const inv = getInventory();
  const ks  = Object.values(store.kiosks).sort((a,b)=>b.liq-a.liq).map(k=>k.name);
  const dateRange = store.dateRange||[];
  const nDays = Math.max(1, dateRange.length);

  let csv = 'SKU,Produto,Quiosque,Velocidade (un/dia),Estoque Atual,Estoque Padrão,Dias Estoque,Meta '+estoqueTargetDays+'d,Repor\n';
  Object.entries(analytics.skus).forEach(([sku,s]) => {
    ks.forEach(kn => {
      const kb    = s.byKiosk?.[kn]||{};
      const sold  = kb.sold||0;
      if (!sold) return;
      const vel   = (sold/nDays).toFixed(2);
      const atual = inv.stock?.[sku]?.[kn]?.atual ?? '';
      const pad   = inv.stock?.[sku]?.[kn]?.padrao ?? '';
      const diasE = atual !== '' && parseFloat(vel) > 0 ? (parseFloat(atual)/parseFloat(vel)).toFixed(0) : '';
      const meta  = parseFloat(vel) > 0 ? Math.ceil(parseFloat(vel)*estoqueTargetDays) : '';
      const repor = pad !== '' && atual !== '' ? Math.max(0, parseFloat(pad)-parseFloat(atual)) : '';
      csv += `"${sku}","${s.desc}","${sK(kn)}",${vel},${atual},${pad},${diasE},${meta},${repor}\n`;
    });
  });

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reposicao_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
