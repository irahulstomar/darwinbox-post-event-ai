// M3 · Validate every generated asset against hard rules, auto-fix what code can fix, and package
// the documents. Outputs the 2 image jobs for FLUX; the documents ride along on the first item.

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
const jobs = $('Fact guard').all().map(i => i.json);
const facts = jobs[0].facts, guard = jobs[0].guard;
const out = {};
const failed = [];
$('DeepSeek: generate assets').all().forEach((it, i) => {
  try { out[jobs[i].asset] = parseAI(it.json, jobs[i].asset); }
  catch (e) { out[jobs[i].asset] = {}; failed.push(`${jobs[i].asset}: ${e.message.slice(0, 120)}`); }   // degrade, don't die
});
// Apply the blog length fix if one was needed (see "Blog length check").
const lenFix = $('Blog length check').first().json;
let blogFixNote = '';
if (lenFix.needed && $json.choices) {
  try { const fixed = parseAI($json, 'Blog length fix'); if (Array.isArray(fixed.sections) && fixed.sections.length) { out.blog = { ...out.blog, ...fixed }; blogFixNote = `expanded from ${lenFix.blog_words_before} words`; } }
  catch (e) { blogFixNote = 'length fix failed: ' + e.message.slice(0, 80); }
}
const checks = [];
const check = (asset, rule, pass, note = '') => checks.push({ asset, rule, pass, note });
failed.forEach(f => check(f.split(':')[0], 'generation failed, re-run this asset', false, f));

