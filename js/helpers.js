// ══════════════════════════════════════════════════════════
//  helpers.js — Shared utilities extracted from index.html
// ══════════════════════════════════════════════════════════

// ── 1. HTML Escape (P14 - Security) ─────────────────────
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ── 2. Global State (P7 - organized namespace) ──────────
window._store = { period:null, importedAt:null, gtLiq:0, gtPecas:0, kiosks:{}, sellers:{}, txnKeys:[], dateRange:[] };
window._goals = { kiosks:{}, sellers:{} };
window._analytics = { skus:{} };
window._isAdmin = false;
window._userRole = null;
window._userProfile = null;

Object.defineProperty(window,'store',{get:()=>window._store,set:v=>{window._store=v;}});
Object.defineProperty(window,'goals',{get:()=>window._goals,set:v=>{window._goals=v;}});

// ── 3. sanitizeGoals ────────────────────────────────────
function sanitizeGoals(g) {
  if (!g) return { kiosks:{}, sellers:{} };
  const isCorrupt = v => typeof v === 'string' && v.includes('${');
  const cleanNum  = v => (isCorrupt(v) || isNaN(parseFloat(v))) ? 0 : parseFloat(v);
  const cleanObj  = obj => {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const [k,v] of Object.entries(obj)) {
      if (isCorrupt(k)) continue;
      out[k] = isCorrupt(v) ? 0 : (typeof v === 'number' ? v : (typeof v === 'object' ? cleanObj(v) : v));
    }
    return out;
  };
  const cleanKiosk = G => !G ? {} : ({
    monthlyByMonth: cleanObj(G.monthlyByMonth||{}),
    weeklyOverride: cleanObj(G.weeklyOverride||{}),
    activeSellers:  Array.isArray(G.activeSellers) ? G.activeSellers.filter(s=>typeof s==='string'&&!isCorrupt(s)) : [],
    dailyByDate:    cleanObj(G.dailyByDate||{}),
  });
  const cleanSeller = S => !S ? {} : ({
    overrideMonthly: cleanObj(S.overrideMonthly||{}),
    overrideWeekly:  cleanObj(S.overrideWeekly||{}),
  });
  return {
    kiosks:    Object.fromEntries(Object.entries(g.kiosks||{}).map(([k,v]) => [k, cleanKiosk(v)])),
    sellers:   Object.fromEntries(Object.entries(g.sellers||{}).map(([k,v]) => [k, cleanSeller(v)])),
    inventory: g.inventory ? { targetDays: g.inventory.targetDays||30, stock: cleanObj(g.inventory.stock||{}) } : undefined,
  };
}
window.sanitizeGoals = sanitizeGoals;

// ── 4. Chart helpers ────────────────────────────────────
let chartInstances = {};
function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

