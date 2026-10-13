// M3 · Fact guard (every quote / evidence must exist word-for-word in the transcript), then build
// one DeepSeek request per asset: blog, YouTube pack, infographic outline, social posts.

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

const inp = $('Read inputs').first().json;
const tr = $('Format transcript').first().json;
const ins = parseAI($json, 'Insight extraction');

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const T = norm(tr.transcript);
const ok = s => !!s && norm(s).length > 10 && T.includes(norm(s));
const verdict = (arr, key) => (arr || []).map(x => ({ ...x, verified: ok(x[key]) }));
const insights = verdict(ins.insights, 'evidence'), quotes = verdict(ins.quotes, 'quote'), data = verdict(ins.data_points, 'evidence');
const facts = {
  summary: ins.summary, audience: ins.audience, themes: ins.themes || [], speaker_map: ins.speaker_map || {},
  key_moments: ins.key_moments || [],
  insights: insights.filter(x => x.verified), quotes: quotes.filter(x => x.verified), data_points: data.filter(x => x.verified),
};
const guard = {
  insights: `${facts.insights.length}/${insights.length}`, quotes: `${facts.quotes.length}/${quotes.length}`,
  data_points: `${facts.data_points.length}/${data.length}`,
  dropped: [...insights, ...quotes, ...data].filter(x => !x.verified).map(x => x.quote || x.evidence),
};
if (facts.quotes.length < 3) throw new Error(`Only ${facts.quotes.length} quotes passed the fact guard; refusing to generate content from unverified material`);

const base = `You create content for an enterprise HR-tech brand from a webinar. Audience: HR leaders and HR tech owners.
Use ONLY the facts, quotes and data points provided (all verified against the transcript). Never invent statistics, customers or claims.
Quotes must be used exactly as given, attributed to the speaker. Plain, confident, specific; no hype words, no emojis.
Do NOT add examples, use cases, product capabilities or details that are not in the source material, even if they seem plausible.
Describe the event only as what it was (a webinar conversation); never call it a launch, keynote or announcement.
Return ONLY valid JSON (inside string values never use the " character; use ' instead, except in markdown blockquotes where you may use > ).`;
const ctx = JSON.stringify({ event: inp.event, watch_url: inp.watch_url || null, ...facts });

const asks = {
  blog: `Write a blog post as structured parts (code assembles the markdown and inserts the quotes). JSON:
{ "title": "max 70 chars, a specific insight-led headline (not just the event name)", "slug": "kebab-case", "meta_description": "max 155 chars",
  "intro": ["1-2 paragraphs, 50-80 words each"],
  "sections": [ { "heading": "H2 heading, max 9 words", "paragraphs": ["exactly 3 paragraphs, 55-80 words each, plain prose, no quotes inside"], "quote_index": "index (0-based) of ONE quote from the provided quotes list that fits this section, or -1" } ],
  "closing": "1 paragraph, 40-70 words, soft call to watch the full conversation" }
Write 5 sections built on the insights and data points. Use 3 different quote_index values across the post (not on every section).
Never put quotation marks or quoted speech inside paragraphs; quotes are inserted by code from quote_index.
Explain each source point more fully (what was said, why it matters to an HR leader, how it links to other points), never by adding outside facts or examples.`,
  youtube: `Create the YouTube package. JSON: { "title": "max 70 chars", "chapters": [ { "t": "mm:ss", "title": "max 6 words" } ],
 "description": "max 1500 chars: 2-line hook, 3 bullet takeaways, who it is for (do NOT include the chapter list or links; they are added later)",
 "tags": ["8-12 tags"],
 "thumbnail_brief": { "headline_text": "max 5 words for the thumbnail", "subtext": "max 6 words", "visual_concept": "ONE simple physical-object metaphor for the main idea, e.g. 'four chunky blocks stacked as pillars' (objects only: no style words, no text, no people)",
   "composition": "where text, speaker photo and visual sit", "colors": "palette", "image_prompt": "prompt for an AI image model to create the BACKGROUND only: no text, no logos, no real faces, 16:9" } }
Chapters: use the key_moments; the first must be 00:00; keep their timestamps.`,
  infographic: `Create an infographic outline. JSON: { "title": "max 8 words", "subtitle": "max 14 words",
 "sections": [ { "heading": "max 5 words", "short_line": "max 10 words for the poster, faithful to the content", "content": "the fact or quote it shows", "type": "data_point | quote | insight", "visual": "icon/chart suggestion", "source_timestamp": "mm:ss" } ],
 "footer": "source line naming the session", "layout_notes": "flow and hierarchy", "palette": "colors" }
Use 5-7 sections. Prefer the provided data_points; every section must come from a provided data_point, quote or insight.`,
  social: `Create social posts. JSON: { "linkedin": [ { "hook_type": "stat|contrarian|quote|question|story|how-to|list", "text": "max 1200 chars, line breaks allowed, ends with a question or soft CTA", "hashtags": "3-5 hashtags in ONE string, e.g. #HRTech #HCM" } ],
 "x": [ { "hook_type": "...", "text": "max 260 chars including hashtags" } ],
 "linkedin_image_prompt": "ONE simple scene metaphor for the strongest post, described as objects only (e.g. 'a large dial turning from manual to automatic on a tidy desk'): no style words, no text, no faces" }
Give 5 LinkedIn posts and 5 X posts. Within each platform every post uses a DIFFERENT hook_type.
Each post is built around ONE idea from the source (one insight, quote or data point) and the 5 posts of a platform cover 5 DIFFERENT ideas.
Do not list the same framework or repeat the same statistic across posts. Vary length: some LinkedIn posts short (40-80 words), some longer.`,
};

return Object.entries(asks).map(([asset, ask]) => ({ json: {
  asset, guard, facts,
  request_body: {
    model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: asset === 'social' ? 0.8 : 0.5, max_tokens: 5000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: base }, { role: 'user', content: `${ask}\n\nSOURCE MATERIAL:\n${ctx}` }],
  },
} }));