// ---------- helpers ----------
const toSec = s => { const p = String(s || '').trim().split(':').map(Number); return p.some(isNaN) ? NaN : p.reduce((a, b) => a * 60 + b, 0); };
const mmss = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const words = md => String(md || '').replace(/[#>*_`\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
const transcriptNumbers = new Set([...tr.transcript.matchAll(/\d[\d,.]*/g)].map(m => m[0].replace(/[,.]$/, '')));
const strayNumbers = s => [...String(s || '').matchAll(/\d[\d,.]*/g)].map(m => m[0].replace(/[,.]$/, ''))
  .filter(n => !transcriptNumbers.has(n) && !/^(19|20)\d\d$/.test(n) && !['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(n));

// ---------- blog ----------
const blog = out.blog || {};
// The blog arrives as structured parts; code assembles the markdown. Quotes come from the VERIFIED list by
// index, so every quote in the post is guaranteed word-for-word. Paragraph text is stripped of stray quote marks.
const sections = (Array.isArray(blog.sections) ? blog.sections : []).map(s => ({
  heading: String(s.heading || '').trim(),
  paragraphs: (s.paragraphs || []).map(p => String(p).replace(/^["“']+|["”']+$/g, '').trim()).filter(Boolean),
  quote: facts.quotes[Number(s.quote_index)] || null,
}));
const usedQuotes = new Set();
sections.forEach(s => { if (s.quote && usedQuotes.has(s.quote.quote)) s.quote = null; else if (s.quote) usedQuotes.add(s.quote.quote); });
const assemble = () => [
  ...(blog.intro || []),
  ...sections.flatMap(s => [`## ${s.heading}`, s.paragraphs[0], ...(s.quote ? [`> "${s.quote.quote}"\n>\n> - ${s.quote.speaker}`] : []), ...s.paragraphs.slice(1)]),
  ...(blog.closing ? ['## Watch the full conversation', blog.closing] : []),
].filter(Boolean).join('\n\n');
// Too long: drop whole secondary paragraphs (never a section's first paragraph, a heading or a quote) from
// the longest section until the post is <= 1150 words. Nothing is reworded, so no fact is altered.
const before = words(assemble());
while (words(assemble()) > 1150) {
  const longest = sections.filter(s => s.paragraphs.length > 1).sort((a, b) => words(b.paragraphs.join(' ')) - words(a.paragraphs.join(' ')))[0];
  if (!longest) break;
  longest.paragraphs.pop();
}
if (before > 1150) blogFixNote = `trimmed from ${before} words by removing secondary paragraphs`;
blog.body_markdown = assemble();
const wc = words(blog.body_markdown);
check('blog', 'quotes inserted from the verified list only', true, `${usedQuotes.size} quotes`);
check('blog', '800-1200 words', wc >= 800 && wc <= 1200, `${wc} words${blogFixNote ? '; ' + blogFixNote : ''}`);
if ((blog.meta_description || '').length > 155) blog.meta_description = blog.meta_description.slice(0, 152).replace(/\s+\S*$/, '') + '...';
check('blog', 'meta description <= 155 chars', (blog.meta_description || '').length <= 155, `${(blog.meta_description || '').length} chars`);
const blogStray = strayNumbers(blog.body_markdown);
check('blog', 'no numbers missing from the transcript', !blogStray.length, blogStray.join(', '));

// ---------- YouTube chapters: YouTube's rules, enforced in code ----------
const yt = out.youtube || {};
let ch = (yt.chapters || []).map(c => ({ s: toSec(c.t), title: String(c.title || '').trim() })).filter(c => !isNaN(c.s) && c.title).sort((a, b) => a.s - b.s);
if (ch.length && ch[0].s !== 0) ch[0].s = 0;
ch = ch.filter((c, i, a) => i === 0 || c.s - a[i - 1].s >= 10);
if (tr.duration_s) ch = ch.filter(c => c.s < tr.duration_s - 10);
if (ch.length < 3) ch = facts.key_moments.map(k => ({ s: toSec(k.start), title: k.title })).filter(c => !isNaN(c.s)).sort((a, b) => a.s - b.s);
check('youtube', 'chapters: first at 00:00, >= 3, >= 10s apart', ch.length >= 3 && ch[0].s === 0, `${ch.length} chapters`);
const chapterText = ch.map(c => `${mmss(c.s)} ${c.title}`).join('\n');
const description = `${(yt.description || '').trim()}\n\nChapters\n${chapterText}${inp.watch_url ? `\n\nWatch the full session: ${inp.watch_url}` : ''}`;
check('youtube', 'description <= 5000 chars', description.length <= 5000, `${description.length} chars`);

// Chapter QA against the creator's official chapters, if given ("0:00 Title" per line).
let chapterQA = null;
if (inp.official_chapters) {
  const off = inp.official_chapters.split(/\r?\n/).map(l => l.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/)).filter(Boolean).map(m => ({ s: toSec(m[1]), title: m[2].trim() }));
  const rows = off.map(o => { const near = ch.reduce((b, c) => (Math.abs(c.s - o.s) < Math.abs(b.s - o.s) ? c : b), ch[0]); const d = Math.abs(near.s - o.s); return { official: `${mmss(o.s)} ${o.title}`, ai: `${mmss(near.s)} ${near.title}`, diff_s: d, match: d <= 90 }; });
  chapterQA = { matched: rows.filter(r => r.match).length, total: rows.length, rows };
  check('youtube', 'AI chapters vs official chapters (within 90s)', chapterQA.matched / Math.max(1, chapterQA.total) >= 0.6, `${chapterQA.matched}/${chapterQA.total} matched`);
}

// ---------- infographic ----------
const ig = out.infographic || {};
const secs = ig.sections || [];
check('infographic', '5-7 sections', secs.length >= 5 && secs.length <= 7, `${secs.length} sections`);
const igStray = secs.flatMap(s => strayNumbers(s.content));
check('infographic', 'every number appears in the transcript', !igStray.length, igStray.join(', '));

// ---------- social ----------
const so = out.social || {};
const li = so.linkedin || [], xs = (so.x || []).map(p => {
  let text = String(p.text || '');
  if (text.length > 280) text = text.slice(0, 277).replace(/\s+\S*$/, '') + '…';
  return { ...p, text };
});
const distinct = a => new Set(a.map(p => p.hook_type)).size === a.length;
check('social', '5-10 posts total', li.length + xs.length >= 5 && li.length + xs.length <= 10, `${li.length} LinkedIn + ${xs.length} X`);
check('social', 'X posts <= 280 chars', xs.every(p => p.text.length <= 280));
check('social', 'distinct hooks per platform', distinct(li) && distinct(xs), [...li, ...xs].map(p => p.hook_type).join(', '));

// ---------- documents ----------
const T = inp.tag;
const md = {};
const speakersLine = Object.values(facts.speaker_map || {}).join(' and ');
md.blog = `# ${blog.title}\n\n_Meta description:_ ${blog.meta_description}\n_Slug:_ ${blog.slug}  ·  _Words:_ ${wc}\n\n---\n\n`
  + `_From the webinar "${inp.event}"${speakersLine ? ` with ${speakersLine}` : ''}._\n\n${blog.body_markdown}\n`
  + (inp.watch_url ? `\n**Watch the full conversation:** ${inp.watch_url}\n` : '');
const tb = yt.thumbnail_brief || {};
md.youtube = `# YouTube package\n\n## Title\n${yt.title}\n\n## Description (paste as is)\n${description}\n\n## Tags\n${(yt.tags || []).join(', ')}\n\n## Thumbnail brief\n- Headline text: ${tb.headline_text}\n- Subtext: ${tb.subtext}\n- Visual concept: ${tb.visual_concept}\n- Composition: ${tb.composition}\n- Colors: ${tb.colors}\n- Finished thumbnail: see "02b YouTube thumbnail" in this folder (generated with the headline text)\n`;
md.infographic = `# Infographic outline: ${ig.title}\n_${ig.subtitle}_\n\n${secs.map((s, i) => `## ${i + 1}. ${s.heading}\n- Content: ${s.content}\n- Type: ${s.type}\n- Visual: ${s.visual}\n- Source: ${s.source_timestamp}`).join('\n\n')}\n\n**Footer:** ${ig.footer}\n\n**Layout:** ${ig.layout_notes}\n\n**Palette:** ${ig.palette}\n`;
md.social = `# Social posts\n\n## LinkedIn\n${li.map((p, i) => `### ${i + 1}. Hook: ${p.hook_type}\n${p.text}\n\n${(Array.isArray(p.hashtags) ? p.hashtags : String(p.hashtags || '').split(/\s+/)).filter(Boolean).map(h => (String(h).startsWith('#') ? h : '#' + h)).join(' ')}`).join('\n\n')}\n\n## X\n${xs.map((p, i) => `### ${i + 1}. Hook: ${p.hook_type} (${p.text.length} chars)\n${p.text}`).join('\n\n')}\n`;
md.facts = `# Source insights & fact check\n\n${facts.summary}\n\n## Fact guard\n- Insights verified: ${guard.insights}\n- Quotes verified: ${guard.quotes}\n- Data points verified: ${guard.data_points}\n${guard.dropped.length ? `- Dropped (not word-for-word in transcript):\n${guard.dropped.map(d => `  - ${d}`).join('\n')}` : '- Nothing dropped'}\n\n## Quality checks\n${checks.map(c => `- ${c.pass ? 'PASS' : 'CHECK'}: ${c.asset}: ${c.rule}${c.note ? ` (${c.note})` : ''}`).join('\n')}\n\n${chapterQA ? `## AI chapters vs official chapters\n${chapterQA.rows.map(r => `- ${r.match ? 'match' : 'miss'}: official ${r.official} | AI ${r.ai} (${r.diff_s}s)`).join('\n')}\n\n` : ''}## Verified quotes\n${facts.quotes.map(q => `- "${q.quote}" (${q.speaker}, ${q.timestamp})`).join('\n')}\n\n## Verified data points\n${facts.data_points.map(d => `- ${d.fact} (${d.timestamp})`).join('\n')}\n\n## Transcription\n${tr.source}\n`;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const infographicHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ig.title)}</title><style>
body{margin:0;background:#0b1f3a;font-family:Arial,Helvetica,sans-serif;color:#fff}main{max-width:820px;margin:0 auto;padding:40px 32px}
h1{font-size:34px;margin:0 0 6px;color:#3fe0c5}p.sub{font-size:17px;color:#c9d6ea;margin:0 0 28px}
.s{display:flex;gap:18px;align-items:flex-start;background:#12305a;border-radius:14px;padding:18px 20px;margin-bottom:14px}
.n{flex:0 0 42px;height:42px;border-radius:50%;background:#3fe0c5;color:#0b1f3a;font-weight:700;font-size:20px;display:flex;align-items:center;justify-content:center}
h2{font-size:19px;margin:0 0 6px}.c{font-size:15px;line-height:1.5;color:#e6edf7}.t{font-size:12px;color:#8fb3d9;margin-top:6px}
footer{font-size:12px;color:#8fb3d9;margin-top:22px}</style></head><body><main>
<h1>${esc(ig.title)}</h1><p class="sub">${esc(ig.subtitle)}</p>
${secs.map((s, i) => `<div class="s"><div class="n">${i + 1}</div><div><h2>${esc(s.heading)}</h2><div class="c">${esc(s.content)}</div><div class="t">${esc(s.type)} · ${esc(s.source_timestamp)}</div></div></div>`).join('')}
<footer>${esc(ig.footer)}</footer></main></body></html>`;

const docs = [
  { name: `${T} 01 Blog draft`, content: md.blog, convert: true },
  { name: `${T} 02 YouTube package (chapters, description, thumbnail brief)`, content: md.youtube, convert: true },
  { name: `${T} 03 Infographic outline`, content: md.infographic, convert: true },
  { name: `${T} 03b Infographic (data-accurate).html`, content: infographicHtml, convert: false },
  { name: `${T} 04 Social posts (LinkedIn + X)`, content: md.social, convert: true },
  { name: `${T} 05 Source insights & fact check`, content: md.facts, convert: true },
  { name: `${T} 06 Transcript`, content: tr.transcript, convert: true },
];
const clean = t => String(t || '').replace(/["“”]/g, '').trim();
const gemini = (prompt, aspectRatio) => ({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
});
// House styles chosen in the style test: B (bold light magazine) for thumbnails, D (soft 3D clay) for social visuals,
// E (clean vertical poster) for the infographic. The LLM supplies only the idea; code supplies the art direction.
const thumbPrompt = `YouTube thumbnail, 16:9. Bold modern magazine-cover design on a warm off-white background. ` +
  `Left: oversized heavy black sans-serif headline reading exactly "${clean(tb.headline_text).toUpperCase() || 'WATCH THE SESSION'}", ` +
  `with its key word highlighted by a bright coral underline stroke, and small dark text below reading exactly "${clean(tb.subtext)}". ` +
  `Right: ${clean(tb.visual_concept) || 'a playful stack of chunky rounded 3D blocks forming pillars'}, rendered as chunky rounded 3D shapes in coral, teal, ` +
  `sunflower yellow and navy, soft shadows, clean studio light. Lots of whitespace, high contrast. Spell the text exactly as given; no other text, no logos, no faces.`;
const linkedinPrompt = `Square social media visual. Soft 3D clay render of ${clean(so.linkedin_image_prompt) || 'a friendly miniature modern office scene'}, ` +
  `seen from above at an isometric angle, small rounded abstract figures without faces where people are needed. Pastel palette of mint, peach, lavender ` +
  `and cream, soft global illumination, matte textures, playful but professional. No text, no letters, no logos.`;
const posterLines = secs.slice(0, 7).map((s, i) => `${i + 1}. "${clean(s.heading)}" / "${clean(s.short_line || s.content).split(/\s+/).slice(0, 12).join(' ')}"`).join('\n');
const infographicPrompt = `A clean, modern vertical infographic poster, 4:5. Flat vector style, white background, navy text, teal and coral accents, ` +
  `consistent simple line icons, clear grid, generous spacing, professional corporate-report quality. Spell every piece of text EXACTLY as written below and add no other text.\n` +
  `Title at top (large, bold): "${clean(ig.title)}"\nSubtitle: "${clean(ig.subtitle)}"\n` +
  `Then ${Math.min(secs.length, 7)} numbered cards, each with a small icon, a bold heading and one short line:\n${posterLines}\n` +
  `Footer (small): "${clean(ig.footer)}"`;
const images = [
  { kind: 'thumbnail', file_name: `${T} 02b YouTube thumbnail.png`, prompt: thumbPrompt, request_body: gemini(thumbPrompt, '16:9') },
  { kind: 'infographic', file_name: `${T} 03c Infographic poster.png`, prompt: infographicPrompt, request_body: gemini(infographicPrompt, '4:5') },
  { kind: 'linkedin', file_name: `${T} 04b LinkedIn visual.png`, prompt: linkedinPrompt, request_body: gemini(linkedinPrompt, '1:1') },
];

return images.map((img, i) => ({ json: { ...img, ...(i === 0 ? { docs, checks, guard, chapterQA, counts: { words: wc, chapters: ch.length, linkedin: li.length, x: xs.length, sections: secs.length } } : {}) } }));
