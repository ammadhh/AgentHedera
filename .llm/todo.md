# .llm/todo.md — ClawGuild (No-Docker Deploy: Vercel + Render/Fly/Railway)

> Goal: Ship a hackathon-winning **agent-first** OpenClaw society where agents autonomously discover jobs, bid via **UCP** commerce messages, complete work, attest to **HCS**, and settle payments via **HTS**. Humans only observe via a web dashboard.  
> Deployment: **UI on Vercel**, **Backend on Render (web service)**, **Agents on Render (background worker)**. No Docker required.

---

## 0) Definition of Done (DoD)
- [ ] Public GitHub repo with clean monorepo + setup docs
- [ ] Live demo URL (Vercel UI) + Backend URL (Render) + Agents worker running
- [ ] On startup, system autonomously:
  - [ ] registers at least **3 agents**
  - [ ] creates at least **3 jobs**
  - [ ] completes at least **2 jobs end-to-end** with no human input
- [ ] Hedera usage is visible:
  - [ ] **HCS** topic logs all major state transitions
  - [ ] **HTS** payment transfer happens at least once; tx id displayed in UI
- [ ] UCP standardized messages:
  - [ ] Quote, Invoice, Receipt JSON validated against schemas
- [ ] UI is observer-only:
  - [ ] Agent states + job flow + event log + payment ledger + reputation badges
- [ ] Deliverables:
  - [ ] `README.md` (setup + walkthrough)
  - [ ] `DEMO_SCRIPT.md` (<3 min script)
  - [ ] `/docs/PLAN.md`, `/docs/UCP.md`, `/docs/REPUTATION.md`

---

## 1) Repo Scaffold (Monorepo, No Docker)
- [ ] Create structure:
  - [ ] `/backend` — Node.js TypeScript API (Fastify or Express)
  - [ ] `/agents` — OpenClaw agent runner (TS or Python; pick easiest and proceed)
  - [ ] `/ui` — Next.js observer dashboard
  - [ ] `/schemas/ucp` — JSON schemas
  - [ ] `/docs` — plan + UCP + reputation
  - [ ] `/scripts` — deploy helpers + seed scripts
  - [ ] `/state` — local dev sqlite + artifacts (gitignored)
  - [ ] `/logs` — local dev logs (gitignored)
- [ ] Add pnpm workspaces (recommended) OR npm workspaces
- [ ] Add `.env.example` (backend + agents + UI envs)
- [ ] Add `.gitignore` for state/logs/secrets

---

## 2) Docs First (keeps Claude focused, helps judges)
- [ ] `/docs/PLAN.md`
  - [ ] Architecture diagram (ASCII ok)
  - [ ] Flow: job -> bids -> assign -> execution -> HCS attest -> HTS settle -> reputation update
  - [ ] Why Hedera adds trust (HCS attestations + HTS settlement)
  - [ ] Why UCP matters (standard commerce schema)
  - [ ] Deployment: Vercel + Render (web + worker)
- [ ] `/docs/UCP.md`
  - [ ] Define: Quote / Invoice / Receipt (and optional Dispute)
  - [ ] Canonical JSON hash + signature placeholder
  - [ ] Validation points in backend
- [ ] `/docs/REPUTATION.md`
  - [ ] Simple score model + update rules
  - [ ] Optional mapping to ERC-8004 style concepts (informational)

---

## 3) Backend API (Render Web Service)
### 3.1 Must-have endpoints
- [ ] `GET /health` (uptime, db ok, hedera ok, counts)
- [ ] `GET /metrics` (agents, jobs, bids, completions, failures)
- [ ] `POST /agents/register`
- [ ] `POST /agents/heartbeat`
- [ ] `GET /agents`
- [ ] `POST /jobs` (also emits HCS event)
- [ ] `GET /jobs`
- [ ] `POST /bids` (validates UCP Quote schema)
- [ ] `GET /bids?job_id=...`
- [ ] `POST /assign` (auto-select winner; emits HCS)
- [ ] `POST /results` (stores artifact; emits HCS; updates rep)
- [ ] `POST /settle` (executes HTS transfer; stores tx id; emits HCS)
- [ ] `GET /events` (recent events; includes mirrored HCS + internal events)

### 3.2 Persistence (pick easiest that works on Render)
- [ ] Prefer **Postgres** on Render (best for hosted persistence)
  - [ ] Create tables: agents, jobs, bids, events, reputation, transfers
- [ ] Local dev fallback: SQLite (ok)
- [ ] Add migrations (lightweight) or init SQL on startup

### 3.3 Event ingestion
- [ ] Write all internal events to `events` table
- [ ] Mirror HCS messages into events table (backend subscribes OR agents post and backend stores)

---

## 4) Hedera Integration (HTS + HCS minimum)
- [ ] Implement `hedera.ts` module used by backend:
  - [ ] init client from env
  - [ ] HCS: create topic if `HCS_TOPIC_ID` missing; persist to DB
  - [ ] HCS: `publishEvent(type, payload)` returns tx id/sequence
  - [ ] HTS: `transferToken(tokenId, fromKey, toAccountId, amount)` (or operator pays as demo)
- [ ] Ensure every major state transition publishes to HCS:
  - [ ] job.created
  - [ ] bid.placed
  - [ ] job.assigned
  - [ ] job.progress
  - [ ] job.completed
  - [ ] payment.settled
  - [ ] reputation.updated
- [ ] Store and surface:
  - [ ] topic id
  - [ ] tx ids / consensus sequence
  - [ ] token transfer tx id

> Note: Keep “real escrow” optional. For demo: pay-on-completion is fine if attestations are on HCS.

---

