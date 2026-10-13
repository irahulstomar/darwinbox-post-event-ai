// Hub · M4 metrics from HubSpot event contacts: KPIs, funnel, interest scores, accounts + buying committees,
// lifecycle movement (7/14/30 days), daily engagement, and statistical anomaly candidates for the AI to judge.

const EVENT = 'Darwinbox Cortex and the AI-Native Era of HCM';
const DAY = 86400000;
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const dayStr = d => new Date(d).toISOString().slice(0, 10);
const daysAgo = s => Math.round((today - new Date(s + 'T00:00:00Z')) / DAY);
const parse = (s, fb) => { try { return JSON.parse(s || ''); } catch (e) { return fb; } };
const normOrg = s => String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(ltd|limited|pvt|private|inc|corp|corporation|co|plc|llc|holding|holdings|group|bank|e retail)\b/g, ' ').replace(/\s+/g, ' ').trim();

const all = $input.all().flatMap(i => i.json.results || []).map(r => ({ id: r.id, ...r.properties }));
const audience = all.filter(c => c.event_attendance_status !== 'speaker');
const isAtt = c => c.event_attendance_status === 'attended';
const stageRank = { subscriber: 0, lead: 1, marketingqualifiedlead: 2, salesqualifiedlead: 3, opportunity: 4, customer: 5 };
const atLeastMql = c => (stageRank[c.lifecyclestage] ?? -1) >= 2;

// ---------- per-contact signals + interest score ----------
const eventDay = (() => { const d = audience.map(c => parse(c.lifecycle_history, []).find(h => h.stage === 'marketingqualifiedlead')).filter(Boolean).map(h => h.date).sort(); return d[0] || dayStr(today - DAY); })();
const people = audience.map(c => {
  const log = parse(c.engagement_log, []);
  const post = log.filter(e => e.d >= eventDay && !/registration/.test(e.s || ''));
  const n = t => post.filter(e => e.t === t).length;
  const last = log.length ? log[log.length - 1].d : null;
  const signals = { opens: n('open'), clicks: n('click'), page_views: n('page_view'), form_fills: n('form_fill'),
    pricing_views: post.filter(e => /pricing/.test(e.s || '')).length, demo_request: post.some(e => /demo request/.test(e.s || '')) };
  let base = (isAtt(c) ? 20 : 0) + Math.min(Number(c.time_in_session_min || 0), 40) / 2 + Number(c.questions_asked || 0) * 6
    + signals.opens * 3 + signals.clicks * 8 + signals.page_views * 4 + signals.form_fills * 15 + signals.pricing_views * 4;
  const idle = last ? Math.max(0, daysAgo(last)) : 30;
  base = Math.round(Math.min(100, base * (1 - Math.min(idle, 30) / 45)));
  return { id: c.id, name: `${c.firstname || ''} ${c.lastname || ''}`.trim(), title: c.jobtitle || '', company: c.company || '',
    account: normOrg(c.company), function: c.job_function || '', seniority: c.seniority || '', tier: (c.icp_tier || '').toUpperCase(),
    stage: c.lifecyclestage || '', attendance: c.event_attendance_status, minutes: Number(c.time_in_session_min || 0),
    questions: Number(c.questions_asked || 0), industry: c.company_industry || '', country: c.country || '',
    signals, base_score: base, last_engaged: last, seeded: c.engagement_source === 'seeded_demo', log };
});

// ---------- KPIs + funnel ----------
const attended = people.filter(p => p.attendance === 'attended');
const mqlPlus = people.filter(p => (stageRank[p.stage] ?? -1) >= 2);
const kpis = {
  registrants: people.length, attended: attended.length, no_shows: people.length - attended.length,
  attendance_rate: Math.round(100 * attended.length / Math.max(1, people.length)),
  mqls: mqlPlus.length, sqls: people.filter(p => (stageRank[p.stage] ?? -1) >= 3).length,
  attendee_to_mql: Math.round(100 * attended.filter(p => (stageRank[p.stage] ?? -1) >= 2).length / Math.max(1, attended.length)),
  avg_interest: Math.round(people.reduce((s, p) => s + p.base_score, 0) / Math.max(1, people.length)),
  tier_a: people.filter(p => p.tier === 'A').length,
};
const funnel = [
  { label: 'Registered', value: kpis.registrants }, { label: 'Attended', value: kpis.attended },
  { label: 'MQL', value: kpis.mqls }, { label: 'SQL', value: kpis.sqls },
];

