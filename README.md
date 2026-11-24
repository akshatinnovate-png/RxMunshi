# DukaanOS

**An AI operating system for India's kirana stores.**

DukaanOS turns a shop's bills, voice notes and WhatsApp into a morning plan, then does the approved work: it drafts the order, sends it to the distributor, and checks the delivery against the bill.

> They record. **DukaanOS acts.**

Built entirely on Google AI and Google Cloud (Gemini, ADK, Firebase, Cloud Run, BigQuery and more), for the Google Cloud Startup Buildathon India 2026.

## RxMunshi (pharmacy app)

The working app is in [apps/rxmunshi](apps/rxmunshi): see its README. Plan: [docs/RXMUNSHI_PLAN.md](docs/RXMUNSHI_PLAN.md).

## Status

Planning. Product code is written during the City Buildathon (20-21 November 2026), within the event rules.

| Document | What it holds |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Rating of the idea, the wedge, scope, timeline and risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The Google-native architecture and the agent's control loop |
| [docs/APPLICATION.md](docs/APPLICATION.md) | Draft answers for the buildathon application (due 13 November) |
| [docs/DEMO.md](docs/DEMO.md) | The five-step demo and the build-day schedule |

## The loop

1. **Capture**: photograph a distributor bill; say *"aaj 12 Maggi, 6 Parle-G becha"*.
2. **Plan**: every morning, a budget-aware action plan.
3. **Approve**: the owner approves, edits or rejects each line.
4. **Execute**: the order goes to the distributor on WhatsApp, only after approval.
5. **Verify**: photograph the delivered bill; DukaanOS finds what differs and updates the records.

The model proposes. The backend validates. The owner authorises. The system verifies.