## 5) UCP Schemas (Bonus Points)
- [ ] Add JSON schemas (Ajv compatible):
  - [ ] `/schemas/ucp/Quote.schema.json`
  - [ ] `/schemas/ucp/Invoice.schema.json`
  - [ ] `/schemas/ucp/Receipt.schema.json`
- [ ] Required fields:
  - [ ] `message_type`, `job_id`, `buyer_agent_id`, `seller_agent_id`
  - [ ] `price`, `currency` (HTS token id), `expiry`
  - [ ] `canonical_hash`, `signature` (placeholder ok), `timestamp`
- [ ] Backend validates:
  - [ ] all bids must be valid Quote
  - [ ] settlement produces Invoice + Receipt saved in DB
- [ ] UI displays UCP objects for each job

---

## 6) Agents (Render Background Worker)
### 6.1 Agent runner design
- [ ] Implement `agents/runner` that:
  - [ ] spawns 3 agents with different skills/prices
  - [ ] registers and heartbeats to backend
  - [ ] polls for open jobs
  - [ ] generates UCP Quote bids
  - [ ] on assignment: executes task + posts results
  - [ ] posts progress updates + completion attestations

### 6.2 Skills (demo-friendly)
- [ ] Skill 1: “Summarize sample docs” (use local sample files in repo)
- [ ] Skill 2: “Generate QA report” (run quick checks / static analysis)
- [ ] Skill 3: “Write short market memo” (templated output)
- [ ] All produce artifacts saved to backend (and optionally to `/state/artifacts` locally)

### 6.3 Robust loop (no infinite loops)
- [ ] Exponential backoff on failures
- [ ] max retries per job stage
- [ ] sleep between polls
- [ ] idempotency keys so restarts don’t duplicate completions
- [ ] persist local agent state to disk for local dev; for Render use DB-only or minimal

---

## 7) Reputation / Trust (UI-visible)
- [ ] Define reputation score:
  - [ ] +10 per completion
  - [ ] -15 per failure/dispute
  - [ ] +time bonus if under threshold
- [ ] Store in DB + expose on `/agents`
- [ ] Update on completion and settlement
- [ ] UI shows badges:
  - [ ] Reliable / Fast / New / Risky

---

## 8) Observer UI (Vercel)
- [ ] Next.js pages:
  - [ ] Overview: counts + “system alive” banner
  - [ ] Jobs: state machine + bids + assigned agent + artifact link
  - [ ] Agents: list + rep badges + last heartbeat
  - [ ] Events: HCS/internal event timeline (filter by job/agent)
  - [ ] Payments: HTS transfer ledger w tx ids
- [ ] Poll backend every 1–3 seconds (simple, reliable for demo)
- [ ] Make UI “observer-only”: no action buttons that drive core flow

---

## 9) “Overnight” Without Docker: Keep Agents Running
- [ ] Backend on Render Web Service (always on)
- [ ] Agents on Render Background Worker (always running)
- [ ] Add internal scheduler:
  - [ ] Either in agents worker OR backend cron-like loop
  - [ ] Create a new job every N minutes (config env `SOAK_INTERVAL_MINUTES`)
- [ ] Add `/health` data points:
  - [ ] last_job_completed_at
  - [ ] completions_last_60min
  - [ ] agents_active_count
- [ ] Add lightweight watchdog *inside the worker*:
  - [ ] if “no completions in X mins”, create easier jobs + reset stuck jobs
  - [ ] if agent hasn’t heartbeated, re-register / restart its loop

> This achieves “overnight continuous run” without Docker: the Render worker stays up.

---

## 10) Deployment Steps (must document + automate)
### 10.1 GitHub
- [ ] Repo ready, clean commits
- [ ] Add GitHub Actions (optional):
  - [ ] lint + typecheck on PR
  - [ ] (optional) nightly ping to /health

### 10.2 Render Deploy (Backend)
- [ ] Add `render.yaml` (optional but nice) OR manual instructions
- [ ] Backend start command: `pnpm -C backend start`
- [ ] Add Postgres addon; set `DATABASE_URL`

### 10.3 Render Deploy (Agents Worker)
- [ ] Worker start command: `pnpm -C agents start`
- [ ] Env vars include backend URL + Hedera keys + intervals

### 10.4 Vercel Deploy (UI)
- [ ] Set `NEXT_PUBLIC_BACKEND_URL`
- [ ] Deploy UI; verify data flows

---

## 11) Demo Assets (wins judges)
- [ ] `README.md`
  - [ ] pitch + “why agent society” + “why Hedera”
  - [ ] quickstart local dev commands
  - [ ] how to deploy (Vercel + Render)
  - [ ] how to verify HTS and HCS (topic id + tx ids)
  - [ ] requirements mapping to bounty checklist
- [ ] `DEMO_SCRIPT.md` (2:30–3:00 minutes)
  - [ ] show UI: agents, job flow, HCS events, HTS payment, reputation update
  - [ ] highlight UCP message objects
  - [ ] show “system gets more valuable as agents join”
- [ ] Optional: add `scripts/seed_demo.ts` to create good-looking initial jobs

---

## 12) Final Acceptance Checklist (must pass)
- [ ] Local: `pnpm i && pnpm demo` runs everything (3 agents + backend + UI)
- [ ] Deployed: UI loads and shows data from backend
- [ ] Deployed: agents worker is running and completing jobs automatically
- [ ] HCS: event stream visible in UI
- [ ] HTS: payment tx id visible in UI
- [ ] README + DEMO_SCRIPT complete and judge-friendly

---

## Priority Order
**P0 (ship):** backend minimal + agents minimal + HTS/HCS + UI basics + deploy  
**P1 (win):** UCP schemas + reputation + clean observer timeline + demo polish  
**P2 (wow):** recurring “subscription invoice” + richer trust signals + nicer UI flow
