import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodes = {};
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n] });
const run = async (name, file, input) => (nodes[name] = await new AsyncFunction('$', '$input', '$json', fs.readFileSync(file, 'utf8'))($, { first: () => input[0], all: () => input }, input[0]?.json));
export const PROPS = 'firstname,lastname,email,jobtitle,company,country,event_attendance_status,time_in_session_min,questions_asked,job_function,seniority,company_industry,icp_tier,icp_score,lifecyclestage,engagement_log,lifecycle_history,engagement_source,last_engaged_at'.split(',');
const hs = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', { method: 'POST', headers: { Authorization: 'Bearer ' + env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 200, properties: PROPS, filterGroups: [{ filters: [{ propertyName: 'event_name', operator: 'EQ', value: 'Darwinbox Cortex and the AI-Native Era of HCM' }] }] }) }).then(r => r.json());
nodes['M4 data request'] = [{ json: { query: {} } }];
const m = (await run('M4 metrics', 'n8n/hub/hub_m4_metrics.js', [{ json: hs }]))[0].json;
console.log('kpis', JSON.stringify(m.kpis));
console.log('movement', JSON.stringify(m.movement));
console.log('today', m.engagement_today, 'prev avg', m.engagement_prev_avg);
console.log('candidates', JSON.stringify(m.candidates));
console.log('top accounts', m.accounts.slice(0, 5).map(a => `${a.name}(${a.score}, ${a.contacts}p, committee=${a.committee})`).join(' | '));
console.log('top contacts', m.top_contacts.slice(0, 6).map(p => `${p.name} ${p.base_score}`).join(' | '));
fs.writeFileSync('tests/out/hub_m4.json', JSON.stringify(m, null, 1));
if (process.argv[2] === 'ai') {
  const pr = (await run('Build AI prompt', 'n8n/hub/hub_m4_ai_prompt.js', [{ json: m }]))[0].json;
  const t = Date.now();
  const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(pr.request_body) }).then(r => r.json());
  console.log('deepseek ms', Date.now() - t);
  const out = (await run('Merge AI', 'n8n/hub/hub_m4_ai_merge.js', [{ json: r }]))[0].json;
  fs.writeFileSync('tests/out/hub_m4_ai.json', JSON.stringify(out, null, 1)); console.log('ai written');
}
