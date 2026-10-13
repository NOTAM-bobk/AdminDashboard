import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEMO_MODE,
  STATUSES,
  STATUS_META,
  asStatus,
  api,
  type Lead,
  type LeadInput,
  type LeadStatus,
} from "../api";
import LeadModal from "./LeadModal";
import ConfirmModal from "./ConfirmModal";

type ModalState =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; lead: Lead }
  | { kind: "delete"; lead: Lead };

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await api.listLeads());
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        onLogout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.description.toLowerCase().includes(q)
      );
    });
  }, [leads, query, statusFilter]);

  const counts = useMemo(() => {
    const counts: Record<LeadStatus, number> = { new: 0, contacted: 0, qualified: 0, won: 0, lost: 0 };
    for (const lead of leads) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    return counts;
  }, [leads]);

  async function handleSave(input: LeadInput) {
    setBusy(true);
    try {
      if (modal.kind === "edit") {
        const updated = await api.updateLead(modal.lead.id, input);
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        const created = await api.createLead(input);
        setLeads((prev) => [created, ...prev]);
      }
      setModal({ kind: "none" });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) onLogout();
      else setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (modal.kind !== "delete") return;
    setBusy(true);
    try {
      await api.deleteLead(modal.lead.id);
      setLeads((prev) => prev.filter((l) => l.id !== modal.lead.id));
      setModal({ kind: "none" });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) onLogout();
      else setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(lead: Lead, status: string) {
    const s = asStatus(status);
    const optimistic: Lead = { ...lead, status: s, updated_at: new Date().toISOString() };
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? optimistic : l)));
    try {
      const updated = await api.updateLead(lead.id, { status: s });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      if (err instanceof Error && err.message.includes("Session expired")) onLogout();
      else setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="min-h-full bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-neutral-900">
              <svg width="12" height="12" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M50 15 90 85 10 85Z" fill="white" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-neutral-900">Leads</span>
          </div>
          <div className="flex items-center gap-3">
            {DEMO_MODE && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Demo mode
              </span>
            )}
            <button
              onClick={onLogout}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="All leads" value={leads.length} dot="bg-neutral-900" />
          {(STATUSES as LeadStatus[]).map((s) => (
            <StatCard key={s} label={STATUS_META[s].label} value={counts[s]} dot={STATUS_META[s].dot} />
          ))}
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads…"
            className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
          />
          <div className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1">
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All
            </FilterChip>
            {(STATUSES as LeadStatus[]).map((s) => (
              <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {STATUS_META[s].label}
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setModal({ kind: "new" })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
            >
              + Add lead
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {loading ? (
            <div className="divide-y divide-neutral-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-6">
                  <div className="h-4 w-36 animate-pulse rounded bg-neutral-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-neutral-100" />
                  <div className="ml-auto h-4 w-16 animate-pulse rounded bg-neutral-100" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState hasLeads={leads.length > 0} onAdd={() => setModal({ kind: "new" })} />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {filtered.map((lead) => (
                <li key={lead.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 sm:px-6">
                  <StatusSelect value={lead.status} onChange={(s) => void handleStatusChange(lead, s)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-neutral-900">{lead.name}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      {lead.phone && <span className="tabular-nums">{lead.phone}</span>}
                      {lead.email && <span className="truncate">{lead.email}</span>}
                    </div>
                    {lead.description && (
                      <p title={lead.description} className="mt-1 max-w-xl truncate text-xs text-neutral-400">
                        {lead.description}
                      </p>
                    )}
                  </div>
                  <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">
                    {formatDate(lead.created_at)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton label={`Edit ${lead.name}`} onClick={() => setModal({ kind: "edit", lead })}>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path
                          d="M10.5 2.5l2 2-7.5 7.5H3v-2l7.5-7.5z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </IconButton>
                    <IconButton label={`Delete ${lead.name}`} onClick={() => setModal({ kind: "delete", lead })}>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path
                          d="M2.5 4.5h10M4.5 4.5v7a1 1 0 001 1h4a1 1 0 001-1v-7M6 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-neutral-400">
          {leads.length} lead{leads.length === 1 ? "" : "s"} · backend {DEMO_MODE ? "demo (browser)" : "Cloudflare Worker + D1"}
        </p>
      </main>

      {modal.kind === "new" && (
        <LeadModal mode="new" busy={busy} onClose={() => setModal({ kind: "none" })} onSave={handleSave} />
      )}
      {modal.kind === "edit" && (
        <LeadModal mode="edit" lead={modal.lead} busy={busy} onClose={() => setModal({ kind: "none" })} onSave={handleSave} />
      )}
      {modal.kind === "delete" && (
        <ConfirmModal
          title="Delete lead"
          message={`Remove “${modal.lead.name}”? This cannot be undone.`}
          busy={busy}
          onConfirm={() => void handleDelete()}
          onClose={() => setModal({ kind: "none" })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-xs font-medium text-neutral-500">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function StatusSelect({ value, onChange }: { value: LeadStatus; onChange: (status: string) => void }) {
  const meta = STATUS_META[value];
  return (
    <div className={`relative inline-flex shrink-0 items-center rounded-full px-2.5 py-1 ring-1 ring-inset ${meta.chip}`}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Lead status"
        className="cursor-pointer appearance-none bg-transparent pr-3 text-xs font-medium focus:outline-none"
      >
        {(STATUSES as LeadStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5"
        width="8"
        height="6"
        viewBox="0 0 8 6"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
    >
      {children}
    </button>
  );
}

function EmptyState({ hasLeads, onAdd }: { hasLeads: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400">
        <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path d="M7.5 1.5v12M1.5 7.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-medium text-neutral-900">
        {hasLeads ? "No matching leads" : "No leads yet"}
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        {hasLeads ? "Try clearing the search or filter." : "Add your first lead to get started."}
      </p>
      {!hasLeads && (
        <button
          onClick={onAdd}
          className="mt-4 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          + Add lead
        </button>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes(" ") ? iso.replace(" ", "T") + "Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
