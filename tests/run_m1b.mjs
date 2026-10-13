// Runs M1b Code nodes locally with a mocked Clay callback + real DeepSeek call.
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = (file, g) => new AsyncFunction(...Object.keys(g), fs.readFileSync(file, 'utf8'))(...Object.values(g));
const cases = [
  [{ row_id: '1', company_name: 'Infosys', final_domain: 'infosys.com', employee_count: '10001+', industry: 'IT Services and IT Consulting', hq_country: 'India' },
   { firstname: 'Ananya', lastname: 'Rao', email: 'ananya.rao@infosys.com.example.com', jobtitle: 'Sr. Mgr - HR', company: 'Infosys Ltd', country: 'India', event_attendance_status: 'attended', time_in_session_min: '41', questions_asked: '1', lifecyclestage: 'lead' }],
  [{ row_id: '2', company_name: 'Chargebee', final_domain: 'chargebee.com', employee_count: '', industry: '', hq_country: '' },
   { firstname: 'Lakshmi', lastname: 'Narayanan', email: 'lakshmi.narayanan@chargebee.com.example.com', jobtitle: '', company: 'chargebee', country: 'India', event_attendance_status: 'attended', time_in_session_min: '8', questions_asked: '0' }],
  [{ row_id: '3', company_name: 'IIM Ahmedabad', final_domain: 'iima.ac.in', employee_count: '501-1000', industry: 'Higher Education', hq_country: 'India' },
   { firstname: 'Rohan', lastname: 'Gupta', email: 'x', jobtitle: 'Student', company: 'IIM Ahmedabad', country: 'India', event_attendance_status: 'attended', time_in_session_min: '37', questions_asked: '2' }],
  [{ row_id: '4', company_name: 'Al-Futtaim', final_domain: 'alfuttaim.com', employee_count: '10001+', industry: 'Retail', hq_country: 'United Arab Emirates' },
   { firstname: 'Khalid', lastname: 'Rahman', email: 'x', jobtitle: 'IT Manager', company: 'Al-Futtaim Group', country: '', event_attendance_status: 'no_show', time_in_session_min: '0', questions_asked: '0' }],
];
for (const [clay, props] of cases) {
  const built = await run('n8n/m1/m1b_build_prompt.js', { $: () => ({ item: { json: { body: clay } } }), $json: { id: clay.row_id, properties: props } });
  const t = Date.now();
  const res = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(built.json.request_body) }).then(r => r.json());
  const out = await run('n8n/m1/m1b_score_route.js', { $: () => ({ item: built }), $json: res });
  const p = out.json.contact_props;
  console.log(`\n${props.firstname} ${props.lastname} (${Date.now() - t} ms, ${res.usage?.total_tokens} tok)`);
  console.log(`  ${p.job_function} | ${p.seniority} | ${p.company_size_band} | ${p.company_industry} | ${p.country} | ${p.region} | owner ${p.hubspot_owner_id} | stage ${p.lifecyclestage} | complete ${p.data_completeness_pct}%`);
  console.log('  ' + p.icp_reason); console.log('  breakdown ' + p.icp_breakdown); console.log('  inferred ' + p.inferred_fields + ' | src ' + p.enrichment_source);
}
