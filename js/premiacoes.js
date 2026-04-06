// ══════════════════════════════════════════════════════════
//  RENDER PREMIAÇÕES — conforme documento "PREMIAÇÕES QUIOSQUES SG"
// ══════════════════════════════════════════════════════════

function renderPremiacoes() {
  const ks = Object.values(store.kiosks).sort((a,b) =>
    kioskMonthLiq(b.name, geralPeriod||'') - kioskMonthLiq(a.name, geralPeriod||''));
  if (!ks.length) {
    document.getElementById('premiacoesBody').innerHTML =
      '<div class="empty"><div class="ei">○</div><div class="et">Nenhum dado</div></div>';
    return;
  }

  const months   = availableMonths();
  const selMonth = geralPeriod || (store.dateRange||[]).map(d=>d.slice(0,7)).sort().slice(-1)[0] || months[0];
  const allWeeks = buildWeeksForMonth(selMonth);

  // ── Toolbar ──
  let h = `<div class="geral-toolbar" style="margin-bottom:20px">
    <div class="geral-filters">
      <div class="geral-filter-item">
        <label class="geral-month-lbl">Mês</label>
        <select class="geral-month-sel" onchange="geralPeriod=this.value;renderPremiacoes()">`;
  months.forEach(m => h += `<option value="${m}"${m===selMonth?' selected':''}>${monthLabel(m)}</option>`);
  h += `</select></div></div></div>`;

  // Collect sellers with their kiosk
  const allSellers = [];
  ks.forEach(k => {
    const kName = k.name;
    const cfg = goals.kiosks[kName]?.activeSellers?.length > 0;
    const gerente = goals.kiosks[kName]?.gerente || '';
    Object.values(k.sellers).forEach(s => {
      if (cfg && !activeSellers(kName).includes(s.name)) return;
      allSellers.push({ name: s.name, kiosk: kName, isGerente: s.name === gerente });
    });
  });

  // ═══════════════════════════════════════════════════════
  //  1. PREMIAÇÃO EQUIPE (mensal, meta geral quiosque, NÃO cumulativa)
  // ═══════════════════════════════════════════════════════
  h += `<div class="h2">Premiação Equipe · Mensal</div>
  <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Meta geral do quiosque · não cumulativa entre níveis</p>
  <div class="tw tw-scroll"><table><thead><tr>
    <th>Quiosque</th>
    <th class="num">Faturamento</th><th class="num">Meta</th>
    <th class="num">%</th><th>Nível</th>
    <th class="num">Prêmio/colab.</th><th class="num">Ativos</th><th class="num">Total Equipe</th>
  </tr></thead><tbody>`;

  ks.forEach(k => {
    const kName = k.name;
    const kLiq  = kioskMonthLiq(kName, selMonth);
    const kGoal = kioskMonthGoal(kName, selMonth);
    const kPct  = kGoal > 0 ? (kLiq / kGoal) * 100 : 0;
    const tier  = prizeForPct(kPct, PRIZE_EQUIPE);
    const nAct  = activeSellers(kName).length;
    const total = tier ? tier.prize * nAct : 0;

    h += `<tr>
      <td><strong>${sK(kName)}</strong></td>
      <td class="mo num">${R(kLiq)}</td>
      <td class="mo num">${kGoal ? R(kGoal) : '—'}</td>
      <td class="num" style="color:${kGoal ? gColor(kPct) : 'var(--muted)'}"><strong>${kGoal ? floorPct(kPct) + '%' : '—'}</strong></td>
      <td>${tier ? `<span class="gbadge ${tier.cls}">${tier.label}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mo num">${tier ? R(tier.prize) : '—'}</td>
      <td class="num">${nAct}</td>
      <td class="mo num"><strong>${tier ? R(total) : '—'}</strong></td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // ═══════════════════════════════════════════════════════
  //  2. PREMIAÇÃO INDIVIDUAL (mensal, meta individual vendedor)
  //     Faturamento + Ticket Médio + P.A. separados
  // ═══════════════════════════════════════════════════════
  h += `<div class="h2">Premiação Individual · Mensal</div>
  <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Meta individual do vendedor · cumulativa com equipe · Faturamento + Ticket Médio + P.A.</p>
  <div class="tw tw-scroll"><table><thead><tr>
    <th>Vendedor</th><th>Quiosque</th>
    <th class="num">Faturamento</th><th class="num">Meta</th><th class="num">% Fat.</th>
    <th class="num">TM Real</th><th class="num">TM Meta</th><th style="text-align:center">TM</th>
    <th class="num">PA Real</th><th class="num">PA Meta</th><th style="text-align:center">PA</th>
    <th>Nível</th>
    <th class="num">Prêm. Fat.</th><th class="num">Prêm. TM</th><th class="num">Prêm. PA</th>
    <th class="num">Total Indiv.</th>
  </tr></thead><tbody>`;

  allSellers.filter(s => !s.isGerente).sort((a,b) =>
    sellerMonthLiq(b.kiosk, b.name, selMonth) - sellerMonthLiq(a.kiosk, a.name, selMonth)
  ).forEach(s => {
    const kName = s.kiosk;
    const sLiq  = sellerMonthLiq(kName, s.name, selMonth);
    const sGoal = sellerMonthGoal(kName, selMonth);
    const sPct  = sGoal > 0 ? (sLiq / sGoal) * 100 : 0;

    const tmReal = sellerMonthTM(kName, s.name, selMonth);
    const tmGoal = kioskTmGoal(kName);
    const tmHit  = tmGoal > 0 && tmReal >= tmGoal;

    const paReal = sellerMonthPA(kName, s.name, selMonth);
    const paGoal = kioskPaGoal(kName);
    const paHit  = paGoal > 0 && paReal >= paGoal;

    const fatTier = prizeForPct(sPct, PRIZE_INDIVIDUAL_FAT);
    const tmPrize = (fatTier && tmHit) ? prizeForPct(sPct, PRIZE_INDIVIDUAL_TM)?.prize || 0 : 0;
    const paPrize = (fatTier && paHit) ? prizeForPct(sPct, PRIZE_INDIVIDUAL_PA)?.prize || 0 : 0;
    const fatPrize = fatTier ? fatTier.prize : 0;
    const totalIndiv = fatPrize + tmPrize + paPrize;

    h += `<tr>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
      <td class="mo num">${R(sLiq)}</td>
      <td class="mo num">${sGoal ? R(sGoal) : '—'}</td>
      <td class="num" style="color:${sGoal ? gColor(sPct) : 'var(--muted)'}"><strong>${sGoal ? floorPct(sPct) + '%' : '—'}</strong></td>
      <td class="mo num">${tmReal > 0 ? R(tmReal) : '—'}</td>
      <td class="mo num">${tmGoal > 0 ? R(tmGoal) : '—'}</td>
      <td style="text-align:center">${tmGoal > 0 ? (tmHit ? '<span class="gbadge hit">✓</span>' : '<span class="gbadge miss">✗</span>') : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mo num">${paReal > 0 ? paReal.toFixed(2) : '—'}</td>
      <td class="mo num">${paGoal > 0 ? paGoal.toFixed(2) : '—'}</td>
      <td style="text-align:center">${paGoal > 0 ? (paHit ? '<span class="gbadge hit">✓</span>' : '<span class="gbadge miss">✗</span>') : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${fatTier ? `<span class="gbadge ${fatTier.cls}">${fatTier.label}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mo num">${fatPrize ? R(fatPrize) : '—'}</td>
      <td class="mo num">${tmPrize ? R(tmPrize) : '—'}</td>
      <td class="mo num">${paPrize ? R(paPrize) : '—'}</td>
      <td class="mo num"><strong>${totalIndiv ? R(totalIndiv) : '—'}</strong></td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // ═══════════════════════════════════════════════════════
  //  3. PREMIAÇÃO GERENTE (mensal, meta geral quiosque)
  // ═══════════════════════════════════════════════════════
  h += `<div class="h2">Premiação Gerente · Mensal</div>
  <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Meta geral do quiosque · Faturamento + Ticket Médio + P.A.</p>
  <div class="tw tw-scroll"><table><thead><tr>
    <th>Gerente</th><th>Quiosque</th>
    <th class="num">Fat. Quiosque</th><th class="num">Meta</th><th class="num">%</th>
    <th class="num">TM Quiosque</th><th class="num">TM Meta</th><th style="text-align:center">TM</th>
    <th class="num">PA Quiosque</th><th class="num">PA Meta</th><th style="text-align:center">PA</th>
    <th>Nível</th>
    <th class="num">Prêm. Fat.</th><th class="num">Prêm. TM</th><th class="num">Prêm. PA</th>
    <th class="num">Total Gerente</th>
  </tr></thead><tbody>`;

  ks.forEach(k => {
    const kName  = k.name;
    const gerente = goals.kiosks[kName]?.gerente || '';
    if (!gerente) return;

    const kLiq   = kioskMonthLiq(kName, selMonth);
    const kGoal  = kioskMonthGoal(kName, selMonth);
    const kPct   = kGoal > 0 ? (kLiq / kGoal) * 100 : 0;

    const tmReal = kioskMonthTM(kName, selMonth);
    const tmGoal = kioskTmGoal(kName);
    const tmHit  = tmGoal > 0 && tmReal >= tmGoal;

    const paReal = kioskMonthPA(kName, selMonth);
    const paGoal = kioskPaGoal(kName);
    const paHit  = paGoal > 0 && paReal >= paGoal;

    const fatTier = prizeForPct(kPct, PRIZE_GERENTE_FAT);
    const tmPrize = (fatTier && tmHit) ? prizeForPct(kPct, PRIZE_GERENTE_TM)?.prize || 0 : 0;
    const paPrize = (fatTier && paHit) ? prizeForPct(kPct, PRIZE_GERENTE_PA)?.prize || 0 : 0;
    const fatPrize = fatTier ? fatTier.prize : 0;
    const totalGer = fatPrize + tmPrize + paPrize;

    h += `<tr>
      <td><strong>${escapeHtml(gerente)}</strong></td>
      <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
      <td class="mo num">${R(kLiq)}</td>
      <td class="mo num">${kGoal ? R(kGoal) : '—'}</td>
      <td class="num" style="color:${kGoal ? gColor(kPct) : 'var(--muted)'}"><strong>${kGoal ? floorPct(kPct) + '%' : '—'}</strong></td>
      <td class="mo num">${tmReal > 0 ? R(tmReal) : '—'}</td>
      <td class="mo num">${tmGoal > 0 ? R(tmGoal) : '—'}</td>
      <td style="text-align:center">${tmGoal > 0 ? (tmHit ? '<span class="gbadge hit">✓</span>' : '<span class="gbadge miss">✗</span>') : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mo num">${paReal > 0 ? paReal.toFixed(2) : '—'}</td>
      <td class="mo num">${paGoal > 0 ? paGoal.toFixed(2) : '—'}</td>
      <td style="text-align:center">${paGoal > 0 ? (paHit ? '<span class="gbadge hit">✓</span>' : '<span class="gbadge miss">✗</span>') : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${fatTier ? `<span class="gbadge ${fatTier.cls}">${fatTier.label}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="mo num">${fatPrize ? R(fatPrize) : '—'}</td>
      <td class="mo num">${tmPrize ? R(tmPrize) : '—'}</td>
      <td class="mo num">${paPrize ? R(paPrize) : '—'}</td>
      <td class="mo num"><strong>${totalGer ? R(totalGer) : '—'}</strong></td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  // ═══════════════════════════════════════════════════════
  //  4. PREMIAÇÃO SEMANAL FLASH — Vendedor
  // ═══════════════════════════════════════════════════════
  if (allWeeks.length) {
    h += `<div class="h2">Premiação Semanal Flash · Vendedor</div>
    <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Meta semanal individual do vendedor</p>`;

    allWeeks.forEach((w, wi) => {
      h += `<div style="font-size:.75rem;color:var(--muted);margin:16px 0 6px;font-family:var(--mono)">S${wi+1} · ${w.label}${w.crossMonth?' ↗':''}</div>
      <div class="tw tw-scroll"><table><thead><tr>
        <th>Vendedor</th><th>Quiosque</th>
        <th class="num">Real</th><th class="num">Meta</th>
        <th class="num">%</th><th>Nível</th><th class="num">Prêmio</th>
      </tr></thead><tbody>`;

      allSellers.filter(s => !s.isGerente).forEach(s => {
        const kName = s.kiosk;
        const sgw   = sellerWeekGoal(kName, w.monKey);
        const swL   = sWeekLiq(kName, s.name, w.monday, w.sunday);
        const spW   = sgw > 0 ? swL / sgw * 100 : 0;
        const prize = sgw > 0 ? prizeForPct(spW) : null;

        h += `<tr>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
          <td class="mo num">${R(swL)}</td>
          <td class="mo num">${sgw ? R(sgw) : '—'}</td>
          <td class="num" style="color:${sgw ? gColor(spW) : 'var(--muted)'}"><strong>${sgw ? floorPct(spW) + '%' : '—'}</strong></td>
          <td>${prize ? `<span class="gbadge ${prize.cls}">${prize.label}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
          <td class="mo num">${prize ? `<strong>${R(prize.prize)}</strong>` : '—'}</td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    });
  }

  // ═══════════════════════════════════════════════════════
  //  5. PREMIAÇÃO SEMANAL FLASH — Gerente
  //     Ganha o mesmo valor sobre cada vendedor que bateu meta
  // ═══════════════════════════════════════════════════════
  if (allWeeks.length) {
    h += `<div class="h2">Premiação Semanal Flash · Gerente</div>
    <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Gerente ganha o mesmo prêmio sobre a meta semanal de cada vendedor</p>`;

    allWeeks.forEach((w, wi) => {
      h += `<div style="font-size:.75rem;color:var(--muted);margin:16px 0 6px;font-family:var(--mono)">S${wi+1} · ${w.label}${w.crossMonth?' ↗':''}</div>
      <div class="tw tw-scroll"><table><thead><tr>
        <th>Gerente</th><th>Quiosque</th><th>Vendedores que bateram</th>
        <th class="num">Total Gerente</th>
      </tr></thead><tbody>`;

      ks.forEach(k => {
        const kName  = k.name;
        const gerente = goals.kiosks[kName]?.gerente || '';
        if (!gerente) return;

        const kSellers = allSellers.filter(s => s.kiosk === kName && !s.isGerente);
        let gerenteTotal = 0;
        const details = [];

        kSellers.forEach(s => {
          const sgw = sellerWeekGoal(kName, w.monKey);
          const swL = sWeekLiq(kName, s.name, w.monday, w.sunday);
          const spW = sgw > 0 ? swL / sgw * 100 : 0;
          const prize = sgw > 0 ? prizeForPct(spW) : null;
          if (prize) {
            gerenteTotal += prize.prize;
            details.push(`${s.name} (${prize.label} → ${R(prize.prize)})`);
          }
        });

        h += `<tr>
          <td><strong>${escapeHtml(gerente)}</strong></td>
          <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
          <td style="font-size:.78rem">${details.length ? details.join(', ') : '<span style="color:var(--muted)">nenhum</span>'}</td>
          <td class="mo num"><strong>${gerenteTotal ? R(gerenteTotal) : '—'}</strong></td>
        </tr>`;
      });
      h += `</tbody></table></div>`;
    });
  }

  // ═══════════════════════════════════════════════════════
  //  6. RESUMO TOTAL POR PESSOA
  // ═══════════════════════════════════════════════════════
  h += `<div class="h2">Resumo Total · ${monthLabel(selMonth)}</div>
  <p style="font-size:.75rem;color:var(--muted);margin:-4px 0 10px">Soma de todas as premiações (equipe + individual + semanal flash)</p>
  <div class="tw tw-scroll"><table><thead><tr>
    <th>Nome</th><th>Quiosque</th><th>Função</th>
    <th class="num">Equipe</th><th class="num">Fat. Indiv.</th>
    <th class="num">TM</th><th class="num">PA</th>
    <th class="num">Flash Sem.</th><th class="num">TOTAL</th>
  </tr></thead><tbody>`;

  let grandTotal = 0;

  ks.forEach(k => {
    const kName  = k.name;
    const kLiq   = kioskMonthLiq(kName, selMonth);
    const kGoal  = kioskMonthGoal(kName, selMonth);
    const kPct   = kGoal > 0 ? (kLiq / kGoal) * 100 : 0;
    const equipeTier = prizeForPct(kPct, PRIZE_EQUIPE);
    const equipeVal  = equipeTier ? equipeTier.prize : 0;
    const gerente    = goals.kiosks[kName]?.gerente || '';
    const tmGoal     = kioskTmGoal(kName);
    const paGoal     = kioskPaGoal(kName);

    // Gerente row
    if (gerente) {
      const gFatTier = prizeForPct(kPct, PRIZE_GERENTE_FAT);
      const gTmReal  = kioskMonthTM(kName, selMonth);
      const gPaReal  = kioskMonthPA(kName, selMonth);
      const gTmHit   = tmGoal > 0 && gTmReal >= tmGoal;
      const gPaHit   = paGoal > 0 && gPaReal >= paGoal;
      const gFat     = gFatTier ? gFatTier.prize : 0;
      const gTm      = (gFatTier && gTmHit) ? (prizeForPct(kPct, PRIZE_GERENTE_TM)?.prize || 0) : 0;
      const gPa      = (gFatTier && gPaHit) ? (prizeForPct(kPct, PRIZE_GERENTE_PA)?.prize || 0) : 0;

      // Semanal gerente: soma dos prêmios de cada vendedor que bateu meta em cada semana
      let gFlash = 0;
      allWeeks.forEach(w => {
        allSellers.filter(s2 => s2.kiosk === kName && !s2.isGerente).forEach(s2 => {
          const sgw = sellerWeekGoal(kName, w.monKey);
          const swL = sWeekLiq(kName, s2.name, w.monday, w.sunday);
          const spW = sgw > 0 ? swL / sgw * 100 : 0;
          const p = sgw > 0 ? prizeForPct(spW) : null;
          if (p) gFlash += p.prize;
        });
      });

      const gTotal = equipeVal + gFat + gTm + gPa + gFlash;
      grandTotal += gTotal;

      h += `<tr style="background:rgba(255,255,255,.03)">
        <td><strong>${escapeHtml(gerente)}</strong></td>
        <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
        <td style="font-size:.75rem;color:var(--muted)">Gerente</td>
        <td class="mo num">${equipeVal ? R(equipeVal) : '—'}</td>
        <td class="mo num">${gFat ? R(gFat) : '—'}</td>
        <td class="mo num">${gTm ? R(gTm) : '—'}</td>
        <td class="mo num">${gPa ? R(gPa) : '—'}</td>
        <td class="mo num">${gFlash ? R(gFlash) : '—'}</td>
        <td class="mo num"><strong>${R(gTotal)}</strong></td>
      </tr>`;
    }

    // Vendedor rows
    allSellers.filter(s => s.kiosk === kName && !s.isGerente).forEach(s => {
      const sLiq  = sellerMonthLiq(kName, s.name, selMonth);
      const sGoal = sellerMonthGoal(kName, selMonth);
      const sPct  = sGoal > 0 ? (sLiq / sGoal) * 100 : 0;

      const fatTier = prizeForPct(sPct, PRIZE_INDIVIDUAL_FAT);
      const fatVal  = fatTier ? fatTier.prize : 0;

      const tmReal = sellerMonthTM(kName, s.name, selMonth);
      const tmHit  = tmGoal > 0 && tmReal >= tmGoal;
      const tmVal  = (fatTier && tmHit) ? (prizeForPct(sPct, PRIZE_INDIVIDUAL_TM)?.prize || 0) : 0;

      const paReal = sellerMonthPA(kName, s.name, selMonth);
      const paHit  = paGoal > 0 && paReal >= paGoal;
      const paVal  = (fatTier && paHit) ? (prizeForPct(sPct, PRIZE_INDIVIDUAL_PA)?.prize || 0) : 0;

      // Semanal vendedor
      let sFlash = 0;
      allWeeks.forEach(w => {
        const sgw = sellerWeekGoal(kName, w.monKey);
        const swL = sWeekLiq(kName, s.name, w.monday, w.sunday);
        const spW = sgw > 0 ? swL / sgw * 100 : 0;
        const p = sgw > 0 ? prizeForPct(spW) : null;
        if (p) sFlash += p.prize;
      });

      const sTotal = equipeVal + fatVal + tmVal + paVal + sFlash;
      grandTotal += sTotal;

      h += `<tr>
        <td>${escapeHtml(s.name)}</td>
        <td style="color:var(--muted);font-size:.8rem">${sK(kName)}</td>
        <td style="font-size:.75rem;color:var(--muted)">Vendedor</td>
        <td class="mo num">${equipeVal ? R(equipeVal) : '—'}</td>
        <td class="mo num">${fatVal ? R(fatVal) : '—'}</td>
        <td class="mo num">${tmVal ? R(tmVal) : '—'}</td>
        <td class="mo num">${paVal ? R(paVal) : '—'}</td>
        <td class="mo num">${sFlash ? R(sFlash) : '—'}</td>
        <td class="mo num"><strong>${R(sTotal)}</strong></td>
      </tr>`;
    });
  });

  h += `<tr style="border-top:2px solid var(--border);background:var(--surface2)">
    <td colspan="8" style="text-align:right"><strong>Total Geral</strong></td>
    <td class="mo num"><strong>${R(grandTotal)}</strong></td>
  </tr>`;
  h += `</tbody></table></div>`;

  // ═══════════════════════════════════════════════════════
  //  7. REFERÊNCIA DE FAIXAS
  // ═══════════════════════════════════════════════════════
  h += `<div class="h2">Referência de Faixas</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">`;

  const renderTierRef = (title, sub, tiers, showTmPa) => {
    let t = `<div class="card"><div class="ct">${title}</div><div class="cs">${sub}</div>`;
    tiers.forEach(tier => {
      t += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem">
        <span class="gbadge ${tier.cls||'warn'}">${tier.label||'≥'+tier.pct+'%'}</span>
        <span style="color:var(--muted)">≥${tier.pct}%</span>
        <span class="mo">${R(tier.prize)}</span>
      </div>`;
    });
    if (showTmPa) {
      t += `<div style="font-size:.72rem;color:var(--muted);margin-top:8px">+ Ticket Médio e P.A. separados no mesmo nível</div>`;
    }
    t += `</div>`;
    return t;
  };

  h += renderTierRef('Equipe', 'por colaborador · não cumulativa', PRIZE_EQUIPE, false);
  h += renderTierRef('Individual — Faturamento', 'por vendedor · cumulativa c/ equipe', PRIZE_INDIVIDUAL_FAT, true);
  h += renderTierRef('Gerente — Faturamento', 'por gestor · meta do quiosque', PRIZE_GERENTE_FAT, true);
  h += renderTierRef('Semanal Flash', 'por vendedor · meta semanal', PRIZE_TIERS, false);
  h += `</div>`;

  document.getElementById('premiacoesBody').innerHTML = h;
}


// ── Daily goals CSV import ──────────────────────────
let _pendingDailyGoals = null;  // parsed before save

function loadDailyGoalCSV(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const result = parseDailyGoalCSV(text);
    if (!result.rows.length) {
      document.getElementById('dailyGoalPreview').style.display = 'none';
      alert('Nenhuma linha válida encontrada. Verifique o formato: DD/MM, Quiosque, Meta');
      return;
    }
    _pendingDailyGoals = result.rows;
    renderDailyGoalPreview(result);
    document.getElementById('btnSaveDailyGoals').disabled = false;
  };
  reader.readAsText(file, 'UTF-8');
}

function parseDailyGoalCSV(text) {
  const rows = [];
  const errors = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const start = lines[0]?.toLowerCase().includes('data') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map(s => s.trim().replace(/"/g,''));
    if (parts.length < 3) { errors.push(`Linha ${i+1}: colunas insuficientes`); continue; }
    const [rawDate, kName, rawMeta] = parts;
    const dm = rawDate.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
    if (!dm) { errors.push(`Linha ${i+1}: data inválida '${rawDate}'`); continue; }
    const day = dm[1].padStart(2,'0'), mon = dm[2].padStart(2,'0');
    const yr  = dm[3] ? (dm[3].length===2 ? '20'+dm[3] : dm[3]) : new Date().getFullYear().toString();
    const dateKey = `${yr}-${mon}-${day}`;
    const metaClean = rawMeta.replace(/\s/g,'').replace(/\.(\d{3})/g,'$1').replace(',','.');
    const meta = parseFloat(metaClean);
    if (isNaN(meta) || meta < 0) { errors.push(`Linha ${i+1}: meta inválida '${rawMeta}'`); continue; }
    const kKeys = Object.keys(store.kiosks);
    const kMatch = kKeys.find(k =>
      k.toLowerCase().includes(kName.toLowerCase()) ||
      kName.toLowerCase().includes(sK(k).toLowerCase()) ||
      sK(k).toLowerCase().includes(kName.toLowerCase())
    );
    rows.push({ dateKey, kName: kMatch || kName, meta, rawKName: kName });
  }
  return { rows, errors };
}

function renderDailyGoalPreview(result) {
  const el = document.getElementById('dailyGoalPreview');
  if (!el) return;
  const byKiosk = {};
  result.rows.forEach(({dateKey, kName, meta}) => {
    const mk = dateKey.slice(0,7);
    const key = kName+'|'+mk;
    if (!byKiosk[key]) byKiosk[key] = {kName, mk, total:0, days:0};
    byKiosk[key].total += meta;
    byKiosk[key].days++;
  });
  let html = `<div class="gdi-table-wrap"><table class="gdi-table"><thead><tr>
    <th>Quiosque</th><th>Mês</th><th class="num">Dias</th><th class="num">Total Mensal</th><th class="num">Média/dia</th>
  </tr></thead><tbody>`;
  Object.values(byKiosk).sort((a,b)=>a.kName.localeCompare(b.kName)).forEach(r => {
    html += `<tr><td>${sK(r.kName)}</td><td>${monthLabel(r.mk)}</td>
      <td class="num">${r.days}</td>
      <td class="num mo">${R(r.total)}</td>
      <td class="num mo">${R(r.total/r.days)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  if (result.errors.length) {
    html += `<div style="font-size:.72rem;color:var(--danger);margin-top:8px">${result.errors.slice(0,5).join('<br>')}</div>`;
  }
  html += `<div style="font-size:.72rem;color:var(--muted);margin-top:6px">${result.rows.length} dias importados${result.errors.length?' · '+result.errors.length+' erros':''}</div>`;
  el.innerHTML = html;
  el.style.display = 'block';
}

async function saveDailyGoals() {
  if (!_pendingDailyGoals?.length) return;
  const btn = document.getElementById('btnSaveDailyGoals');
  if (btn) btn.disabled = true;
  showStatus('Salvando metas diárias…', 'dim');

  _pendingDailyGoals.forEach(({dateKey, kName, rawKName, meta}) => {
    const resolvedName = Object.keys(store.kiosks).find(k =>
      k.toLowerCase().includes((rawKName||kName).toLowerCase()) ||
      (rawKName||kName).toLowerCase().includes(sK(k).toLowerCase()) ||
      sK(k).toLowerCase().includes((rawKName||kName).toLowerCase())
    ) || kName;
    ensureKiosk(resolvedName);
    if (!goals.kiosks[resolvedName].dailyByDate) goals.kiosks[resolvedName].dailyByDate = {};
    goals.kiosks[resolvedName].dailyByDate[dateKey] = meta;
  });

  for (const kn of Object.keys(goals.kiosks)) {
    const G = goals.kiosks[kn];
    if (!G.dailyByDate || !Object.keys(G.dailyByDate).length) continue;
    const monthly = {};
    Object.entries(G.dailyByDate).forEach(([d,v]) => {
      const mk = d.slice(0,7);
      monthly[mk] = (monthly[mk]||0) + v;
    });
    Object.entries(monthly).forEach(([mk,v]) => { G.monthlyByMonth[mk] = v; });
    const weekly = {};
    Object.entries(G.dailyByDate).forEach(([d,v]) => {
      const dt  = new Date(d+'T00:00:00');
      const dow = dt.getDay();
      const daysBack = dow===0 ? 6 : dow-1;
      const mon = new Date(dt); mon.setDate(mon.getDate()-daysBack);
      const monKey = mon.toISOString().slice(0,10);
      weekly[monKey] = (weekly[monKey]||0) + v;
    });
    Object.entries(weekly).forEach(([wk,v]) => { G.weeklyOverride[wk] = v; });
  }

  try {
    await saveAllGoals();
    toast('Metas diárias salvas ✓', 'ok');
    _pendingDailyGoals = null;
    renderGoals();
  } catch(e) {
    showStatus('Erro: '+e.message, 'err');
    if (btn) btn.disabled = false;
  }
}

function clearMonthGoals() {
  if (!confirm(`Limpar todas as metas de ${monthLabel(goalsSelMonth)}?`)) return;
  const mk = goalsSelMonth;
  const [yr, mo] = mk.split('-').map(Number);
  const wKeys = weeksInMonth(yr, mo).map(w => w.monKey);
  Object.values(goals.kiosks).forEach(G => {
    if (G.weeklyOverride)   wKeys.forEach(k => delete G.weeklyOverride[k]);
    if (G.monthlyByMonth)   delete G.monthlyByMonth[mk];
  });
  Object.values(goals.sellers).forEach(S => {
    if (S.overrideMonthly) delete S.overrideMonthly[mk];
    if (S.overrideWeekly)  wKeys.forEach(k => delete S.overrideWeekly[k]);
  });
  saveAllGoals().then(() => renderGoals());
}