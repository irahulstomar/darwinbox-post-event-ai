import json, os, sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
_env = {}
for line in open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8-sig"):
    if "=" in line:
        k, v = line.strip().split("=", 1); _env[k.strip()] = v.strip().strip('"')
TOKEN = _env["HUBSPOT_TOKEN"]

def call(method, path, body=None):
    req = urllib.request.Request("https://api.hubapi.com" + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
