import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BUDGET_TYPES,
  BUDGET_TYPE_META,
  api,
  fmtMoney,
  lastMonths,
  monthLabel,
  yearMonth,
  type BudgetEntry,
  type BudgetInput,
  type BudgetType,
  type Lead,
} from "../api";
import { MonthlyBarChart, NetLineChart } from "./charts";

interface Props {
  leads: Lead[];
  onLogout: () => void;
}

export default function BudgetView({ leads, onLogout }: Props) {
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(yearMonth(new Date()));
  const [type, setType] = useState<BudgetType>("spending");
  const [label, setLabel] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api.listBudget());
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        onLogout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load budget");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Aggregation: monthly derived made/lost come from won/lost leads' deal
  // values (by updated_at month); spending/made/lost manual entries add on top.
  const months = useMemo(() => lastMonths(6), []);

  const byMonth = useMemo(() => {
    const spending = new Map<string, number>();
    const madeEntries = new Map<string, number>();
    const lostEntries = new Map<string, number>();
    for (const e of entries) {
      const key = e.month;
      if (e.type === "spending") spending.set(key, (spending.get(key) ?? 0) + e.amount);
      else if (e.type === "made") madeEntries.set(key, (madeEntries.get(key) ?? 0) + e.amount);
      else if (e.type === "lost") lostEntries.set(key, (lostEntries.get(key) ?? 0) + e.amount);
    }
    const wonFromLeads = new Map<string, number>();
    const lostFromLeads = new Map<string, number>();
    for (const l of leads) {
      if (l.value <= 0) continue;
      const key = l.updated_at.slice(0, 7);
      if (l.status === "won") wonFromLeads.set(key, (wonFromLeads.get(key) ?? 0) + l.value);
      else if (l.status === "lost") lostFromLeads.set(key, (lostFromLeads.get(key) ?? 0) + l.value);
    }
    const all = [...months];
    for (const key of [...spending.keys(), ...madeEntries.keys(), ...lostEntries.keys(), ...wonFromLeads.keys(), ...lostFromLeads.keys()]) {
      if (!all.includes(key)) all.push(key);
    }
    all.sort();
    let cum = 0;
    const points = all.map((key) => {
      const spendingTotal = spending.get(key) ?? 0;
      const made = (madeEntries.get(key) ?? 0) + (wonFromLeads.get(key) ?? 0);
      const lost = (lostEntries.get(key) ?? 0) + (lostFromLeads.get(key) ?? 0);
      const net = made - lost - spendingTotal;
      cum += net;
      return { month: monthLabel(key), key, spending: spendingTotal, made, lost, net, cumNet: Math.round(cum * 100) / 100 };
    });
    return points;
  }, [entries, leads, months]);

  const current = month;
  const kpi = useMemo(() => {
    const point = byMonth.find((p) => p.key === current);
    return point ?? { spending: 0, made: 0, lost: 0, net: 0 };
  }, [byMonth, current]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = Number(formAmount);
    if (formAmount.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter an amount greater than 0");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const input: BudgetInput = {
        month,
        type,
        label: label.trim(),
        amount: Math.round(amount * 100) / 100,
      };
      const created = await api.createBudget(input);
      setEntries((prev) => [created, ...prev]);
      setLabel("");
      setFormAmount("");
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) onLogout();
      else setFormError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: BudgetEntry) {
    setBusy(true);
    setDeletingId(entry.id);
    try {
      await api.deleteBudget(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      if (err instanceof Error && err.message.includes("Session expired")) onLogout();
      else setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI cards for the selected month */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">This month overview</h2>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
            }}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:border-neutral-400 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Spending" value={kpi.spending} tone="neutral" />
          <Kpi label="Made" value={kpi.made} tone="positive" />
          <Kpi label="Lost" value={kpi.lost} tone="negative" />
          <Kpi label="Net" value={kpi.net} tone={kpi.net >= 0 ? "positive" : "negative"} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-900">Monthly made / lost / spending</h3>
          <MonthlyBarChart data={byMonth} />
          <p className="mt-2 text-xs text-neutral-400">
            Made &amp; lost include won/lost lead deal values; manual entries add on top.
          </p>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-900">Cumulative net</h3>
          {byMonth.some((p) => p.cumNet !== 0) ? (
            <NetLineChart data={byMonth} />
          ) : (
            <Empty mini />
          )}
        </section>
      </div>

      {/* Add entry + list */}
      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-neutral-900">Monthly entries</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Log spending, money made, or lost — per month.
          </p>
        </div>

        <form onSubmit={handleAdd} className="grid gap-2 border-b border-neutral-100 px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-6">
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
            }}
            aria-label="Month"
            className={inputClass}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BudgetType)}
            aria-label="Type"
            className={inputClass}
          >
            {BUDGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {BUDGET_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            aria-label="Label"
            className={`${inputClass} lg:col-span-2`}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            placeholder="Amount"
            aria-label="Amount"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add entry
          </button>
        </form>

        {formError && (
          <p className="px-4 py-2 text-xs text-red-600 sm:px-5">{formError}</p>
        )}
        {error && (
          <p className="px-4 py-2 text-xs text-red-600 sm:px-5">{error}</p>
        )}

        {loading ? (
          <div className="divide-y divide-neutral-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <div className="h-4 w-24 animate-pulse rounded bg-neutral-100" />
                <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {entries.map((entry) => {
              const meta = BUDGET_TYPE_META[entry.type];
              return (
                <li key={entry.id} className="group flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <span className="hidden w-14 shrink-0 text-xs text-neutral-400 sm:block">
                    {monthLabel(entry.month)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
                    {entry.label || <span className="text-neutral-400">—</span>}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-900">
                    {fmtMoney(entry.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry)}
                    disabled={busy && deletingId === entry.id}
                    aria-label={`Delete entry ${entry.label || entry.month}`}
                    title="Delete entry"
                    className="shrink-0 rounded-md p-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                      <path
                        d="M2.5 4.5h10M4.5 4.5v7a1 1 0 001 1h4a1 1 0 001-1v-7M6 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none sm:text-sm";

function Kpi({ label, value, tone }: { label: string; value: number; tone: "neutral" | "positive" | "negative" }) {
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{fmtMoney(value)}</p>
    </div>
  );
}

function Empty({ mini = false }: { mini?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${mini ? "h-56" : "px-6 py-12"}`}>
      <h3 className="text-sm font-medium text-neutral-900">No entries yet</h3>
      <p className="mt-1 max-w-xs text-sm text-neutral-500">
        {mini
          ? "Net will appear once you log spending, made or lost amounts."
          : "Use the form above to log your first spending, made or lost entry."}
      </p>
    </div>
  );
}
