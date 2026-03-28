// ══════════════════════════════════════════════════════════
//  APROVACAO — User approval tab rendering
//  Depends on globals from helpers.js: escapeHtml, toast
//  Depends on window: canAccessTab, fbLoadAllUsers, fbApproveUser,
//  fbRejectUser, fbUpdateUserRole, ROLES, formatCPF
// ══════════════════════════════════════════════════════════

async function renderAprovacao() {
  const el = document.getElementById('aprovacaoBody');
  if (!el) return;
  if (!window.canAccessTab('aprovacao')) {
    el.innerHTML = '<div class="empty"><div class="ei">○</div><div class="et">Sem permissão</div></div>';
    return;
  }
  el.innerHTML = '<div style="color:var(--muted);padding:12px">Carregando…</div>';
  try {
    const users = await window.fbLoadAllUsers();
    renderAprovacaoTable(users);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);padding:12px">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

function renderAprovacaoTable(users) {
  const el = document.getElementById('aprovacaoBody');
  if (!el) return;

  const pending  = users.filter(u => u.status === 'pending');
  const active   = users.filter(u => u.status === 'active');
  const rejected = users.filter(u => u.status === 'rejected');

  const statusBadge = s => ({
    pending:  '<span class="gbadge" style="background:rgba(245,158,11,.15);color:#f59e0b">Pendente</span>',
    active:   '<span class="gbadge hit">Ativo</span>',
    rejected: '<span class="gbadge miss">Recusado</span>',
  }[s] || escapeHtml(s));

  const roleOpts = Object.entries(window.ROLES||{}).map(([k,v]) =>
    `<option value="${escapeHtml(k)}">${escapeHtml(v.label)}</option>`).join('');

  const userRow = u => {
    const isPending = u.status === 'pending';
    const isActive  = u.status === 'active';
    const safeName = escapeHtml(u.name || '');
    const safeCpf  = escapeHtml(window.formatCPF(u.cpf||''));
    const dob = u.dob ? new Date(u.dob+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const created = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    return `<tr>
      <td style="padding:9px 12px">
        <div style="font-size:.85rem">${safeName}</div>
        <div style="font-size:.7rem;color:var(--muted);font-family:var(--mono)">${safeCpf} · nasc. ${escapeHtml(dob)}</div>
      </td>
      <td style="padding:9px 12px">${statusBadge(u.status)}</td>
      <td style="padding:9px 12px">
        <select class="geral-month-sel" style="height:30px;font-size:.75rem"
          onchange="window.fbUpdateUserRole('${u.uid}',this.value).then(()=>renderAprovacao())"
          ${isPending||u.status==='rejected'?'disabled':''}>
          ${Object.entries(window.ROLES||{}).map(([k,v])=>`<option value="${k}"${u.role===k?' selected':''}>${escapeHtml(v.label)}</option>`).join('')}
        </select>
      </td>
      <td style="padding:9px 12px;font-size:.72rem;color:var(--muted);font-family:var(--mono)">${escapeHtml(created)}</td>
      <td style="padding:9px 12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${isPending ? `
            <select id="role-sel-${u.uid}" class="geral-month-sel" style="height:28px;font-size:.72rem">
              ${roleOpts}
            </select>
            <button class="btn-primary" style="height:28px;padding:0 10px;font-size:.75rem"
              onclick="approveUser('${u.uid}')">Aprovar</button>
            <button class="btn-secondary" style="height:28px;padding:0 10px;font-size:.75rem;color:var(--danger)"
              onclick="rejectUser('${u.uid}')">Recusar</button>
          ` : ''}
          ${isActive ? `
            <button class="btn-secondary" style="height:28px;padding:0 10px;font-size:.75rem;color:var(--danger)"
              onclick="rejectUser('${u.uid}')">Revogar</button>
          ` : ''}
          ${u.status==='rejected' ? `
            <select id="role-sel-${u.uid}" class="geral-month-sel" style="height:28px;font-size:.72rem">
              ${roleOpts}
            </select>
            <button class="btn-primary" style="height:28px;padding:0 10px;font-size:.75rem"
              onclick="approveUser('${u.uid}')">Reativar</button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  };

  let h = '';

  if (pending.length) {
    h += `<div class="h2" style="color:#f59e0b">Aguardando aprovação (${pending.length})</div>
    <div class="tw tw-scroll" style="margin-bottom:20px"><table>
      <thead><tr>
        <th>Usuário</th><th>Status</th><th>Perfil</th><th>Cadastro</th><th>Ação</th>
      </tr></thead>
      <tbody>${pending.map(userRow).join('')}</tbody>
    </table></div>`;
  }

  h += `<div class="h2">Usuários ativos (${active.length})</div>
  <div class="tw tw-scroll" style="margin-bottom:20px"><table>
    <thead><tr><th>Usuário</th><th>Status</th><th>Perfil</th><th>Cadastro</th><th>Ação</th></tr></thead>
    <tbody>${active.length ? active.map(userRow).join('') : '<tr><td colspan="5" style="color:var(--muted);padding:12px">Nenhum usuário ativo</td></tr>'}</tbody>
  </table></div>`;

  if (rejected.length) {
    h += `<div class="h2" style="color:var(--muted)">Recusados (${rejected.length})</div>
    <div class="tw tw-scroll"><table>
      <thead><tr><th>Usuário</th><th>Status</th><th>Perfil</th><th>Cadastro</th><th>Ação</th></tr></thead>
      <tbody>${rejected.map(userRow).join('')}</tbody>
    </table></div>`;
  }

  el.innerHTML = h || '<div style="color:var(--muted);padding:12px">Nenhum usuário cadastrado.</div>';
}

async function approveUser(uid) {
  const sel  = document.getElementById('role-sel-'+uid);
  const role = sel?.value || 'vendedor';
  try {
    await window.fbApproveUser(uid, role);
    toast('Usuário aprovado ✓', 'ok');
    renderAprovacao();
  } catch(e) { toast('Erro: '+e.message, 'err'); }
}

async function rejectUser(uid) {
  try {
    await window.fbRejectUser(uid);
    toast('Acesso revogado', 'ok');
    renderAprovacao();
  } catch(e) { toast('Erro: '+e.message, 'err'); }
}
