// ══════════════════════════════════════════════════════════
//  PRODUTOS MODULE — Product catalog management
// ══════════════════════════════════════════════════════════

const PROD_CATS = ['Relógio Feminino','Relógio Masculino','Óculos de Sol','Óculos de Grau','Semijoia Feminina','Semijoia Masculina','Outros'];
const PROD_KIOSKS = ['BLN','MOO','GAR','NEU'];
const PROD_CAT_CLS = {
  'Relógio Feminino':'cb-rf','Relógio Masculino':'cb-rm',
  'Óculos de Sol':'cb-os','Óculos de Grau':'cb-og',
  'Semijoia Feminina':'cb-sf','Semijoia Masculina':'cb-sm','Outros':'cb-ou'
};

function prodCatColor(c) {
  const m = {'Relógio Feminino':'#4a9eff','Relógio Masculino':'#ff9f4a','Óculos de Sol':'#4aff9f',
    'Óculos de Grau':'#c47aff','Semijoia Feminina':'#ff4a9f','Semijoia Masculina':'#ffca4a','Outros':'#888'};
  return m[c] || '#fff';
}

// Product data — loaded from Firebase analytics or localStorage
let prodData = [];
let prodDirty = false;
let prodFilterCat = 'all';
let prodFilterKiosks = new Set(PROD_KIOSKS);
let prodSearchQ = '';

function loadProdData() {
  // Try Firebase analytics products first
  const fbProducts = window._analytics?.products;
  if (fbProducts && Array.isArray(fbProducts) && fbProducts.length) {
    prodData = fbProducts.map(p => ({...p, kiosks:[...(p.kiosks||[])], _orig:JSON.stringify({category:p.category,kiosks:p.kiosks})}));
    return;
  }
  // Try building from analytics SKU data
  const skus = window._analytics?.skus;
  if (skus && Object.keys(skus).length) {
    prodData = Object.entries(skus).map(([code, s]) => {
      const kiosks = Object.keys(s.byKiosk || {}).filter(k => (s.byKiosk[k]?.sold || 0) > 0)
        .map(k => {
          if (k.toLowerCase().includes('balneario') || k.toLowerCase().includes('balne')) return 'BLN';
          if (k.toLowerCase().includes('mooca')) return 'MOO';
          if (k.toLowerCase().includes('garten')) return 'GAR';
          if (k.toLowerCase().includes('neumarkt')) return 'NEU';
          return k.slice(0,3).toUpperCase();
        });
      return {
        code,
        name: s.desc || code,
        category: autoCategory(s.desc || ''),
        kiosks: [...new Set(kiosks)].sort(),
        qty: s.totalSold || 0,
        revenue: s.revenue || 0,
        _orig: ''
      };
    });
    prodData.forEach(p => p._orig = JSON.stringify({category:p.category,kiosks:p.kiosks}));
    return;
  }
  // Fallback: localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('sg_products') || '[]');
    if (saved.length) {
      prodData = saved.map(p => ({...p, kiosks:[...(p.kiosks||[])], _orig:JSON.stringify({category:p.category,kiosks:p.kiosks})}));
      return;
    }
  } catch {}
  prodData = [];
}

// Auto-categorize product by name (same logic as PDF section 06)
function autoCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('óculos de grau') || n.includes('para grau')) return 'Óculos de Grau';
  if (n.includes('óculos de sol') || (n.includes('óculos') && !n.includes('grau'))) return 'Óculos de Sol';
  if (n.includes('relógio') || n.includes('relogio')) {
    if (n.includes('masculino')) return 'Relógio Masculino';
    if (n.includes('feminino')) return 'Relógio Feminino';
    if (/\b(40|42)mm\b/.test(n) || /chrono|belmont|hudson|bronx 40|square croco/i.test(n)) return 'Relógio Masculino';
    if (/\b(32|24|19)mm\b/.test(n) || /boxy|octavia|nolita|queens|versailles|louvre/i.test(n)) return 'Relógio Feminino';
    return 'Relógio Feminino'; // default for watches
  }
  if (n.includes('masculino')) return 'Semijoia Masculina';
  if (n.includes('caixa') || n.includes('estojo') || n.includes('carteira') || n.includes('flowerbox') || n.includes('flower box')) return 'Outros';
  if (n.includes('anel') || n.includes('bracelete') || n.includes('pulseira') || n.includes('colar') || n.includes('corrente') || n.includes('riviera')) return 'Semijoia Feminina';
  return 'Outros';
}

