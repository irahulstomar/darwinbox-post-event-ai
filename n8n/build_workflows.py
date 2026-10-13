"""Assemble importable n8n workflow JSON from the Code-node scripts in n8n/<module>/.

Writes two copies:
  n8n/workflows/*.json  -> committed to GitHub (placeholders, no secrets)
  n8n/import/*.json     -> what you import into n8n (Clay webhook URL filled from .env; gitignored)
Credentials are not embedded: after import, pick them in each HTTP node.
"""
import json, pathlib, uuid

ROOT = pathlib.Path(__file__).resolve().parent
ENV = {}
for line in (ROOT.parent / ".env").read_text(encoding="utf-8-sig").splitlines():
    if "=" in line:
        k, v = line.split("=", 1); ENV[k.strip()] = v.strip().strip('"')

EVENT = "Darwinbox Cortex and the AI-Native Era of HCM"
HS = "https://api.hubapi.com"
CONTACT_PROPS = ("firstname,lastname,email,jobtitle,company,country,event_name,event_attendance_status,time_in_session_min,"
                 "questions_asked,lifecyclestage,hubspot_owner_id,job_function,seniority,company_industry,company_size_band,"
                 "icp_tier,icp_score,icp_reason,region,dedupe_status,dedupe_reason,data_completeness_pct,"
                 "data_completeness_before_pct,fields_missing_before,inferred_fields,enrichment_source")
RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 5000}