// ── 5. Goal calculation functions ───────────────────────
function kioskDailyGoal(kName, dateKey) {
  return goals.kiosks[kName]?.dailyByDate?.[dateKey] || 0;
}
function kioskMonthGoal(kName, monthKey) {
  const manual = goals.kiosks[kName]?.monthlyByMonth?.[monthKey] || 0;
  if (manual) return manual;
  return kioskMonthGoalFromDaily(kName, monthKey);
}
function kioskWeekGoal(kName, monKey, monday, sunday) {
  const G = goals.kiosks[kName]; if (!G) return 0;
  if (G.weeklyOverride?.[monKey]) return G.weeklyOverride[monKey];
  if (monday && sunday) return kioskWeekGoalFromDaily(kName, monday, sunday);
  const mon = new Date(monKey+'T00:00:00');
  const sun = new Date(mon.getTime()+6*86400000);
  return kioskWeekGoalFromDaily(kName, mon, sun);
}
function sellerMonthGoal(kName, monthKey) {
  const G = goals.kiosks[kName]; if (!G) return 0;
  const total = kioskMonthGoal(kName, monthKey);
  if (!total) return 0;
  const override = goals.sellers?.[kName]?.overrideMonthly?.[monthKey];
  if (override) return override;
  const n = activeSellers(kName).length || 1;
  return total / n;
}
function sellerWeekGoal(kName, sName, monKey, monday, sunday) {
  const override = goals.sellers?.[sName]?.overrideWeekly?.[monKey];
  if (override) return override;
  const total = kioskWeekGoal(kName, monKey, monday, sunday);
  if (!total) return 0;
  const n = activeSellers(kName).length || 1;
  return total / n;
}
function sWeekLiq(kName, sName, monday, sunday) {
  const byDate = store.kiosks[kName]?.sellers?.[sName]?.byDate || {};
  return Object.entries(byDate).reduce((s, [d, v]) => {
    const dt = new Date(d+'T00:00:00');
    return (dt >= monday && dt <= sunday) ? s + (v.liq||0) : s;
  }, 0);
}
function kioskMonthGoalFromDaily(kName, monthKey) {
  const db = goals.kiosks[kName]?.dailyByDate||{};
  return Object.entries(db)
    .filter(([d]) => d.slice(0,7) === monthKey)
    .reduce((s,[,v]) => s+v, 0);
}
function kioskWeekGoalFromDaily(kName, monday, sunday) {
  const db = goals.kiosks[kName]?.dailyByDate||{};
  return Object.entries(db)
    .filter(([d]) => { const dt=new Date(d+'T00:00:00'); return dt>=monday&&dt<=sunday; })
    .reduce((s,[,v]) => s+v, 0);
}

// ── 6. Prize tier constants and functions ───────────────
const KC = [
  { line:'#60a5fa', fill:'rgba(96,165,250,.12)',  border:'rgba(96,165,250,.25)'  },
  { line:'#34d399', fill:'rgba(52,211,153,.12)',  border:'rgba(52,211,153,.25)'  },
  { line:'#f59e0b', fill:'rgba(245,158,11,.12)',  border:'rgba(245,158,11,.25)'  },
  { line:'#f472b6', fill:'rgba(244,114,182,.12)', border:'rgba(244,114,182,.25)' },
];
const CLRS = [
  'rgba(255,255,255,.90)',
  'rgba(255,255,255,.65)',
  'rgba(255,255,255,.42)',
  'rgba(255,255,255,.25)',
];

const PRIZE_TIERS = [
  { pct:160, label:'Ultra', cls:'ultra', prize:200 },
  { pct:140, label:'Mega',  cls:'mega',  prize:150 },
  { pct:120, label:'Super', cls:'super', prize:100 },
  { pct:100, label:'Meta',  cls:'hit',   prize:50  },
];
const PRIZE_TIERS_MONTHLY = [
  { pct:160, label:'Ultra', cls:'ultra', prize:800 },
  { pct:140, label:'Mega',  cls:'mega',  prize:600 },
  { pct:120, label:'Super', cls:'super', prize:400 },
  { pct:100, label:'Meta',  cls:'hit',   prize:200 },
];
function prizeForPct(pct, tiers) {
  tiers = tiers || PRIZE_TIERS;
  for (const t of tiers) { if (pct >= t.pct) return t; }
  return null;
}
function prizeForPctMonthly(pct) { return prizeForPct(pct, PRIZE_TIERS_MONTHLY); }

