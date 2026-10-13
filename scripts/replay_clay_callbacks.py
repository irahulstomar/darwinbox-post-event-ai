"""Re-run M1 lane 2 for every event contact without spending Clay credits:
rebuild the Clay callback payload from the company already stored in HubSpot and POST it to the n8n webhook.
Only Clay-sourced company facts are replayed; anything the LLM had estimated is left blank so it is re-inferred."""
import json, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from env import ENV
from hs_common import call
EVENT = sys.argv[1] if len(sys.argv) > 1 else "Darwinbox Cortex and the AI-Native Era of HCM"
URL = ENV["N8N_BASE_URL"] + "/webhook/clay-enriched-" + ENV["CLAY_CALLBACK_SECRET"]
s, d = call("POST", "/crm/v3/objects/contacts/search", {"limit": 200, "properties": ["firstname", "lastname"],
    "filterGroups": [{"filters": [{"propertyName": "event_name", "operator": "EQ", "value": EVENT}]}]})
for i, r in enumerate(d["results"], 1):
    s, c = call("GET", f"/crm/v3/objects/contacts/{r['id']}/associations/companies")
    co = {}
    if s == 200 and c.get("results"):
        cid = c["results"][0]["toObjectId"] if "toObjectId" in c["results"][0] else c["results"][0]["id"]
        s, cd = call("GET", f"/crm/v3/objects/companies/{cid}?properties=name,domain,numberofemployees,industry_normalised,hq_country,linkedin_company_page,description,enrichment_source")
        co = cd.get("properties", {}) if s == 200 else {}
    from_clay = co.get("enrichment_source") == "clay"
    payload = {"row_id": r["id"], "final_domain": co.get("domain") or "", "company_name": co.get("name") or "",
               "employee_count": (co.get("numberofemployees") or "") if from_clay else "",
               "industry": (co.get("industry_normalised") or "") if from_clay else "",
               "hq_country": co.get("hq_country") or "", "linkedin_url": co.get("linkedin_company_page") or "",
               "description": (co.get("description") or "")[:500]}
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "replay/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(f"{i:2} {r['properties']['firstname']} {r['properties']['lastname']}: {resp.status} {'clay' if from_clay else 'llm-refill'}")
    time.sleep(0.6)