def code(name, file, pos, each=False):
    p = {"jsCode": (ROOT / file).read_text(encoding="utf-8")}
    if each:
        p["mode"] = "runOnceForEachItem"
    return {"name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos, "parameters": p}


def http(name, pos, method, url, body=None, auth="hubspot", batch=None, **extra):
    p = {"method": method, "url": url, "options": {}}
    if auth == "hubspot":
        p.update(authentication="predefinedCredentialType", nodeCredentialType="hubspotAppToken")
    elif auth == "google":
        p.update(authentication="predefinedCredentialType", nodeCredentialType="googleOAuth2Api")
    elif auth == "header":
        p.update(authentication="genericCredentialType", genericAuthType="httpHeaderAuth")
    if body is not None:
        p.update(sendBody=True, specifyBody="json", jsonBody=body)
    if batch:
        p["options"]["batching"] = {"batch": {"batchSize": batch, "batchInterval": 15000 if auth == "google" else 1000}}
    return {"name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos, "parameters": p, **RETRY, **extra}


def http_upload(name, pos):
    """Drive multipart upload (metadata + HTML): Drive converts the HTML into a formatted Google Doc."""
    return {"name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos, **RETRY,
            "parameters": {"method": "POST",
                           "url": "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
                           "authentication": "predefinedCredentialType", "nodeCredentialType": "googleDriveOAuth2Api",
                           "sendBody": True, "contentType": "raw", "rawContentType": "={{ $json.content_type }}",
                           "body": "={{ $json.multipart }}", "options": {}}}


def chain(*names):
    return {a: {"main": [[{"node": b, "type": "main", "index": 0}]]} for a, b in zip(names, names[1:])}


def workflow(name, nodes):
    order = [n["name"] for n in nodes]
    for n in nodes:
        n["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, name + n["name"]))
    return {"name": name, "nodes": nodes, "connections": chain(*order), "settings": {"executionOrder": "v1"}, "pinData": {}}


# ---------------- M1a · Intake ----------------
m1a = workflow("M1a · Lead intake (CSV → clean → dedupe → HubSpot → Clay)", [
    {"name": "Upload registrant CSV", "type": "n8n-nodes-base.formTrigger", "typeVersion": 2.2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m1a-form")),
     "parameters": {
         "formTitle": "Post-event lead enrichment",
         "formDescription": "Upload the webinar registrant/attendee export (Zoom, GoTo or ON24 CSV). "
                            "It is cleaned, de-duplicated against HubSpot, enriched with Clay + DeepSeek, scored and routed to SDRs.",
         "formFields": {"values": [
             {"fieldLabel": "Registrant export (CSV)", "fieldType": "file", "multipleFiles": False, "acceptFileTypes": ".csv", "requiredField": True},
             {"fieldLabel": "Event name", "placeholder": EVENT, "requiredField": True},
         ]},
         "options": {}}},
    code("Parse & clean CSV", "m1/m1a_parse_clean.js", [220, 0]),
    http("Load CRM contacts", [440, 0], "POST", f"{HS}/crm/v3/objects/contacts/search",
         json.dumps({"limit": 200, "properties": ["firstname", "lastname", "email", "company", "jobtitle", "lifecyclestage"]}),
         executeOnce=True),
    code("Match vs HubSpot", "m1/m1a_match_hubspot.js", [660, 0]),
    http("Create or update contact", [880, 0],
         "={{ $json.hubspot_id ? 'PATCH' : 'POST' }}",
         f"={{{{ '{HS}/crm/v3/objects/contacts' + ($json.hubspot_id ? '/' + $json.hubspot_id : '') }}}}",
         "={{ JSON.stringify({ properties: $json.hs_props }) }}", batch=5, onError="continueRegularOutput"),
    http("Send to Clay", [1100, 0], "POST", "__CLAY_WEBHOOK_URL__",
         "={{ JSON.stringify({ row_id: $json.id, first_name: $('Match vs HubSpot').item.json.firstname, "
         "last_name: $('Match vs HubSpot').item.json.lastname, email: $('Match vs HubSpot').item.json.email, "
         "job_title: $('Match vs HubSpot').item.json.jobtitle, organization: $('Match vs HubSpot').item.json.company, "
         "company_domain: $('Match vs HubSpot').item.json.company_domain, country: $('Match vs HubSpot').item.json.country, "
         "attended: $('Match vs HubSpot').item.json.attendance, time_in_session_min: $('Match vs HubSpot').item.json.time_in_session_min, "
         "event_name: $('Match vs HubSpot').item.json.event_name }) }}",
         auth="header", batch=5, onError="continueRegularOutput"),
    {"name": "Run summary", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1320, 0], "parameters": {"jsCode": """
const people = $('Match vs HubSpot').all().map(i => i.json);
const saved = $('Create or update contact').all().filter(i => i.json.id).length;
const s = k => people.filter(p => p.dedupe_status === k).length;
const avg = Math.round(people.reduce((a, p) => a + p.data_completeness_before_pct, 0) / people.length);
return [{ json: { message:
  `${people[0]._stats.raw_rows} rows received → ${people.length} unique people (${people[0]._stats.raw_rows - people.length} duplicate registrations merged).\\n` +
  `HubSpot: ${s('merged')} matched existing contacts, ${s('needs_review')} flagged for review, ${s('new')} new. ${saved} saved.\\n` +
  `Data completeness before enrichment: ${avg}%. Clay + DeepSeek are enriching now; open the M1 report in ~2 minutes.` } }];
"""}},
    {"name": "Show summary", "type": "n8n-nodes-base.form", "typeVersion": 1, "position": [1540, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m1a-form-end")),
     "parameters": {"operation": "completion", "completionTitle": "Upload processed",
                    "completionMessage": "={{ $json.message }}", "options": {}}},
])

# ---------------- M1b · Enrich & route (Clay callback) ----------------
m1b = workflow("M1b · Enrich, score & route (Clay callback → DeepSeek → HubSpot)", [
    {"name": "Clay callback", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m1b-clay")),
     "parameters": {"httpMethod": "POST", "path": "clay-enriched-__CALLBACK_SECRET__", "options": {}}},  # secret in the path
    http("Get contact", [220, 0], "GET",
         f"={HS}/crm/v3/objects/contacts/{{{{ $json.body.row_id }}}}?properties={CONTACT_PROPS}"),
    code("Build prompt", "m1/m1b_build_prompt.js", [440, 0], each=True),
    http("DeepSeek classify", [660, 0], "POST", "https://api.deepseek.com/chat/completions",
         "={{ JSON.stringify($json.request_body) }}", auth="header"),
    code("Score & route", "m1/m1b_score_route.js", [880, 0], each=True),
    http("Find company", [1100, 0], "POST", f"{HS}/crm/v3/objects/companies/search",
         "={{ JSON.stringify({ limit: 1, filterGroups: [{ filters: [{ propertyName: $json.company_domain ? 'domain' : 'name', "
         "operator: 'EQ', value: $json.company_domain || $json.company_name }] }] }) }}"),
    http("Create or update company", [1320, 0],
         "={{ $json.total > 0 ? 'PATCH' : 'POST' }}",
         f"={{{{ '{HS}/crm/v3/objects/companies' + ($json.total > 0 ? '/' + $json.results[0].id : '') }}}}",
         "={{ JSON.stringify({ properties: $('Score & route').item.json.company_props }) }}"),
    http("Update contact", [1540, 0], "PATCH",
         f"={HS}/crm/v3/objects/contacts/{{{{ $('Score & route').item.json.hs_contact_id }}}}",
         "={{ JSON.stringify({ properties: $('Score & route').item.json.contact_props }) }}"),
    http("Link contact to company", [1760, 0], "PUT",
         f"={HS}/crm/v4/objects/contacts/{{{{ $('Score & route').item.json.hs_contact_id }}}}"
         f"/associations/default/companies/{{{{ $('Create or update company').item.json.id }}}}"),
])

# ---------------- M1c · Report ----------------
m1c = workflow("M1c · Lead enrichment report (HubSpot → HTML)", [
    {"name": "Report request", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m1c-report")),
     "parameters": {"httpMethod": "GET", "path": "m1-report", "responseMode": "responseNode", "options": {}}},
    http("Event contacts", [220, 0], "POST", f"{HS}/crm/v3/objects/contacts/search",
         "={{ JSON.stringify({ limit: 200, properties: '" + CONTACT_PROPS + "'.split(','), filterGroups: [{ filters: "
         "[{ propertyName: 'event_name', operator: 'EQ', value: $json.query.event || '" + EVENT + "' }] }] }) }}"),
    code("Build report", "m1/m1c_report.js", [440, 0]),
    {"name": "Return page", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [660, 0],
     "parameters": {"respondWith": "text", "responseBody": "={{ $json.html }}",
                    "options": {"responseHeaders": {"entries": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}]}}}},
])
# ---------------- M2 · Post-event communications ----------------
M2_PROPS = ("firstname,lastname,jobtitle,company,country,event_attendance_status,time_in_session_min,questions_asked,"
            "job_function,seniority,company_industry,icp_tier")
m2 = workflow("M2 · Post-event communications (transcript → DeepSeek → HubSpot emails)", [
    {"name": "Event closed form", "type": "n8n-nodes-base.formTrigger", "typeVersion": 2.2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m2-form")),
     "parameters": {
         "formTitle": "Event closed: send post-event emails",
         "formDescription": "Transcribes the recording (Deepgram), then generates and sends 3 segment emails through HubSpot (attendees, no-shows, speakers) with "
                            "fact-checked takeaways, persona and industry personalisation, A/B/C subject lines and UTM tracking.",
         "formFields": {"values": [
             {"fieldLabel": "Event name", "placeholder": EVENT, "requiredField": True},
             {"fieldLabel": "Recording file URL", "placeholder": "Direct mp3/mp4/m4a link (Zoom/ON24 download URL). Transcribed by Deepgram"},
             {"fieldLabel": "Watch link for emails", "placeholder": "Page people click to watch (e.g. YouTube / on-demand page)", "requiredField": True},
             {"fieldLabel": "CTA link", "placeholder": "https://... (demo / resource page)"},
             {"fieldLabel": "Transcript (.txt), optional fallback", "fieldType": "file", "multipleFiles": False, "acceptFileTypes": ".txt"},
             {"fieldLabel": "From name", "placeholder": "Webinar Team"},
             {"fieldLabel": "Reply-to email", "fieldType": "email"},
             {"fieldLabel": "Mode", "fieldType": "dropdown", "requiredField": True,
              "fieldOptions": {"values": [{"option": "Send now via HubSpot"}, {"option": "Create drafts only"}]}},
         ]},
         "options": {}}},
    code("Read inputs", "m2/m2_read_inputs.js", [220, 0]),
    http("Event contacts", [440, 0], "POST", f"{HS}/crm/v3/objects/contacts/search",
         "={{ JSON.stringify({ limit: 200, properties: '" + M2_PROPS + "'.split(','), filterGroups: [{ filters: "
         "[{ propertyName: 'event_name', operator: 'EQ', value: $json.event }] }] }) }}"),
    code("Prepare transcription", "m2/m2_prepare_transcription.js", [660, 0]),
    http("Deepgram transcribe", [880, 0], "={{ $json.dg_method }}", "={{ $json.dg_url }}",
         "={{ JSON.stringify($json.dg_body) }}", auth="header"),
    code("Format transcript", "m2/m2_format_transcript.js", [1100, 0]),
    code("Build insight prompt", "m2/m2_insight_prompt.js", [1320, 0]),
    http("DeepSeek: extract insights", [880, 0], "POST", "https://api.deepseek.com/chat/completions",
         "={{ JSON.stringify($json.request_body) }}", auth="header"),
    code("Fact guard + copy prompt", "m2/m2_guard_copy_prompt.js", [1100, 0]),
    http("DeepSeek: write emails", [1320, 0], "POST", "https://api.deepseek.com/chat/completions",
         "={{ JSON.stringify($json.request_body) }}", auth="header"),
    code("Personalise", "m2/m2_personalise.js", [1540, 0]),
    http("Update contacts", [1760, 0], "POST", f"{HS}/crm/v3/objects/contacts/batch/update", "={{ JSON.stringify($json.batch) }}"),
    {"name": "Split segments", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [0, 220],
     "parameters": {"jsCode": "return $('Personalise').first().json.segments.map(s => ({ json: s }));"}},
    http("Create segment list", [220, 220], "POST", f"{HS}/crm/v3/lists", "={{ JSON.stringify($json.list) }}"),
    http("Add members", [440, 220], "PUT", f"={HS}/crm/v3/lists/{{{{ $json.list.listId }}}}/memberships/add",
         "={{ JSON.stringify($('Split segments').item.json.member_ids) }}"),
    http("Create email", [660, 220], "POST", f"{HS}/marketing/v3/emails",
         "={{ JSON.stringify({ ...$('Split segments').item.json.email, to: { contactIlsLists: { include: "
         "[String($('Create segment list').item.json.list.listId)], exclude: [] } } }) }}"),
    http("Send email", [880, 220],
         "={{ $('Read inputs').first().json.mode === 'send' ? 'POST' : 'GET' }}",
         f"={{{{ '{HS}/marketing/v3/emails/' + $json.id + ($('Read inputs').first().json.mode === 'send' ? '/publish' : '') }}}}"),
    code("Summary", "m2/m2_summary.js", [1100, 220]),
    {"name": "Show result", "type": "n8n-nodes-base.form", "typeVersion": 1, "position": [1320, 220],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m2-form-end")),
     "parameters": {"operation": "completion", "completionTitle": "Post-event emails ready",
                    "completionMessage": "={{ $json.message }}", "options": {}}},
])


# ---------------- M3 · Content repurposing ----------------
GD = "n8n-nodes-base.googleDrive"
MY_DRIVE = {"__rl": True, "value": "My Drive", "mode": "list", "cachedResultName": "My Drive"}
EVENT_FOLDER = {"__rl": True, "value": "={{ $('Create event folder').first().json.id }}", "mode": "id"}
TO_IMAGE_JS = """// Gemini returns each image as base64 inlineData; turn it into a file for Drive.
// If an image failed, save a short note (with the prompt) instead so the run still completes.
const metas = $('Validate & package').all().map(i => i.json);
const out = [];
for (const [k, it] of $input.all().entries()) {
  const meta = metas[k] || {};
  const parts = (it.json.candidates && it.json.candidates[0] && it.json.candidates[0].content && it.json.candidates[0].content.parts) || [];
  const img = parts.find(p => p.inlineData);
  if (img) {
    const data = await this.helpers.prepareBinaryData(Buffer.from(img.inlineData.data, 'base64'), meta.file_name, img.inlineData.mimeType || 'image/png');
    out.push({ json: { file_name: meta.file_name, kind: meta.kind }, binary: { data } });
  } else {
    const why = JSON.stringify(it.json.error || it.json).slice(0, 300);
    const name = meta.file_name.replace(/[.]png$/, ' (skipped).txt');
    const note = 'Image not generated: ' + why + '\\n\\nPrompt to re-run:\\n' + meta.prompt;
    const data = await this.helpers.prepareBinaryData(Buffer.from(note, 'utf8'), name, 'text/plain');
    out.push({ json: { file_name: name, kind: meta.kind }, binary: { data } });
  }
}
return out;"""
m3 = workflow("M3 · Content repurposing (recording → Deepgram → DeepSeek → Gemini images → Google Drive)", [
    {"name": "Recording form", "type": "n8n-nodes-base.formTrigger", "typeVersion": 2.2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "m3-form")),
     "parameters": {
         "formTitle": "Recording → content package",
         "formDescription": "Transcribes the recording and builds a fact-checked content package: blog draft, YouTube chapters + "
                            "description + thumbnail brief, infographic outline, 5-10 social posts and AI visuals, saved to Google Drive.",
         "formFields": {"values": [
             {"fieldLabel": "Event name", "placeholder": EVENT, "requiredField": True},
             {"fieldLabel": "Recording file URL", "placeholder": "Direct mp3/mp4/m4a link. Transcribed by Deepgram"},
             {"fieldLabel": "Transcript (.txt), optional fallback", "fieldType": "file", "multipleFiles": False, "acceptFileTypes": ".txt"},
             {"fieldLabel": "Speakers", "placeholder": "Jayant Paleti, Brett Ungashick"},
             {"fieldLabel": "Watch link", "placeholder": "https://www.youtube.com/watch?v=..."},
             {"fieldLabel": "Official chapters (optional, for QA)", "fieldType": "textarea", "placeholder": "0:00 Intro"},
         ]},
         "responseMode": "onReceived",
         "options": {"respondWithOptions": {"values": {"formSubmittedText": "Working on it. The content package appears in Google Drive (folder 'Events · <event> · <date>') in about 2 minutes."}}}}},
    code("Read inputs", "m3/m3_read_inputs.js", [220, 0]),
    {"name": "Create event folder", "type": GD, "typeVersion": 3, **RETRY, "position": [440, 0],
     "parameters": {"resource": "folder", "name": "={{ $json.folder_name }}", "driveId": MY_DRIVE,
                    "folderId": {"__rl": True, "value": "root", "mode": "list", "cachedResultName": "/ (Root folder)"}, "options": {}}},
    code("Prepare transcription", "m3/m3_prepare_transcription.js", [660, 0]),
    http("Deepgram transcribe", [880, 0], "={{ $json.dg_method }}", "={{ $json.dg_url }}", "={{ JSON.stringify($json.dg_body) }}", auth="header"),
    code("Format transcript", "m3/m3_format_transcript.js", [1100, 0]),
    code("Build insight prompt", "m3/m3_insight_prompt.js", [1320, 0]),
    http("DeepSeek: extract insights", [1540, 0], "POST", "https://api.deepseek.com/chat/completions", "={{ JSON.stringify($json.request_body) }}", auth="header"),
    code("Fact guard", "m3/m3_fact_guard.js", [1760, 0]),
    http("DeepSeek: generate assets", [0, 240], "POST", "https://api.deepseek.com/chat/completions", "={{ JSON.stringify($json.request_body) }}", auth="header"),
    code("Blog length check", "m3/m3_blog_length.js", [220, 240]),
    http("DeepSeek: fix blog length", [440, 240], "={{ $json.fix_method }}", "={{ $json.fix_url }}", "={{ JSON.stringify($json.fix_body) }}", auth="header"),
    code("Validate & package", "m3/m3_validate_package.js", [660, 240]),
    http("Generate image (Gemini)", [880, 240], "POST",
         "https://aiplatform.googleapis.com/v1/projects/__GCP_PROJECT__/locations/global/publishers/google/models/gemini-3-pro-image:generateContent",
         "={{ JSON.stringify($json.request_body) }}", auth="google", batch=1, onError="continueRegularOutput"),
    {"name": "To image file", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [660, 240],
     "parameters": {"jsCode": TO_IMAGE_JS}},
    {"name": "Upload images", "type": GD, "typeVersion": 3, **RETRY, "position": [880, 240],
     "parameters": {"name": "={{ $json.file_name }}", "driveId": MY_DRIVE, "folderId": EVENT_FOLDER, "options": {}}},
    code("Documents", "m3/m3_documents.js", [0, 480]),
    http_upload("Create documents", [220, 480]),
    code("Build index", "m3/m3_index.js", [440, 480]),
    http_upload("Create index", [660, 480]),
])


