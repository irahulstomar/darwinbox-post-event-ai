// M2 · Fact-guard the extracted quotes, compute the speaker performance snapshot,
// work out which personas/industries are in the audience, and build the copywriting request.

const inp = $('Read inputs').first().json;
const prev = $('Build insight prompt').first().json;
const contacts = prev.contacts;

// Tolerant JSON parse of a DeepSeek reply: strips ``` fences and repairs the two common breakages
// (raw line breaks and stray double quotes inside string values) with a small character scanner.
const parseAI = (resp, what) => {
  const c = resp && resp.choices && resp.choices[0];
  if (!c) throw new Error(`${what}: DeepSeek returned no answer: ${JSON.stringify(resp).slice(0, 300)}`);
  const t = String((c.message && c.message.content) || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const raw = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  try { return JSON.parse(raw); } catch (e1) {}
  // common LLM slips: bare hashtags in arrays, trailing commas
  const raw2 = raw.replace(/([\[,]\s*)(#[A-Za-z0-9_]+)"?(?=\s*[,\]])/g, '$1"$2"')   // bare hashtags
    .replace(/,(\s*[}\]])/g, '$1');                                                    // trailing commas
  try { return JSON.parse(raw2); } catch (e2) {}
  let out = '', inStr = false;
  for (let i = 0; i < raw2.length; i++) {
    const ch = raw2[i];
    if (!inStr) { out += ch; if (ch === '"') inStr = true; continue; }
    if (ch === '\\') { out += ch + (raw2[i + 1] || ''); i++; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r' || ch === '\t') { out += ch === '\t' ? '\\t' : ''; continue; }
    if (ch === '"') {
      let j = i + 1; while (j < raw2.length && /\s/.test(raw2[j])) j++;
      if (j >= raw2.length || ',}]:'.includes(raw2[j])) { out += ch; inStr = false; } else out += '\\"';
      continue;
    }
    out += ch;
  }
  try { return JSON.parse(out); }
  catch (e) { throw new Error(`${what}: invalid JSON (finish_reason=${c.finish_reason}, ${t.length} chars). Starts: ${t.slice(0, 160)}`); }
};
const ins = parseAI($json, 'Insight extraction');

// ---------- fact guard: every quote must exist word-for-word in the transcript ----------
const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const T = norm($('Format transcript').first().json.transcript);
const checked = (ins.takeaways || []).map(t => ({ ...t, quote_verified: !!t.quote && T.includes(norm(t.quote)) }));
const takeaways = checked.filter(t => t.quote_verified).slice(0, 3);
const rejected = checked.filter(t => !t.quote_verified).map(t => ({ headline: t.headline, quote: t.quote }));
if (takeaways.length < 3) throw new Error(`Only ${takeaways.length} takeaways passed the fact guard; refusing to write emails from unverified quotes`);
const bestQuotes = {};
for (const [name, q] of Object.entries(ins.best_quote_by_speaker || {}))
  if (q && T.includes(norm(q.quote))) bestQuotes[name] = q;

// ---------- performance snapshot (computed, never generated) ----------
const audience = contacts.filter(c => c.event_attendance_status !== 'speaker');
const attended = audience.filter(c => c.event_attendance_status === 'attended');
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const count = (arr, k) => arr.reduce((m, c) => (c[k] ? (m[c[k]] = (m[c[k]] || 0) + 1, m) : m), {});
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const stats = {
  registrants: audience.length,
  attendees: attended.length,
  attendance_rate_pct: pct(attended.length, audience.length),
  avg_minutes: Math.round(attended.reduce((s, c) => s + Number(c.time_in_session_min || 0), 0) / (attended.length || 1)),
  stayed_30_plus_pct: pct(attended.filter(c => Number(c.time_in_session_min) >= 30).length, attended.length),
  questions: attended.reduce((s, c) => s + Number(c.questions_asked || 0), 0),
  director_plus_pct: pct(attended.filter(c => ['C-level', 'VP', 'Director'].includes(c.seniority)).length, attended.length),
  companies: new Set(audience.map(c => (c.company || '').toLowerCase())).size,
  countries: new Set(audience.map(c => c.country).filter(Boolean)).size,
  top_industries: top(count(audience, 'company_industry'), 3),
};

// ---------- personas in the audience ----------
const personaOf = c => {
  const fn = c.job_function, sen = c.seniority;
  if (['HRIS', 'IT'].includes(fn)) return 'hr_tech';
  if (['Talent Acquisition', 'L&D'].includes(fn)) return 'talent';
  if (['Finance', 'Operations'].includes(fn)) return 'finance_ops';
  if (['HR', 'Leadership', 'Total Rewards'].includes(fn)) return ['C-level', 'VP', 'Director'].includes(sen) ? 'hr_leader' : 'hr_practitioner';
  return 'other';
};
const industries = top(count(audience, 'company_industry'), 8);

const system = `You write post-webinar emails for an enterprise HR-tech company. Audience: HR leaders and HR tech owners.
Tone: warm, specific, concise, no hype, no emojis. Never use placeholders except {first_name} in subject lines.
Use ONLY the facts provided. Do not invent numbers, customers or features. No URLs (links are added later).
Describe the event only as what it was (a webinar conversation); never call it a launch, keynote or announcement unless the summary says so.
Any number you use must keep its exact meaning from the takeaways or stats (e.g. if a speaker says "four pillars", never write "3 pillars").
Avoid numbers in subject lines unless they come straight from the stats.
Return ONLY valid JSON (inside string values never use the " character; use ' instead):
{
 "takeaway_snippets": ["max 20 words, one per takeaway, same order: the so-what for an HR leader; must NOT repeat the headline"],
 "attendee": { "subjects": ["3 distinct subject lines, max 60 chars"], "preview": "max 90 chars",
               "intro": "thank them for attending, 1-2 sentences", "takeaways_lead": "short lead-in to the 3 takeaways",
               "recording_line": "1 sentence inviting them to rewatch or share the recording", "cta_line": "1 sentence leading to the CTA",
               "cta_text": "2-5 word button text", "closing": "1 sentence" },
 "no_show": { same keys as attendee; the intro is a friendly 'sorry we missed you' catch-up and the recording is the main CTA },
 "speaker": { "subjects": ["3 lines, max 60 chars"], "preview": "max 90 chars", "intro": "thank the speaker warmly and specifically, 2 sentences",
              "snapshot_lead": "1 sentence introducing the audience numbers", "closing": "1-2 sentences, e.g. offer to share the recording clips" },
 "persona_openers": { "hr_leader": "...", "hr_practitioner": "...", "hr_tech": "...", "talent": "...", "finance_ops": "...", "other": "..." },
 "industry_lines": { "<industry exactly as given>": "1 sentence tying the session to that industry" }
}
persona_openers: one sentence each, tying the session to what that persona cares about. Do not mention the person's name.`;

const user = JSON.stringify({
  event: inp.event, summary: ins.event_summary, hook: ins.one_line_hook,
  takeaways: takeaways.map(t => ({ headline: t.headline, detail: t.detail, quote: t.quote, speaker: t.speaker, timestamp: t.timestamp })),
  audience_stats_for_speaker_email: stats,
  industries_present: industries,
});

return [{ json: {
  contacts, takeaways, rejected, bestQuotes, stats, industries,
  persona_by_id: Object.fromEntries(contacts.map(c => [c.id, personaOf(c)])),
  speaker_map: ins.speaker_map || {}, summary: ins.event_summary, hook: ins.one_line_hook,
  request_body: {
    model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.6, max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  },
} }];
