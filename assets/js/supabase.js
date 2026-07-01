/* ============================================================
   SUPABASE — configuração do banco de dados online.

   1. Crie um projeto em https://supabase.com
   2. Vá em  Project Settings → API
   3. Copie a "Project URL" e a chave "anon public" abaixo.

   ⚠️ NUNCA cole aqui a chave "service_role" nem a "secret"
      (começa com sb_secret_). Use APENAS a chave pública:
      "anon public" (começa com eyJ...) ou "publishable"
      (começa com sb_publishable_). A segurança vem do
      Row Level Security (RLS) — veja o README.md.

   • URL: só o domínio, SEM /rest/v1/ no final.
   ============================================================ */
const SUPABASE_URL = 'https://auawvsurvdkrevctvvvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YXd2c3VydmRrcmV2Y3R2dnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MzUwMzUsImV4cCI6MjA5ODQxMTAzNX0.uENQ3j3y-BdDjYUpODCLKGLXAcFHwRokA91zMuJmHJU'; // anon public

/* TRAVA DE SEGURANÇA: recusa qualquer chave secreta no front-end.
   Cobre: chave secreta nova (sb_secret_) e JWT com role service_role
   (que começa com eyJ e não tem o texto "service_role" à mostra). */
(function guardSecretKey(k) {
  let danger = k.startsWith('sb_secret_') || k.includes('service_role');
  if (!danger && k.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') danger = true;
    } catch (_) { /* token não-JWT: ignora */ }
  }
  if (danger) {
    throw new Error('🚨 Chave SECRETA detectada em supabase.js! Use a chave pública (anon/publishable) e revogue a secreta no painel do Supabase.');
  }
})(SUPABASE_ANON_KEY);

/* Cria o cliente do Supabase (a lib é carregada via CDN no admin.html).
   Se ainda não estiver configurado, deixamos `db = null` e o painel
   mostra um aviso amigável em vez de quebrar. */
const SUPABASE_READY =
  typeof window.supabase !== 'undefined' &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('SEU_PROJETO') &&
  !SUPABASE_ANON_KEY.includes('COLE_AQUI');

const db = SUPABASE_READY
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

window.db = db;
window.SUPABASE_READY = SUPABASE_READY;
// Expostos para o main.js chamar as Edge Functions (create-subscription).
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
