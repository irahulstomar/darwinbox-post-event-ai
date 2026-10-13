import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const src = fs.readFileSync('n8n/m2/m2_insight_prompt.js', 'utf8');
const system = src.match(/const system = `([\s\S]*?)`;/)[1];
const transcript = fs.readFileSync('data/recording/transcript.txt', 'utf8');
const body = { model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 4000, response_format: { type: 'json_object' },
  messages: [{ role: 'system', content: system }, { role: 'user', content: `Event: X\nSpeakers: Jayant Paleti; Brett Ungashick\n\nTRANSCRIPT:\n${transcript}` }] };
const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const t = r.choices[0].message.content;
try { JSON.parse(t); console.log('valid JSON this time'); } catch (e) { const pos = Number((e.message.match(/position (\d+)/) || [])[1]); console.log(e.message); console.log('...' + t.slice(Math.max(0, pos - 150), pos + 80) + '...'); }
