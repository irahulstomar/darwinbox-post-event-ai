"""Load the pre-event CRM contacts (and their companies) into HubSpot. Safe to re-run: upserts by email/domain."""
import json, pathlib
from hs_common import call

OWNERS = {"senior": "169348475", "india": "169348477", "sea": "169348476"}
DOMAINS = {"Infosys Limited": "infosys.com", "Tata Steel Limited": "tatasteel.com", "Wipro": "wipro.com", "HDFC Bank": "hdfcbank.com",
           "Swiggy": "swiggy.com", "Nykaa E-Retail": "nykaa.com", "Globe Telecom Inc": "globe.com.ph", "Majid Al Futtaim Holding": "majidalfuttaim.com",
           "Orion Innovation": "orioninc.com", "JSW Steel Ltd": "jsw.in", "Dr Reddys": "drreddys.com", "GoTo": "gotocompany.com",
           "Asian Paints": "asianpaints.com", "Emirates NBD Bank": "emiratesnbd.com"}

contacts = json.loads((pathlib.Path(__file__).resolve().parent.parent / "data" / "hubspot_existing_contacts.json").read_text(encoding="utf-8"))
for c in contacts:
    dom = DOMAINS[c["company"]]
    s, d = call("POST", "/crm/v3/objects/companies/search", {"filterGroups": [{"filters": [{"propertyName": "domain", "operator": "EQ", "value": dom}]}]})
    if d.get("total"):
        cid = d["results"][0]["id"]
    else:
        s, d = call("POST", "/crm/v3/objects/companies", {"properties": {"name": c["company"], "domain": dom}})
        cid = d["id"]
    props = {k: c[k] for k in ("firstname", "lastname", "email", "company", "jobtitle", "lifecyclestage")}
    props["hubspot_owner_id"] = OWNERS[c["owner"]]
    s, d = call("POST", "/crm/v3/objects/contacts", {"properties": props,
        "associations": [{"to": {"id": cid}, "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 1}]}]})
    status = "created" if s == 201 else ("exists" if s == 409 else f"ERR {s} {d}")
    print(f"{c['firstname']} {c['lastname']:10} | {c['company']:26} | {status}")
