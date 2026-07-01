// ============================================================
//  Edge Function: create-subscription
//  Cria uma ASSINATURA RECORRENTE (preapproval) no Mercado Pago
//  já vinculada ao checkout do cliente (external_reference), e
//  devolve o link de pagamento (init_point).
//
//  Chamada pelo front-end (index.html) quando o cliente conclui
//  o mini-formulário. Faz o insert em pending_checkouts com a
//  service_role (por isso o insert anônimo pode ser desativado).
//
//  Deploy: `supabase functions deploy create-subscription --no-verify-jwt`
//  Secrets: MP_ACCESS_TOKEN, SITE_URL (URL pública do site).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SITE_URL = (Deno.env.get("SITE_URL") || "https://maisdigital.github.io").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Planos válidos (o valor NÃO vem do cliente — evita adulteração de preço)
const PLANS: Record<string, { name: string; amount: number }> = {
  presenca: { name: "Presença Digital", amount: 397 },
  atendimento: { name: "Atendimento Inteligente", amount: 797 },
  automacao: { name: "Automação Comercial", amount: 1497 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const clip = (v: unknown, max: number) => (v == null ? null : String(v).trim().slice(0, max) || null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const b = await req.json().catch(() => ({}));

    const planId = String(b.planId || "");
    const plan = PLANS[planId];
    if (!plan) return json(400, { error: "plano inválido" });

    const email = String(b.email || "").trim().toLowerCase();
    if (!isEmail(email)) return json(400, { error: "e-mail inválido" });
    if (b.consent !== true) return json(400, { error: "consentimento obrigatório" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 1) Guarda o que o cliente pediu (server-side, dados já validados/limitados)
    const { data: pending, error: pErr } = await sb.from("pending_checkouts").insert([{
      email,
      client_name: clip(b.client_name, 120),
      company_name: clip(b.company_name, 120),
      whatsapp: clip(b.whatsapp, 30),
      instagram: clip(b.instagram, 100),
      notes: clip(b.notes, 500),
      plan: plan.name,
      monthly_value: plan.amount,
      source: "Site",
      status: "aguardando",
    }]).select("id").single();
    if (pErr) return json(500, { error: "checkout_save_failed" });

    // 2) Cria a assinatura recorrente no Mercado Pago
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Mais Digital — ${plan.name}`,
        external_reference: pending.id,       // casamento confiável no webhook
        payer_email: email,
        back_url: `${SITE_URL}/obrigado.html?plano=${encodeURIComponent(plan.name)}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: plan.amount,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });

    const mp = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mp.init_point) {
      return json(502, { error: "mp_error", detail: mp?.message || mpRes.status });
    }

    // 3) Devolve o link pro front-end redirecionar
    return json(200, { init_point: mp.init_point });
  } catch (_e) {
    return json(500, { error: "internal" });
  }
});