# ---------------- HUB · dashboard + data endpoints ----------------
import urllib.parse
HUB_HTML = (ROOT / "hub" / "hub_page.html").read_text(encoding="utf-8")
M4_PROPS = ("firstname,lastname,email,jobtitle,company,country,event_attendance_status,time_in_session_min,questions_asked,job_function,"
            "seniority,company_industry,icp_tier,icp_score,lifecyclestage,engagement_log,lifecycle_history,engagement_source,last_engaged_at")
M1_PROPS = CONTACT_PROPS + ",company_size_band,icp_score,icp_reason,hubspot_owner_id,inferred_fields"
M2_PROPS = "firstname,lastname,pe_subject,postevent_email_variant,pe_opening_line,utm_campaign_postevent,pe_recording_url"
DRIVE = "https://www.googleapis.com/drive/v3/files"
FOLDER_Q = urllib.parse.quote("mimeType='application/vnd.google-apps.folder' and trashed=false and name contains 'Events'")
LIST_URL = ("={{ '" + DRIVE + "?q=' + encodeURIComponent(String.fromCharCode(39) + $json.files[0].id + String.fromCharCode(39) + ' in parents and trashed=false')"
            " + '&pageSize=50&fields=files(id,name,mimeType,webViewLink,createdTime)' }}")
