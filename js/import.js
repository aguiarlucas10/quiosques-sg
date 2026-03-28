// ══════════════════════════════════════════════════════════
//  IMPORT MODULE — File reading, logging, CSV processing
// ══════════════════════════════════════════════════════════

let rawCSV = null;

function log(msg, cls) {
  const box = document.getElementById('logbox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'll ' + (cls||'dim');
  el.textContent = msg;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
function resetLog() {
  const box = document.getElementById('logbox');
  if (box) box.innerHTML = '';
}
function preview(text) {
  const lines = text.split('\n').slice(0,6);
  log('Prévia:', 'dim');
  lines.forEach(l => { if (l.trim()) log('  '+l.slice(0,120), 'dim'); });
}
function onFile(evt) {
  const f = evt.target.files[0]; if (!f) return;
  resetLog();
  log('📄 '+f.name+'  ('+(f.size/1024).toFixed(1)+' KB)', 'info');
  const r = new FileReader();
  r.onload = ev => {
    rawCSV = ev.target.result;
    const fmt = detectCSVFormat(rawCSV);
    const ok = fmt === 'analytic';
    log('✓ Lido — '+rawCSV.split('\n').length+' linhas · '+(ok?'✓ Analítico':'✗ Formato resumido — use o relatório Analítico (VENDEDOR.RPT)'), ok?'ok':'err');
    preview(rawCSV);
    document.getElementById('btnProc').disabled = !ok;
  };
  r.readAsText(f, 'latin-1');
}

function handleDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer?.files[0]; if (!f) return;
  document.getElementById('fi').files; // can't set programmatically
  const fakeEvt = { target: { files: [f] } };
  onFile(fakeEvt);
}

// ══════════════════════════════════════════════════════════
//  ANALYTIC CSV PARSER
// ══════════════════════════════════════════════════════════
function detectCSVFormat(text) {
  // Analytic: has 'Ítens :' or 'Itens :' marker
  return /[IÍ]tens\s*:/i.test(text) ? 'analytic' : 'summary';
}

async function processCSV() {
  if (!rawCSV) return;
  if (detectCSVFormat(rawCSV) !== 'analytic') {
    log('✗ Use o relatório Analítico (VENDEDOR.RPT). Resumido não é mais aceito.', 'err');
    return;
  }
  return processAnalyticCSV();
}

async function processAnalyticCSV() {
  if (!rawCSV) { log('Carregue um arquivo CSV primeiro.', 'err'); return; }
  document.getElementById('btnProc').disabled = true;
  log('⟳ Processando relatório analítico…', 'info');

  const rows = parseCSVProper(rawCSV);
  let period = null, gtLiq = 0, gtPecas = 0;

  // Inherit existing store data
  const kiosks   = JSON.parse(JSON.stringify(store.kiosks||{}));
  const sellers  = JSON.parse(JSON.stringify(store.sellers||{}));
  const existingTxns = new Set(store.txnKeys||[]);
  const allDates = new Set(store.dateRange||[]);
  const sellerTotals = {};

  // Analytics data (separate Firestore doc)
  const existingSkus  = JSON.parse(JSON.stringify(window._analytics?.skus||{}));
  const existingTxnDetails = JSON.parse(JSON.stringify(window._analytics?.transactions||{}));

  let newTxns = 0, dupTxns = 0;

  // Group rows by transaction
  const txnMap = {};
  for (const r of rows) {
    if (!r[3]?.includes('Loja')) continue;
    const kName = (r[4]||'').replace(/\s+/g,' ').trim();
    const sName = (r[6]||'').trim();
    if (!kName || !sName) continue;
    if (!period && r[1]) period = (r[1]||'').replace(/Período de /i,'').replace(/ Até /i,' – ').trim();

    const txnId   = r[24]?.trim() || '';
    const isItem  = r[43]?.trim() === 'Ítens :';
    if (!isItem) continue;

    const date    = normDate(r[25]||'');
    const time_   = (r[27]||'').trim();
    // col[28] = Valor = faturamento líquido real recebido (já descontado crédito de troca)
    // col[39] = Total de Peças Vendidas na transação
    const txnValor = brNum(r[28]);
    const txnPiecesTotal = parseInt(r[39]||'0') || 0;
    // Payment method breakdown: col29=Dinheiro col30=Cheque col31=Cartão col32=PIX col33=Vale col34=Depósito
    const txnPay = {
      din:  brNum(r[29]), che: brNum(r[30]),
      car:  brNum(r[31]), pix: brNum(r[32]),
      vale: brNum(r[33]), dep: brNum(r[34]),
    };
    const sku     = (r[44]||'').trim();
    const desc    = (r[45]||'').trim();
    const price   = brNum(r[47]);
    const listP   = brNum(r[49]);
    const op      = (r[52]||'').trim();
    const qtySold = parseInt(r[54]||'0') || 0;
    const qtyXch  = parseInt(r[55]||'0') || 0;

    if (!txnId || !sku) continue;

    if (!txnMap[txnId]) txnMap[txnId] = { kName, sName, date, time: time_, items:[], txnId,
                                           liq: txnValor, pcs: txnPiecesTotal, pay: txnPay };
    txnMap[txnId].items.push({ sku, desc, price, listPrice:listP, op, qty:qtySold, qtyX:qtyXch });
  }

  // Process each transaction
  for (const [txnId, txn] of Object.entries(txnMap)) {
    const isDup = existingTxns.has(txnId);
    if (isDup) { dupTxns++; continue; }
    existingTxns.add(txnId);
    newTxns++;

    const { kName, sName, date } = txn;
    const txnPay = txn.pay || {din:0,che:0,car:0,pix:0,vale:0,dep:0};
    if (date) allDates.add(date);

    // Use col[28] = Valor líquido real, col[39] = total peças (from txn header, not item sum)
    const txnLiq   = txn.liq;   // net amount actually received (post-exchange credit)
    const txnPcs   = txn.pcs;   // total pieces sold in this transaction
    let txnTroca = 0;
    for (const item of txn.items) {
      if (item.op === 'Troca') txnTroca += item.qtyX;
    }

    // Update kiosk/seller store aggregates (same as summary format)
    if (!kiosks[kName]) kiosks[kName] = {name:kName,liq:0,pecas:0,trocas:0,sellers:{},byDate:{}};
    const K = kiosks[kName];
    if (!K.sellers[sName]) K.sellers[sName] = {name:sName,trocas:0,byDate:{}};
    if (date) {
      if (!K.byDate[date]) K.byDate[date] = {liq:0,pecas:0};
      K.byDate[date].liq   += txnLiq;
      K.byDate[date].pecas += txnPcs;
      const S = K.sellers[sName];
      if (!S.byDate[date]) S.byDate[date] = {liq:0,pecas:0};
      S.byDate[date].liq   += txnLiq;
      S.byDate[date].pecas += txnPcs;
      S.trocas += txnTroca;
    }

    // Seller totals for liq/pecas/dias
    const stk = kName+'||'+sName;
    if (!sellerTotals[stk]) sellerTotals[stk] = {kName,sName,liq:0,pecas:0,trocas:0,dates:new Set()};
    sellerTotals[stk].liq    += txnLiq;
    sellerTotals[stk].pecas  += txnPcs;
    sellerTotals[stk].trocas += txnTroca;
    if (date) sellerTotals[stk].dates.add(date);

    // Aggregate payments for Financeiro module
    if (!window._payAgg) window._payAgg = {};
    if (date) {
      if (!window._payAgg[kName]) window._payAgg[kName] = {};
      if (!window._payAgg[kName][date]) window._payAgg[kName][date] = {din:0,che:0,car:0,pix:0,vale:0,dep:0,total:0,n:0};
      const pa = window._payAgg[kName][date];
      pa.din   += txnPay.din;  pa.che  += txnPay.che;  pa.car  += txnPay.car;
      pa.pix   += txnPay.pix;  pa.vale += txnPay.vale; pa.dep  += txnPay.dep;
      pa.total += txnLiq;      pa.n    += 1;
    }

    // Store transaction detail for analytics
    existingTxnDetails[txnId] = {
      kiosk: kName, seller: sName, date, time: txn.time,
      items: txn.items
    };

    // Update SKU analytics
    for (const item of txn.items) {
      if (!existingSkus[item.sku]) {
        existingSkus[item.sku] = {
          desc: item.desc, listPrice: item.listPrice, practPrice: item.price,
          totalSold:0, totalReturned:0, revenue:0,
          byKiosk:{}, byDate:{}
        };
      }
      const sk = existingSkus[item.sku];
      sk.desc = item.desc;
      sk.listPrice  = Math.max(sk.listPrice||0, item.listPrice);
      sk.practPrice = item.price;
      if (!sk.byKiosk[kName]) sk.byKiosk[kName] = {sold:0,returned:0,revenue:0};
      if (item.op === 'Venda') {
        sk.totalSold     += item.qty;
        sk.revenue       += item.price * item.qty;
        sk.byKiosk[kName].sold    += item.qty;
        sk.byKiosk[kName].revenue += item.price * item.qty;
        if (date) sk.byDate[date] = (sk.byDate[date]||0) + item.qty;
      } else if (item.op === 'Troca') {
        sk.totalReturned += item.qtyX;
        sk.byKiosk[kName].returned += item.qtyX;
      }
    }
  }

  // Finalize seller aggregates
  for (const st of Object.values(sellerTotals)) {
    const K = kiosks[st.kName]; if (!K) continue;
    if (!K.sellers[st.sName]) K.sellers[st.sName] = {name:st.sName,trocas:0,byDate:{}};
    const S = K.sellers[st.sName];
    S.liq   = (S.liq||0)  + st.liq;
    S.pecas = (S.pecas||0) + st.pecas;
    S.dias  = (st.dates.size);
    S.trocas= (S.trocas||0) + st.trocas;
  }
  for (const kn in kiosks) {
    const K = kiosks[kn]; K.liq = K.pecas = 0;
    for (const sn in K.sellers) {
      K.liq   += K.sellers[sn].liq||0;
      K.pecas += K.sellers[sn].pecas||0;
    }
    for (const sn in K.sellers) {
      const S = K.sellers[sn];
      if (!sellers[sn]||(S.liq||0)>(sellers[sn].liq||0)) sellers[sn]={...S,kiosk:kn};
    }
  }

  // Get GT totals from summary lines
  for (const r of rows) {
    const gl = brNum(r[67]||''); const gp = brInt(r[71]||'');
    if (gl > gtLiq) { gtLiq = gl; gtPecas = gp; }
  }

  const kCount = Object.keys(kiosks).length;
  if (!kCount) { log('✗ Nenhum quiosque encontrado.','err'); document.getElementById('btnProc').disabled=false; return; }

  log(`✓ ${kCount} quiosques · ${Object.keys(sellers).length} vendedores · ${Object.keys(existingSkus).length} SKUs`, 'ok');
  log(`✓ Transações novas: ${newTxns}  · Duplicatas: ${dupTxns}`, dupTxns>0?'warn':'ok');
  log('⟳ Salvando no Firebase…','info');

  try {
    const newStore = {
      period, importedAt: new Date().toLocaleString('pt-BR'),
      gtLiq, gtPecas, kiosks, sellers,
      txnKeys: Array.from(existingTxns),
      dateRange: Array.from(allDates).sort()
    };
    const newAnalytics = {
      skus: existingSkus,
      transactions: existingTxnDetails,
      payments: window._payAgg || {},
      importedAt: newStore.importedAt,
      period, dateRange: newStore.dateRange
    };
    await window.fbSaveStore(newStore);
    await window.fbSaveAnalytics(newAnalytics);
    log('✓ Dados analíticos importados e publicados!','ok');
    toast('Analítico importado ✓','ok');
    renderGeral(); renderKiosques();
    renderEstoque();
  } catch(e) { log('✗ Erro: '+e.message,'err'); }
  document.getElementById('btnProc').disabled = false;
}

// ── Drop zone event setup ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const drop = document.getElementById('drop');
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { drop.classList.remove('over'); handleDrop(e); });
  }
});
