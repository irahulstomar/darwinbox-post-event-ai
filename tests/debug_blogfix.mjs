import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const md = fs.readFileSync('tests/out/m3/01 Blog draft.md', 'utf8').split('---\n\n')[1];
const words = s => s.replace(/[#>*_`\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
const w = words(md); console.log('input words', w);
const body = { model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.3, max_tokens: 5000, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: 'You are an editor. Return ONLY valid JSON: { "body_markdown": "..." }. Keep every fact, quote and attribution exactly; add no new facts, examples or claims; keep the H2 structure and blockquotes.' },
    { role: 'user', content: `This blog body is ${w} words. Rewrite it to between 950 and 1100 words by tightening sentences and removing repetition.\n\n${md}` }] };
const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const c = r.choices[0]; console.log('finish', c.finish_reason, 'len', c.message.content.length);
try { const j = JSON.parse(c.message.content); console.log('output words', words(j.body_markdown)); } catch (e) { console.log('parse fail', e.message, c.message.content.slice(0, 200)); }