README_URL = "={{ '" + DRIVE + "/' + ($json.files.find(f => /00 README/.test(f.name)) || $json.files[0]).id + '/export?mimeType=text/plain' }}"
IMG_META_URL = "={{ '" + DRIVE + "/' + encodeURIComponent($json.query.id) + '?fields=id,name,mimeType' }}"
IMG_GET_URL = "={{ '" + DRIVE + "/' + $json.id + '?alt=media' }}"
IMG_GUARD_JS = ("// Only serve images that belong to a content package (tagged file names), never any other Drive file.\n"
                "if (!String($json.mimeType || '').startsWith('image/') || !String($json.name || '').startsWith('[')) throw new Error('Not a content-package image');\n"
                "return [{ json: { id: $json.id } }];")


def hook(name, path, pos):
    return {"name": name, "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": pos,
            "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "hub-" + path)),
            "parameters": {"httpMethod": "GET", "path": path, "responseMode": "responseNode", "options": {}}}


def respond_json(name, pos):
    return {"name": name, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": pos,
            "parameters": {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}",
                           "options": {"responseHeaders": {"entries": [{"name": "Cache-Control", "value": "no-store"}]}}}}


def drive_get(name, pos, url, text=False, file=False):
    opts = {}
    if text:
        opts = {"response": {"response": {"responseFormat": "text"}}}
    if file:
        opts = {"response": {"response": {"responseFormat": "file"}}}
    return {"name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos, **RETRY,
            "parameters": {"method": "GET", "url": url, "authentication": "predefinedCredentialType",
                           "nodeCredentialType": "googleDriveOAuth2Api", "options": opts}}


