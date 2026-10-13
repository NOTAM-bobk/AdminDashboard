/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker API for the Leads dashboard.
// - D1 (SQLite) storage, free tier friendly
// - Single shared-password auth issuing a short-lived HS256 (JWT-style) token
// - Browser CORS restricted to ALLOWED_ORIGINS (comma-separated)

export interface Env {
  DB: D1Database;
  /** Shared login password (set with `wrangler secret put APP_PASSWORD`). */
  APP_PASSWORD: string;
  /** Secret used to sign session tokens (set with `wrangler secret put SESSION_SECRET`). */
  SESSION_SECRET: string;
}

export interface Variables extends Record<string, unknown> {
  ALLOWED_ORIGINS?: string;
}

type EnvWithVars = Env & Variables;

interface LeadRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64urlEncode(
    encoder.encode(JSON.stringify({ sub: "leads-app", iat: now, exp: now + TOKEN_TTL_SECONDS }))
  );
  const unsigned = `${header}.${payload}`;
  const key = await hmacKey(secret);
  const sig = b64urlEncode(await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned)));
  return `${unsigned}.${sig}`;
}

async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, sig] = parts;
  if (JSON.parse(new TextDecoder().decode(b64urlDecode(header))).alg !== "HS256") return false;
  const key = await hmacKey(secret);
  const expected = b64urlEncode(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`))
  );
  if (sig !== expected) return false;
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  if (claims.sub !== "leads-app") return false;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

/** Constant-time string compare (best effort in Workers). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeStatus(value: unknown): string {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (STATUSES as readonly string[]).includes(s) ? s : "new";
}

function clamp(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function leadToJson(row: LeadRow) {
  return {
    ...row,
    status: normalizeStatus(row.status),
  };
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function corsHeaders(origin: string, env: EnvWithVars): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if ((origin && allowed.includes(origin)) || allowed.includes("*")) {
    return {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return {};
}

function json(body: unknown, status = 200, cors: HeadersInit = {}): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...cors } as Record<string, string>);
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(message: string, status: number, cors: HeadersInit = {}): Response {
  return json({ error: message }, status, cors);
}

function withCors(res: Response, cors: HeadersInit): Response {
  if (!Object.keys(cors).length) return res;
  const headers = new Headers(res.headers);
  const merged = new Headers(cors as Headers);
  for (const [k, v] of merged.entries()) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type LeadPatch = { name?: string; phone?: string; email?: string; status?: string; description?: string };

function parseLeadInput(body: unknown, partial: boolean): { patch: LeadPatch; errors: string[] } {
  const errors: string[] = [];
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: LeadPatch = {};

  const hasName = "name" in input && String(input.name ?? "").trim() !== "";
  if (!partial || hasName) {
    const name = clamp(input.name, 200);
    if (!name) errors.push("Name is required");
    else patch.name = name;
  }

  if (!partial || "phone" in input) patch.phone = clamp(input.phone, 50);
  if (!partial || "email" in input) patch.email = clamp(input.email, 200);
  if (!partial || "description" in input) patch.description = clamp(input.description, 2000);
  if (!partial || "status" in input) patch.status = normalizeStatus(input.status);

  // Basic email sanity: only flag if non-empty and obviously wrong.
  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) {
    errors.push("Email is not a valid address");
  }

  return { patch, errors };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function authed(
  req: Request,
  env: EnvWithVars
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, res: errorResponse("Unauthorized", 401) };
  const valid = await verifyToken(token, env.SESSION_SECRET);
  if (!valid) return { ok: false, res: errorResponse("Session expired, sign in again", 401) };
  return { ok: true };
}

async function listLeads(env: EnvWithVars): Promise<LeadRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, phone, email, status, description, created_at, updated_at FROM leads ORDER BY id DESC"
  ).all<LeadRow>();
  return results ?? [];
}

async function getLeadById(env: EnvWithVars, id: number): Promise<LeadRow | null> {
  return await env.DB.prepare(
    "SELECT id, name, phone, email, status, description, created_at, updated_at FROM leads WHERE id = ?"
  )
    .bind(id)
    .first<LeadRow>();
}

const LEAD_COLUMNS: Record<keyof LeadPatch, string> = {
  name: "name",
  phone: "phone",
  email: "email",
  status: "status",
  description: "description",
};

function applyPatch(patch: LeadPatch): { setClauses: string[]; values: unknown[] } {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(patch) as (keyof LeadPatch)[]) {
    if (!(key in LEAD_COLUMNS) || patch[key] === undefined) continue;
    setClauses.push(`${LEAD_COLUMNS[key]} = ?`);
    values.push(patch[key] as string);
  }
  if (setClauses.length) setClauses.push("updated_at = datetime('now')");
  return { setClauses, values };
}

async function handleRequest(req: Request, env: EnvWithVars, cors: HeadersInit): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;

  // --- Health -------------------------------------------------------------
  if (method === "GET" && path === "/") {
    return json({ ok: true, service: "leads-api" }, 200, cors);
  }

  // --- Login --------------------------------------------------------------
  if (method === "POST" && path === "/api/login") {
    if (!env.APP_PASSWORD) return errorResponse("APP_PASSWORD secret is not configured on this worker", 500, cors);
    if (!env.SESSION_SECRET) return errorResponse("SESSION_SECRET secret is not configured on this worker", 500, cors);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400, cors);
    }
    const password = typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";
    if (!password || !timingSafeEqual(password, env.APP_PASSWORD)) {
      return errorResponse("Incorrect password", 401, cors);
    }
    return json({ token: await signToken(env.SESSION_SECRET) }, 200, cors);
  }

  // --- Everything below requires auth --------------------------------------
  const auth = await authed(req, env);
  if (!auth.ok) return withCors(auth.res, cors);

  if (method === "GET" && path === "/api/leads") {
    const leads = await listLeads(env);
    return json(leads.map(leadToJson), 200, cors);
  }

  if (method === "POST" && path === "/api/leads") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400, cors);
    }
    const { patch, errors } = parseLeadInput(body, false);
    if (errors.length || !patch.name) {
      return errorResponse(errors[0] ?? "Name is required", 400, cors);
    }
    const { meta } = await env.DB.prepare(
      "INSERT INTO leads (name, phone, email, status, description) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(patch.name, patch.phone ?? "", patch.email ?? "", normalizeStatus(patch.status), patch.description ?? "")
      .run();
    const lead = await getLeadById(env, Number(meta.last_row_id));
    if (!lead) return errorResponse("Lead created but could not be read back", 500, cors);
    return json(leadToJson(lead), 201, cors);
  }

  const leadMatch = path.match(/^\/api\/leads\/(\d+)$/);
  if (leadMatch) {
    const id = Number(leadMatch[1]);

    if (method === "PATCH") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse("Invalid JSON body", 400, cors);
      }
      const { patch, errors } = parseLeadInput(body, true);
      if (errors.length) return errorResponse(errors[0], 400, cors);
      const { setClauses, values } = applyPatch(patch);
      if (!setClauses.length) return errorResponse("Nothing to update", 400, cors);
      const result = await env.DB.prepare(`UPDATE leads SET ${setClauses.join(", ")} WHERE id = ?`)
        .bind(...values, id)
        .run();
      if (!result.meta.changes) return errorResponse("Lead not found", 404, cors);
      const lead = await getLeadById(env, id);
      if (!lead) return errorResponse("Lead not found", 404, cors);
      return json(leadToJson(lead), 200, cors);
    }

    if (method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return errorResponse("Lead not found", 404, cors);
      return json({ ok: true }, 200, cors);
    }
  }

  return errorResponse("Not found", 404, cors);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(req: Request, env: EnvWithVars): Promise<Response> {
    const cors = corsHeaders(req.headers.get("Origin") ?? "", env);
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const res = await handleRequest(req, env, cors);
      return withCors(res, cors);
    } catch (err) {
      console.error("Unhandled error:", err);
      return errorResponse("Internal server error", 500, cors);
    }
  },
};
