// ============================================================
//  Edge Function: mp-webhook
//  Recebe a notificação do Mercado Pago após um pagamento,
//  valida a assinatura, confirma o pagamento na API do MP e
//  cria/atualiza o cliente na tabela `clients` automaticamente.
//
//  Roda DENTRO do Supabase (Deno) — o site continua no GitHub
//  Pages. Os segredos (token do MP, service_role) ficam aqui,
//  nas variáveis de ambiente da função, NUNCA no front-end.
//
//  Deploy e secrets: veja a seção "Integração automática de
//  pagamento" no README.md.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Segredos (configurados via `supabase secrets set`) ---
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;        // token do Mercado Pago
const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET")!;    // segredo da assinatura do webhook
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;              // injetado pelo Supabase
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // injetado pelo Supabase

// Mapa de valor → plano (fallback quando não há checkout pendente)
const AMOUNT_TO_PLAN: Record<string, string> = {
  "397": "Presença Digital",
  "797": "Atendimento Inteligente",
  "1497": "Automação Comercial",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---- Validação da assinatura do Mercado Pago (x-signature) ----
async function isValidSignature(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;
  const sig = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";

  // x-signature = "ts=<timestamp>,v1=<hash>"
  const parts = Object.fromEntries(
    sig.split(",").map((p) => p.split("=").map((s) => s.trim())) as [string, string][],
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Template oficial: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Comparação em tempo constante
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // O id do recurso pode vir no body (data.id) ou na query (?data.id=)
    const dataId = String(body?.data?.id ?? url.searchParams.get("data.id") ?? "");
    const topic = String(body?.type ?? body?.topic ?? url.searchParams.get("type") ?? "");

    if (!dataId) return json(200, { ok: true, skipped: "sem data.id" });

    // 1) Segurança: valida a assinatura antes de tudo
    if (!(await isValidSignature(req, dataId))) {
      return json(401, { error: "assinatura inválida" });
    }

    // 2) Só tratamos eventos de pagamento
    const isPayment = topic.includes("payment");
    if (!isPayment) return json(200, { ok: true, skipped: `topic ${topic}` });

    // 3) Busca o pagamento na API do Mercado Pago (fonte da verdade)
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!mpRes.ok) return json(200, { ok: true, skipped: `mp ${mpRes.status}` });
    const pay = await mpRes.json();

    if (pay.status !== "approved") {
      return json(200, { ok: true, skipped: `status ${pay.status}` });
    }

    const email = (pay.payer?.email || "").toLowerCase();
    const amount = String(Math.round(Number(pay.transaction_amount) || 0));
    const paymentId = String(pay.id);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 4) Idempotência: se este pagamento já virou cliente, não duplica
    const { data: existing } = await sb
      .from("clients").select("id").eq("mp_payment_id", paymentId).maybeSingle();
    if (existing) return json(200, { ok: true, already: true });

    // 5) Tenta casar com o checkout que o cliente preencheu antes de pagar
    let intent: Record<string, unknown> | null = null;
    if (email) {
      const { data } = await sb
        .from("pending_checkouts")
        .select("*")
        .eq("email", email)
        .eq("status", "aguardando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      intent = data ?? null;
    }

    const plan = (intent?.plan as string) || AMOUNT_TO_PLAN[amount] || "Plano Customizado";

    // 6) Cria o cliente já "Fechado / Pago" com os dados que ele pediu
    const { error: insErr } = await sb.from("clients").insert([{
      client_name: (intent?.client_name as string) || pay.payer?.first_name || email || "Novo cliente",
      company_name: (intent?.company_name as string) || null,
      whatsapp: (intent?.whatsapp as string) || null,
      instagram: (intent?.instagram as string) || null,
      segment: (intent?.segment as string) || null,
      city: (intent?.city as string) || null,
      source: (intent?.source as string) || "Site",
      plan,
      project_status: "Fechado",
      payment_status: "Pago",
      monthly_value: Number(pay.transaction_amount) || (intent?.monthly_value as number) || null,
      start_date: new Date().toISOString().slice(0, 10),
      notes: (intent?.notes as string) || null,
      mp_payment_id: paymentId,
      progress: {},
    }]);
    if (insErr) return json(500, { error: insErr.message });

    // 7) Marca o checkout como consumido (não some, vira histórico)
    if (intent?.id) {
      await sb.from("pending_checkouts")
        .update({ status: "pago", consumed_at: new Date().toISOString() })
        .eq("id", intent.id);
    }

    return json(200, { ok: true, created: true });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
