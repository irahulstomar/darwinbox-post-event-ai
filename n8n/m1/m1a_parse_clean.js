// M1a · Parse & clean CSV, then dedupe inside the file.
// Input: one item from the Form Trigger with the CSV as binary + "Event name".
// Output: one item per unique person, with clean fields and "before" completeness.

const PERSONAL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'rediffmail.com', 'proton.me'];
const DEMO_SUFFIX = '.example.com'; // demo-safe emails: name@company.com.example.com
const DIAL_CODES = { '+91': 'India', '+65': 'Singapore', '+60': 'Malaysia', '+63': 'Philippines', '+62': 'Indonesia',
  '+84': 'Vietnam', '+66': 'Thailand', '+971': 'United Arab Emirates', '+966': 'Saudi Arabia', '+974': 'Qatar',
  '+1': 'United States', '+44': 'United Kingdom' };
const COUNTRY_ALIASES = { 'uae': 'United Arab Emirates', 'u.a.e.': 'United Arab Emirates', 'usa': 'United States',
  'us': 'United States', 'uk': 'United Kingdom', 'ksa': 'Saudi Arabia' };
// The 14 fields an SDR needs. "Before" = what the raw export gives us.
const COMPLETENESS_FIELDS = ['firstname', 'lastname', 'email', 'jobtitle', 'company', 'country', 'job_function',
  'seniority', 'company_industry', 'company_size_band', 'icp_tier', 'region', 'hubspot_owner_id', 'lifecyclestage'];

// ---------- helpers ----------
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row); }
  const header = rows.shift().map(h => h.trim().replace(/^﻿/, ''));
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const squash = s => (s || '').replace(/\s+/g, ' ').trim();
const titleCase = s => squash(s).toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (m, p, ch) => p + ch.toUpperCase());
const normOrg = s => squash(s).toLowerCase().replace(/['’.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(ltd|limited|pvt|private|inc|corp|corporation|co|plc|llc|holding|holdings|group|e retail)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
function jaroWinkler(a, b) {
  a = a || ''; b = b || ''; if (a === b) return 1; if (!a || !b) return 0;
  const md = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false); let m = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++)
    if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let l = 0; while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}
// Company similarity: token containment, so "Nykaa" ~ "Nykaa E-Retail" and "TATA STEEL" ~ "Tata Steel Limited".
function orgSim(a, b) {
  const A = new Set(normOrg(a).split(' ').filter(Boolean)), B = new Set(normOrg(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / Math.min(A.size, B.size);
}
const nameKey = (f, l) => [f, l].join(' ').toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');

// ---------- read the upload ----------
const upload = $input.first();
const binKey = Object.keys(upload.binary || {})[0];
if (!binKey) throw new Error('No CSV file found in the form submission');
const csvText = (await this.helpers.getBinaryDataBuffer(0, binKey)).toString('utf8');
const eventName = squash(upload.json['Event name']) || 'Untitled event';
const runId = 'm1-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const raw = parseCsv(csvText);

// ---------- clean each row ----------
const cleaned = raw.map((r, i) => {
  const email = (r['Email'] || '').toLowerCase().replace(/\s+/g, '');
  let host = email.split('@')[1] || '';
  if (host.endsWith(DEMO_SUFFIX)) host = host.slice(0, -DEMO_SUFFIX.length);
  const isPersonal = PERSONAL_DOMAINS.includes(host);
  let country = squash(r['Country/Region Name']), countrySource = country ? 'input' : '';
  if (country && COUNTRY_ALIASES[country.toLowerCase()]) country = COUNTRY_ALIASES[country.toLowerCase()];
  if (!country && r['Phone']) {
    const code = Object.keys(DIAL_CODES).sort((a, b) => b.length - a.length).find(c => r['Phone'].startsWith(c));
    if (code) { country = DIAL_CODES[code]; countrySource = 'phone_dial_code'; }
  }
  const role = (r['Role'] || 'Attendee').toLowerCase() === 'panelist' ? 'speaker'
    : ((r['Attended'] || '').toLowerCase() === 'yes' ? 'attended' : 'no_show');
  return {
    src_row: i + 2,
    firstname: titleCase(r['First Name']), lastname: titleCase(r['Last Name']),
    email, email_is_personal: isPersonal, company_domain: isPersonal ? '' : host,
    jobtitle: squash(r['Job Title']), company: squash(r['Organization']),
    country, country_source: countrySource, phone: squash(r['Phone']),
    attendance: role,
    time_in_session_min: Number(r['Time in Session (minutes)']) || 0,
    questions_asked: Number(r['Questions Asked']) || 0,
    registered_at: r['Registration Time'],
  };
});

// ---------- dedupe inside the file ----------
// Same email, or same person (name match, either order) at the same company.
const groups = [];
for (const c of cleaned) {
  const g = groups.find(g => g.some(o =>
    (o.email && o.email === c.email) ||
    (jaroWinkler(nameKey(o.firstname, o.lastname), nameKey(c.firstname, c.lastname)) >= 0.93 &&
      (orgSim(o.company, c.company) >= 0.6 || (o.company_domain && o.company_domain === c.company_domain)))));
  if (g) g.push(c); else groups.push([c]);
}
const rank = c => (c.attendance === 'speaker' ? 4 : c.attendance === 'attended' ? 2 : 0) + (c.email_is_personal ? 0 : 1) + c.time_in_session_min / 100;
const people = groups.map(g => {
  const sorted = [...g].sort((a, b) => rank(b) - rank(a));
  const p = { ...sorted[0] };
  for (const o of sorted.slice(1)) for (const k of ['jobtitle', 'company', 'country', 'phone', 'company_domain'])
    if (!p[k] && o[k]) { p[k] = o[k]; if (k === 'country') p.country_source = o.country_source; }
  p.questions_asked = Math.max(...g.map(x => x.questions_asked));
  p.infile_duplicates = g.length - 1;
  p.infile_merge_note = g.length > 1
    ? `Merged ${g.length} registrations (rows ${g.map(x => x.src_row).join(', ')}): ` +
      (new Set(g.map(x => x.email)).size === 1 ? 'same email' : 'same person at same company, different email')
    : '';
  p.other_emails = [...new Set(g.map(x => x.email))].filter(e => e !== p.email);
  const have = { firstname: p.firstname, lastname: p.lastname, email: p.email, jobtitle: p.jobtitle, company: p.company,
    country: p.country_source === 'input' ? p.country : '' };
  p.fields_missing_before = COMPLETENESS_FIELDS.filter(f => !have[f]);
  p.data_completeness_before_pct = Math.round(100 * (COMPLETENESS_FIELDS.length - p.fields_missing_before.length) / COMPLETENESS_FIELDS.length);
  p.event_name = eventName; p.m1_run_id = runId;
  return p;
});

return people.map(p => ({ json: { ...p, _stats: { raw_rows: raw.length, unique_people: people.length } } }));
