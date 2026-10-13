// Hub · M1 page data: completeness before vs after, dedupe decisions, tiers, routing, SDR handoff, CSV rows.

const FIELDS = ['firstname', 'lastname', 'email', 'jobtitle', 'company', 'country', 'job_function', 'seniority',
  'company_industry', 'company_size_band', 'icp_tier', 'region', 'hubspot_owner_id', 'lifecyclestage'];
const LABEL = { firstname: 'First name', lastname: 'Last name', email: 'Email', jobtitle: 'Job title', company: 'Company',
  country: 'Country', job_function: 'Job function', seniority: 'Seniority', company_industry: 'Industry',
  company_size_band: 'Company size', icp_tier: 'ICP tier', region: 'Region', hubspot_owner_id: 'Owner', lifecyclestage: 'Lifecycle stage' };
const OWNER = { '169348475': 'Neha · Senior SDR', '169348477': 'Priya · India SDR', '169348476': 'Aman · SEA/MEA SDR', '100973776': 'Rahul · speakers' };
const has = v => v !== undefined && v !== null && v !== '' && v !== 'Unknown';
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch (e) { return fb; } };

const contacts = $input.all().flatMap(i => i.json.results || []).map(r => ({ id: r.id, ...r.properties }));
const n = contacts.length || 1;
const fields = FIELDS.map(f => ({
  field: LABEL[f],
  before: Math.round(100 * contacts.filter(c => !parse(c.fields_missing_before, FIELDS).includes(f)).length / n),
  after: Math.round(100 * contacts.filter(c => has(c[f])).length / n),
}));
const avg = k => Math.round(fields.reduce((s, r) => s + r[k], 0) / fields.length);
const count = (k, v) => contacts.filter(c => c[k] === v).length;
const scored = contacts.filter(c => c.event_attendance_status !== 'speaker');
const owners = {};
contacts.forEach(c => { const o = OWNER[c.hubspot_owner_id] || 'Unassigned'; owners[o] = (owners[o] || 0) + 1; });
const regions = {};
scored.forEach(c => { regions[c.region || 'row'] = (regions[c.region || 'row'] || 0) + 1; });
const person = c => ({ id: c.id, name: `${c.firstname || ''} ${c.lastname || ''}`.trim(), title: c.jobtitle, company: c.company,
  function: c.job_function, seniority: c.seniority, industry: c.company_industry, size: c.company_size_band, country: c.country,
  tier: (c.icp_tier || '').toUpperCase(), score: Number(c.icp_score || 0), reason: (c.icp_reason || '').replace(/^[ABC] \([^)]*\)\.\s*/, ''),
  owner: OWNER[c.hubspot_owner_id] || '', stage: c.lifecyclestage, dedupe: c.dedupe_status, dedupe_reason: c.dedupe_reason,
  inferred: parse(c.inferred_fields, []).length, source: c.enrichment_source });

return [{ json: {
  generated_at: new Date().toISOString(),
  kpis: { contacts: contacts.length, before: avg('before'), after: avg('after'), merged: count('dedupe_status', 'merged'),
          review: count('dedupe_status', 'needs_review'), tier_a: count('icp_tier', 'a'), tier_b: count('icp_tier', 'b'), tier_c: count('icp_tier', 'c'),
          mqls: contacts.filter(c => ['marketingqualifiedlead', 'salesqualifiedlead'].includes(c.lifecyclestage)).length,
          inferred_values: contacts.reduce((s, c) => s + parse(c.inferred_fields, []).length, 0) },
  fields, owners, regions,
  handoff: scored.filter(c => ['marketingqualifiedlead', 'salesqualifiedlead'].includes(c.lifecyclestage) || c.icp_tier === 'a')
    .sort((a, b) => Number(b.icp_score) - Number(a.icp_score)).map(person),
  dedupe: contacts.filter(c => ['merged', 'needs_review'].includes(c.dedupe_status)).map(person),
  rows: contacts.map(person),
} }];
