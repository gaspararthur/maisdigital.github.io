/* ============================================================
   CONFIGURAÇÃO — altere só aqui.
   Coloque o número no formato internacional, só dígitos:
   55 + DDD + número. Ex.: 5599999999999
   ============================================================ */
const WHATSAPP_NUMBER = '55XXXXXXXXXXX';
const CONTACT_EMAIL = 'contato@maisdigital.com';

/* ------------------------------------------------------------
   PAGAMENTOS — links de assinatura recorrente.
   Crie um link de assinatura para cada plano (Mercado Pago →
   "Assinaturas", ou Stripe → "Payment Links" recorrente) e cole
   a URL aqui. Enquanto ficar vazio, o botão do plano abre o
   WhatsApp já pedindo aquele plano — nunca dá em lugar nenhum.
   ------------------------------------------------------------ */
const PLAN_CHECKOUT = {
  presenca: 'https://mpago.la/2wSSovJ',     // ex.: https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=...
  atendimento: 'https://mpago.la/2xYmKnu',
  automacao: 'https://mpago.la/1ecZjRS'
  // 'customizado' não tem valor fixo: sempre vai pelo WhatsApp.
};
// Valor mensal de cada plano (usado no checkout pré-pagamento).
const PLAN_VALUES = { presenca: 397, atendimento: 797, automacao: 1497 };

/* Aplica número e e-mail configurados em TODOS os links do site,
   para você nunca precisar editar o contato em vários lugares. */
document.querySelectorAll('a[href*="wa.me/"]').forEach(link => {
  link.href = link.href.replace(/wa\.me\/[^?]*/, `wa.me/${WHATSAPP_NUMBER}`);
});
document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
  link.href = `mailto:${CONTACT_EMAIL}`;
});

/* ------------------------------------------------------------
   CHECKOUT PRÉ-PAGAMENTO
   Quando o plano tem link de pagamento E o Supabase está pronto,
   abrimos um mini-formulário que guarda o que o cliente pediu
   (em `pending_checkouts`) ANTES de ir pro pagamento. Depois que
   o pagamento é aprovado, a Edge Function `mp-webhook` casa esses
   dados pelo e-mail e cria o cliente sozinho no painel.
   Sem Supabase configurado, o botão vai direto pro pagamento.
   ------------------------------------------------------------ */
const coModal = document.querySelector('[data-checkout-modal]');
const coForm = document.querySelector('[data-checkout-form]');
let coTarget = null;

function openCheckout(target) {
  coTarget = target;
  coForm?.reset();
  const planEl = coModal.querySelector('[data-co-plan]');
  const valEl = coModal.querySelector('[data-co-value]');
  if (planEl) planEl.textContent = target.name;
  if (valEl) valEl.textContent = target.value ? `R$ ${target.value}/mês` : '';
  const noteEl = coModal.querySelector('[data-co-note]');
  if (noteEl) noteEl.textContent = '';
  coModal.hidden = false;
  document.body.classList.add('menu-open');
}
function closeCheckout() { if (coModal) { coModal.hidden = true; document.body.classList.remove('menu-open'); } }

document.querySelectorAll('[data-plan-id]').forEach(btn => {
  const id = btn.dataset.planId;
  const name = btn.dataset.planName || 'um plano';
  const link = PLAN_CHECKOUT[id];

  if (link && link.trim()) {
    btn.href = link.trim();
    // Com Supabase + modal disponíveis, coletamos os dados antes de pagar.
    if (window.db && coModal) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCheckout({ id, name, link: link.trim(), value: PLAN_VALUES[id] });
      });
    }
  } else {
    const msg = encodeURIComponent(`Olá! Tenho interesse no plano *${name}* da Mais Digital. Pode me passar os detalhes?`);
    btn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
  }
  btn.target = '_blank';
  btn.rel = 'noopener';

  // Mede a intenção de contratar (se o analytics estiver ligado).
  btn.addEventListener('click', () => {
    if (typeof gtag === 'function') gtag('event', 'plano_clicado', { plano: name });
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', { content_name: name });
  });
});

coModal?.addEventListener('click', (e) => { if (e.target === coModal) closeCheckout(); });
coModal?.querySelectorAll('[data-co-close]').forEach(b => b.addEventListener('click', closeCheckout));

coForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!coTarget) return;
  const note = coForm.querySelector('[data-co-note]');
  const submitBtn = coForm.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  note.textContent = 'Salvando e redirecionando para o pagamento seguro...';

  const fd = Object.fromEntries(new FormData(coForm));
  try {
    if (window.db) {
      await window.db.from('pending_checkouts').insert([{
        email: (fd.email || '').trim().toLowerCase(),
        client_name: fd.client_name?.trim() || null,
        company_name: fd.company_name?.trim() || null,
        whatsapp: fd.whatsapp?.trim() || null,
        instagram: fd.instagram?.trim() || null,
        plan: coTarget.name,
        monthly_value: coTarget.value || null,
        notes: fd.notes?.trim() || null,
        source: 'Site'
      }]);
    }
  } catch (_) { /* mesmo que falhe o registro, não bloqueamos a venda */ }

  // Vai para o checkout do Mercado Pago (pagamento acontece lá).
  window.location.href = coTarget.link;
});

/* Página de obrigado (pós-pagamento): personaliza com o plano vindo
   da URL (?plano=...) e monta o WhatsApp de boas-vindas que já pede
   os dados do cliente, para a equipe começar sem ficar caçando info. */
const onboardBtn = document.querySelector('[data-onboarding]');
if (onboardBtn) {
  const plano = new URLSearchParams(location.search).get('plano') || 'um dos nossos planos';
  document.querySelectorAll('[data-plano-nome]').forEach(el => { el.textContent = plano; });

  const msg = encodeURIComponent(
    `Olá! Acabei de assinar o plano *${plano}* da Mais Digital. ✅\n\n` +
    `Seguem meus dados para começarmos:\n` +
    `*Nome:* \n*Nome do negócio:* \n*Instagram/site atual:* \n*Melhor horário para contato:* `
  );
  onboardBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
  onboardBtn.target = '_blank';
  onboardBtn.rel = 'noopener';

  // Marca a conversão no analytics (se estiver ligado).
  if (typeof gtag === 'function') gtag('event', 'purchase', { plano });
  if (typeof fbq === 'function') fbq('track', 'Purchase', { content_name: plano });
}

const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-menu-toggle]');

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 12);
});

toggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  document.body.classList.toggle('menu-open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
});

nav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    document.body.classList.remove('menu-open');
    toggle?.setAttribute('aria-expanded', 'false');
  });
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// Efeito sutil no botão principal, inspirado em landing pages premium.
document.querySelectorAll('.magnetic').forEach(button => {
  button.addEventListener('mousemove', event => {
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${x * 0.07}px, ${y * 0.12}px)`;
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = '';
  });
});

/* ============================================================
   FORMULÁRIO DE LEAD
   Estratégia de entrega garantida:
   1) Tenta enviar para a API (/api/leads) — funciona quando há backend.
   2) Sempre abre o WhatsApp com a mensagem pronta, então o lead
      chega à equipe mesmo em hospedagem estática (GitHub Pages).
   ============================================================ */
const form = document.querySelector('[data-lead-form]');
const note = document.querySelector('[data-form-note]');

function buildWhatsappMessage(data) {
  const linhas = [
    'Olá! Quero uma análise gratuita da minha empresa.',
    '',
    `*Nome:* ${data.name || '-'}`,
    `*WhatsApp:* ${data.phone || '-'}`,
    `*Negócio:* ${data.business || '-'}`,
    `*Interesse:* ${data.plan || '-'}`
  ];
  if (data.challenge) linhas.push(`*Desafio:* ${data.challenge}`);
  return encodeURIComponent(linhas.join('\n'));
}

form?.addEventListener('submit', async event => {
  event.preventDefault();

  // Consentimento LGPD (se o checkbox existir)
  const consent = form.querySelector('[name="consent"]');
  if (consent && !consent.checked) {
    note.textContent = 'Por favor, aceite a Política de Privacidade para continuar.';
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  note.textContent = 'Abrindo o WhatsApp com seus dados...';

  // Tenta registrar no backend (silencioso se não existir).
  try {
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (_) { /* sem backend: seguimos pelo WhatsApp */ }

  // Entrega garantida: abre conversa no WhatsApp já preenchida.
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsappMessage(data)}`;
  window.open(url, '_blank', 'noopener');
  note.textContent = 'Tudo certo! Conclua o envio na conversa do WhatsApp que abrimos para você.';
  form.reset();
});
