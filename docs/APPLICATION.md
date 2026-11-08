# Application draft (due 13 November 2026)

## Idea (one line)
DukaanOS is an AI operating system for kirana stores: it turns bills, voice notes and WhatsApp into a morning plan, then does the approved work: drafts the order, sends it to the distributor, and checks the delivery against the bill.

## Problem
Around 12 million kirana stores run India's daily retail on memory, notebooks and the distributor's salesman. Owners lose money to stock-outs, over-ordering, billing mismatches and missed deliveries, and existing apps only record what happened; nobody does the work.

## Solution
A proactive agent that works on any phone:
1. Capture: photograph bills, speak sales in Hinglish, import sheets.
2. Plan: a budget-aware morning plan every day.
3. Approve: one tap per line, with edits.
4. Execute: the order goes to the distributor on WhatsApp after approval.
5. Verify: the delivered bill is checked against the order; differences are reported.

## Why now, why Google
Gemini's multimodal and multilingual models make messy inputs (handwritten bills, Hinglish voice) usable for the first time, and agent tooling (ADK, Agent Engine) makes a safe, approval-gated agent practical. The whole stack runs on Google Cloud and Firebase; see ARCHITECTURE.md.

## Market
Kirana stores, then pharmacies, hardware shops and other independent retail. Revenue: a free tier for capture and records; a paid tier for the Autopilot, forecasting and outreach; later, distributor partnerships.

## Differentiation
Ledger and billing apps record; DukaanOS acts, with owner approval and verification, in the owner's language, on a cheap phone.

## Technical architecture
See ARCHITECTURE.md: Gemini + ADK agents on Vertex AI Agent Engine, Cloud Run for deterministic rules, Firestore with offline persistence, Firebase Auth (phone OTP), Document AI, Speech-to-Text, BigQuery with TimesFM, Cloud Scheduler and Workflows.

## Founder
Akshat Sarkar built Saathi, an open source elder-care AI (Alexa+ MCP server, Windows and Android apps, approval-gated agent actions, formal proofs of its security core, OpenSSF Best Practices Silver), and Sahay, a Windows agent that operates a PC and stops scams.

## Pitch deck outline
1. The shopkeeper's morning today
2. The problem in numbers
3. DukaanOS: they record, we act
4. The five-step loop (live demo)
5. Why it is trustworthy (model proposes, code validates, owner authorises, system verifies)
6. Google stack
7. Market and business model
8. Traction plan: shops to pilot with
9. Founder
10. Ask
