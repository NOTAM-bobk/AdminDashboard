export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  description: string;
  created_at: string;
  updated_at: string;
}

export type LeadInput = Pick<Lead, "name" | "phone" | "email" | "status" | "description">;

export const STATUS_META: Record<LeadStatus, { label: string; dot: string; chip: string }> = {
  new: { label: "New", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-600/10" },
  contacted: { label: "Contacted", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-600/10" },
  qualified: { label: "Qualified", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-600/10" },
  won: { label: "Won", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/10" },
  lost: { label: "Lost", dot: "bg-neutral-400", chip: "bg-neutral-100 text-neutral-600 ring-neutral-500/10" },
};

export function asStatus(value: string): LeadStatus {
  return (STATUSES as string[]).includes(value) ? (value as LeadStatus) : "new";
}

const API_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
export const DEMO_MODE = API_URL === "";

const TOKEN_KEY = "leads.token";
const DEMO_KEY = "leads.demo-data";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Shared interface
// ---------------------------------------------------------------------------

export interface LeadClient {
  login(password: string): Promise<void>;
  logout(): void;
  hasToken(): boolean;
  listLeads(): Promise<Lead[]>;
  createLead(input: LeadInput): Promise<Lead>;
  updateLead(id: number, patch: Partial<LeadInput>): Promise<Lead>;
  deleteLead(id: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Live client (talks to the Cloudflare Worker)
// ---------------------------------------------------------------------------

function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(value: string | null) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage failures (private mode)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    setToken(null);
    throw new ApiError("Session expired, sign in again", 401);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

class LiveClient implements LeadClient {
  async login(password: string): Promise<void> {
    const { token: t } = await request<{ token: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    setToken(t);
  }

  logout(): void {
    setToken(null);
  }

  hasToken(): boolean {
    return token() !== null;
  }

  listLeads(): Promise<Lead[]> {
    return request<Lead[]>("/api/leads");
  }

  createLead(input: LeadInput): Promise<Lead> {
    return request<Lead>("/api/leads", { method: "POST", body: JSON.stringify(input) });
  }

  updateLead(id: number, patch: Partial<LeadInput>): Promise<Lead> {
    return request<Lead>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async deleteLead(id: number): Promise<void> {
    await request(`/api/leads/${id}`, { method: "DELETE" });
  }
}

// ---------------------------------------------------------------------------
// Demo client (no worker configured): data lives in localStorage
// ---------------------------------------------------------------------------

const SEED: LeadInput[] = [
  {
    name: "Amara Diallo",
    phone: "+1 (415) 555-0123",
    email: "amara@brightloop.io",
    status: "new",
    description: "Asked about pricing on LinkedIn — follow up today.",
  },
  {
    name: "Jonas Weber",
    phone: "+49 151 555 0198",
    email: "jonas@weber-gmbh.de",
    status: "contacted",
    description: "Sent intro deck on Monday, waiting on reply.",
  },
  {
    name: "Priya Nair",
    phone: "+91 98200 55521",
    email: "priya@nairlabs.in",
    status: "qualified",
    description: "Budget confirmed, needs 3 seats by end of month.",
  },
  {
    name: "Tom Becker",
    phone: "+1 (212) 555-0150",
    email: "tom@beckerco.com",
    status: "won",
    description: "Signed annual contract, renewal in June.",
  },
  {
    name: "Sara Ahmed",
    phone: "",
    email: "sara@duneapps.com",
    status: "lost",
    description: "Went with a cheaper competitor.",
  },
];

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function loadDemoData(): Lead[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw) as Lead[];
  } catch {
    // fall through to seed
  }
  const seeded: Lead[] = SEED.map((input, i) => ({
    ...input,
    id: i + 1,
    created_at: todayPlus(i * 2 + 1),
    updated_at: todayPlus(i * 2 + 1),
  }));
  saveDemoData(seeded);
  return seeded;
}

function saveDemoData(leads: Lead[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(leads));
  } catch {
    // ignore
  }
}

function nextId(leads: Lead[]): number {
  return leads.reduce((max, l) => Math.max(max, l.id), 0) + 1;
}

function normalize(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

class DemoClient implements LeadClient {
  async login(password: string): Promise<void> {
    if (password !== "demo") {
      throw new ApiError("In demo mode the password is: demo", 401);
    }
    setToken("demo-token");
  }

  logout(): void {
    setToken(null);
  }

  hasToken(): boolean {
    return token() !== null;
  }

  async listLeads(): Promise<Lead[]> {
    return loadDemoData().sort((a, b) => b.id - a.id);
  }

  async createLead(input: unknown): Promise<Lead> {
    const i = input as Record<string, unknown>;
    const name = normalize(i.name, 200);
    if (!name) throw new ApiError("Name is required", 400);
    const leads = loadDemoData();
    const lead: Lead = {
      id: nextId(leads),
      name,
      phone: normalize(i.phone, 50),
      email: normalize(i.email, 200),
      status: asStatus(String(i.status ?? "new")),
      description: normalize(i.description, 2000),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveDemoData([lead, ...leads]);
    return lead;
  }

  async updateLead(id: number, patch: Partial<LeadInput>): Promise<Lead> {
    const leads = loadDemoData();
    const idx = leads.findIndex((l) => l.id === id);
    if (idx === -1) throw new ApiError("Lead not found", 404);
    const current = leads[idx];
    const updated: Lead = {
      ...current,
      ...(patch.name !== undefined ? { name: normalize(patch.name, 200) || current.name } : {}),
      ...(patch.phone !== undefined ? { phone: normalize(patch.phone, 50) } : {}),
      ...(patch.email !== undefined ? { email: normalize(patch.email, 200) } : {}),
      ...(patch.status !== undefined ? { status: asStatus(String(patch.status)) } : {}),
      ...(patch.description !== undefined ? { description: normalize(patch.description, 2000) } : {}),
      updated_at: new Date().toISOString(),
    };
    leads[idx] = updated;
    saveDemoData(leads);
    return updated;
  }

  async deleteLead(id: number): Promise<void> {
    saveDemoData(loadDemoData().filter((l) => l.id !== id));
  }
}

// ---------------------------------------------------------------------------

export const api: LeadClient = DEMO_MODE ? new DemoClient() : new LiveClient();
