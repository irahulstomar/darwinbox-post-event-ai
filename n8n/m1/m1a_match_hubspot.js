// M1a · Match each person against existing HubSpot contacts.
// Rules (confidence):
//   1.00  exact email match                      -> update existing (Merged)
//   0.95  same full name + same company          -> update existing (Merged)
//   0.80  similar name (JW >= 0.85) + same company -> create, flag "Needs review"
//   else  create new
// Output: one item per person with hs_props ready to create/update.

const normOrg = s => (s || '').toLowerCase().replace(/['’.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(ltd|limited|pvt|private|inc|corp|corporation|co|plc|llc|holding|holdings|group|e retail|bank)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
function orgSim(a, b) {
  const A = new Set(normOrg(a).split(' ').filter(Boolean)), B = new Set(normOrg(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  return [...A].filter(x => B.has(x)).length / Math.min(A.size, B.size);
}
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
const full = (f, l) => `${f || ''} ${l || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
const domainOf = e => ((e || '').split('@')[1] || '').replace(/\.example\.com$/, '');

const crm = ($('Load CRM contacts').first().json.results || []).map(c => ({ id: c.id, ...c.properties }));
const people = $('Parse & clean CSV').all().map(i => i.json);

return people.map(p => {
  let match = null, confidence = 0, reason = 'No match in HubSpot: new contact';
  const byEmail = crm.find(c => (c.email || '').toLowerCase() === p.email || p.other_emails.includes((c.email || '').toLowerCase()));
  if (byEmail) { match = byEmail; confidence = 1; reason = `Exact email match with HubSpot contact ${byEmail.id}`; }
  else {
    let best = null, bestScore = 0, bestKind = '';
    for (const c of crm) {
      const nameJW = jaroWinkler(full(p.firstname, p.lastname), full(c.firstname, c.lastname));
      const sameCo = Math.max(orgSim(p.company, c.company), p.company_domain && p.company_domain === domainOf(c.email) ? 1 : 0);
      if (sameCo < 0.6) continue;
      if (nameJW === 1 && 0.95 > bestScore) { best = c; bestScore = 0.95; bestKind = 'same name, same company'; }
      else if (nameJW >= 0.85 && 0.8 > bestScore) { best = c; bestScore = 0.8; bestKind = `similar name (${nameJW.toFixed(2)}), same company`; }
    }
    if (best) {
      confidence = bestScore;
      if (bestScore >= 0.9) { match = best; reason = `Fuzzy match: ${bestKind} as HubSpot contact ${best.id} (${best.firstname} ${best.lastname}, ${best.company})`; }
      else reason = `Possible duplicate of HubSpot contact ${best.id} (${best.firstname} ${best.lastname}, ${best.company}): ${bestKind}. Created separately for SDR review.`;
    }
  }
  const status = match ? 'merged' : (confidence >= 0.75 ? 'needs_review' : 'new');
  if (p.infile_merge_note) reason = `${p.infile_merge_note}. ${reason}`;

  const props = {
    firstname: p.firstname, lastname: p.lastname, jobtitle: p.jobtitle, company: p.company,
    phone: p.phone || undefined,
    country: p.country || undefined,
    event_name: p.event_name, event_attendance_status: p.attendance,
    time_in_session_min: p.attendance === 'no_show' ? 0 : p.time_in_session_min,
    questions_asked: p.questions_asked,
    dedupe_status: status, dedupe_reason: reason, match_confidence: confidence,
    data_completeness_before_pct: p.data_completeness_before_pct,
    fields_missing_before: JSON.stringify(p.fields_missing_before),
    m1_run_id: p.m1_run_id,
    enrichment_source: 'input',
  };
  if (!match) props.email = p.email;               // never overwrite the CRM's email on a merge
  if (match && !props.jobtitle) delete props.jobtitle;
  Object.keys(props).forEach(k => props[k] === undefined && delete props[k]);

  return { json: { ...p, hubspot_id: match ? match.id : null, dedupe_status: status, dedupe_reason: reason,
                   match_confidence: confidence, hs_props: props } };
});
