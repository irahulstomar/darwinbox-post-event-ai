"""One-off n8n workflow: 5 Gemini image samples (2 thumbnail styles, 2 LinkedIn styles, 1 infographic) to pick a look."""
import json, uuid, pathlib

PROJECT = "darwinbox-demo-511422"
URL = f"https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/gemini-3-pro-image:generateContent"

SAMPLES = [
    ("A_thumbnail_editorial_dark", "16:9",
     "YouTube thumbnail, 16:9. Premium minimal editorial design. Left 55 percent: a huge bold white geometric sans-serif headline on two lines "
     "reading exactly \"AI-NATIVE HCM\", and below it a slim rounded teal pill label reading exactly \"Darwinbox Cortex · 4 pillars\". "
     "Right side: one elegant 3D sculpture of four translucent frosted-glass pillars standing on a glossy reflective floor, soft studio lighting, "
     "subtle teal and violet rim light. Background: smooth deep indigo-to-black gradient with fine film grain and lots of negative space. "
     "Apple keynote aesthetic. No other text, no logos, no faces, no brains, no circuit boards, no network lines."),
    ("B_thumbnail_bold_light", "16:9",
     "YouTube thumbnail, 16:9. Bold modern magazine-cover design on a warm off-white background. Left: oversized heavy black sans-serif headline "
     "on two lines reading exactly \"AI-NATIVE HCM\" with the word \"AI-NATIVE\" highlighted by a bright coral underline stroke, and small dark text "
     "below reading exactly \"Darwinbox Cortex, explained\". Right: a playful stack of four chunky rounded 3D blocks in coral, teal, sunflower yellow "
     "and navy forming pillars, soft shadows, clean studio light. Lots of whitespace, high contrast. No other text, no logos, no faces."),
    ("C_linkedin_paper_swiss", "1:1",
     "Square social media visual. Minimal Swiss-style editorial illustration: four tall pillars made of layered paper cut-outs in soft teal, coral, "
     "sand and navy, with gentle realistic paper shadows, arranged asymmetrically on a cream background with generous whitespace. Calm, premium, "
     "modern HR-tech brand feel. No text, no letters, no logos, no people."),
    ("D_linkedin_3d_clay", "1:1",
     "Square social media visual. Soft 3D clay render: a friendly miniature modern office scene seen from above at an isometric angle, with a large "
     "glowing dial (like a volume knob) in the centre labelled with nothing, turning from manual to automatic, small rounded abstract figures "
     "without faces around it. Pastel palette of mint, peach, lavender and cream, soft global illumination, matte textures, playful but professional. "
     "No text, no letters, no logos."),
    ("E_infographic", "4:5",
     "A clean, modern vertical infographic poster, 4:5. Flat vector style, white background, navy text, teal and coral accents, consistent simple "
     "line icons, clear grid, generous spacing, professional corporate-report quality. Spell every piece of text EXACTLY as written below and add no other text.\n"
     "Title at top (large, bold): \"Darwinbox Cortex: The AI-Native HCM Era\"\n"
     "Subtitle: \"7 takeaways from the webinar with Jayant Paleti\"\n"
     "Then 7 numbered cards, each with a small icon, a bold heading and one short line:\n"
     "1. \"HR systems touch everyone\" / \"Employee experience is the design focus\"\n"
     "2. \"Platform first\" / \"60% of a module is inherited from the core\"\n"
     "3. \"AI-assisted is not enough\" / \"Cortex is built AI-native from scratch\"\n"
     "4. \"Four pillars\" / \"Signals · Context graph · Agentic execution · Ubiquity\"\n"
     "5. \"Proactive HR\" / \"Signals trigger playbooks automatically\"\n"
     "6. \"Configure by upload\" / \"The context graph asks 10 clarifying questions\"\n"
     "7. \"Faster implementation\" / \"What took two years can happen in three months\"\n"
     "Footer (small): \"Source: Darwinbox Cortex and the AI-Native Era of HCM, OutSail webinar\""),
]

CODE = "return " + json.dumps([{"json": {"name": n, "aspect": a, "prompt": p}} for n, a, p in SAMPLES]) + ";"
TO_FILE = """const metas = $('Samples').all().map(i => i.json);
const out = [];
for (const [k, it] of $input.all().entries()) {
  const parts = (it.json.candidates && it.json.candidates[0] && it.json.candidates[0].content && it.json.candidates[0].content.parts) || [];
  const img = parts.find(p => p.inlineData);
  if (!img) { out.push({ json: { name: metas[k].name, error: JSON.stringify(it.json).slice(0, 300) } }); continue; }
  const data = await this.helpers.prepareBinaryData(Buffer.from(img.inlineData.data, 'base64'), metas[k].name + '.png', img.inlineData.mimeType || 'image/png');
  out.push({ json: { name: metas[k].name }, binary: { data } });
}
return out;"""

def node(name, type_, pos, params, **extra):
    return {"id": str(uuid.uuid4()), "name": name, "type": type_, "typeVersion": extra.pop("v", 1), "position": pos, "parameters": params, **extra}

wf = {"name": "TEST · Image styles", "settings": {"executionOrder": "v1"}, "pinData": {},
      "nodes": [
          node("Run test", "n8n-nodes-base.manualTrigger", [0, 0], {}),
          node("Samples", "n8n-nodes-base.code", [220, 0], {"jsCode": CODE}, v=2),
          node("Gemini image", "n8n-nodes-base.httpRequest", [440, 0],
               {"method": "POST", "url": URL, "authentication": "predefinedCredentialType", "nodeCredentialType": "googleOAuth2Api",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ contents: [{ role: 'user', parts: [{ text: $json.prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: $json.aspect } } }) }}",
                "options": {}}, v=4.2, onError="continueRegularOutput"),
          node("To image files", "n8n-nodes-base.code", [660, 0], {"jsCode": TO_FILE}, v=2),
      ],
      "connections": {"Run test": {"main": [[{"node": "Samples", "type": "main", "index": 0}]]},
                      "Samples": {"main": [[{"node": "Gemini image", "type": "main", "index": 0}]]},
                      "Gemini image": {"main": [[{"node": "To image files", "type": "main", "index": 0}]]}}}
out = pathlib.Path(__file__).resolve().parent / "import" / "TEST_image_styles.json"
out.write_text(json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8")
print("written", out.name)