// ── 7. Date/format utilities ────────────────────────────
function availableMonths() {
  const set = new Set();
  (store.dateRange||[]).forEach(d => set.add(d.slice(0,7)));
  Object.values(store.kiosks||{}).forEach(k =>
    Object.keys(k.byDate||{}).forEach(d => set.add(d.slice(0,7)))
  );
  if (!set.size) { const now=new Date(); set.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`); }
  return [...set].sort();
}
function monthLabel(ym) {
  if (!ym) return '';
  const [y,m] = ym.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return (names[parseInt(m)-1]||m) + ' ' + y;
}
function weeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month-1, 1);
  const lastDay  = new Date(year, month, 0);
  let cur = new Date(firstDay);
  const dow = cur.getDay();
  const daysBack = dow===0 ? 6 : dow-1;
  cur.setDate(cur.getDate() - daysBack);
  while (cur <= lastDay) {
    const monday = new Date(cur);
    const sunday = new Date(cur); sunday.setDate(sunday.getDate()+6);
    const monKey = monday.toISOString().slice(0,10);
    const mLabel = `${monday.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} – ${sunday.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
    const crossMonth = monday.getMonth() !== lastDay.getMonth() || sunday.getMonth() !== firstDay.getMonth();
    weeks.push({ monKey, label: mLabel, monday, sunday, crossMonth, monthKey: ym() });
    cur.setDate(cur.getDate()+7);
  }
  return weeks;
  function ym() { return `${year}-${String(month).padStart(2,'0')}`; }
}
// fmtDL — format date key as DD/MM (P6: removed duplicate fmtDateBR)
function fmtDL(dateKey) {
  if (!dateKey) return '';
  const [,m,d] = dateKey.split('-');
  return d+'/'+m;
}
function todayKey() {
  return new Date().toISOString().slice(0,10);
}
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
function normDate(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return '';
  const [,d,mo,y] = m;
  const yr = y.length===2 ? '20'+y : y;
  return `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// ── 8. Data utilities ───────────────────────────────────
function kioskDayLiq(kName, dateKey) {
  return store.kiosks[kName]?.byDate?.[dateKey]?.liq || 0;
}
function dailyPrizeBadge(pct) {
  if (pct >= 160) return { label:'Ultra', cls:'ultra' };
  if (pct >= 140) return { label:'Mega',  cls:'mega'  };
  if (pct >= 120) return { label:'Super', cls:'super' };
  if (pct >= 100) return { label:'Meta',  cls:'hit'   };
  return null;
}
function kioskMonthLiq(kName, monthKey) {
  if (!monthKey) return store.kiosks[kName]?.liq || 0;
  const byDate = store.kiosks[kName]?.byDate || {};
  return Object.entries(byDate)
    .filter(([d]) => d.slice(0,7) === monthKey)
    .reduce((s,[,v]) => s+(v.liq||0), 0);
}
function kioskMonthPecas(kName, monthKey) {
  if (!monthKey) return store.kiosks[kName]?.pecas || 0;
  const byDate = store.kiosks[kName]?.byDate || {};
  return Object.entries(byDate)
    .filter(([d]) => d.slice(0,7) === monthKey)
    .reduce((s,[,v]) => s+(v.pecas||0), 0);
}
function sellerMonthLiq(kName, sName, monthKey) {
  if (!monthKey) return store.kiosks[kName]?.sellers?.[sName]?.liq || 0;
  const byDate = store.kiosks[kName]?.sellers?.[sName]?.byDate || {};
  return Object.entries(byDate)
    .filter(([d]) => d.slice(0,7) === monthKey)
    .reduce((s,[,v]) => s+(v.liq||0), 0);
}
function sellerMonthPecas(kName, sName, monthKey) {
  if (!monthKey) return store.kiosks[kName]?.sellers?.[sName]?.pecas || 0;
  const byDate = store.kiosks[kName]?.sellers?.[sName]?.byDate || {};
  return Object.entries(byDate)
    .filter(([d]) => d.slice(0,7) === monthKey)
    .reduce((s,[,v]) => s+(v.pecas||0), 0);
}
function sellerMonthDias(kName, sName, monthKey) {
  const byDate = store.kiosks[kName]?.sellers?.[sName]?.byDate || {};
  return Object.keys(byDate)
    .filter(d => (!monthKey || d.slice(0,7) === monthKey) && (byDate[d].liq||0) > 0).length;
}
function kioskLastSale(kName) {
  const dates = Object.keys((store.kiosks[kName]||{}).byDate||{}).sort();
  if (!dates.length) return null;
  const d = new Date(dates[dates.length-1] + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
}
function kWeekLiq(kName, monday, sunday) {
  const K = store.kiosks[kName]; if (!K) return 0;
  return Object.entries(K.byDate||{}).reduce((s,[d,v]) => {
    const dt = new Date(d+'T00:00:00');
    return (dt>=monday && dt<=sunday) ? s+(v.liq||0) : s;
  }, 0);
}
function activeSellers(kName) {
  const G = goals.kiosks?.[kName];
  if (G?.activeSellers?.length) return G.activeSellers;
  return Object.keys(store.kiosks?.[kName]?.sellers||{});
}
function sWeekPcs(kName, sName, monday, sunday) {
  const S = (store.kiosks[kName]||{}).sellers?.[sName];
  if (!S) return 0;
  let sum = 0;
  for (const [d,v] of Object.entries(S.byDate||{})) {
    const dt = new Date(d+'T00:00:00');
    if (dt >= monday && dt <= sunday) sum += v.pecas||0;
  }
  return sum;
}

// ── 9. Format helpers ───────────────────────────────────
function R(n) {
  if (n === null || n === undefined || isNaN(n)) return '\u2014';
  return 'R$ ' + Number(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function brNum(s) {
  if (!s) return 0;
  try { return parseFloat(String(s).replace(/\./g,'').replace(',','.')); } catch { return 0; }
}
function brInt(s) { return parseInt(String(s||'').replace(/\D/g,''))||0; }
function sK(n) {
  return (n||'').replace(/QUIOSQUE\s*/i,'').replace(/\s*SHOPPING\s*/i,'').replace(/\s*PLAZA\s*/i,'').replace(/\s{2,}/g,' ').trim();
}
function gColor(pct) {
  if (pct >= 100) return 'var(--success)';
  if (pct >= 70)  return '#f59e0b';
  return 'var(--danger)';
}
function floorPct(p) { return (Math.floor(p*10)/10).toFixed(1); }
function gBar(val, goal) {
  if (!goal) return '';
  const pct = Math.min((val/goal)*100, 100);
  return `<div class="goal-bar-wrap"><div class="goal-bar-fill" style="width:${pct}%;background:${gColor((val/goal)*100)}"></div></div><span class="goal-pct" style="color:${gColor((val/goal)*100)}">${floorPct((val/goal)*100)}%</span>`;
}

// ── 10. CSV parser ──────────────────────────────────────
function parseCSVProper(text) {
  const rows = []; let cur = []; let cell = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i+1] === '"') { cell += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { cur.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && text[i+1] === '\n') i++;
      cur.push(cell.trim()); cell = '';
      if (cur.some(x=>x)) rows.push(cur);
      cur = [];
    } else { cell += c; }
  }
  if (cell || cur.length) { cur.push(cell.trim()); if (cur.some(x=>x)) rows.push(cur); }
  return rows;
}

// ── 11. UI helpers ──────────────────────────────────────
function showStatus(msg,cls='dim'){const el=document.getElementById('statusBar');el.textContent=msg;el.className='show '+(cls||'');}
function hideStatus(){document.getElementById('statusBar').className='';}
let _hideTimer=null;
function toast(msg,cls='ok'){showStatus(msg,cls);clearTimeout(_hideTimer);_hideTimer=setTimeout(hideStatus,3000);}

function showEmptyState(){
  const empty='<div class="empty"><div class="ei">\u25CB</div><div class="et">Nenhum dado encontrado</div><div class="eh">Fa\u00E7a login como admin e importe o relat\u00F3rio CSV</div></div>';
  document.getElementById('geralBody').innerHTML=empty;
  document.getElementById('kiosquesBody').innerHTML=empty;
}

// ── 12. Shared period state ─────────────────────────────
let geralPeriod = null;
let geralWeek   = null;
let geralDay    = null;
let consolidadoWeek = null;

// ── 13. Shared toolbar builder (P5) ─────────────────────
function buildPeriodToolbar(opts) {
  const { months, selectedMonth, onMonthChange, weeks, selectedWeek, onWeekChange, extraHtml } = opts;
  let h = '<div class="geral-toolbar"><div class="geral-filters">';
  h += '<div class="geral-filter-item"><label class="geral-month-lbl">M\u00EAs</label>';
  h += '<select class="geral-month-sel" onchange="' + onMonthChange + '">';
  months.forEach(m => { h += '<option value="' + m + '"' + (m===selectedMonth?' selected':'') + '>' + monthLabel(m) + '</option>'; });
  h += '</select></div>';
  if (weeks && weeks.length) {
    h += '<div class="geral-filter-item"><label class="geral-month-lbl">Semana</label>';
    h += '<select class="geral-month-sel" onchange="' + onWeekChange + '">';
    h += '<option value=""' + (!selectedWeek?' selected':'') + '>M\u00EAs completo</option>';
    weeks.forEach((w, wi) => { h += '<option value="' + w.monKey + '"' + (selectedWeek===w.monKey?' selected':'') + '>S' + (wi+1) + ' \u00B7 ' + w.label + (w.crossMonth?' \u2197':'') + '</option>'; });
    h += '</select></div>';
  }
  if (extraHtml) h += extraHtml;
  h += '</div></div>';
  return h;
}

// ── 14. Navigation function ─────────────────────────────
function nav(id, btn) {
  if (!window.canAccessTab?.(id)) { document.getElementById('authScreen')?.classList.add('show'); window.showAuthTab?.('login'); return; }
  document.querySelectorAll('.pnl').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => { t.classList.remove('on'); t.setAttribute('aria-selected','false'); });
  document.getElementById('pnl-'+id)?.classList.add('on');
  if (btn) { btn.classList.add('on'); btn.setAttribute('aria-selected','true'); }
  if (id==='goals') renderGoals();
  if (id==='consolidado') renderConsolidado();
  if (id==='kiosques') renderKiosques();
  if (id==='premiacoes') renderPremiacoes();
  if (id==='estoque') renderEstoque();
  if (id==='aprovacao') renderAprovacao();
  if (id==='financeiro') renderFinanceiro();
  if (id==='produtos') window.renderProdutos?.();
}

// ── 15. Auth UI functions ───────────────────────────────
window.showAuthTab = function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab-pane').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('auth-pane-'+tab)?.classList.add('on');
  document.querySelector(`.auth-tab-btn[data-tab="${tab}"]`)?.classList.add('on');
}

function onCpfInput(el) {
  let v = el.value.replace(/\D/g,'').slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2')
       .replace(/(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
       .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,'$1.$2.$3-$4');
  el.value = v;
}

async function doLogin() {
  const cpf  = document.getElementById('loginCpf').value.trim();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginErr');
  const btn  = document.getElementById('btnLoginSubmit');

  if (!cpf || !pass) { err.textContent = 'Preencha CPF e senha.'; return; }
  const rawCpf = cpf.replace(/\D/g,'');
  if (rawCpf.length !== 11) { err.textContent = 'CPF inv\u00E1lido.'; return; }

  btn.disabled = true; btn.textContent = 'Entrando\u2026'; err.textContent = '';
  try {
    await window._doLogin(rawCpf, pass);
    // onAuthStateChanged will handle UI transition
  } catch(e) {
    console.error('login error:', e.code, e.message);
    const msgs = {
      'auth/invalid-credential':    'CPF ou senha incorretos.',
      'auth/user-not-found':        'CPF n\u00E3o cadastrado.',
      'auth/wrong-password':        'Senha incorreta.',
      'auth/too-many-requests':     'Muitas tentativas. Tente mais tarde.',
      'auth/invalid-email':         'Formato de CPF inv\u00E1lido.',
      'auth/network-request-failed':'Sem conex\u00E3o com a internet.',
    };
    err.textContent = msgs[e.code] || ('Erro (' + (e.code||'?') + '): ' + e.message);
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const cpf  = document.getElementById('regCpf').value.trim();
  const dob  = document.getElementById('regDob').value;
  const pass = document.getElementById('regPass').value;
  const pass2= document.getElementById('regPass2').value;
  const role = document.getElementById('regRole').value;
  const err  = document.getElementById('regErr');
  const btn  = document.getElementById('btnRegSubmit');

  err.textContent = '';
  if (!name || !cpf || !dob || !pass) { err.textContent = 'Preencha todos os campos.'; return; }
  if (!window.validateCPF(cpf))       { err.textContent = 'CPF inv\u00E1lido.'; return; }
  if (pass.length < 6)                { err.textContent = 'Senha: m\u00EDnimo 6 caracteres.'; return; }
  if (pass !== pass2)                 { err.textContent = 'Senhas n\u00E3o coincidem.'; return; }

  btn.disabled = true; btn.textContent = 'Cadastrando\u2026';
  try {
    await window._doRegister({ name, cpf: cpf.replace(/\D/g,''), dob, password: pass, role });
    // Show success message
    document.getElementById('auth-pane-register').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:2rem;margin-bottom:12px">\u2713</div>
        <div style="font-size:1rem;margin-bottom:8px">Cadastro enviado!</div>
        <div style="font-size:.82rem;color:var(--muted)">Aguarde a aprova\u00E7\u00E3o de um coordenador ou administrador.</div>
        <button class="btn-secondary" onclick="showAuthTab('login')" style="margin-top:16px;height:36px;padding:0 16px">Voltar ao login</button>
      </div>`;
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'CPF j\u00E1 cadastrado.',
      'auth/weak-password':        'Senha muito fraca.',
    };
    err.textContent = msgs[e.code] || 'Erro: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Cadastrar';
  }
}

