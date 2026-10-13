"""Seed 30 days of engagement + lifecycle history for the event contacts (the event was yesterday, so real
history doesn't exist yet). Everything written here is tagged engagement_source = seeded_demo.

Deterministic. Plants 3 patterns for M4's anomaly detection:
  1. Buying-committee surge: 3 people from one account all active on the same day after the event
  2. Silent Tier-A MQL: a top-fit attendee with zero engagement since the event
  3. No-show with high intent: a no-show who is browsing pricing and filled a form
A few contacts who requested a demo move to SQL.
"""
import csv, json, random, sys, pathlib
from datetime import datetime, timedelta, date
from hs_common import call

sys.stdout.reconfigure(encoding="utf-8")
random.seed(7)
EVENT = "Darwinbox Cortex and the AI-Native Era of HCM"
EVENT_DAY = date(2026, 10, 12)
TODAY = date(2026, 10, 13)
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

SURGE = {"Kavya Reddy", "Sanjay Rao", "Tanya Bhatia"}            # Swiggy buying committee
SILENT = {"Omar Haddad"}                                         # Tier-A MQL gone quiet
NOSHOW_INTENT = {"Yousef Al-Harbi"}                              # no-show browsing pricing
SQL = {"Kavya Reddy", "Sneha Kulkarni", "Wei Ling Tan"}          # requested a demo after the event

# registration dates from the Zoom export (email -> date)
reg = {}
for r in csv.DictReader(open(DATA / "registrants_zoom_export.csv", encoding="utf-8")):
    try:
        reg[r["Email"].lower()] = datetime.strptime(r["Registration Time"], "%m/%d/%Y %I:%M:%S %p").date()
    except ValueError:
        pass

props = ["firstname", "lastname", "email", "event_attendance_status", "icp_tier", "lifecyclestage", "time_in_session_min", "createdate"]
s, d = call("POST", "/crm/v3/objects/contacts/search", {"limit": 200, "properties": props,
    "filterGroups": [{"filters": [{"propertyName": "event_name", "operator": "EQ", "value": EVENT}]}]})
contacts = d["results"]
print("event contacts:", len(contacts))

def ev(day, t, src):
    return {"d": day.isoformat(), "t": t, "s": src}

updates = []
for c in contacts:
    p = c["properties"]; name = f"{p['firstname']} {p['lastname']}"
    status, tier = p["event_attendance_status"], (p["icp_tier"] or "c")
    if status == "speaker":
        continue
    r_day = reg.get((p["email"] or "").lower(), EVENT_DAY - timedelta(days=random.randint(3, 25)))
    log = [ev(r_day, "page_view", "event registration page"), ev(r_day, "form_fill", "webinar registration form")]
    # pre-event emails: invite opens + reminder
    for k in range(random.randint(0, 2)):
        dday = r_day + timedelta(days=random.randint(0, max(0, (EVENT_DAY - r_day).days)))
        log.append(ev(min(dday, EVENT_DAY), "open", "webinar reminder email"))
    if random.random() < 0.5:
        log.append(ev(EVENT_DAY - timedelta(days=1), "open", "webinar reminder email"))
    # post-event engagement (12-13 Oct), weighted by tier and attendance
    weight = {"a": 1.0, "b": 0.6, "c": 0.3}.get(tier, 0.3) * (1.0 if status == "attended" else 0.45)
    post_days = [EVENT_DAY, TODAY]
    if name not in SILENT:
        if random.random() < 0.85 * weight + 0.1:
            log.append(ev(random.choice(post_days), "open", "post-event email"))
        if random.random() < 0.55 * weight:
            log.append(ev(TODAY, "click", "post-event email: recording link"))
        for _ in range(int(random.random() * 3 * weight)):
            log.append(ev(TODAY, "page_view", random.choice(["recording page", "Cortex product page", "pricing page"])))
    if name in SURGE:
        log += [ev(TODAY, "click", "post-event email: recording link"), ev(TODAY, "page_view", "pricing page"),
                ev(TODAY, "page_view", "Cortex product page"), ev(TODAY, "page_view", "customer stories page")]
    if name in NOSHOW_INTENT:
        log += [ev(TODAY, "open", "post-event email"), ev(TODAY, "click", "post-event email: recording link"),
                ev(TODAY, "page_view", "recording page"), ev(TODAY, "page_view", "pricing page"),
                ev(TODAY, "page_view", "pricing page"), ev(TODAY, "form_fill", "pricing enquiry form")]
    if name in SQL:
        log.append(ev(TODAY, "form_fill", "demo request form"))
    log.sort(key=lambda e: e["d"])

    # lifecycle history: older CRM contacts were subscribers before registering
    created = datetime.fromisoformat(p["createdate"].replace("Z", "+00:00")).date()
    hist = []
    if created < r_day - timedelta(days=1) or p["lifecyclestage"] in ("subscriber",):
        hist.append({"stage": "subscriber", "date": (r_day - timedelta(days=random.randint(20, 60))).isoformat()})
    hist.append({"stage": "lead", "date": r_day.isoformat()})
    stage = p["lifecyclestage"]
    if stage in ("marketingqualifiedlead", "salesqualifiedlead") or name in SQL:
        hist.append({"stage": "marketingqualifiedlead", "date": EVENT_DAY.isoformat()})
    new_props = {}
    if name in SQL:
        hist.append({"stage": "salesqualifiedlead", "date": TODAY.isoformat()})
        new_props["lifecyclestage"] = "salesqualifiedlead"

    count = lambda t: sum(1 for e in log if e["t"] == t)
    new_props.update({
        "engagement_log": json.dumps(log), "engagement_source": "seeded_demo",
        "email_opens": count("open"), "email_clicks": count("click"),
        "page_views": count("page_view"), "form_fills": count("form_fill"),
        "last_engaged_at": f"{log[-1]['d']}T12:00:00Z",
        "lifecycle_history": json.dumps(hist),
    })
    updates.append({"id": c["id"], "properties": new_props})

for i in range(0, len(updates), 100):
    s, r = call("POST", "/crm/v3/objects/contacts/batch/update", {"inputs": updates[i:i + 100]})
    print("batch update:", s, "" if s in (200, 207) else r)
print("seeded:", len(updates), "| SQL:", ", ".join(sorted(SQL)), "| surge:", ", ".join(sorted(SURGE)), "| silent:", ", ".join(SILENT), "| no-show intent:", ", ".join(NOSHOW_INTENT))
