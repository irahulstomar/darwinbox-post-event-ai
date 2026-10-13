// Builds a local preview of the hub with real HubSpot data (M3 is mocked from the latest local package).
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodes = {};
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n] });
const run = async (name, file, input) => (nodes[name] = await new AsyncFunction('$', '$input', '$json', fs.readFileSync(file, 'utf8'))($, { first: () => input[0], all: () => input }, input[0]?.json));
const H = { Authorization: 'Bearer ' + env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' };
const search = props => fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', { method: 'POST', headers: H, body: JSON.stringify({ limit: 200, properties: props.split(','), filterGroups: [{ filters: [{ propertyName: 'event_name', operator: 'EQ', value: 'Darwinbox Cortex and the AI-Native Era of HCM' }] }] }) }).then(r => r.json());
const M1P = 'firstname,lastname,email,jobtitle,company,country,event_name,event_attendance_status,time_in_session_min,questions_asked,lifecyclestage,hubspot_owner_id,job_function,seniority,company_industry,company_size_band,icp_tier,icp_score,icp_reason,region,dedupe_status,dedupe_reason,data_completeness_pct,data_completeness_before_pct,fields_missing_before,inferred_fields,enrichment_source';
const m1 = (await run('M1 data', 'n8n/hub/hub_m1_data.js', [{ json: await search(M1P) }]))[0].json;
nodes['M2 emails'] = [{ json: await fetch('https://api.hubapi.com/marketing/v3/emails?limit=100&includeStats=true&sort=-createdAt', { headers: H }).then(r => r.json()) }];
const m2 = (await run('M2 data', 'n8n/hub/hub_m2_data.js', [{ json: await search('firstname,lastname,pe_subject,postevent_email_variant,pe_opening_line,utm_campaign_postevent,pe_recording_url') }]))[0].json;
const m4 = JSON.parse(fs.readFileSync('tests/out/hub_m4.json', 'utf8')), ai = JSON.parse(fs.readFileSync('tests/out/hub_m4_ai.json', 'utf8'));
const m3 = { found: true, folder: { name: 'Events · Darwinbox Cortex and the AI-Native Era of HCM · 2026-10-13', url: '#' }, counts: 'Blog 1080 words · 7 YouTube chapters · 7 infographic sections · 5 LinkedIn + 5 X posts', chapters: 'AI chapters matched 6/7 official chapters (within 90s).', guard: 'Insights 7/7 · Quotes 7/7 · Data points 8/8 verified',
  images: [{ name: '02b YouTube thumbnail.png', preview: 'thumb', url: '#' }, { name: '03c Infographic poster.png', preview: 'thumb', url: '#' }, { name: '04b LinkedIn visual.png', preview: 'li', url: '#' }],
  docs: ['00 README: index & quality report', '01 Blog draft', '02 YouTube package (chapters, description, thumbnail brief)', '03 Infographic outline', '03b Infographic (data-accurate).html', '04 Social posts (LinkedIn + X)', '05 Source insights & fact check', '06 Transcript'].map(n => ({ name: n, kind: /html$/.test(n) ? 'html' : 'doc', url: '#' })),
  checks: [{ pass: true, text: 'blog: 800-1200 words (1080 words)' }, { pass: true, text: 'youtube: chapters: first at 00:00, >= 3, >= 10s apart (7 chapters)' }, { pass: true, text: 'youtube: AI chapters vs official chapters (within 90s) (6/7 matched)' }, { pass: true, text: 'social: distinct hooks per platform' }] };
console.log('m1 kpis', JSON.stringify(m1.kpis)); console.log('m2 totals', JSON.stringify(m2.totals), 'run', m2.run_id, 'segments', m2.segments.length);
const data = { 'hub-m4': m4, 'hub-m4-ai': ai, 'hub-m1': m1, 'hub-m2': m2, 'hub-m3': m3 };
let html = fs.readFileSync('n8n/hub/hub_page.html', 'utf8');
html = html.replace("async function get(path) {", `const MOCK = ${JSON.stringify(data)};\nasync function get(path) { await new Promise(r => setTimeout(r, path.includes('ai') ? 900 : 100)); if (MOCK[path]) return MOCK[path];`);
html = html.replace("src=\"${CONFIG.base + i.preview}\"", "src=\"../../data/m3_output_v2/${i.preview}.png\"");
fs.writeFileSync('tests/out/hub_preview.html', html);
console.log('preview written');
