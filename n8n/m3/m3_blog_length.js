// M3 · LLMs can't count words, so code enforces the brief's 800-1200 word range on the structured blog.
// Too short -> one DeepSeek expansion pass that returns the same JSON (same facts, no new content).
// Too long  -> trimmed deterministically in Validate & package (whole secondary paragraphs are dropped).
// Without a fix needed, a 1-token request keeps the flow branch-free (a GET with a body is rejected by DeepSeek's CDN).

const jobs = $('Fact guard').all().map(i => i.json);
const gens = $input.all().map(i => i.json);
const k = jobs.findIndex(j => j.asset === 'blog');
const quotes = jobs[0].facts.quotes;
let blog = {};
try {
  const t = String(gens[k].choices[0].message.content).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  blog = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
} catch (e) { /* Validate & package reports parse problems */ }

const count = s => String(s || '').split(/\s+/).filter(Boolean).length;
const secs = Array.isArray(blog.sections) ? blog.sections : [];
const words = (blog.intro || []).reduce((n, p) => n + count(p), 0)
  + secs.reduce((n, s) => n + (s.paragraphs || []).reduce((m, p) => m + count(p), 0) + count(s.heading)
    + (quotes[s.quote_index] ? count(quotes[s.quote_index].quote) : 0), 0)
  + count(blog.closing);
const needed = words > 0 && words < 800;

return [{ json: {
  blog_words_before: words, needed,
  fix_method: 'POST',
  fix_url: 'https://api.deepseek.com/chat/completions',
  fix_body: needed ? {
    model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.3, max_tokens: 6000, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are an editor. Return ONLY valid JSON with exactly the same structure you are given. Keep every fact; add no new facts, examples or claims; keep headings and quote_index values unchanged; no quotation marks inside paragraphs.' },
      { role: 'user', content: `This blog is ${words} words; it must be 950-1100. Expand every paragraph by about ${Math.round(100 * (1000 / words - 1))}% by explaining the existing points more fully.\n\n${JSON.stringify(blog)}` },
    ],
  } : { model: 'deepseek-flash', thinking: { type: 'disabled' }, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] },
} }];
