"""Create the property group + custom properties used by all 4 modules. Safe to re-run."""
from hs_common import call

GROUP = "post_event_ai"

def opts(*labels):
    return [{"label": l, "value": l.lower().replace(" ", "_").replace("-", "_").replace("+", "plus"), "displayOrder": i}
            for i, l in enumerate(labels)]

def text(name, label, desc=""):    return dict(name=name, label=label, type="string", fieldType="text", description=desc)
def area(name, label, desc=""):    return dict(name=name, label=label, type="string", fieldType="textarea", description=desc)
def num(name, label, desc=""):     return dict(name=name, label=label, type="number", fieldType="number", description=desc)
def date(name, label, desc=""):    return dict(name=name, label=label, type="datetime", fieldType="date", description=desc)
def enum(name, label, options, desc=""):
    return dict(name=name, label=label, type="enumeration", fieldType="select", options=options, description=desc)

CONTACT = [
    text("event_name", "Event name", "Webinar/event this contact registered for"),
    enum("event_attendance_status", "Event attendance status", opts("Attended", "No show", "Speaker")),
    num("time_in_session_min", "Time in session (min)"),
    num("questions_asked", "Questions asked"),
    enum("job_function", "Job function", opts("HR", "HRIS", "Talent Acquisition", "L&D", "Finance", "IT", "Operations", "Leadership", "Other")),
    enum("seniority", "Seniority", opts("C-level", "VP", "Director", "Manager", "IC")),
    enum("icp_tier", "ICP tier", opts("A", "B", "C")),
    num("icp_score", "ICP score", "0-100 from the ICP rubric"),
    area("icp_reason", "ICP reason", "One-line AI explanation of the score"),
    enum("region", "Region", opts("India", "SEA", "MEA", "NA", "RoW")),
    area("inferred_fields", "Inferred fields", "JSON: fields the AI inferred, with confidence"),
    text("enrichment_source", "Enrichment source", "clay / llm / hubspot / input"),
    num("data_completeness_pct", "Data completeness %"),
    enum("dedupe_status", "Dedupe status", opts("New", "Merged", "Needs review")),
    num("interest_score", "Interest score"),
    num("email_opens", "Post-event email opens"),
    num("email_clicks", "Post-event email clicks"),
    num("page_views", "Page views (post-event)"),
    num("form_fills", "Form fills (post-event)"),
    date("last_engaged_at", "Last engaged at"),
    area("lifecycle_history", "Lifecycle history", "JSON list of {stage, date}"),
    text("postevent_email_variant", "Post-event email variant"),
    text("utm_campaign_postevent", "Post-event UTM campaign"),
    text("company_industry", "Company industry", "Copied from the associated company for reporting"),
    text("company_size_band", "Company size band"),
    num("data_completeness_before_pct", "Data completeness before enrichment %"),
    area("fields_missing_before", "Fields missing before enrichment", "JSON list"),
    area("dedupe_reason", "Dedupe reason"),
    num("match_confidence", "Dedupe match confidence"),
    area("icp_breakdown", "ICP score breakdown", "JSON: points per rubric line"),
    text("m1_run_id", "M1 run id"),
    text("pe_subject", "Post-event email subject (personalised)"),
    area("pe_opening_line", "Post-event opening line (persona)"),
    area("pe_industry_line", "Post-event industry line"),
    text("pe_recording_url", "Post-event recording link (UTM)"),
    text("pe_cta_url", "Post-event CTA link (UTM)"),
    area("pe_speaker_snapshot", "Speaker performance snapshot"),
    area("pe_speaker_quote", "Speaker best quote"),
    date("pe_sent_at", "Post-event email sent at"),
    area("engagement_log", "Engagement log", "JSON list of {d: date, t: open|click|page_view|form_fill, s: source}"),
    text("engagement_source", "Engagement data source", "live or seeded_demo"),
]
COMPANY = [
    enum("employee_band", "Employee band", opts("1-199", "200-499", "500-999", "1000-4999", "5000+")),
    text("industry_normalised", "Industry (normalised)"),
    text("hq_country", "HQ country"),
    enum("icp_tier", "ICP tier", opts("A", "B", "C")),
    text("enrichment_source", "Enrichment source"),
]

for obj, props in (("contacts", CONTACT), ("companies", COMPANY)):
    s, d = call("POST", f"/crm/v3/properties/{obj}/groups", {"name": GROUP, "label": "Post-Event AI", "displayOrder": -1})
    print(obj, "group:", "created" if s == 201 else ("exists" if s == 409 else (s, d)))
    for p in props:
        p["groupName"] = GROUP
        s, d = call("POST", f"/crm/v3/properties/{obj}", p)
        print(f"  {p['name']:28}", "created" if s == 201 else ("exists" if s == 409 else (s, d)))
