import { useState, type FormEvent } from "react";
import { DEMO_MODE, api } from "../api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900">
            <svg width="18" height="18" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M50 15 90 85 10 85Z" fill="white" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Leads</h1>
          <p className="text-sm text-neutral-500">Sign in to open your dashboard.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <label htmlFor="password" className="block text-sm font-medium text-neutral-800">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            className="mt-1.5 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none"
          />

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || !password}
            className="mt-5 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-400">
          {DEMO_MODE ? "Demo mode · password is “demo” · data lives in your browser" : "Password is set via the Worker's APP_PASSWORD secret"}
        </p>
      </div>
    </main>
  );
}
