// M1b · Validate the DeepSeek output, score ICP fit, assign region + owner + lifecycle stage,
// and build the HubSpot company + contact updates. Runs once per item.

// ---------- editable config (show this in the demo) ----------
const ICP = {
  size:      [[5000, 30], [1000, 25], [500, 18], [200, 8], [0, 0]],           // employees >= n -> points
  region:    { india: 15, sea: 15, mea: 15, na: 10, row: 5 },
  persona:   { 'HR': 20, 'HRIS': 20, 'Talent Acquisition': 18, 'L&D': 16, 'Total Rewards': 18, 'Leadership': 15,
               'Finance': 10, 'IT': 10, 'Operations': 6, 'Consulting': 0, 'Student': 0, 'Other': 0 },
  seniority: { 'C-level': 15, 'VP': 15, 'Director': 12, 'Manager': 7, 'IC': 2, 'Unknown': 0 },
  engagement: { attended: 8, stayed_30_min: 6, asked_question: 6 },          // intent matters as much as fit
  tiers: { A: 75, B: 50 },                                                    // >= A -> A, >= B -> B, else C
  hr_persona_min: 15,                                                         // persona points needed for Tier A
};
const OWNERS = { senior: '169348475', india: '169348477', international: '169348476', speakers: '100973776' };
const REGION_OF = {
  'India': 'india', 'Singapore': 'sea', 'Malaysia': 'sea', 'Philippines': 'sea', 'Indonesia': 'sea', 'Vietnam': 'sea',
  'Thailand': 'sea', 'United Arab Emirates': 'mea', 'UAE': 'mea', 'Saudi Arabia': 'mea', 'Qatar': 'mea', 'Kuwait': 'mea',
  'Oman': 'mea', 'Bahrain': 'mea', 'Egypt': 'mea', 'South Africa': 'mea', 'United States': 'na', 'Canada': 'na',
};
const STAGES = ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist', 'other'];
const ENUMS = {
  job_function: Object.keys(ICP.persona),
  seniority: Object.keys(ICP.seniority),
  disqualifier: ['none', 'student', 'consultant_or_agency', 'hr_tech_vendor', 'personal_use'],
};
// The same 14 fields M1a measured "before".
const COMPLETENESS_FIELDS = ['firstname', 'lastname', 'email', 'jobtitle', 'company', 'country', 'job_function',
  'seniority', 'company_industry', 'company_size_band', 'icp_tier', 'region', 'hubspot_owner_id', 'lifecyclestage'];

// ---------- inputs ----------
const prev = $('Build prompt').item.json;
const c = prev.contact, co = prev.company;
let ai = {}, aiError = '';
try { ai = JSON.parse($json.choices[0].message.content); } catch (e) { aiError = 'DeepSeek returned invalid JSON; used fallbacks'; }
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const fn = pick(ai.job_function, ENUMS.job_function, 'Other');
const sen = pick(ai.seniority, ENUMS.seniority, 'Unknown');
const disq = pick(ai.disqualifier, ENUMS.disqualifier, 'none');
const inferred = Array.isArray(ai.inferred) ? ai.inferred.filter(x => x && x.field).slice(0, 10) : [];

// ---------- company facts: Clay first, AI fallback ----------
let employees = co.employee_count, sizeSource = employees ? 'clay' : '';
if (!employees && Number.isInteger(ai.employee_count_estimate)) { employees = ai.employee_count_estimate; sizeSource = 'llm'; }
const band = employees == null ? null : employees >= 5000 ? '5000plus' : employees >= 1000 ? '1000_4999'
  : employees >= 500 ? '500_999' : employees >= 200 ? '200_499' : '1_199';
const industry = co.industry || ai.industry || null;
const industrySource = co.industry ? 'clay' : (ai.industry ? 'llm' : '');

// ---------- region + country ----------
let country = c.country || '', countrySource = country ? 'input' : '';
if (!country && ai.contact_country) { country = ai.contact_country; countrySource = 'llm'; }
if (!country && co.hq_country) { country = co.hq_country; countrySource = 'clay_hq'; }
const region = REGION_OF[country] || 'row';

