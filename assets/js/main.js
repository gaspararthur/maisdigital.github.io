const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-menu-toggle]');

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 12);
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

const form = document.querySelector('[data-lead-form]');
const note = document.querySelector('[data-form-note]');

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  note.textContent = 'Enviando solicitação...';

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Falha no envio');
    note.textContent = 'Solicitação recebida! A equipe entrará em contato.';
    form.reset();
  } catch (error) {
    note.textContent = 'Formulário pronto para backend. Enquanto isso, chame pelo WhatsApp.';
  }
});
