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

/* TRAVA DE SEGURANÇA: recusa chave secreta no front-end.
   Se isso disparar, você colou a chave errada — use a pública. */
if (SUPABASE_ANON_KEY.startsWith('sb_secret_') || SUPABASE_ANON_KEY.includes('service_role')) {
  throw new Error('🚨 Chave SECRETA detectada em supabase.js! Remova-a e use a chave pública (anon/publishable). Revogue a chave vazada no painel do Supabase.');
}

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
