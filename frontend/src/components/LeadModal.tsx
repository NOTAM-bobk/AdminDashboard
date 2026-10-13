import { useEffect, useState, type FormEvent } from "react";
import { STATUSES, STATUS_META, type Lead, type LeadInput, type LeadStatus } from "../api";

export interface LeadModalProps {
  mode: "new" | "edit";
  lead?: Lead;
  busy: boolean;
  onClose: () => void;
  onSave: (input: LeadInput) => Promise<void>;
}

export default function LeadModal({ mode, lead, busy, onClose, onSave }: LeadModalProps) {
  const [name, setName] = useState(lead?.name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "new");
  const [description, setDescription] = useState(lead?.description ?? "");
  const [value, setValue] = useState<string>(
    lead && lead.value > 0 ? String(lead.value) : ""
  );
  const [error, setError] = useState<string | null>(null);

  // Escape closes the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    const parsedValue = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setError("Deal value must be a non-negative number");
      return;
    }
    await onSave({
      name: name.trim(),
      phone,
      email,
      status,
      description,
      value: Math.round(parsedValue * 100) / 100,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 p-4 pt-[10vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-[fadeIn_120ms_ease-out] rounded-xl border border-neutral-200 bg-white shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "new" ? "Add lead" : "Edit lead"}
      >
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            {mode === "new" ? "Add lead" : "Edit lead"}
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-5">
            <Field label="Name" htmlFor="lead-name" required>
              <input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Jane Doe"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" htmlFor="lead-phone">
                <input
                  id="lead-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 555-0100"
                  className={inputClass}
                />
              </Field>
              <Field label="Email" htmlFor="lead-email">
                <input
                  id="lead-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" htmlFor="lead-status">
                <select
                  id="lead-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus)}
                  className={inputClass}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deal value" htmlFor="lead-value" hint="Optional">
                <input
                  id="lead-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="lead-description" hint="Optional">
              <textarea
                id="lead-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Short context or next step…"
                className={`${inputClass} resize-none`}
              />
            </Field>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "new" ? "Add lead" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none";

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-800">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
