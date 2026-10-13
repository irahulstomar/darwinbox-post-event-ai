import json, os, sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
env = {}
for line in open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8-sig"):
    if "=" in line:
        k, v = line.strip().split("=", 1); env[k.strip()] = v.strip().strip('"')
tok = env["HUBSPOT_TOKEN"]
def call(method, path, body=None):
    req = urllib.request.Request("https://api.hubapi.com" + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:300]
s, d = call("GET", "/account-info/v3/details"); print("account:", s, d if s != 200 else {k: d.get(k) for k in ("portalId","accountType","timeZone","companyCurrency","dataHostingLocation")})
s, d = call("POST", "/oauth/v2/private-apps/get/access-token-info", {"tokenKey": tok}); print("scopes:", s, sorted(d.get("scopes", [])) if s == 200 else d)
s, d = call("GET", "/crm/v3/owners?limit=100"); print("owners:", s)
if s == 200:
    for o in d["results"]: print("  ", o["id"], o.get("firstName"), o.get("lastName"), "archived" if o.get("archived") else "")
s, d = call("GET", "/crm/v3/objects/contacts?limit=5&properties=firstname,lastname"); print("contacts:", s, [ (c["properties"].get("firstname"), c["properties"].get("lastname")) for c in d["results"]] if s == 200 else d)
s, d = call("GET", "/crm/v3/objects/companies?limit=5&properties=name"); print("companies:", s, [c["properties"].get("name") for c in d["results"]] if s == 200 else d)
