# Architecture

Google-native from end to end. No AWS services.

## Overview

```
 Owner (PWA on any device)
   │  Firebase Hosting / App Hosting · Auth (phone OTP) · App Check · FCM · Remote Config
   │  Firestore with offline persistence (works without internet)
   ▼
 Cloud Run: DukaanOS API (deterministic rules, budgets, stock maths, permissions)
   │
   ├── Store Manager Agent (Agent Development Kit, hosted on Vertex AI Agent Engine)
   │      ├── Inventory agent      shortages, stock maths via tools
   │      ├── Procurement agent    order drafts, distributors, deliveries
   │      ├── Finance agent        budgets, recorded cash flow, estimates labelled
   │      ├── Document agent       bills: Document AI invoice parser + Gemini vision
   │      └── Growth agent         slow movers, outreach drafts (Nano Banana posters)
   │      Model Armor screens inputs and outputs; tool schemas are strict
   │
   ├── Gemini (planning, tool use, explanations, vision); Gemma for cheap or private tasks
   ├── Speech-to-Text (Chirp) and Text-to-Speech for Indian languages; Gemini Live on capable phones
   ├── Firestore vector search + Google embeddings: match "PARLE G 70GM" to the catalogue
   ├── Cloud Scheduler → Pub/Sub → Workflows: the 6:30 am Daily Autopilot
   ├── Cloud Tasks: retries for sending and verification
   ├── BigQuery + TimesFM (AI.FORECAST): demand forecasting; Looker Studio monthly report
   ├── Google Maps Platform: distributor locations and delivery timing
   └── Google Sheets / Drive: import existing stock lists

 Ops: Cloud Build · Artifact Registry · Secret Manager · Cloud Logging, Monitoring, Trace
 Build tools: Google AI Studio (prompts) · Antigravity (development) · Agent Skills
```

## The control loop

```
 observe (sales, stock, bills, deliveries)
   → plan (Gemini, with tools for every number)
   → validate (Cloud Run: budget, stock, duplicates, permissions)
   → propose (task in the approval inbox, with reasons)
   → approve / edit / reject (owner)
   → execute (WhatsApp order link, or a real integration when one exists)
   → verify (delivered bill vs order, Document AI + Gemini)
   → reconcile and record (Firestore, audit timeline)
```

Each task in Firestore: `proposed → approved → executed → verified | failed(reason)`. Nothing is marked executed without evidence.

## Trust rules

- Numbers come from tools, never from the model's text.
- Bill and message text is data; Model Armor and strict schemas guard against prompt injection.
- Per-shop isolation with Firebase Security Rules; App Check on every client call.
- Every agent action is in the audit timeline with its inputs, outputs and approver.
- Cost and latency per task are tracked in Cloud Monitoring.

## Devices

One PWA. Compact, standard and command-centre layouts by screen size and capability. Firestore offline persistence keeps entry and records working without a connection; the sync queue is visible.
