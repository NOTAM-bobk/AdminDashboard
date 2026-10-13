# AdminDashboard — Leads Dashboard

A minimal lead-tracking dashboard. **Frontend on Vercel** (clean, Vercelesque UI), **backend on Cloudflare Workers + D1** (free tier: Workers free plan + D1 free plan), **one shared password** login.

Fields per lead: **Name** (required), **Phone**, **Email**, **Status** (New / Contacted / Qualified / Won / Lost), an optional short **Description**, and an optional **Deal value** (money).

The dashboard is **mobile-optimized** (stacked touch-friendly lead cards instead of a table on small screens) and has two tabs:

- **Leads** — search, status filter, stats, inline status changes, add/edit/delete.
- **Budget** — monthly **spending / made / lost** tracking with charts:
  - Log manual monthly entries (spending, made, lost) via the form in the Budget tab.
  - Won and lost leads' deal values feed the "Made" and "Lost" series automatically.
  - Charts: monthly made/lost/spending bars and a cumulative net line, plus a this-month KPI row.

> Original notes from this repo: *"use this and build a vercel deploy ready dashboard for me to track leads, i can enter contact detils name" · "UI: vercel stylized clean minlisic, sign in password is enviromental table" · "use cloudflare as backend"*

## Repo layout

```
frontend/   Vite + React + TypeScript + Tailwind (deploys to Vercel as a static site)
worker/     Cloudflare Worker API + D1 database + migrations
scripts/    smoke-test.sh — local end-to-end API test
```

Without `VITE_API_URL` set, the frontend runs in **demo mode** (password `demo`, data held in the browser) so it can be previewed before Cloudflare is wired up. The budget tab works in demo mode too, with seeded monthly entries. Charts load in a separate on-demand bundle, so the first mobile paint stays light.

## Local dev

```sh
bun install                       # installs frontend + worker dependencies
bun run dev                       # frontend on http://localhost:5173 (demo mode)
cd worker && bun run dev          # optional: API on http://localhost:8787 (uses worker/.dev.vars)
```

Local Worker smoke test (applies D1 migrations, boots wrangler, exercises login + CRUD):

```sh
sh ./scripts/smoke-test.sh        # or: 8787 demo
bun run typecheck                 # typechecks both packages
```

## Deploy the backend (Cloudflare Worker + D1)

```sh
cd worker
npx wrangler login
npx wrangler d1 create leads-db          # copy the returned database_id…
# …into worker/wrangler.jsonc  →  d1_databases[0].database_id
npx wrangler d1 migrations apply leads-db --remote   # applies all migrations (including budget)
npx wrangler secret put APP_PASSWORD     # your shared dashboard password
npx wrangler secret put SESSION_SECRET   # any long random string (signs session tokens)
```

Edit `worker/wrangler.jsonc` → `vars.ALLOWED_ORIGINS` (comma-separated list) with all origins the frontend will be served from locally and in production, then deploy:

```sh
npx wrangler deploy
```

Note the deployed URL (e.g. `https://leads-api.<your-subdomain>.workers.dev`). After deploying secrets/origins changes, redeploy once more.

## Deploy the frontend (Vercel)

1. Push this repo to GitHub, then import it in Vercel with the default settings (repo root). A root-level `vercel.json` points Vercel at `frontend/`, so no extra configuration is needed.
2. In the Vercel project settings:
   - **Root Directory**: `frontend`
   - Build command `vite build`, output directory `dist` (auto-detected)
   - **Environment variable**: `VITE_API_URL` = the Worker URL from the step above (no trailing slash)
3. Deploy. Vercel serves `frontend/vercel.json`'s SPA rewrite so deep links work.

## Custom domain

You want it on your own domain with the Cloudflare backend. Two clean options:

- **Feasible**: point your domain's DNS at Vercel (add the domain in the Vercel project; Vercel gives you A/CNAME records), and add your domain to the Worker's `ALLOWED_ORIGINS`.
- **Alternative**: keep DNS on Cloudflare and serve only the Worker on the domain (`workers_dev`/route in `wrangler.jsonc`) — but then the frontend would need hosting too; the split deployment above is the simpler path.

## Secrets & env vars summary

| Where | Name | What |
| --- | --- | --- |
| Cloudflare Worker secret | `APP_PASSWORD` | The one shared sign-in password |
| Cloudflare Worker secret | `SESSION_SECRET` | Long random string used to sign session tokens |
| Cloudflare Worker var | `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API |
| Vercel env var | `VITE_API_URL` | Deployed Worker URL the frontend talks to |

## API

All routes live under the Worker; everything except `/` and `/api/login` requires `Authorization: Bearer <token>` (7-day session).

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/login` | `{ password }` → `{ token }` |
| GET | `/api/leads` | All leads, newest first |
| POST | `/api/leads` | `{ name, phone?, email?, status?, description?, value? }` |
| PATCH | `/api/leads/:id` | Partial update of any lead fields |
| DELETE | `/api/leads/:id` | Remove a lead |
| GET | `/api/budget` | All budget entries, newest month first |
| POST | `/api/budget` | `{ month (YYYY-MM), type (spending\|made\|lost), label?, amount }` |
| PATCH | `/api/budget/:id` | Partial update of a budget entry |
| DELETE | `/api/budget/:id` | Remove a budget entry |

Free-tier friendly: D1 free plan covers millions of small reads/writes per day — a personal leads tracker will stay far inside it.
