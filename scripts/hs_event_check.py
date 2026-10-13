import sys
sys.stdout.reconfigure(encoding="utf-8")
from hs_common import call
props = "firstname,lastname,jobtitle,company,country,job_function,seniority,company_industry,company_size_band,icp_tier,icp_score,region,hubspot_owner_id,lifecyclestage,dedupe_status,data_completeness_before_pct,data_completeness_pct,enrichment_source,icp_reason".split(",")
s, d = call("POST", "/crm/v3/objects/contacts/search", {"limit": 100, "properties": props,
    "filterGroups": [{"filters": [{"propertyName": "event_name", "operator": "EQ", "value": (sys.argv[2] if len(sys.argv) > 2 else "Darwinbox Cortex and the AI-Native Era of HCM")}]}]})
res = d.get("results", [])
print("contacts:", d.get("total"), "| enriched:", sum(1 for r in res if r["properties"].get("icp_tier") or r["properties"].get("job_function")))
for r in res[: int(sys.argv[1]) if len(sys.argv) > 1 else 100]:
    p = r["properties"]
    print(f"\n{p['firstname']} {p['lastname']} | {p['company']} | dedupe {p['dedupe_status']} | {p['data_completeness_before_pct']}% -> {p['data_completeness_pct']}%")
    print(f"  {p['job_function']} | {p['seniority']} | {p['company_industry']} | {p['company_size_band']} | {p['country']} | {p['region']} | tier {p['icp_tier']} {p['icp_score']} | owner {p['hubspot_owner_id']} | {p['lifecyclestage']} | src {p['enrichment_source']}")
    if p.get("icp_reason"): print("  ", p["icp_reason"][:170])