// ---------- lifecycle movement: stage entries within 7 / 14 / 30 days ----------
const movement = [7, 14, 30].map(w => {
  const row = { window: w, lead: 0, marketingqualifiedlead: 0, salesqualifiedlead: 0 };
  audience.forEach(c => parse(c.lifecycle_history, []).forEach(h => { if (h.date && daysAgo(h.date) <= w && row[h.stage] !== undefined) row[h.stage]++; }));
  return row;
});

// ---------- daily engagement (last 30 days) ----------
const days = Array.from({ length: 30 }, (_, i) => dayStr(today - (29 - i) * DAY));
const timeline = days.map(d => {
  const t = { date: d, open: 0, click: 0, page_view: 0, form_fill: 0 };
  people.forEach(p => p.log.forEach(e => { if (e.d === d && t[e.t] !== undefined) t[e.t]++; }));
  return t;
});

// ---------- accounts + buying committees ----------
const accMap = {};
people.forEach(p => { (accMap[p.account] = accMap[p.account] || []).push(p); });
const accounts = Object.entries(accMap).map(([key, ps]) => {
  const names = {}; ps.forEach(p => { names[p.company] = (names[p.company] || 0) + 1; });
  const fns = [...new Set(ps.map(p => p.function).filter(f => f && f !== 'Other'))];
  return { key, name: Object.entries(names).sort((a, b) => b[1] - a[1])[0][0], industry: ps[0].industry, country: ps[0].country,
    score: ps.reduce((s, p) => s + p.base_score, 0), contacts: ps.length, functions: fns,
    committee: ps.length >= 2 && fns.length >= 2,
    members: ps.sort((a, b) => b.base_score - a.base_score).map(p => ({ name: p.name, title: p.title, function: p.function, seniority: p.seniority, tier: p.tier, score: p.base_score, stage: p.stage })) };
}).sort((a, b) => b.score - a.score);

// ---------- anomaly candidates (statistics only; the AI decides what matters) ----------
const candidates = [];
const todayStr = dayStr(today);
accounts.forEach(a => {
  const counts = days.map(d => accMap[a.key].reduce((s, p) => s + p.log.filter(e => e.d === d).length, 0));
  const prior = counts.slice(0, -1), mean = prior.reduce((s, x) => s + x, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((s, x) => s + (x - mean) ** 2, 0) / prior.length) || 0.5;
  const z = (counts[counts.length - 1] - mean) / sd;
  const activeToday = accMap[a.key].filter(p => p.log.some(e => e.d === todayStr)).length;
  if (z >= 2.5 && counts[counts.length - 1] >= 4) candidates.push({ type: 'account_spike', account: a.name, actions_today: counts[counts.length - 1], baseline_per_day: +mean.toFixed(2), z: +z.toFixed(1), people_active_today: activeToday, contacts: a.contacts });
});
people.filter(p => p.attendance === 'attended' && p.tier === 'A' && (stageRank[p.stage] ?? -1) >= 2 && p.signals.opens + p.signals.clicks + p.signals.page_views + p.signals.form_fills === 0)
  .forEach(p => candidates.push({ type: 'silent_high_fit', contact: p.name, title: p.title, company: p.company, minutes: p.minutes, questions: p.questions, actions_since_event: 0 }));
people.filter(p => p.attendance === 'no_show' && p.signals.clicks + p.signals.page_views + p.signals.form_fills >= 3)
  .forEach(p => candidates.push({ type: 'no_show_high_intent', contact: p.name, title: p.title, company: p.company, pricing_views: p.signals.pricing_views, form_fills: p.signals.form_fills, actions_since_event: p.signals.clicks + p.signals.page_views + p.signals.form_fills }));
const todayTotal = timeline[timeline.length - 1], prev = timeline.slice(0, -1);
const prevAvg = prev.reduce((s, t) => s + t.open + t.click + t.page_view + t.form_fill, 0) / prev.length;
const todaySum = todayTotal.open + todayTotal.click + todayTotal.page_view + todayTotal.form_fill;

const top = [...people].sort((a, b) => b.base_score - a.base_score).slice(0, 12).map(({ log, ...p }) => p);
return [{ json: {
  event: EVENT, generated_at: new Date().toISOString(), seeded: people.some(p => p.seeded),
  kpis, funnel, movement, timeline, engagement_today: todaySum, engagement_prev_avg: +prevAvg.toFixed(1),
  accounts: accounts.slice(0, 8), top_contacts: top, candidates,
} }];