def search(name, pos, props):
    return http(name, pos, "POST", f"{HS}/crm/v3/objects/contacts/search",
                json.dumps({"limit": 200, "properties": props.split(","), "filterGroups": [{"filters": [
                    {"propertyName": "event_name", "operator": "EQ", "value": EVENT}]}]}))


def lane(*nodes):
    return list(nodes), chain(*[n["name"] for n in nodes])


hub_lanes = [
    lane(hook("Hub page", "hub", [0, 0]),
         {"name": "Return hub page", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [220, 0],
          "parameters": {"respondWith": "text", "responseBody": "__HUB_HTML__",
                         "options": {"responseHeaders": {"entries": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}]}}}}),
    lane(hook("M4 data request", "hub-m4", [0, 200]), search("M4 contacts", [220, 200], M4_PROPS),
         code("M4 metrics", "hub/hub_m4_metrics.js", [440, 200]), respond_json("Return M4 data", [660, 200])),
    lane(hook("M4 AI request", "hub-m4-ai", [0, 400]), search("M4 AI contacts", [220, 400], M4_PROPS),
         code("M4 AI metrics", "hub/hub_m4_metrics.js", [440, 400]), code("Build AI prompt", "hub/hub_m4_ai_prompt.js", [660, 400]),
         http("DeepSeek: analyse", [880, 400], "POST", "https://api.deepseek.com/chat/completions", "={{ JSON.stringify($json.request_body) }}", auth="header"),
         code("Merge AI", "hub/hub_m4_ai_merge.js", [1100, 400]), respond_json("Return M4 AI", [1320, 400])),
    lane(hook("M1 data request", "hub-m1", [0, 600]), search("M1 contacts", [220, 600], M1_PROPS),
         code("M1 data", "hub/hub_m1_data.js", [440, 600]), respond_json("Return M1 data", [660, 600])),
    lane(hook("M2 data request", "hub-m2", [0, 800]),
         http("M2 emails", [220, 800], "GET", f"{HS}/marketing/v3/emails?limit=100&includeStats=true&sort=-createdAt"),
         search("M2 contacts", [440, 800], M2_PROPS),
         code("M2 data", "hub/hub_m2_data.js", [660, 800]), respond_json("Return M2 data", [880, 800])),
    lane(hook("M3 data request", "hub-m3", [0, 1000]),
         drive_get("Find latest package", [220, 1000], f"{DRIVE}?q={FOLDER_Q}&orderBy=createdTime%20desc&pageSize=5&fields=files(id,name,createdTime)"),
         drive_get("List package files", [440, 1000], LIST_URL),
         drive_get("Export README", [660, 1000], README_URL, text=True),
         code("M3 data", "hub/hub_m3_data.js", [880, 1000]), respond_json("Return M3 data", [1100, 1000])),
    lane(hook("Image request", "hub-img", [0, 1200]),
         drive_get("Image metadata", [220, 1200], IMG_META_URL),
         {"name": "Images from packages only", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [440, 1200],
          "parameters": {"jsCode": IMG_GUARD_JS}},
         drive_get("Download image", [660, 1200], IMG_GET_URL, file=True),
         {"name": "Return image", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [880, 1200],
          "parameters": {"respondWith": "binary", "options": {"responseHeaders": {"entries": [{"name": "Cache-Control", "value": "public, max-age=3600"}]}}}}),
]
hub_nodes, hub_conns = [], {}
for ns, cs in hub_lanes:
    hub_nodes += ns
    hub_conns.update(cs)
