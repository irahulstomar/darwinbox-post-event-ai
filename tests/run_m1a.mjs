// Local harness: runs the n8n Code-node scripts with mocked n8n globals against the demo CSV + live HubSpot seed.
import fs from 'fs';
const csv = fs.readFileSync('data/registrants_zoom_export.csv');
const seed = JSON.parse(fs.readFileSync('data/hubspot_existing_contacts.json', 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = (file, globals, ctx = {}) => new AsyncFunction(...Object.keys(globals), fs.readFileSync(file, 'utf8')).call(ctx, ...Object.values(globals));

const parsed = await run('n8n/m1/m1a_parse_clean.js',
  { $input: { first: () => ({ json: { 'Event name': 'Darwinbox Cortex and the AI-Native Era of HCM' }, binary: { data: {} } }) } },
  { helpers: { getBinaryDataBuffer: async () => csv } });
const crm = { results: seed.map((c, i) => ({ id: String(1000 + i), properties: c })) };
const nodes = { 'Load CRM contacts': [{ json: crm }], 'Parse & clean CSV': parsed };
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n] });
const matched = await run('n8n/m1/m1a_match_hubspot.js', { $ });

console.log('raw rows', parsed[0].json._stats.raw_rows, '-> unique people', parsed.length);
const by = s => matched.filter(m => m.json.dedupe_status === s);
console.log('merged', by('merged').length, '| needs_review', by('needs_review').length, '| new', by('new').length);
for (const m of matched.filter(m => m.json.dedupe_status !== 'new' || m.json.infile_duplicates))
  console.log(`  [${m.json.dedupe_status}] ${m.json.firstname} ${m.json.lastname} (${m.json.company}) :: ${m.json.dedupe_reason}`);
const avg = a => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
console.log('avg completeness before', avg(matched.map(m => m.json.data_completeness_before_pct)) + '%');
console.log('country from phone:', matched.filter(m => m.json.country_source === 'phone_dial_code').map(m => m.json.firstname + '→' + m.json.country).join(', '));
console.log('sample props:', JSON.stringify(matched.find(m => m.json.firstname === 'Vikram').json.hs_props));
