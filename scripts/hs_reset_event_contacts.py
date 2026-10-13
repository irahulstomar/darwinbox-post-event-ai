"""Delete every contact tagged with an event (from M1 test runs), then re-seed the 14 pre-existing CRM contacts.
Companies are kept (they are real-company records and get re-used by domain)."""
import subprocess, sys
from hs_common import call
s, d = call("POST", "/crm/v3/objects/contacts/search", {"limit": 200, "properties": ["firstname", "lastname", "event_name"],
    "filterGroups": [{"filters": [{"propertyName": "event_name", "operator": "HAS_PROPERTY"}]}]})
ids = [r["id"] for r in d.get("results", [])]
print("deleting", len(ids), "event contacts:", ", ".join(f"{r['properties']['firstname']} {r['properties']['lastname']}" for r in d.get("results", [])))
for i in range(0, len(ids), 100):
    print(" batch archive:", call("POST", "/crm/v3/objects/contacts/batch/archive", {"inputs": [{"id": x} for x in ids[i:i + 100]]})[0])
subprocess.run([sys.executable, "hs_seed_existing.py"], check=True)