for n in hub_nodes:
    n["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "hub" + n["name"]))
hub = {"name": "HUB · Post-Event AI dashboard (page + data endpoints)", "nodes": hub_nodes, "connections": hub_conns,
       "settings": {"executionOrder": "v1"}, "pinData": {}}


# ---------------- MASTER · run everything ----------------
PICK = """// Hand each module exactly the inputs (and file) its own form would have given it.
const f = $('Master form').first();
const bin = f.binary || {};
const keyFor = re => Object.keys(bin).find(k => re.test(k)) || null;
const csvKey = keyFor(/registrant|csv/i), trKey = keyFor(/transcript/i);
const j = f.json;
const module = '__MODULE__';
const json = module === 'm1' ? { 'Event name': j['Event name'] }
  : module === 'm3' ? { 'Event name': j['Event name'], 'Recording file URL': j['Recording file URL'] || '', 'Speakers': j['Speakers'] || '',
                        'Watch link': j['Watch link for emails'] || '', 'Official chapters (optional, for QA)': j['Official chapters (optional, for QA)'] || '' }
  : { 'Event name': j['Event name'], 'Recording file URL': j['Recording file URL'] || '', 'Watch link for emails': j['Watch link for emails'] || '',
      'CTA link': j['CTA link'] || '', 'From name': j['From name'] || 'Webinar Team', 'Reply-to email': j['Reply-to email'] || '', 'Mode': j['Mode'] };
const key = module === 'm1' ? csvKey : trKey;
if (module === 'm1' && !key) throw new Error('Upload the registrant CSV');
return [{ json, ...(key ? { binary: { data: bin[key] } } : {}) }];"""


def pick(name, module, pos):
    return {"name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos,
            "parameters": {"jsCode": PICK.replace("__MODULE__", module)}}


def run_module(name, pos):
    return {"name": name, "type": "n8n-nodes-base.executeWorkflow", "typeVersion": 1.2, "position": pos,
            "parameters": {"workflowId": {"__rl": True, "value": "", "mode": "list"}, "options": {"waitForSubWorkflow": True}},
            "onError": "continueRegularOutput"}


master = workflow("MASTER · Run everything (M1 → M3 → M2)", [
    {"name": "Master form", "type": "n8n-nodes-base.formTrigger", "typeVersion": 2.2, "position": [0, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "master-form")),
     "parameters": {
         "formTitle": "Event closed: run the whole post-event workflow",
         "formDescription": "One submit runs lead enrichment (M1), the content package (M3) and the post-event emails (M2). "
                            "The Lead intelligence dashboard (M4) updates live. Takes about 8 minutes; follow progress in the hub.",
         "formFields": {"values": [
             {"fieldLabel": "Event name", "placeholder": EVENT, "requiredField": True},
             {"fieldLabel": "Registrant export (CSV)", "fieldType": "file", "multipleFiles": False, "acceptFileTypes": ".csv", "requiredField": True},
             {"fieldLabel": "Recording file URL", "placeholder": "Direct mp3/mp4/m4a link (Zoom/ON24). Transcribed by Deepgram"},
             {"fieldLabel": "Transcript (.txt), optional fallback", "fieldType": "file", "multipleFiles": False, "acceptFileTypes": ".txt"},
             {"fieldLabel": "Speakers", "placeholder": "Jayant Paleti, Brett Ungashick"},
             {"fieldLabel": "Watch link for emails", "placeholder": "https://www.youtube.com/watch?v=...", "requiredField": True},
             {"fieldLabel": "CTA link", "placeholder": "https://... (demo / resource page)"},
             {"fieldLabel": "Official chapters (optional, for QA)", "fieldType": "textarea", "placeholder": "0:00 Intro"},
             {"fieldLabel": "From name", "placeholder": "Webinar Team"},
             {"fieldLabel": "Reply-to email", "fieldType": "email"},
             {"fieldLabel": "Mode", "fieldType": "dropdown", "requiredField": True,
              "fieldOptions": {"values": [{"option": "Create drafts only"}, {"option": "Send now via HubSpot"}]}},
         ]},
         "responseMode": "onReceived",
         "options": {"respondWithOptions": {"values": {"formSubmittedText": "Running: lead enrichment, content package and emails. Open the hub in about 8 minutes."}}}}},
    pick("Inputs for M1", "m1", [220, 0]),
    run_module("Run M1 · Lead enrichment", [440, 0]),
    {"name": "Wait for Clay + DeepSeek enrichment", "type": "n8n-nodes-base.wait", "typeVersion": 1.1, "position": [660, 0],
     "webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "master-wait")),
     "parameters": {"resume": "timeInterval", "amount": 2, "unit": "minutes"}},
    pick("Inputs for M3", "m3", [880, 0]),
    run_module("Run M3 · Content package", [1100, 0]),
    pick("Inputs for M2", "m2", [1320, 0]),
    run_module("Run M2 · Post-event emails", [1540, 0]),
    {"name": "Done", "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": [1760, 0], "parameters": {}},
])

