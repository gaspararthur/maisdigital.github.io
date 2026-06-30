/* ============================================================
   PAINEL ADMINISTRATIVO — Mais Digital
   Front-end puro (GitHub Pages) + Supabase (auth + banco).
   A segurança real fica no Row Level Security do Supabase.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Opções (selects) ---------- */
  const SOURCES = ['Instagram', 'WhatsApp', 'Indicação', 'Site', 'Google', 'Tráfego pago', 'Outro'];
  const PLANS = ['Presença Digital', 'Atendimento Inteligente', 'Automação Comercial', 'Plano Customizado'];
  const STATUSES = ['Novo lead', 'Em conversa', 'Proposta enviada', 'Fechado', 'Em produção', 'Aguardando cliente', 'Entregue', 'Perdido/Cancelado'];
  const PAYMENTS = ['Pago', 'Pendente', 'Atrasado', 'Cancelado'];
  const RESPONSIBLES = ['Arthur Gaspar', 'Higor Novaes', 'Kauan de Jesus'];

  /* ---------- Checklist de progresso (chave: rótulo) ---------- */
  const CHECKLIST = [
    ['briefing_received', 'Briefing recebido'],
    ['materials_received', 'Materiais recebidos'],
    ['instagram_analyzed', 'Instagram analisado'],
    ['bio_adjusted', 'Bio ajustada'],
    ['highlights_organized', 'Destaques organizados'],
    ['whatsapp_configured', 'WhatsApp configurado'],
    ['catalog_quickreplies', 'Catálogo/respostas rápidas'],
    ['crm_created', 'CRM simples criado'],
    ['form_created', 'Formulário de orçamento/agendamento'],
    ['landing_created', 'Landing page criada'],
    ['automation_configured', 'Automação configurada'],
    ['first_review_sent', 'Primeira revisão enviada'],
    ['changes_done', 'Alterações feitas'],
    ['client_approved', 'Aprovado pelo cliente'],
    ['published_delivered', 'Publicado/entregue'],
    ['report_sent', 'Relatório mensal enviado']
  ];

  /* ---------- Estado ---------- */
  let clients = [];
  const filters = { search: '', plan: '', project_status: '', source: '', responsible: '' };

  /* ---------- Atalhos ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const db = window.db;

  /* ============================================================
     AUTENTICAÇÃO
     ============================================================ */
  const loginView = $('[data-login-view]');
  const appView = $('[data-app]');
  const loginForm = $('[data-login-form]');
  const loginError = $('[data-login-error]');

  function showLogin(msg) {
    appView.hidden = true;
    loginView.style.display = 'grid';
    if (msg) loginError.textContent = msg;
  }
  function showApp(session) {
    loginView.style.display = 'none';
    appView.hidden = false;
    $('[data-user-email]').textContent = session?.user?.email || '';
    loadClients();
  }

  async function initAuth() {
    if (!db) {
      showLogin('⚠️ Supabase não configurado. Edite assets/js/supabase.js com sua URL e anon key (veja o README).');
      loginForm.querySelector('[data-login-btn]').disabled = true;
      return;
    }
    const { data: { session } } = await db.auth.getSession();
    session ? showApp(session) : showLogin();

    db.auth.onAuthStateChange((_event, session) => {
      session ? showApp(session) : showLogin();
    });
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) return;
    loginError.textContent = '';
    const btn = loginForm.querySelector('[data-login-btn]');
    btn.disabled = true; btn.textContent = 'Entrando...';
    const { email, password } = Object.fromEntries(new FormData(loginForm));
    const { error } = await db.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) loginError.textContent = 'E-mail ou senha inválidos.';
  });

  $('[data-logout]')?.addEventListener('click', async () => {
    if (db) await db.auth.signOut();
  });

  /* ============================================================
     DADOS (Supabase CRUD)
     ============================================================ */
  async function loadClients() {
    if (!db) return;
    const { data, error } = await db.from('clients').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    clients = data || [];
    renderAll();
  }

  async function saveClient(payload, id) {
    if (id) {
      payload.updated_at = new Date().toISOString();
      return db.from('clients').update(payload).eq('id', id).select();
    }
    return db.from('clients').insert([payload]).select();
  }

  async function removeClient(id) {
    return db.from('clients').delete().eq('id', id);
  }

  /* ============================================================
     PROGRESSO
     ============================================================ */
  function progressPct(progress) {
    const done = CHECKLIST.filter(([k]) => progress && progress[k]).length;
    return Math.round((done / CHECKLIST.length) * 100);
  }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function renderDashboard() {
    const active = clients.filter(c => c.payment_status !== 'Cancelado' && c.project_status !== 'Perdido/Cancelado');
    const set = (k, v) => { const el = $(`[data-stat="${k}"]`); if (el) el.textContent = v; };

    set('total', clients.length);
    set('leads', clients.filter(c => c.project_status === 'Novo lead').length);
    set('producao', clients.filter(c => ['Fechado', 'Em produção', 'Aguardando cliente'].includes(c.project_status)).length);
    set('entregue', clients.filter(c => c.project_status === 'Entregue').length);
    set('pendentes', clients.filter(c => c.payment_status === 'Pendente').length);
    set('atrasados', clients.filter(c => c.payment_status === 'Atrasado').length);
    set('receita', brl(active.reduce((s, c) => s + (Number(c.monthly_value) || 0), 0)));

    // De onde vieram
    const counts = {};
    clients.forEach(c => { if (c.source) counts[c.source] = (counts[c.source] || 0) + 1; });
    const wrap = $('[data-source-breakdown]');
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    wrap.innerHTML = entries.length
      ? entries.map(([s, n]) => `<span><b>${n}</b> ${esc(s)}</span>`).join('')
      : '<span class="muted">Sem dados ainda</span>';
  }

  /* ============================================================
     TABELA DE CLIENTES
     ============================================================ */
  function statusClass(s) {
    return 'st-' + String(s || '').toLowerCase().replace(/[^a-z]+/g, '');
  }

  function applyFilters(list) {
    return list.filter(c => {
      if (filters.plan && c.plan !== filters.plan) return false;
      if (filters.project_status && c.project_status !== filters.project_status) return false;
      if (filters.source && c.source !== filters.source) return false;
      if (filters.responsible && c.responsible !== filters.responsible) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${c.client_name || ''} ${c.company_name || ''} ${c.whatsapp || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const body = $('[data-clients-body]');
    const rows = applyFilters(clients);
    $('[data-empty]').hidden = rows.length > 0;

    body.innerHTML = rows.map(c => {
      const pct = progressPct(c.progress);
      return `<tr data-row="${c.id}">
        <td data-label="Cliente"><strong>${esc(c.client_name)}</strong></td>
        <td data-label="Empresa">${esc(c.company_name) || '—'}</td>
        <td data-label="Origem">${esc(c.source) || '—'}</td>
        <td data-label="Plano">${esc(c.plan) || '—'}</td>
        <td data-label="Status"><span class="badge ${statusClass(c.project_status)}">${esc(c.project_status) || '—'}</span></td>
        <td data-label="Progresso">
          <div class="row-progress"><span style="width:${pct}%"></span></div><small>${pct}%</small>
        </td>
        <td data-label="Resp.">${esc(c.responsible) || '—'}</td>
        <td data-label="Vencimento">${c.due_date ? c.due_date.split('-').reverse().join('/') : '—'}</td>
        <td data-label="" class="row-actions">
          <button class="icon-btn" data-action="details" title="Detalhes/editar">✏️</button>
          <button class="icon-btn danger" data-action="delete" title="Excluir">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }

  function renderAll() { renderDashboard(); renderTable(); }

  /* ============================================================
     MODAL CLIENTE
     ============================================================ */
  const modal = $('[data-modal]');
  const clientForm = $('[data-client-form]');
  const modalError = $('[data-modal-error]');

  function fillSelect(sel, options, withEmpty) {
    sel.innerHTML = (withEmpty ? '<option value=""></option>' : '') +
      options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  }

  function buildSelects() {
    // Selects do formulário do modal
    fillSelect($('[data-options="sources"]'), SOURCES);
    fillSelect($('[data-options="plans"]'), PLANS);
    fillSelect($('[data-options="statuses"]'), STATUSES);
    fillSelect($('[data-options="responsibles"]'), RESPONSIBLES, true);
    fillSelect($('[data-options="payments"]'), PAYMENTS);
    // Filtros da toolbar (mantém a opção "Todos")
    const addOpts = (sel, opts) => { opts.forEach(o => sel.insertAdjacentHTML('beforeend', `<option value="${esc(o)}">${esc(o)}</option>`)); };
    addOpts($('[data-filter="plan"]'), PLANS);
    addOpts($('[data-filter="project_status"]'), STATUSES);
    addOpts($('[data-filter="source"]'), SOURCES);
    addOpts($('[data-filter="responsible"]'), RESPONSIBLES);
  }

  function buildChecklist(progress) {
    const wrap = $('[data-checklist]');
    wrap.innerHTML = CHECKLIST.map(([k, label]) => `
      <label class="check-item">
        <input type="checkbox" data-check="${k}" ${progress && progress[k] ? 'checked' : ''}>
        <span>${esc(label)}</span>
      </label>`).join('');
    updateProgressUI();
  }

  function currentProgress() {
    const p = {};
    $$('[data-check]', clientForm).forEach(cb => { p[cb.dataset.check] = cb.checked; });
    return p;
  }

  function updateProgressUI() {
    const pct = progressPct(currentProgress());
    $('[data-progress-fill]').style.width = pct + '%';
    $('[data-progress-label]').textContent = pct + '%';
  }

  function openModal(client) {
    modalError.textContent = '';
    clientForm.reset();
    $('[data-modal-title]').textContent = client ? `Editar — ${client.client_name}` : 'Novo cliente';
    clientForm.id.value = client?.id || '';

    if (client) {
      ['client_name', 'company_name', 'whatsapp', 'instagram', 'segment', 'city',
       'source', 'plan', 'project_status', 'responsible', 'payment_status',
       'monthly_value', 'start_date', 'due_date', 'notes'].forEach(name => {
        if (clientForm[name] != null && client[name] != null) clientForm[name].value = client[name];
      });
    }
    buildChecklist(client?.progress || {});
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }

  clientForm?.addEventListener('change', (e) => {
    if (e.target.matches('[data-check]')) updateProgressUI();
  });

  clientForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalError.textContent = '';
    const btn = $('[data-save-btn]');
    btn.disabled = true; btn.textContent = 'Salvando...';

    const fd = Object.fromEntries(new FormData(clientForm));
    const id = fd.id || null;
    const payload = {
      client_name: fd.client_name?.trim(),
      company_name: fd.company_name?.trim() || null,
      whatsapp: fd.whatsapp?.trim() || null,
      instagram: fd.instagram?.trim() || null,
      segment: fd.segment?.trim() || null,
      city: fd.city?.trim() || null,
      source: fd.source || null,
      plan: fd.plan || null,
      project_status: fd.project_status || null,
      responsible: fd.responsible || null,
      payment_status: fd.payment_status || null,
      monthly_value: fd.monthly_value ? Number(fd.monthly_value) : null,
      start_date: fd.start_date || null,
      due_date: fd.due_date || null,
      notes: fd.notes?.trim() || null,
      progress: currentProgress()
    };

    const { error } = await saveClient(payload, id);
    btn.disabled = false; btn.textContent = 'Salvar cliente';
    if (error) { modalError.textContent = 'Erro ao salvar: ' + error.message; return; }
    closeModal();
    loadClients();
  });

  /* ============================================================
     EXCLUSÃO COM CONFIRMAÇÃO
     ============================================================ */
  const confirmModal = $('[data-confirm]');
  let pendingDeleteId = null;

  function askDelete(client) {
    pendingDeleteId = client.id;
    $('[data-confirm-name]').textContent = client.client_name || 'este cliente';
    confirmModal.hidden = false;
  }
  $('[data-confirm-cancel]')?.addEventListener('click', () => { confirmModal.hidden = true; pendingDeleteId = null; });
  $('[data-confirm-ok]')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    await removeClient(pendingDeleteId);
    confirmModal.hidden = true; pendingDeleteId = null;
    loadClients();
  });

  /* ============================================================
     EVENTOS DA TABELA / TOOLBAR
     ============================================================ */
  $('[data-clients-body]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-row]')?.dataset.row;
    const client = clients.find(c => String(c.id) === String(id));
    if (!client) return;
    if (btn.dataset.action === 'delete') askDelete(client);
    else openModal(client);
  });

  $('[data-new-client]')?.addEventListener('click', () => openModal(null));
  $$('[data-modal-close]').forEach(b => b.addEventListener('click', closeModal));
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  $('[data-search]')?.addEventListener('input', (e) => { filters.search = e.target.value; renderTable(); });
  $$('[data-filter]').forEach(sel => sel.addEventListener('change', (e) => {
    filters[sel.dataset.filter] = e.target.value; renderTable();
  }));

  /* ============================================================
     EXPORTAÇÃO (backup JSON / CSV)
     ============================================================ */
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]).filter(k => k !== 'progress');
    cols.push('progresso_pct');
    const head = cols.join(',');
    const lines = rows.map(r => cols.map(col => {
      const val = col === 'progresso_pct' ? progressPct(r.progress) : r[col];
      return `"${String(val ?? '').replace(/"/g, '""')}"`;
    }).join(','));
    return [head, ...lines].join('\n');
  }
  $$('[data-export]').forEach(btn => btn.addEventListener('click', () => {
    const rows = applyFilters(clients);
    if (btn.dataset.export === 'json') {
      download('clientes-maisdigital.json', JSON.stringify(rows, null, 2), 'application/json');
    } else {
      download('clientes-maisdigital.csv', '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
    }
  }));

  /* ============================================================
     INÍCIO
     ============================================================ */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); confirmModal.hidden = true; }
  });
  buildSelects();
  initAuth();
})();