// ── MUTATIONS ──
function prodChangeCat(idx, val) {
  prodData[idx].category = val;
  prodMarkDirty();
  renderProdTable();
}

function prodToggleMix(idx, k, checked) {
  if (checked && !prodData[idx].kiosks.includes(k)) {
    prodData[idx].kiosks = [...prodData[idx].kiosks, k].sort();
  } else if (!checked) {
    prodData[idx].kiosks = prodData[idx].kiosks.filter(x => x !== k);
  }
  prodMarkDirty();
}

function prodMarkDirty() {
  prodDirty = true;
  const changed = prodData.filter(p => JSON.stringify({category:p.category,kiosks:p.kiosks}) !== p._orig).length;
  const saveMsg = document.getElementById('prodSaveMsg');
  const saveBar = document.getElementById('prodSaveBar');
  if (saveMsg) saveMsg.textContent = changed + ' produto' + (changed!==1?'s':'') + ' com alterações não salvas';
  if (saveBar) saveBar.classList.add('show');
}

function discardProdChanges() {
  loadProdData();
  prodDirty = false;
  const saveBar = document.getElementById('prodSaveBar');
  if (saveBar) saveBar.classList.remove('show');
  renderProdTable();
}

async function saveProdChanges() {
  const payload = prodData.map(p => ({code:p.code,name:p.name,category:p.category,kiosks:p.kiosks,qty:p.qty,revenue:p.revenue}));
  try {
    const analytics = window._analytics || {};
    analytics.products = payload;
    if (window.fbSaveAnalytics) {
      await window.fbSaveAnalytics(analytics);
    } else {
      localStorage.setItem('sg_products', JSON.stringify(payload));
    }
    prodData.forEach(p => p._orig = JSON.stringify({category:p.category,kiosks:p.kiosks}));
    prodDirty = false;
    const saveBar = document.getElementById('prodSaveBar');
    if (saveBar) saveBar.classList.remove('show');
    toast('Produtos salvos', 'ok');
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

// ── FILTERS ──
function setProdCat(cat, btn) {
  prodFilterCat = cat;
  document.querySelectorAll('#pnl-produtos .prod-pill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  renderProdTable();
}

function toggleProdKiosk(k, btn) {
  if (prodFilterKiosks.has(k)) { prodFilterKiosks.delete(k); btn.classList.remove('on'); }
  else { prodFilterKiosks.add(k); btn.classList.add('on'); }
  renderProdTable();
}

function setProdSearch(val) {
  prodSearchQ = val;
  renderProdTable();
}

// ── EXPORT ──
function exportProductsCSV() {
  const rows = [['Código','Nome','Categoria','BLN','MOO','GAR','NEU','Qtd. Vendida','Receita']];
  prodData.forEach(p => {
    rows.push([p.code, p.name, p.category,
      p.kiosks.includes('BLN')?'S':'N',
      p.kiosks.includes('MOO')?'S':'N',
      p.kiosks.includes('GAR')?'S':'N',
      p.kiosks.includes('NEU')?'S':'N',
      p.qty, p.revenue||0]);
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
  a.download = 'produtos_sg_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ── RENDER TABLE ──
function renderProdTable() {
  const el = document.getElementById('prodTableBody');
  if (!el) return;

  const q = prodSearchQ.toLowerCase();
  let visible = prodData.filter((p, i) => {
    p._idx = i;
    if (prodFilterCat !== 'all' && p.category !== prodFilterCat) return false;
    if (q && !p.name.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stats
  const statsEl = document.getElementById('prodStats');
  if (statsEl) {
    const catCounts = {};
    visible.forEach(p => { catCounts[p.category] = (catCounts[p.category]||0) + 1; });
    let sh = '<span class="stat-chip">' + visible.length + ' SKUs</span>';
    Object.entries(catCounts).forEach(([c,n]) => { sh += '<span class="stat-chip">' + n + ' ' + c + '</span>'; });
    statsEl.innerHTML = sh;
  }

  if (!visible.length) {
    el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:64px 24px;color:var(--muted)">Nenhum produto encontrado</td></tr>';
    return;
  }

  let h = '';
  visible.forEach(p => {
    const i = p._idx;
    h += '<tr>' +
      '<td class="code">' + escapeHtml(p.code) + '</td>' +
      '<td class="pname">' + escapeHtml(p.name) + '</td>' +
      '<td><select class="cat-sel" onchange="prodChangeCat(' + i + ',this.value)">';
    PROD_CATS.forEach(c => { h += '<option value="' + c + '"' + (c===p.category?' selected':'') + '>' + c + '</option>'; });
    h += '</select></td>' +
      '<td><div class="kiosk-checks">';
    PROD_KIOSKS.forEach(k => {
      h += '<div class="kc"><input type="checkbox"' + (p.kiosks.includes(k)?' checked':'') +
        ' onchange="prodToggleMix(' + i + ',\'' + k + '\',this.checked)"><label>' + k + '</label></div>';
    });
    h += '</div></td>' +
      '<td class="qty">' + (p.qty||0) + '</td>' +
      '<td class="qty"><b>' + (p.revenue ? R(p.revenue) : '—') + '</b></td>' +
    '</tr>';
  });
  el.innerHTML = h;
}

// ── MAIN RENDER ──
function renderProdutos() {
  const el = document.getElementById('produtosBody');
  if (!el) return;

  loadProdData();

  if (!prodData.length) {
    el.innerHTML = '<div class="empty"><div class="ei" aria-hidden="true">○</div>' +
      '<div class="et">Nenhum produto cadastrado</div>' +
      '<div class="eh">Importe o relatório analítico para popular o catálogo</div></div>';
    return;
  }

  const catLabels = {
    'Relógio Feminino':'Rel. Fem.', 'Relógio Masculino':'Rel. Masc.',
    'Óculos de Sol':'Óc. Sol', 'Óculos de Grau':'Óc. Grau',
    'Semijoia Feminina':'Semijoia Fem.', 'Semijoia Masculina':'Semijoia Masc.', 'Outros':'Outros'
  };

  let h = '';

  // Save bar
  h += '<div class="prod-save-bar" id="prodSaveBar">' +
    '<span id="prodSaveMsg">Alterações não salvas</span> ' +
    '<button class="btn-save" onclick="saveProdChanges()">Salvar no Firebase</button> ' +
    '<button class="btn-discard" onclick="discardProdChanges()">Descartar</button>' +
    '</div>';

  // Toolbar
  h += '<div class="prod-toolbar">' +
    '<div class="search-wrap">' +
      '<span class="search-icon">⌕</span>' +
      '<input type="text" id="prodSearchInput" placeholder="Buscar por nome ou código…" ' +
        'value="' + escapeHtml(prodSearchQ) + '" oninput="setProdSearch(this.value)">' +
    '</div>' +
    '<div class="filter-pills">' +
      '<button class="prod-pill' + (prodFilterCat==='all'?' on':'') + '" onclick="setProdCat(\'all\',this)">Todos</button>';
  PROD_CATS.forEach(c => {
    h += '<button class="prod-pill' + (prodFilterCat===c?' on':'') + '" data-cat="' + c + '" ' +
      'onclick="setProdCat(\'' + c + '\',this)">' + (catLabels[c]||c) + '</button>';
  });
  h += '</div>' +
    '<div class="kiosk-filter"><span class="kf">Loja:</span>';
  PROD_KIOSKS.forEach(k => {
    h += '<button class="prod-kpill' + (prodFilterKiosks.has(k)?' on':'') + '" onclick="toggleProdKiosk(\'' + k + '\',this)">' + k + '</button>';
  });
  h += '</div>' +
    '<button class="btn-export" onclick="exportProductsCSV()">↓ CSV</button>' +
    '</div>';

  // Stats bar
  h += '<div id="prodStats" class="stats-bar" style="padding:8px 0;display:flex;gap:8px;flex-wrap:wrap"></div>';

  // Table
  h += '<div class="table-wrap"><table>' +
    '<thead><tr>' +
      '<th>Código</th><th>Produto</th><th>Categoria</th>' +
      '<th class="center">Mix por Loja</th><th style="text-align:right">Qtd.</th><th style="text-align:right">Receita</th>' +
    '</tr></thead>' +
    '<tbody id="prodTableBody"></tbody>' +
    '</table></div>';

  el.innerHTML = h;
  renderProdTable();
}

window.renderProdutos = renderProdutos;