// ---------- ICP score ----------
const attendance = c.event_attendance_status;
const isSpeaker = attendance === 'speaker';
const pts = {
  company_size: employees == null ? 0 : ICP.size.find(([n]) => employees >= n)[1],
  region: ICP.region[region] ?? 0,
  persona: ICP.persona[fn] ?? 0,
  seniority: ICP.seniority[sen] ?? 0,
  engagement: (attendance === 'attended' ? ICP.engagement.attended : 0)
    + (Number(c.time_in_session_min) >= 30 ? ICP.engagement.stayed_30_min : 0)
    + (Number(c.questions_asked) > 0 ? ICP.engagement.asked_question : 0),
};
let score = Object.values(pts).reduce((a, b) => a + b, 0);
if (disq !== 'none') { score = Math.min(score, ICP.tiers.B - 1); pts.disqualifier_cap = disq; }
let tier = score >= ICP.tiers.A ? 'a' : score >= ICP.tiers.B ? 'b' : 'c';
// Tier A needs an HR-buyer persona: a big company alone is not enough.
if (tier === 'a' && pts.persona < ICP.hr_persona_min) { tier = 'b'; pts.tier_rule = 'A needs HR-buyer persona'; }

// ---------- owner + lifecycle (forward only) ----------
const owner = isSpeaker ? OWNERS.speakers : tier === 'a' ? OWNERS.senior : region === 'india' ? OWNERS.india : OWNERS.international;
// MQL = attended + Tier A/B + we know their role. Unknown role stays a lead until an SDR qualifies it.
const target = isSpeaker ? 'other'
  : attendance === 'attended' && (tier === 'a' || tier === 'b') && fn !== 'Other' ? 'marketingqualifiedlead' : 'lead';
const current = c.lifecyclestage || '';
const moveStage = !current || STAGES.indexOf(target) > STAGES.indexOf(current);

// ---------- HubSpot payloads ----------
const sourceTags = new Set(['input']);
if (sizeSource === 'clay' || industrySource === 'clay' || co.domain) sourceTags.add('clay');
if (inferred.length || sizeSource === 'llm' || industrySource === 'llm' || countrySource === 'llm') sourceTags.add('llm');
const contactProps = {
  job_function: fn, seniority: sen,
  jobtitle: c.jobtitle || ai.normalized_title || undefined,
  country: country || undefined,
  company_industry: industry || undefined,
  company_size_band: band || undefined,
  icp_tier: isSpeaker ? undefined : tier,
  icp_score: isSpeaker ? undefined : score,
  icp_breakdown: JSON.stringify(pts),
  icp_reason: isSpeaker ? 'Speaker: excluded from ICP scoring' : `${tier.toUpperCase()} (${score}/100${pts.tier_rule ? '; ' + pts.tier_rule : ''}${pts.disqualifier_cap ? '; capped: ' + disq : ''}). ${ai.fit_note || ''}`.trim(),
  region,
  hubspot_owner_id: owner,
  inferred_fields: JSON.stringify([
    ...inferred,
    ...(countrySource === 'llm' || countrySource === 'clay_hq' ? [{ field: 'country', value: country, confidence: 0.7, basis: 'company HQ' }] : []),
    ...(sizeSource === 'llm' ? [{ field: 'company_size', value: String(employees), confidence: 0.6, basis: 'LLM estimate, Clay had no data' }] : []),
  ]),
  enrichment_source: [...sourceTags].join('+'),
};
if (moveStage) contactProps.lifecyclestage = target;
if (aiError) contactProps.inferred_fields = JSON.stringify([{ field: 'all', value: aiError, confidence: 0, basis: 'fallback' }]);

const after = { ...c, ...contactProps, lifecyclestage: moveStage ? target : current };
const filled = COMPLETENESS_FIELDS.filter(f => after[f] !== undefined && after[f] !== null && after[f] !== '' && after[f] !== 'Unknown');
contactProps.data_completeness_pct = Math.round(100 * filled.length / COMPLETENESS_FIELDS.length);
Object.keys(contactProps).forEach(k => contactProps[k] === undefined && delete contactProps[k]);

const companyProps = {
  name: co.name || c.company, domain: co.domain || undefined,
  employee_band: band || undefined, numberofemployees: employees || undefined,
  industry_normalised: industry || undefined, hq_country: co.hq_country || undefined,
  linkedin_company_page: co.linkedin_url || undefined,
  description: co.description || undefined,
  enrichment_source: sizeSource === 'llm' || industrySource === 'llm' ? 'clay+llm' : 'clay',
};
Object.keys(companyProps).forEach(k => companyProps[k] === undefined && delete companyProps[k]);

return { json: { hs_contact_id: prev.hs_contact_id, company_domain: co.domain, company_name: companyProps.name,
                 contact_props: contactProps, company_props: companyProps } };
