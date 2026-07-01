// ============================================================
//  Edge Function: mp-webhook
//  Recebe a notificação do Mercado Pago (pagamento avulso OU
//  cobrança de assinatura recorrente), valida a assinatura,
//  confirma na API do MP e cria/atualiza o cliente no painel.
//
//  Roda DENTRO do Supabase (Deno). Segredos ficam aqui, nunca
//  no front-end. Deploy: `supabase functions deploy mp-webhook
//  --no-verify-jwt`. Veja o README (Integração de pagamento).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Valor mensal → plano (fallback quando não há checkout casado)
const AMOUNT_TO_PLAN: Record<string, string> = {
  "397": "Presença Digital",
  "797": "Atendimento Inteligente",
  "1497": "Automação Comercial",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

// ---- Validação da assinatura do Mercado Pago (x-signature) ----
async function isValidSignature(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;
  const sig = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";

  // x-signature = "ts=<timestamp>,v1=<hash>" — parsing tolerante a espaços
  let ts = "", v1 = "";
  for (const part of sig.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (k === "ts") ts = val;
    else if (k === "v1") v1 = val;
  }
  if (!ts || !v1) return false;

  // Frescor: rejeita notificações fora de uma janela de 5 min (anti-replay)
  const tsNum = Number(ts);
  const tsSec = tsNum > 1e12 ? tsNum / 1000 : tsNum; // aceita ms ou s
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > 300) return false;

  // Template oficial: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Comparação em tempo constante
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function mpGet(path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  const data = r.ok ? await r.json() : null;
  return { ok: r.ok, status: r.status, data };
}

// Erros transitórios do MP (429/5xx) → pedimos reentrega (não perder venda)
const isTransient = (s: number) => s === 429 || s >= 500;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dataId = String(body?.data?.id ?? url.searchParams.get("data.id") ?? "");
    const topic = String(body?.type ?? body?.topic ?? url.searchParams.get("type") ?? "");

    if (!dataId) return json(200, { ok: true, skipped: "sem data.id" });
    if (!(await isValidSignature(req, dataId))) return json(401, { error: "unauthorized" });

    // Dados que vamos extrair conforme o tipo de evento
    let approved = false;
    let email = "";
    let amount = "";
    let externalRef = "";     // id do pending_checkout (casamento confiável)
    let uniqueRef = "";       // chave de idempotência p/ criar o cliente 1x

    if (topic.includes("authorized_payment")) {
      // COBRANÇA DE ASSINATURA (recorrente): /authorized_payments/{id}
      const ap = await mpGet(`/authorized_payments/${dataId}`);
      if (!ap.ok) return json(isTransient(ap.status) ? 502 : 200, { skipped: `authpay ${ap.status}` });
      const st = ap.data?.status ?? ap.data?.payment?.status;
      if (st !== "approved" && st !== "processed" && st !== "recycling" && st !== "scheduled") {
        // só seguimos em cobrança efetivada
        if (st !== "approved") return json(200, { ok: true, skipped: `authpay status ${st}` });
      }
      amount = String(Math.round(Number(ap.data?.transaction_amount) || 0));
      const preapprovalId = String(ap.data?.preapproval_id ?? "");
      uniqueRef = preapprovalId || `authpay:${dataId}`; // 1 cliente por assinatura
      approved = st === "approved";
      // A assinatura carrega o external_reference e o e-mail do pagador
      if (preapprovalId) {
        const pre = await mpGet(`/preapproval/${preapprovalId}`);
        if (pre.ok) {
          externalRef = String(pre.data?.external_reference ?? "");
          email = String(pre.data?.payer_email ?? "").toLowerCase();
          if (!amount || amount === "0") amount = String(Math.round(Number(pre.data?.auto_recurring?.transaction_amount) || 0));
        }
      }
    } else if (topic.includes("payment")) {
      // PAGAMENTO (avulso, ou primeira cobrança que o MP também notifica)
      const p = await mpGet(`/v1/payments/${dataId}`);
      if (!p.ok) return json(isTransient(p.status) ? 502 : 200, { skipped: `payment ${p.status}` });
      if (p.data?.status !== "approved") return json(200, { ok: true, skipped: `status ${p.data?.status}` });
      approved = true;
      email = String(p.data?.payer?.email ?? "").toLowerCase();
      amount = String(Math.round(Number(p.data?.transaction_amount) || 0));
      // Se este pagamento pertence a uma assinatura, deduplicamos pela assinatura
      const linkedPreapproval = String(p.data?.metadata?.preapproval_id ?? p.data?.point_of_interaction?.transaction_data?.subscription_id ?? "");
      externalRef = String(p.data?.external_reference ?? "");
      uniqueRef = linkedPreapproval || (externalRef ? `ref:${externalRef}` : `pay:${dataId}`);
    } else {
      // subscription_preapproval (criação/edição): não cria cliente sozinho
      return json(200, { ok: true, skipped: `topic ${topic}` });
    }

    if (!approved) return json(200, { ok: true, skipped: "nao aprovado" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Casa o checkout que o cliente preencheu. Prioriza o external_reference
    // (id do pending_checkout — confiável). Só cai pro e-mail+valor se faltar.
    let intent: Record<string, any> | null = null;
    if (externalRef) {
      const { data } = await sb.from("pending_checkouts").select("*").eq("id", externalRef).maybeSingle();
      intent = data ?? null;
    }
    if (!intent && email) {
      const { data } = await sb.from("pending_checkouts").select("*")
        .eq("email", email).eq("status", "aguardando")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      // só usa se o valor bater (evita pegar checkout de outro plano)
      if (data && Math.round(Number(data.monthly_value) || 0) === Number(amount)) intent = data;
    }

    // O plano vem do valor pago (fonte da verdade); intent só se bater.
    const intentMatchesValue = intent && Math.round(Number(intent.monthly_value) || 0) === Number(amount);
    const plan = (intentMatchesValue ? intent!.plan : null) || AMOUNT_TO_PLAN[amount] || "Plano Customizado";

    // Cria o cliente de forma idempotente (upsert): a corrida/retry do MP e as
    // renovações mensais (mesmo uniqueRef) NÃO geram cliente duplicado.
    const { data: inserted, error: insErr } = await sb.from("clients").upsert([{
      client_name: intent?.client_name || "Novo cliente",
      company_name: intent?.company_name || null,
      whatsapp: intent?.whatsapp || null,
      instagram: intent?.instagram || null,
      segment: intent?.segment || null,
      city: intent?.city || null,
      source: intent?.source || "Site",
      plan,
      project_status: "Fechado",
      payment_status: "Pago",
      monthly_value: Number(amount) || intent?.monthly_value || null,
      start_date: new Date().toISOString().slice(0, 10),
      notes: intent?.notes || null,
      mp_ref: uniqueRef,
      progress: {},
    }], { onConflict: "mp_ref", ignoreDuplicates: true }).select("id");

    if (insErr) return json(500, { error: "insert_failed" });

    const created = Array.isArray(inserted) && inserted.length > 0;

    if (created && intent?.id) {
      await sb.from("pending_checkouts").update({ status: "pago", consumed_at: new Date().toISOString() }).eq("id", intent.id);
    } else if (!created) {
      // Renovação de assinatura já existente: reforça que está pago em dia.
      await sb.from("clients").update({ payment_status: "Pago", updated_at: new Date().toISOString() }).eq("mp_ref", uniqueRef);
    }

    log({ evt: "processed", topic, created, plan });
    return json(200, { ok: true, created });
  } catch (_e) {
    return json(500, { error: "internal" });
  }
});
