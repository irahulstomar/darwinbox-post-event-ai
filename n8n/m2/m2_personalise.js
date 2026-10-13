// M2 · Guardrail the generated copy, render the 3 segment emails, and personalise every contact
// (subject A/B/C variant, persona opener, industry line, UTM-tagged links) as HubSpot properties.

const inp = $('Read inputs').first().json;
const g = $('Fact guard + copy prompt').first().json;
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
const copy = parseAI($json, 'Copy generation');

// ---------- guardrails ----------
const issues = [];
const allowedNumbers = new Set([...JSON.stringify(g.stats).matchAll(/\d+/g)].map(m => m[0])
  .concat([...$('Format transcript').first().json.transcript.matchAll(/\d+/g)].map(m => m[0])).concat(['1', '2', '3']));
const checkText = (where, s) => {
  if (!s || typeof s !== 'string') { issues.push(`${where}: missing`); return; }
  if (/\{\{|\}\}|https?:\/\//.test(s)) issues.push(`${where}: contains a token or URL`);
  for (const n of s.match(/\d+/g) || []) if (!allowedNumbers.has(n)) issues.push(`${where}: number "${n}" is not in the data`);
};
for (const seg of ['attendee', 'no_show', 'speaker']) {
  const c = copy[seg] || {};
  if (!Array.isArray(c.subjects) || c.subjects.length < 3) issues.push(`${seg}: needs 3 subject lines`);
  (c.subjects || []).forEach((s, i) => { if (s.length > 70) issues.push(`${seg} subject ${i + 1} longer than 70 chars`); });
  for (const [k, v] of Object.entries(c)) if (k !== 'subjects') checkText(`${seg}.${k}`, v);
}
(copy.takeaway_snippets || []).forEach((s, i) => checkText(`snippet ${i + 1}`, s));
const blocking = issues.filter(i => /missing|token or URL|needs 3/.test(i));
if (blocking.length) throw new Error('Copy failed guardrails: ' + blocking.join('; '));

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const utm = (url, content) => {
  if (!url) return '';
  const [base, hashPart] = url.split('#');
  const q = `utm_source=hubspot&utm_medium=email&utm_campaign=${encodeURIComponent(inp.utm_campaign)}&utm_content=${encodeURIComponent(content)}`;
  return base + (base.includes('?') ? '&' : '?') + q + (hashPart ? '#' + hashPart : '');
};
const hash = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const VARIANTS = ['A', 'B', 'C'];

const takeawaysHtml = g.takeaways.map((t, i) => `<li style="margin-bottom:12px"><strong>${esc(copy.takeaway_snippets?.[i] || t.headline)}</strong><br>
<em style="color:#555">&ldquo;${esc(t.quote)}&rdquo; &mdash; ${esc(t.speaker)}, ${esc(t.timestamp)}</em></li>`).join('');
const button = (href, text) => `<p style="margin:20px 0"><a href="${href}" style="background:#1f5eff;color:#ffffff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${esc(text)}</a></p>`;
const sign = `<p>${esc(inp.from_name)}</p>`;

const html = {
  attendee: `<p>Hi {{ personalization_token('contact.firstname', 'there') }},</p><p>${esc(copy.attendee.intro)}</p><p>{{ contact.pe_opening_line }}</p>
<p><strong>${esc(copy.attendee.takeaways_lead)}</strong></p><ol>${takeawaysHtml}</ol>
<p>{{ contact.pe_industry_line }}</p><p>${esc(copy.attendee.recording_line)}</p>
${button('{{ contact.pe_recording_url }}', 'Watch the recording')}
<p>${esc(copy.attendee.cta_line)} <a href="{{ contact.pe_cta_url }}">${esc(copy.attendee.cta_text)}</a></p>
<p>${esc(copy.attendee.closing)}</p>${sign}`,
  no_show: `<p>Hi {{ personalization_token('contact.firstname', 'there') }},</p><p>${esc(copy.no_show.intro)}</p><p>{{ contact.pe_opening_line }}</p>
${button('{{ contact.pe_recording_url }}', 'Watch the full recording')}
<p><strong>${esc(copy.no_show.takeaways_lead)}</strong></p><ol>${takeawaysHtml}</ol>
<p>{{ contact.pe_industry_line }}</p><p>${esc(copy.no_show.cta_line)} <a href="{{ contact.pe_cta_url }}">${esc(copy.no_show.cta_text)}</a></p>
<p>${esc(copy.no_show.closing)}</p>${sign}`,
  speaker: `<p>Hi {{ personalization_token('contact.firstname', 'there') }},</p><p>${esc(copy.speaker.intro)}</p>
<p><strong>${esc(copy.speaker.snapshot_lead)}</strong></p>
<table cellpadding="6" style="border-collapse:collapse;font-size:14px">
<tr><td>Registered</td><td><strong>${g.stats.registrants}</strong> people from ${g.stats.companies} companies in ${g.stats.countries} countries</td></tr>
<tr><td>Attended live</td><td><strong>${g.stats.attendees}</strong> (${g.stats.attendance_rate_pct}% of registrants)</td></tr>
<tr><td>Avg. time watched</td><td><strong>${g.stats.avg_minutes} min</strong>; ${g.stats.stayed_30_plus_pct}% stayed 30+ min</td></tr>
<tr><td>Audience questions</td><td><strong>${g.stats.questions}</strong></td></tr>
<tr><td>Director level or above</td><td><strong>${g.stats.director_plus_pct}%</strong> of attendees</td></tr>
<tr><td>Top industries</td><td>${esc(g.stats.top_industries.join(', '))}</td></tr></table>
<p><strong>Your most-quoted moment:</strong><br><em>{{ contact.pe_speaker_quote }}</em></p>
${button('{{ contact.pe_recording_url }}', 'See the recording')}
<p>${esc(copy.speaker.closing)}</p>${sign}`,
};

// ---------- per-contact personalisation ----------
const SEG = { attended: 'attendee', no_show: 'no_show', speaker: 'speaker' };
const members = { attendee: [], no_show: [], speaker: [] };
const nowIso = new Date().toISOString();
const inputs = g.contacts.map(c => {
  const seg = SEG[c.event_attendance_status] || 'no_show';
  const v = hash(c.id) % 3, variant = VARIANTS[v];
  const persona = g.persona_by_id[c.id] || 'other';
  members[seg].push(c.id);
  const name = `${c.firstname || ''} ${c.lastname || ''}`.trim();
  const q = g.bestQuotes[name];
  const props = {
    pe_subject: (copy[seg].subjects[v] || copy[seg].subjects[0]).replace(/\{first_name\}/g, c.firstname || 'there'),
    pe_opening_line: seg === 'speaker' ? '' : (copy.persona_openers?.[persona] || ''),
    pe_industry_line: copy.industry_lines?.[c.company_industry] || '',
    pe_recording_url: utm(inp.recording_url, `${seg}_${variant}`),
    pe_cta_url: utm(inp.cta_url || inp.recording_url, `${seg}_${variant}_cta`),
    pe_speaker_snapshot: seg === 'speaker' ? `${g.stats.attendees} attended live (${g.stats.attendance_rate_pct}%), avg ${g.stats.avg_minutes} min, ${g.stats.questions} questions` : '',
    pe_speaker_quote: seg === 'speaker' && q ? `"${q.quote}" (${q.timestamp})` : '',
    postevent_email_variant: `${seg}_${variant}_${persona}`,
    utm_campaign_postevent: inp.utm_campaign,
    pe_sent_at: nowIso,
  };
  return { id: c.id, properties: props };
});

const LABEL = { attendee: 'Attendees: thank-you', no_show: 'No-shows: catch-up', speaker: 'Speakers: thank-you' };
const segments = Object.keys(html).map(seg => ({
  segment: seg, label: LABEL[seg], member_ids: members[seg],
  list: { name: `${inp.event.slice(0, 60)} · ${LABEL[seg]} · ${inp.runId}`, objectTypeId: '0-1', processingType: 'MANUAL' },
  email: {
    name: `${inp.event.slice(0, 60)} · ${LABEL[seg]} · ${inp.runId}`,
    subject: '{{ contact.pe_subject }}',
    from: { fromName: inp.from_name, replyTo: inp.reply_to || undefined },
    content: { templatePath: '@hubspot/email/dnd/Plain_email.html',
      widgets: { primary_rich_text_module: { id: 'primary_rich_text_module', name: 'primary_rich_text_module', type: 'module',
        module_id: 1155639, body: { html: html[seg], module_id: 1155639 } } } },
  },
  subjects: copy[seg].subjects, preview: copy[seg].preview,
}));

return [{ json: { batch: { inputs }, segments, issues, copy, takeaways: g.takeaways, rejected: g.rejected, stats: g.stats } }];
