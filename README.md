# RxMunshi

An approval-gated AI munshi for Indian pharmacies. It gets expiry money back from wholesalers, fills the Schedule H1 register, brings chronic patients back on WhatsApp (with DPDP consent) and checks every delivery bill. It is B2B software only: it never sells, stocks or delivers medicines.

Design: the PoshanSetu + ReachGrid design system (ReachGrid workspace surface).

Plan: [docs/PLAN.md](docs/PLAN.md).

## Download

| App | File |
|---|---|
| Windows 10/11 (64-bit) | `RxMunshi-Setup-1.0.0.exe`: setup wizard with Start menu and desktop shortcuts |
| Android 5.0+ | `RxMunshi-1.0.0.apk` |

Get them from the [v1.0.0 release](https://github.com/akshatinnovate-png/RxMunshi/releases/tag/v1.0.0). Both run offline in Demo mode. Install steps: [docs/releases/v1.0.0.md](docs/releases/v1.0.0.md).

Build them yourself:

```bash
npm run build:windows   # needs makensis (apt install nsis)
npm run build:android   # needs a JDK and Ubuntu's android-sdk-platform-23, android-sdk-build-tools, apksigner, zipalign, aapt, dalvik-exchange
```

The Android signing key is created at `android/release.keystore` on the first build. Keep it safe: updates must be signed with the same key.

## Run

```bash
npm install
npm run dev          # http://localhost:3000, Demo mode, no keys needed
npm test             # 52 unit tests (core logic, actions, OCR sanitising, webhook signatures)
npm run build && npm start
BASE=http://localhost:3000 npm run e2e   # 13-step stage demo in Chromium
PGUSER=postgres supabase/tests/run.sh    # migrations + RLS tests on local Postgres
```

Copy `.env.example` to `.env.local` to go live: Supabase (data, RLS, Realtime), Gemini (bill/Rx OCR and the Munshi agent), Meta WhatsApp Cloud API. Each one is optional; without it the app falls back (demo store, offline planner and samples, wa.me links).

## What is in it

| Feature | Where |
|---|---|
| Split-screen Bill Scanner (drop, webcam, samples) | `/scan` |
| **F2 Delivery Verifier**: price rise, above MRP, short supply, missing free goods, short-dated, duplicate, not ordered, dead stock, low-confidence reads | `/scan`, `src/core/verify.ts` |
| Expiry Radar with best action per batch, voice filter, return slip PDF, quarantine | `/expiry` |
| **F3 Money-back**: return windows, credit-note chasing at 15/30/45 days, settlement, wholesaler terms | `/returns`, `src/core/returns.ts` |
| Refills with DPDP consent capture, YES/NO/STOP only, live YES banner + chime | `/refills`, `/phone` |
| **F4 Rx to Register**: FEFO matching, same-salt options for the pharmacist, H1 entry at the moment of supply | `/dispense` |
| **F5 Committed-Demand Reorder** with the dead-stock guard, one WhatsApp order per wholesaler | `/reorder` |
| **F6 Inspector Mode**: compliance score, fixes, inspection pack PDF | `/inspector` |
| **F1 Munshi agent**: Hindi/Hinglish/English, voice in and out, typed tools, proposals → approval → execution → audit; Gemini function calling or offline planner | right panel, `/munshi`, `src/core/agent.ts` |
| H1 register CSV/PDF, wholesaler scorecard, append-only audit trail, command palette, jury tour, clock to move days forward, dark theme, data export and delete | |

## Architecture

- `src/core/`: pure business logic, all arithmetic, tested. The model never produces numbers.
- `src/data/`: one `Store` interface: `demoStore` (browser, synced across tabs with BroadcastChannel) and `liveStore` (Supabase + Realtime); `actions.ts` executes approved work and writes audit events.
- `src/app/api/`: Gemini OCR and agent step, WhatsApp send and signed webhook, H1 CSV. Rate-limited; require a signed-in member when Supabase is configured.
- `supabase/`: schema with RLS via `shop_members` roles, DPDP consent trigger, dead-stock trigger, H1 constraints and 3-year retention, append-only audit, Realtime, private storage, the 08:00 IST `pg_cron` job and the `daily-run` Edge Function.
