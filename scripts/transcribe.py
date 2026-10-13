"""Send the webinar audio to Deepgram nova-3 and save raw JSON + a clean [mm:ss] Speaker N: text transcript."""
import json, sys, urllib.request, pathlib
sys.stdout.reconfigure(encoding="utf-8")
from env import ENV
rec = pathlib.Path(__file__).resolve().parent.parent / "data" / "recording"
audio = rec / "cortex_webinar.m4a"
url = ("https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&utterances=true"
       "&paragraphs=true&smart_format=true&punctuate=true&language=en"
       + "".join("&keyterm=" + t for t in ("Darwinbox", "Jayant", "Cortex", "OutSail", "HCM", "Brett", "Gartner", "agentic")))
req = urllib.request.Request(url, data=audio.read_bytes(), method="POST",
      headers={"Authorization": "Token " + ENV["DEEPGRAM_API_KEY"], "Content-Type": "audio/mp4"})
with urllib.request.urlopen(req, timeout=600) as r:
    raw = json.loads(r.read())
(rec / "deepgram_raw.json").write_text(json.dumps(raw, indent=1), encoding="utf-8")
ch = raw["results"]["channels"][0]["alternatives"][0]
lines = []
for p in ch["paragraphs"]["paragraphs"]:
    t = int(p["start"]); text = " ".join(s["text"] for s in p["sentences"])
    lines.append(f"[{t//60:02d}:{t%60:02d}] Speaker {p['speaker']}: {text}")
(rec / "transcript.txt").write_text("\n".join(lines), encoding="utf-8")
print("duration_s", raw["metadata"]["duration"], "paragraphs", len(lines), "speakers", sorted({p['speaker'] for p in ch['paragraphs']['paragraphs']}))
print("\n".join(lines[:6]))
