# RxMunshi: build plan

Source: *RxMunshi — Real-Time Working MVP Technical Spec* (the 48-hour dev guide).
Status: **plan, awaiting approval.** No product code yet.

RxMunshi is the pharmacy version of the DukaanOS idea: **the model proposes, code validates, the owner approves, the system verifies.** It runs as a web app on a counter PC or laptop. It never sells, stocks or delivers medicines.

---

## 1. What wins

Judges and chemists reward the same thing: **one loop that visibly saves rupees, live, every time.** "Can do anything" loses demos, because breadth breaks on stage. So the plan is:

1. Build the spec's MVP exactly, so it works without Wi-Fi panic.
2. Add six features that turn RxMunshi from a tracker into an **agent that recovers money and keeps the shop legal**, each ending in a number on screen (₹ recovered, ₹ saved, minutes saved, audit-ready).
3. Make the agent able to *act* on everything it can see, but only through typed tools, approval and an audit trail.

**The one-line pitch:** *Other apps record your pharmacy. RxMunshi gets your expiry money back, fills your H1 register and brings your chronic patients back, with your approval at every step.*

---

## 2. Corrections to the spec (decide before building)

| Spec says | Problem | Plan |
|---|---|---|
| H1 log is auto-filled "when Schedule H1 antibiotics are scanned" on a purchase bill | The H1 register (Drugs and Cosmetics Rules, rule 65) records **supply to a patient**, not purchases. Logging purchases would produce a wrong register. | Purchase scan only **flags** H1 batches. The register row is written at **dispense** (Rx scan or counter entry). |
| `schedule_h1_logs` columns | The register needs the **prescriber's name and address** and the **patient's name**, kept **three years**. | Add `doctor_address`, `patient_address`, `retain_until`. Block saving without required fields. |
| "Form 20B Return Slip" | Form 20B is the *wholesaler's* licence, not a slip format. | Call it **Expiry Return Slip**, addressed to the wholesaler with their 20B/21B licence number printed on it. |
| WhatsApp Cloud API from day one | Templates need Meta business verification and approval (days). | Two lanes: approved templates when ready; until then a **wa.me pre-filled link** (owner taps send) plus a **simulated YES** for stage. The UI says which lane was used. |
| Gemini 2.5 Flash | Model versions move. | Model ID in config; strict JSON schema; every extracted field shows its confidence. |
| `auth.uid() = shop_id` | Breaks the day a shop has two staff logins. | `shop_members(user_id, shop_id, role)`; RLS checks membership. Roles: owner, pharmacist, staff. |

---

## 3. The MVP (exactly the spec, hardened)

**Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, pg_cron), Gemini Flash vision, Meta WhatsApp Cloud API, jsPDF, Vercel. *(See question 2: a Google-native variant is possible.)*

**Screens** (all realtime, no refresh):
- **Today**: live KPI bar (stock value at risk, expiring in 30/60/90 days, credit pending ₹, refills due, YES replies).
- **Bill Scanner**: split screen. Bill on the left (drop file or webcam), editable rows on the right, each with a confidence tag. *Save all* bulk-inserts and flags dead-stock risk.
- **Expiry Radar**: table bucketed 30/60/90, voice and `/` search, one-click return slip.
- **Credit Notes**: pending/settled, ₹ totals, aging.
- **Refills**: chronic patients, Day-27 queue, consent state, live YES banner and chime.
- **H1 Register**: entries, missing-field warnings, CSV export.
- **Settings**: shop profile, licence numbers, wholesalers, WhatsApp lane.

**API routes:** `POST /api/scan-bill`, `POST /api/return-slip`, `POST /api/webhooks/whatsapp` (verify Meta signature), `GET /api/export/h1-csv`, daily 08:00 IST job (pg_cron → Edge Function).

**Keyboard:** `/` search, `V` Hindi voice, `S` scan, `?` shortcuts.

**Stage safety net:** a *Demo* switch in the header runs every external call (Gemini, WhatsApp, Storage) through recorded fixtures, so the full flow (scan → save → return slip → YES reply) works offline in under 10 seconds. All demo data is labelled **synthetic**.

---

## 4. Six features that decide winning

Each feature ends in a number the owner cares about, and each is a set of agent tools.

