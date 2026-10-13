// Hub · M4 AI layer request: DeepSeek judges the statistical anomaly candidates, adjusts interest scores for the
// top contacts (with a reason each) and writes the narrative (incl. stage movement over 7/14/30 days).

const m = $json;
const compact = {
  event: m.event, kpis: m.kpis, funnel: m.funnel,
  lifecycle_stage_entries: Object.fromEntries(m.movement.map(r => [`last_${r.window}_days`, { new_leads: r.lead, new_mqls: r.marketingqualifiedlead, new_sqls: r.salesqualifiedlead }])),
  engagement_today: m.engagement_today, engagement_prev_daily_avg: m.engagement_prev_avg,
  anomaly_candidates: m.candidates,
  top_accounts: m.accounts.slice(0, 6).map(a => ({ name: a.name, score: a.score, contacts: a.contacts, functions: a.functions, buying_committee: a.committee,
    members: a.members.map(x => `${x.name} (${x.title || x.function}, ${x.seniority}, tier ${x.tier}, score ${x.score}, ${x.stage})`) })),
  top_contacts: m.top_contacts.map(p => ({ id: p.id, name: p.name, title: p.title, company: p.company, tier: p.tier, stage: p.stage,
    attendance: p.attendance, minutes: p.minutes, questions: p.questions, base_score: p.base_score, signals: p.signals })),
};

const system = `You are a revenue-operations analyst reviewing post-webinar lead data for an enterprise HR-tech company.
Use ONLY the numbers provided. Return ONLY valid JSON (inside string values never use the " character; use ' instead):
{
 "headline": "one sentence, the single most important takeaway, max 20 words",
 "narrative": "5-6 sentences for a sales leader: conversion, lifecycle stage movement over the last 7, 14 and 30 days (use lifecycle_stage_entries exactly: e.g. 'in the last 7 days X new leads, Y new MQLs and Z new SQLs'), where intent is concentrated, and what to do next",
 "anomalies": [ { "title": "max 8 words", "severity": "high | medium | low", "type": "account_spike | silent_high_fit | no_show_high_intent | other",
                  "explanation": "1-2 sentences citing the numbers", "who": "account or contact", "action": "one concrete next step for the SDR" } ],
 "score_adjustments": [ { "id": "contact id", "delta": "integer from -15 to 15", "reason": "max 18 words, cites the signal" } ]
}
Rules:
- anomalies: judge each candidate; keep the ones that matter, order by severity. ONE anomaly per person or account: if a spike is driven by one person who is also a candidate, report it once (as that person's anomaly). You may add at most one 'other' anomaly only if the numbers clearly show it.
- score_adjustments: one entry per top contact. Raise for buying signals (demo request, pricing views, several people from one account), lower for fading interest or poor fit. The base score is a formula; you add judgement.
- Never invent people, accounts or numbers.`;

return [{ json: { metrics: m, request_body: {
  model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.3, max_tokens: 3000, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(compact) }],
} } }];