# Snippet the user pastes into each module: a second trigger so the master can call it.
CALLED_BY_MASTER = {"nodes": [{"parameters": {"inputSource": "passthrough"}, "name": "When called by MASTER",
                               "type": "n8n-nodes-base.executeWorkflowTrigger", "typeVersion": 1.1, "position": [0, -200],
                               "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "called-by-master"))}], "connections": {}}
(ROOT / "import" / "PASTE_called_by_master_trigger.json").write_text(json.dumps(CALLED_BY_MASTER, indent=2), encoding="utf-8")


def lanes(name, *wfs):
    """One workflow, one lane per trigger (lanes stacked vertically)."""
    nodes, conns = [], {}
    for i, wf in enumerate(wfs):
        for n in wf["nodes"]:
            nodes.append({**n, "position": [n["position"][0], n["position"][1] + i * 300]})
        conns.update(wf["connections"])
    return {"name": name, "nodes": nodes, "connections": conns, "settings": {"executionOrder": "v1"}, "pinData": {}}


m1 = lanes("M1 · Lead Enrichment", m1a, m1b, m1c)

for folder, secret in (("workflows", False), ("import", True)):
    out = ROOT / folder; out.mkdir(exist_ok=True)
    for old in ("M1a_lead_intake.json", "M1b_enrich_score_route.json", "M1c_report.json"):
        (out / old).unlink(missing_ok=True)
    for fname, wf in (("M1_lead_enrichment.json", m1), ("M2_post_event_comms.json", m2), ("M3_content_repurposing.json", m3), ("HUB_dashboard.json", hub), ("MASTER_run_everything.json", master)):
        text = json.dumps(wf, indent=2, ensure_ascii=False)
        text = text.replace("__CLAY_WEBHOOK_URL__", ENV.get("CLAY_WEBHOOK_URL", "PASTE_CLAY_WEBHOOK_URL") if secret else "PASTE_CLAY_WEBHOOK_URL")
        text = text.replace("__CF_ACCOUNT_ID__", ENV.get("CF_ACCOUNT_ID", "CF_ACCOUNT_ID") if secret else "CF_ACCOUNT_ID")
        text = text.replace("__GCP_PROJECT__", ENV.get("GCP_PROJECT", "darwinbox-demo-511422") if secret else "YOUR_GCP_PROJECT")
        if fname == "HUB_dashboard.json":
            forms = {"__FORM_M1__": "48b4a71f-ddf2-49db-91fe-71b6c06ebf76", "__FORM_M2__": "3e44700f-2a07-4cab-bce9-19e664afa9ed",
                     "__FORM_M3__": "582040b3-b841-4dd9-8124-96f07b074c63", "__FORM_ALL__": "1a41c96d-fe88-456c-9038-76114a964c73"}
            page = HUB_HTML
            for k, v in forms.items():
                page = page.replace(k, (ENV.get("N8N_BASE_URL", "https://YOUR-N8N") + "/form/" + v) if secret else ("https://YOUR-N8N/form/" + v))
            page = page.replace("__DOCS_URL__", "https://github.com/irahulstomar")
            text = text.replace(json.dumps("__HUB_HTML__"), json.dumps(page, ensure_ascii=False))
        text = text.replace("__CALLBACK_SECRET__", ENV.get("CLAY_CALLBACK_SECRET", "SECRET") if secret else "SECRET")
        (out / fname).write_text(text, encoding="utf-8")
print("written:", [p.name for p in (ROOT / "import").glob("*.json")])
