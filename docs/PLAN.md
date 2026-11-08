# DukaanOS plan

## 1. Rating of the idea

**7.5 / 10 as first written; 9 / 10 with the sharpened wedge below.**

### Strengths
- A real problem in a very large market: India has roughly 12 million kirana stores (the commonly cited figure), most run on memory, a notebook and the distributor's salesman.
- Strong fit with the judging criteria: product potential, market viability, technical architecture and depth of Google AI.
- The Daily Autopilot is a memorable, demoable hook.
- Built for low-end phones, Indian languages and voice: AI that is useful to people enterprise software ignores.
- The founder has already shipped an agentic, safety-first product (Saathi: MCP server, approval-gated actions, OpenSSF Best Practices Silver).

### Weaknesses and how we fix them
| Risk | Fix |
|---|---|
| **Data cold start**: most kiranas have no digital sales or stock records, so forecasting has nothing to learn from. | Make capture the front door: bill photos (Gemini vision + Document AI), Hinglish voice entry, Google Sheets import. Plans work from day one using recorded purchases and stated sales. |
| **No supplier APIs**: distributors take orders on WhatsApp, phone or in person. | Execute honestly: after approval, send a pre-filled WhatsApp order (no integration needed). Never claim an order was placed without confirmation. Verify by reading the delivered bill. |
| **Too wide**: six pillars in two days. | Build one loop end to end (capture, plan, approve, execute, verify). Show the rest as roadmap. |
| **Crowded neighbours**: Khatabook, OkCredit (ledgers), Vyapar (billing and inventory), Udaan and Jumbotail (B2B supply). | One-line difference: they record, DukaanOS acts, with approval and verification. |
| **Name**: "Dukaan" is an existing Indian startup brand (mydukaan.io). | Keep DukaanOS as the working name; choose a distinct brand before launch. |
| **Event rules**: the City Buildathon is "idea on day one, working product on day two" for a new product idea. | Before 20 November prepare only what the rules allow (documents, design, accounts, demo data, prompts). Confirm with the organisers (Hack2skill) or the FAQ. |

## 2. The wedge

> DukaanOS turns a kirana's bills, voice notes and WhatsApp into a morning plan, then does the approved work: it drafts the order, sends it to the distributor, and checks the delivery against the bill.

## 3. The full vision (six pillars)

1. **Store intelligence**: answers from the shop's own records, never guesses.
2. **Procurement**: shortages, supplier comparison, order drafts, delivery tracking. Owner approval before any order.
3. **Money intelligence**: recorded cash flow, upcoming expenses, budget scenarios; actuals always separated from estimates.
4. **Multimodal input**: bills, shelf photos, voice, spreadsheets, Indian languages, converted into reviewable records.
5. **Growth**: slow movers, patterns, customer outreach drafts for approval.
6. **Personal business agent**: remembers approved preferences, follows up, daily briefing; proactive when useful, quiet when not.

## 4. Scope

| Feature | When |
|---|---|
| Bill photo capture and Hinglish voice entry | Buildathon (MVP) |
| Daily Autopilot: budget-aware morning plan | Buildathon (MVP) |
| Approval inbox with edit and reject | Buildathon (MVP) |
| WhatsApp order to distributor after approval | Buildathon (MVP) |
| Delivery verification against the delivered bill | Buildathon (MVP) |
| Audit timeline: what the agent did and why | Buildathon (MVP) |
| Natural-language questions over the records | Buildathon (MVP) |
| Demand forecasting with TimesFM in BigQuery | Finale |
| Offer posters with Nano Banana for customer outreach | Finale |
| Voice conversation with Gemini Live on capable phones | Finale |
| Supplier reliability and price history | Next |
| Cash-flow planning | Next |
| Photo-assisted shelf counts (suggestions only, never silent overwrites) | Next |
| Multi-store view, integrations marketplace, deeper offline work | Later |

## 5. Devices

One installable web app (PWA), three layouts:
- **Compact** (a Rs 5,000 Android phone): large buttons, small bundles, cached records, offline entry with a visible sync queue, text first, voice optional.
- **Standard** (a good phone): voice, camera capture, approval notifications.
- **Command centre** (tablet or laptop): tables, bulk import and export, side-by-side bill and order review, full audit log.

Offline: entry, records and deterministic maths work without internet; AI planning and sending need a connection, and the app says so.

## 6. Timeline

| When | What |
|---|---|
| By 13 Nov | Application: idea, solution, architecture, pitch deck ([APPLICATION.md](APPLICATION.md)) |
| By 18 Nov | Selection results. Meanwhile: Google Cloud and Firebase projects, prompts in AI Studio, demo dataset (a fictional shop with 90 days of sales and realistic distributor bills), screen designs, demo script |
| 20-21 Nov | City Buildathon: build the five-step loop ([DEMO.md](DEMO.md)) |
| 23, 25, 27 Nov | Regional Showcase: forecasting and traction story |
| 2 Dec | Grand Finale, Google Bengaluru |

## 7. Non-negotiables

- Gemini proposes; code does all money arithmetic, budgets, stock maths and permissions.
- Every action is a task: proposed, approved, executed, verified (or failed, with a reason).
- No fake actions: if there is no confirmation, it is a draft.
- Text on bills and messages is data, never instructions.
- Each shop's data is separate (Firebase Security Rules), and the owner can export or delete it.
- Zero AWS. Everything runs on Google Cloud and Firebase.