### F1. Munshi, the agent (the core)
A morning plan and an "ask or do anything" box, by voice (Hindi/English) or typing.
- **Morning plan at 08:00:** "3 batches worth ₹4,820 must go back to Sharma Pharma before their return window closes Friday. 6 refills due; 4 opted in. Reorder Telma-40: 2 committed refills, 0 in stock."
- **Ask:** "Agle mahine kaun si dawai expire hogi?" answers from the database, with the query shown.
- **Do:** "Teen wale batch return kar do" → proposes the return slips → owner approves → executed → logged.
- Every action is a **task**: `proposed → approved → executed → verified | failed(reason)`. The audit timeline shows inputs, outputs and the approver.
- Rule: numbers come from SQL tools, never from model text. Bill and message text is data, never instructions.

### F2. Delivery Verifier
When a wholesaler's bill is scanned, compare it against the order and the last purchase:
- price above last rate or above MRP, short quantity, free-quantity scheme missing,
- **short-dated stock received** (e.g. under 6 months of shelf life): "refuse or return now",
- duplicate bill number.
Result: a mismatch card with ₹ at stake and a drafted message to the wholesaler.

### F3. Expiry Money-Back Engine
The spec tracks credit notes; this **chases** them.
- Per-wholesaler **return window** and credit % (configurable), with a countdown on each batch.
- **Best action per near-expiry batch:** return now, or use first for a refill patient who takes it, or stop reordering. Rupees shown for each.
- Auto-chase pending credit notes at 15/30/45 days (drafted, approved, sent).
- Photograph the credit note when it arrives → matched to the claim → marked settled.
- Headline counter: **₹ recovered this month.**

### F4. Rx to Register
Scan a prescription at the counter:
- reads doctor, patient and medicines; matches them to batches in stock (FEFO: first expiring, first out);
- for H1 drugs, **fills the register row** and blocks save until required fields are present;
- shows **same-salt alternatives in stock** for the pharmacist to choose from (decision support only; the pharmacist decides);
- offers refill enrolment with **DPDP consent captured on screen** (purpose, timestamp, withdrawal link).

### F5. Committed-Demand Reorder
Chronic patients are guaranteed demand. Combine due refills with sell-through:
- reorder suggestions with reasons ("4 patients due in 7 days, 1 strip left"),
- the **dead-stock guard** blocks reordering a drug that expired unsold in the last 90 days unless overridden,
- approved lines become **one WhatsApp order per wholesaler**,
- the next delivery bill is checked by F2, closing the loop.

### F6. Inspector Mode
A drug inspector walks in. One click:
- **compliance score** with what is missing (H1 rows without prescriber address, licence expiring, expired stock not segregated),
- **inspection pack PDF**: shop licences, H1 register (3 years), purchase bills index, expired-stock register, return slips,
- licence and pharmacist-registration renewal reminders.

**How the six connect:** F4 and F5 create demand and orders, F2 checks what arrives, F3 recovers what expires, F6 proves it was all legal, and F1 runs the whole loop from one plan.

---

## 5. Agent design

- **Model:** Gemini Flash with function calling and strict JSON schemas. Tools are typed server functions; the model never writes SQL that runs unchecked.
- **Read tools:** `query_inventory`, `expiry_buckets`, `credit_status`, `refills_due`, `h1_entries`, `price_history`, `compliance_check`.
- **Write tools (always proposed, never direct):** `draft_return_slip`, `draft_reorder`, `draft_whatsapp`, `mark_settled`, `create_h1_entry`, `enroll_refill`.
- **Validation layer** (deterministic code): totals, quantities, consent, role, duplicates. Rejected proposals show why.
- **Approval:** owner/pharmacist role required for anything sent or written.
- **Prompt-injection guard:** text from bills, prescriptions and WhatsApp replies is wrapped as data; the webhook accepts only known intents (YES/NO/STOP).
- **Cost and latency** per agent run are logged; the agent says when it is offline.

---

## 6. Data model

The spec's five tables, plus:

| Table | Why |
|---|---|
| `shop_members` | multi-user RLS with roles |
| `wholesalers` | name, licence 20B/21B, phone, return window days, credit % |
| `purchase_bills` + `purchase_lines` | the scanned bill, its image, confidence per field (F2) |
| `orders` + `order_lines` | reorders sent (F5), matched against bills (F2) |
| `agent_tasks` | proposed/approved/executed/verified/failed, with reason |
| `audit_events` | who did what, inputs, outputs, evidence link |
| `consent_log` | DPDP: patient, purpose, channel, given_at, withdrawn_at |
| `drug_master` | name, salt, strength, schedule (H, H1, X), for matching and alternatives |

Realtime on: `inventory_batches`, `credit_notes`, `chronic_patients`, `agent_tasks`, `purchase_bills`.
Storage: private buckets for bills and prescriptions, signed URLs only.

---

## 7. Design (PoshanSetu + ReachGrid design system)

Use the system's **ReachGrid Workspace** surface, theme `reachgrid` (light) with `reachgrid-dark`, because a counter PC needs dense, docked panels:
- **AppBar** with the live KPI strip; **navigator** panel for sections; **Inspector** panel for the selected batch, bill or patient; sticky statusbar showing sync state, demo mode and the WhatsApp lane.
- Bill Scanner and Delivery Verifier use **SplitCompare**; tables use **DataTable** with **Sparkline**; numbers use **Stat** with tabular numerals and Indian grouping (₹ 4,820, ₹ 1.2 L).
- **Evidence tags** on every value: `obs` (typed or confirmed), `der` (computed), `imp` (read by OCR, with confidence), `syn` (demo data).
- Desktop-OS moments for the stage: **BootScreen** on load, **Toast** for the live YES reply, **Modal** for approvals, **TourSpotlight** for a guided jury tour.
- Square, 2px ink borders, hard offset shadows, `hot` only for the single call to action and focus. Inter Tight for display, IBM Plex Mono for data and controls, Noto Sans Devanagari for Hindi. No emoji, UI glyphs only.
- Reserved status colours stay reserved: expiry urgency uses `bad`/`warn`/`good` with text labels, never colour alone.

---

## 8. Build order

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** | Next.js app, design system CSS ported, Supabase schema + RLS + seed, Demo mode adapters | app runs locally with synthetic data, no keys |
| **1. MVP** | Bill Scanner, Expiry Radar, return slip PDF, credit notes, refills + webhook, H1 CSV, 08:00 job, voice search | the spec's demo runs end to end, live and in Demo mode |
| **2. Agent** | F1: tools, tasks, approval inbox, audit timeline, morning plan | "return the three batches" works by voice, with approval |
| **3. Money** | F3 Money-Back, F2 Delivery Verifier | ₹ recovered and ₹ mismatches shown on Today |
| **4. Counter** | F4 Rx to Register, F5 Committed-Demand Reorder | Rx scan fills H1; refills drive a WhatsApp order |
| **5. Trust** | F6 Inspector Mode, tests, deploy | inspection pack PDF; CI green; live URL |

**Tests:** Vitest for all deterministic maths (expiry buckets, return windows, credit totals, H1 CSV, reorder quantities, RLS policies); Playwright for the stage flow in Demo mode, run in CI on every push.

**Repo layout:** `apps/rxmunshi` (Next.js), `supabase/` (migrations, seed, functions), `packages/core` (pure business logic + tests), `docs/`.

---

## 9. What I need from you

- **Accounts/keys** (only for live mode; Demo mode needs none): Supabase project, Gemini API key, Vercel project, Meta WhatsApp Business number (optional at first).
- **Real data to test on:** 10 wholesaler bills and 5 prescriptions (with patient details removed), and your wholesalers' actual return windows and credit %.
- **The event date**, so I can cut scope if needed.

## 10. Risks

| Risk | Mitigation |
|---|---|
| OCR misreads a batch or expiry | confidence per field, low-confidence cells highlighted, nothing saved without confirmation |
| WhatsApp template approval delays | wa.me lane plus simulated YES; UI labels which lane ran |
| Regulatory misstep | no selling, no retail-to-retail listings, substitution is decision support only, consent before any patient message |
| Stage Wi-Fi | Demo mode with fixtures; the whole demo also runs from `localhost` |
| Scope | phases are cut-lines: phase 1 alone is a complete demo |
