/**
 * Adex Holdings Trust - Cloudflare Worker
 * Features:
 *  - /log : security visit logging + optional email notification
 *  - /availability (GET) : returns { [rentalId]: "available" | "rented" }
 *  - /availability/update (POST) : updates availability (Bearer token protected)
 *
 * Storage:
 *  - Uses KV namespace: ADEX_KV (bind in wrangler.toml)
 *
 * Email:
 *  - Uses MailChannels (built-in) to send email (no extra provider required).
 *
 * IMPORTANT:
 *  - Set secrets: ADMIN_TOKEN, EMAIL_TO, EMAIL_FROM
 *  - Configure CORS to allow your GitHub Pages/custom domain.
 */

const json = (obj, status=200, extraHeaders={}) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
});

function getAllowedOrigin(request, env){
  const origin = request.headers.get("Origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
  if(allow.length === 0) return "*";
  return allow.includes(origin) ? origin : allow[0]; // default to first
}

async function readAvailability(env){
  const raw = await env.ADEX_KV.get("availability_v1");
  if(!raw) return {};
  try{ return JSON.parse(raw); }catch(e){ return {}; }
}

async function writeAvailability(env, data){
  await env.ADEX_KV.put("availability_v1", JSON.stringify(data||{}));
}

function getClientIp(request){
  // Cloudflare provides true client IP here
  return request.headers.get("CF-Connecting-IP") || "";
}

function requireBearer(request, env){
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if(!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN){
    return { ok:false, res: json({ error:"Unauthorized" }, 401) };
  }
  return { ok:true };
}

async function sendEmail(env, subject, text){
  if(!env.EMAIL_TO || !env.EMAIL_FROM) return { ok:false, skipped:true };

  const msg = {
    personalizations: [{ to: [{ email: env.EMAIL_TO }] }],
    from: { email: env.EMAIL_FROM, name: "Adex Holdings Trust - Portal" },
    subject,
    content: [{ type: "text/plain", value: text }]
  };

  const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(msg)
  });

  if(!resp.ok){
    const body = await resp.text().catch(()=> "");
    return { ok:false, status:resp.status, body };
  }
  return { ok:true };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request, env);
    const cors = corsHeaders(origin);

    if(request.method === "OPTIONS"){
      return new Response("", { status: 204, headers: cors });
    }

    if(url.pathname === "/availability" && request.method === "GET"){
      const availability = await readAvailability(env);
      return json(availability, 200, cors);
    }

    if(url.pathname === "/availability/update" && request.method === "POST"){
      const auth = requireBearer(request, env);
      if(!auth.ok) return new Response(auth.res.body, { status: auth.res.status, headers: { ...cors, "content-type":"application/json" } });

      const body = await request.json().catch(()=> ({}));
      const updates = body.updates || {};
      const current = await readAvailability(env);
      const merged = { ...current, ...updates };
      await writeAvailability(env, merged);
      return json({ ok:true, mode:"worker", updated:Object.keys(updates).length }, 200, cors);
    }

    if(url.pathname === "/log" && request.method === "POST"){
      const body = await request.json().catch(()=> ({}));
      const ip = getClientIp(request);
      const ua = request.headers.get("User-Agent") || "";
      const now = new Date().toISOString();

      const entry = {
        ts: now,
        ip,
        ua,
        path: body.path || "",
        page: body.page || "",
        referrer: body.referrer || ""
      };

      // Store rolling log (last N entries)
      const maxEntries = Number(env.LOG_MAX_ENTRIES || 200);
      const raw = await env.ADEX_KV.get("visitlog_v1");
      let log = [];
      try{ log = raw ? JSON.parse(raw) : []; }catch(e){ log = []; }
      log.unshift(entry);
      log = log.slice(0, maxEntries);
      await env.ADEX_KV.put("visitlog_v1", JSON.stringify(log));

      // Optional email notification:
      // - Controlled by env var EMAIL_ON_LOG ("true"/"false")
      if((env.EMAIL_ON_LOG || "false").toLowerCase() === "true"){
        const subject = `Adex Trust visit: ${entry.path || "/"} (${ip || "no-ip"})`;
        const text = [
          "New portal visit logged:",
          `Time: ${entry.ts}`,
          `IP: ${entry.ip}`,
          `User-Agent: ${entry.ua}`,
          `Path: ${entry.path}`,
          `Page: ${entry.page}`,
          `Referrer: ${entry.referrer || "(none)"}`
        ].join("\n");
        ctx.waitUntil(sendEmail(env, subject, text));
      }

      return json({ ok:true }, 200, cors);
    }

    // Helpful endpoint to view logs (admin-protected)
    if(url.pathname === "/visitlog" && request.method === "GET"){
      const auth = requireBearer(request, env);
      if(!auth.ok) return new Response(auth.res.body, { status: auth.res.status, headers: { ...cors, "content-type":"application/json" } });

      const raw = await env.ADEX_KV.get("visitlog_v1");
      const log = raw ? JSON.parse(raw) : [];
      return json({ ok:true, log }, 200, cors);
    }

    return json({ error:"Not found" }, 404, cors);
  }
};
