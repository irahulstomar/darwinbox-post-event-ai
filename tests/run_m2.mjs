// Runs the M2 Code nodes locally: real transcript + real HubSpot contacts + real DeepSeek. Sends nothing.
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodes = {};
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n], get item() { return nodes[n][0]; } });
const run = async (name, file, input, ctx = {}) => {
  const $input = { first: () => input[0], all: () => input };
  const $json = input[0]?.json;
  nodes[name] = await new AsyncFunction('$', '$input', '$json', fs.readFileSync(file, 'utf8')).call(ctx, $, $input, $json);
  return nodes[name];
};
const ds = async body => { const t = Date.now(); const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); console.log(`  deepseek ${body.model} ${Date.now() - t}ms ${r.usage?.total_tokens} tok`); return [{ json: r }]; };
const hs = async body => fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', { method: 'POST', headers: { Authorization: 'Bearer ' + env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

const form = [{ json: { 'Event name': 'Darwinbox Cortex and the AI-Native Era of HCM', 'Watch link for emails': 'https://www.youtube.com/watch?v=dtNFhRtZYgk', 'CTA link': 'https://darwinbox.com/', 'From name': 'Webinar Team', Mode: 'Create drafts only' }, binary: { data: {} } }];
await run('Read inputs', 'n8n/m2/m2_read_inputs.js', form, { helpers: { getBinaryDataBuffer: async () => fs.readFileSync('data/recording/transcript.txt') } });
const props = 'firstname,lastname,jobtitle,company,country,event_attendance_status,time_in_session_min,questions_asked,job_function,seniority,company_industry,icp_tier'.split(',');
const contacts = await hs({ limit: 200, properties: props, filterGroups: [{ filters: [{ propertyName: 'event_name', operator: 'EQ', value: 'Darwinbox Cortex and the AI-Native Era of HCM' }] }] });
await run('Prepare transcription', 'n8n/m2/m2_prepare_transcription.js', [{ json: contacts }]);
await run('Format transcript', 'n8n/m2/m2_format_transcript.js', [{ json: {} }]);
await run('Build insight prompt', 'n8n/m2/m2_insight_prompt.js', [{ json: {} }]);
const ins = await ds(nodes['Build insight prompt'][0].json.request_body);
await run('Fact guard + copy prompt', 'n8n/m2/m2_guard_copy_prompt.js', ins);
const g = nodes['Fact guard + copy prompt'][0].json;
console.log('speaker map', JSON.stringify(g.speaker_map), '| rejected', g.rejected.length);
g.takeaways.forEach((t, i) => console.log(`  T${i + 1} [${t.timestamp}] ${t.headline} :: "${t.quote}" (${t.speaker})`));
console.log('stats', JSON.stringify(g.stats));
const cp = await ds(g.request_body);
const out = (await run('Personalise', 'n8n/m2/m2_personalise.js', cp))[0].json;
console.log('issues', out.issues);
for (const s of out.segments) console.log(`\n${s.label}: ${s.member_ids.length} contacts\n  subjects: ${s.subjects.join(' | ')}`);
const ex = out.batch.inputs.find(i => nodes['Build insight prompt'][0].json.contacts.find(c => c.id === i.id)?.event_attendance_status === 'attended');
console.log('\nexample contact props', JSON.stringify(ex.properties, null, 1));
const fill = (h, p) => h.replace(/\{\{ contact\.(\w+) \}\}/g, (_, k) => p[k] ?? ({ firstname: 'Ananya' }[k] || ''));
fs.mkdirSync('tests/out', { recursive: true });
for (const s of out.segments) {
  const sample = out.batch.inputs.find(i => s.member_ids.includes(i.id));
  fs.writeFileSync(`tests/out/m2_${s.segment}.html`, `<meta charset=utf-8><div style="max-width:620px;margin:24px auto;font:15px/1.6 Arial">
<p style="color:#888">Subject: ${sample.properties.pe_subject}</p>${fill(s.email.content.widgets.primary_rich_text_module.body.html, sample.properties)}</div>`);
}
console.log('previews written to tests/out/');