async function doSignOut() {
  await window._doSignOut();
}

// ── 16. buildWeeksForMonth ──────────────────────────────
// (P6: buildAvailableWeeks removed — dead code)
function buildWeeksForMonth(ym) {
  const [yr, mo] = ym.split('-').map(Number);
  const weeks    = weeksInMonth(yr, mo);
  const dateSet  = new Set(store.dateRange||[]);
  return weeks.filter(w =>
    [...dateSet].some(d => {
      const dt = new Date(d+'T00:00:00');
      return dt >= w.monday && dt <= w.sunday;
    })
  );
}

// ── 17. setGeralPeriod, setGeralWeek, setGeralDay ───────
function setGeralPeriod(val) {
  geralPeriod = val;
  renderGeral();
}
function setGeralWeek(val) {
  geralWeek = val || null;
  renderGeral();
}
function setGeralDay(val) {
  geralDay = val || null;
  renderGeral();
}

// ── 18. getWeekCtx ──────────────────────────────────────
function getWeekCtx() {
  const week = geralWeek || consolidadoWeek;
  if (!week) return null;
  const allWeeks = buildWeeksForMonth(geralPeriod || '');
  return allWeeks.find(w => w.monKey === week) || null;
}

// ── 19. tryRender ───────────────────────────────────────
window.tryRender = function tryRender() {
  if (!window._userProfile) return;
  try {
    const tab = document.querySelector('.pnl.on')?.id?.replace('pnl-','') || 'geral';
    if (tab === 'geral') { renderGeral(); return; }
    if (tab === 'kiosques') { renderKiosques(); return; }
    if (tab === 'consolidado') { renderConsolidado(); return; }
    if (tab === 'premiacoes') { renderPremiacoes(); return; }
    if (tab === 'financeiro') { renderFinanceiro(); return; }
    if (tab === 'produtos') { window.renderProdutos?.(); return; }
    renderGeral();
  } catch(e) { console.error('tryRender error:', e); }
};

// ── 20. DOMContentLoaded handler ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (Object.keys(window._store?.kiosks || {}).length > 0) {
    renderGeral();
    renderKiosques();
  }
});
