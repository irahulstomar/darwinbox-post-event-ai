// M1c · Build the M1 report page from HubSpot: completeness before vs after, dedupe results,
// ICP tiers, routing, and the SDR handoff list (+ HubSpot-ready CSV download).

const FIELDS = ['firstname', 'lastname', 'email', 'jobtitle', 'company', 'country', 'job_function', 'seniority',
  'company_industry', 'company_size_band', 'icp_tier', 'region', 'hubspot_owner_id', 'lifecyclestage'];
const LABEL = { firstname: 'First name', lastname: 'Last name', email: 'Email', jobtitle: 'Job title', company: 'Company',
  country: 'Country', job_function: 'Job function', seniority: 'Seniority', company_industry: 'Industry',
  company_size_band: 'Company size', icp_tier: 'ICP tier', region: 'Region', hubspot_owner_id: 'Owner', lifecyclestage: 'Lifecycle stage' };
const OWNER = { '169348475': 'Neha (Senior SDR)', '169348477': 'Priya (India SDR)', '169348476': 'Aman (SEA/MEA SDR)', '100973776': 'Rahul (speakers)' };
const STAGE = { subscriber: 'Subscriber', lead: 'Lead', marketingqualifiedlead: 'MQL', salesqualifiedlead: 'SQL', other: 'Other' };
const SIZE = { '1_199': '1-199', '200_499': '200-499', '500_999': '500-999', '1000_4999': '1,000-4,999', '5000plus': '5,000+' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const has = v => v !== undefined && v !== null && v !== '' && v !== 'Unknown';

const event = $('Report request').first().json.query?.event || 'Darwinbox Cortex and the AI-Native Era of HCM';
const contacts = $input.all().flatMap(i => i.json.results || []).map(r => ({ id: r.id, ...r.properties }));
const n = contacts.length || 1;

// completeness per field, before vs after
const rows = FIELDS.map(f => {
  const before = contacts.filter(c => { try { return !JSON.parse(c.fields_missing_before || '[]').includes(f); } catch { return false; } }).length;
  const after = contacts.filter(c => has(c[f])).length;
  return { f, before: Math.round(100 * before / n), after: Math.round(100 * after / n) };
});
const avg = k => Math.round(rows.reduce((s, r) => s + r[k], 0) / rows.length);
const count = (k, v) => contacts.filter(c => c[k] === v).length;
const scored = contacts.filter(c => c.event_attendance_status !== 'speaker');
const handoff = scored.filter(c => c.lifecyclestage === 'marketingqualifiedlead' || c.icp_tier === 'a')
  .sort((a, b) => Number(b.icp_score) - Number(a.icp_score));
const review = contacts.filter(c => c.dedupe_status === 'needs_review');
const merged = contacts.filter(c => c.dedupe_status === 'merged');

// HubSpot-ready CSV (import-friendly internal names as headers)
const csvCols = ['email', 'firstname', 'lastname', 'jobtitle', 'company', 'country', 'job_function', 'seniority',
  'company_industry', 'company_size_band', 'region', 'icp_tier', 'icp_score', 'icp_reason', 'hubspot_owner_id',
  'lifecyclestage', 'event_name', 'event_attendance_status', 'dedupe_status'];
const csv = [csvCols.join(','), ...contacts.map(c => csvCols.map(k => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const bar = (p, cls) => `<div class="bar"><span class="${cls}" style="width:${p}%"></span></div><b>${p}%</b>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1 Lead Enrichment Report</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14171f;--muted:#5b6475;--line:#e3e6ec;--before:#c9ced8;--after:#1f7a5a;--a:#1f7a5a;--b:#b7791f;--c:#8a93a5}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--ink:#e8ebf1;--muted:#9aa3b5;--line:#2a2f3a;--before:#3a4150;--after:#3fb68b;--a:#3fb68b;--b:#e0a542;--c:#7d8699}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.k{color:var(--muted);font-size:12px}.v{font-size:24px;font-weight:650}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
.bar{display:inline-block;width:110px;height:8px;background:var(--line);border-radius:4px;margin-right:6px;vertical-align:middle}.bar span{display:block;height:100%;border-radius:4px}
.before{background:var(--before)}.after{background:var(--after)}.t{font-weight:700}.ta{color:var(--a)}.tb{color:var(--b)}.tc{color:var(--c)}
.wrap{overflow-x:auto}a.btn{display:inline-block;margin-top:8px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;color:var(--ink);text-decoration:none;background:var(--card)}
.muted{color:var(--muted)}
</style></head><body><main>
<h1>Lead Enrichment Report</h1>
<p class="sub">${esc(event)} · ${contacts.length} contacts in HubSpot · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
<div class="grid">
 <div class="card"><div class="k">Completeness before</div><div class="v">${avg('before')}%</div></div>
 <div class="card"><div class="k">Completeness after</div><div class="v">${avg('after')}%</div></div>
 <div class="card"><div class="k">Merged with existing CRM</div><div class="v">${merged.length}</div></div>
 <div class="card"><div class="k">Needs review</div><div class="v">${review.length}</div></div>
 <div class="card"><div class="k">ICP tier A / B / C</div><div class="v"><span class="ta">${count('icp_tier', 'a')}</span> / <span class="tb">${count('icp_tier', 'b')}</span> / <span class="tc">${count('icp_tier', 'c')}</span></div></div>
 <div class="card"><div class="k">MQLs for SDR handoff</div><div class="v">${count('lifecyclestage', 'marketingqualifiedlead')}</div></div>
</div>

<h2>Field completeness: before vs after</h2>
<div class="wrap"><table><tr><th>Field</th><th>Before (raw export)</th><th>After (Clay + DeepSeek + rules)</th></tr>
${rows.map(r => `<tr><td>${LABEL[r.f]}</td><td>${bar(r.before, 'before')}</td><td>${bar(r.after, 'after')}</td></tr>`).join('')}
</table></div>

<h2>SDR handoff (${handoff.length})</h2>
<div class="wrap"><table><tr><th>Contact</th><th>Company</th><th>Tier</th><th>Why</th><th>Owner</th><th>Stage</th></tr>
${handoff.map(c => `<tr><td><b>${esc(c.firstname)} ${esc(c.lastname)}</b><br><span class="muted">${esc(c.jobtitle)} · ${esc(c.job_function)} · ${esc(c.seniority)}</span></td>
<td>${esc(c.company)}<br><span class="muted">${esc(c.company_industry)} · ${esc(SIZE[c.company_size_band] || '')} · ${esc(c.country)}</span></td>
<td class="t t${esc(c.icp_tier)}">${esc((c.icp_tier || '').toUpperCase())} ${esc(c.icp_score)}</td><td>${esc((c.icp_reason || '').replace(/^[ABC] \([^)]*\)\.\s*/, ''))}</td>
<td>${esc(OWNER[c.hubspot_owner_id] || c.hubspot_owner_id)}</td><td>${esc(STAGE[c.lifecyclestage] || c.lifecyclestage)}</td></tr>`).join('')}
</table></div>

<h2>Dedupe decisions</h2>
<div class="wrap"><table><tr><th>Contact</th><th>Status</th><th>Reason</th></tr>
${[...review, ...merged].map(c => `<tr><td>${esc(c.firstname)} ${esc(c.lastname)}<br><span class="muted">${esc(c.company)}</span></td><td>${c.dedupe_status === 'merged' ? 'Merged' : 'Needs review'}</td><td>${esc(c.dedupe_reason)}</td></tr>`).join('')}
</table></div>

<h2>HubSpot-ready file</h2>
<a class="btn" download="hubspot_ready_${esc(event.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Download CSV (${contacts.length} rows)</a>
</main></body></html>`;

return [{ json: { html, contacts: contacts.length, completeness_before: avg('before'), completeness_after: avg('after') } }];
