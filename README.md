# AI-led Post-Event Content Automation

A working prototype that takes a webinar's registrant list and recording and, with AI as the engine, produces enriched and routed leads, segment follow-up emails, a multi-channel content package and a live lead intelligence dashboard.

**Submission document:** [docs/Rahul_Ranjan_Darwinbox_Post_Event_AI_Prototype.pdf](docs/Rahul_Ranjan_Darwinbox_Post_Event_AI_Prototype.pdf)
The build runs on a self-hosted n8n instance; a live walkthrough is available on request.

## Modules

| Module | What it does | Key tools |
|---|---|---|
| **M1 Lead enrichment** | Cleans a Zoom-style registrant export, dedupes inside the file and against HubSpot (exact + fuzzy), enriches companies with Clay, infers function / seniority / gaps with DeepSeek (each with a confidence), scores ICP fit, assigns region, routes owners and sets lifecycle stage. Data completeness 42% → 99%. | n8n, HubSpot, Clay, DeepSeek |
| **M2 Post-event emails** | Transcribes the recording (Deepgram), extracts takeaways with verbatim quotes, fact-checks them against the transcript, writes three segment emails (attendees, no-shows, speakers) with A/B/C subjects and persona + industry personalisation, and sends them through HubSpot with UTM tracking. | n8n, Deepgram, DeepSeek, HubSpot |
| **M3 Content repurposing** | Builds an 800-1200 word blog, YouTube chapters + description + thumbnail brief, an infographic outline, 5 LinkedIn + 5 X posts and three AI visuals, validates each against hard rules in code, and saves everything to a per-event Google Drive folder as formatted Google Docs with a QA report. | n8n, Deepgram, DeepSeek, Gemini 3 Pro Image, Google Drive |
| **M4 Lead intelligence** | Live dashboard from HubSpot: attendee-to-MQL funnel, stage movement over 7/14/30 days, top accounts and buying committees, interest scores (formula + AI adjustment with reasons), statistical anomaly candidates judged by AI, and an AI narrative regenerated on every load. | n8n, HubSpot, DeepSeek, HTML + Chart.js |
| **Hub + master** | One page served by n8n with a page per module, and a master workflow that runs M1 → (wait for enrichment) → M3 → M2 from one form. | n8n |

## Repository layout

```
n8n/workflows/        Importable n8n workflows (credentials and secrets stripped; placeholders where needed)
n8n/m1 m2 m3 hub/     Source of every Code node (the workflows embed these)
n8n/build_workflows.py  Assembles the workflow JSON from the code files
scripts/              HubSpot setup: custom properties, seed CRM contacts, seed engagement history, replay enrichment
tests/                Local harnesses that run the Code nodes against real APIs (no sending)
data/                 Synthetic registrant export (real companies, fake people, .example.com emails) and CRM seed
docs/                 Submission PDF, its HTML source and screenshots
```

## Setup

1. Copy `.env.example` to `.env` and fill in your own keys.
2. `python scripts/hs_create_properties.py` creates the HubSpot custom properties; `python scripts/hs_seed_existing.py` loads the demo CRM contacts.
3. In n8n, import the files in `n8n/workflows/`, then select credentials in each node:
   HubSpot App Token, DeepSeek (Header Auth `Authorization: Bearer ...`), Deepgram (Header Auth `Authorization: Token ...`),
   Clay webhook (Header Auth `x-clay-webhook-auth`), Google Drive OAuth2, Google OAuth2 (scope `cloud-platform`, for Gemini images).
4. Replace the placeholders in the workflows: `PASTE_CLAY_WEBHOOK_URL`, the Clay callback path `clay-enriched-SECRET`, `YOUR_GCP_PROJECT`, and the form URLs in the hub page.

## Data and honesty notes

- The webinar is a real public conversation (OutSail with Jayant Paleti, co-founder of Darwinbox). Its transcript is not included in this repository; generate it from the recording with Deepgram.
- Registrants, CRM contacts and the 30-day engagement history are synthetic and labelled as such. No demo address can receive mail.
- HubSpot developer test accounts deliver marketing email only to account users; other sends are logged as dropped.
- The master workflow is built and wired; the individual modules are tested end to end.
