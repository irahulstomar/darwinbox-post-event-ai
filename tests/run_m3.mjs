// Runs M3 Code nodes locally: real transcript + real DeepSeek + real FLUX. Writes the package to tests/out/m3/.
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodes = {};
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n], get item() { return nodes[n][0]; } });
const run = async (name, file, input, ctx = {}) => (nodes[name] = await new AsyncFunction('$', '$input', '$json', fs.readFileSync(file, 'utf8')).call(ctx, $, { first: () => input[0], all: () => input }, input[0]?.json));
const ds = async body => { const t = Date.now(); const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()); console.log(`  deepseek ${Date.now() - t}ms ${r.usage?.total_tokens} tok`); return { json: r }; };
const info = JSON.parse(fs.readFileSync('data/recording/cortex_webinar.info.json', 'utf8'));
const official = (info.chapters || []).map(c => `${Math.floor(c.start_time / 60)}:${String(Math.floor(c.start_time % 60)).padStart(2, '0')} ${c.title}`).join('\n');
await run('Read inputs', 'n8n/m3/m3_read_inputs.js', [{ json: { 'Event name': 'Darwinbox Cortex and the AI-Native Era of HCM', Speakers: 'Jayant Paleti, Brett Ungashick', 'Watch link': 'https://www.youtube.com/watch?v=dtNFhRtZYgk', 'Official chapters (optional, for QA)': official }, binary: { data: {} } }],
  { helpers: { getBinaryDataBuffer: async () => fs.readFileSync('data/recording/transcript.txt') } });
await run('Prepare transcription', 'n8n/m3/m3_prepare_transcription.js', [{ json: {} }]);
await run('Format transcript', 'n8n/m3/m3_format_transcript.js', [{ json: {} }]);
await run('Build insight prompt', 'n8n/m3/m3_insight_prompt.js', [{ json: {} }]);
const ins = await ds(nodes['Build insight prompt'][0].json.request_body);
const jobs = await run('Fact guard', 'n8n/m3/m3_fact_guard.js', [ins]);
console.log('guard', JSON.stringify(jobs[0].json.guard).slice(0, 300));
const gens = await Promise.all(jobs.map(j => ds(j.json.request_body)));
fs.mkdirSync('tests/out/m3', { recursive: true }); gens.forEach((g, i) => fs.writeFileSync(`tests/out/m3/raw_${jobs[i].json.asset}.txt`, g.json.choices?.[0]?.message?.content || JSON.stringify(g.json)));
nodes['DeepSeek: generate assets'] = gens;
const lc = (await run('Blog length check', 'n8n/m3/m3_blog_length.js', gens))[0].json;
console.log('blog words before fix', lc.blog_words_before, 'fix needed', lc.needed);
const fix = lc.needed ? await ds(lc.fix_body) : { json: {} };
const pkg = await run('Validate & package', 'n8n/m3/m3_validate_package.js', [fix]);
const p = pkg[0].json;
console.log('counts', JSON.stringify(p.counts));
p.checks.forEach(c => console.log(`  ${c.pass ? 'PASS ' : 'CHECK'} ${c.asset}: ${c.rule} ${c.note ? '(' + c.note + ')' : ''}`));
fs.mkdirSync('tests/out/m3', { recursive: true });
p.docs.forEach(d => fs.writeFileSync(`tests/out/m3/${d.name.replace(/^\[[^\]]+\]\s*/, '').replace(/[^\w.() -]+/g, '_')}${d.convert ? '.md' : ''}`, d.content));
for (const img of pkg.map(i => i.json)) {
  if (process.env.NO_IMG) continue; const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, { method: 'POST', headers: { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: img.prompt, steps: 8 }) }).then(r => r.json());
  fs.writeFileSync(`tests/out/m3/${img.kind}.jpg`, Buffer.from(r.result.image, 'base64')); console.log('  image', img.kind, 'ok');
}
// --- documents + index (formatted Google Docs path) ---
nodes['Create event folder'] = [{ json: { id: 'FOLDER123' } }];
const docItems = await run('Documents', 'n8n/m3/m3_documents.js', [{ json: {} }]);
docItems.forEach(d => { const html = d.json.multipart.split('text/html; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0];
  fs.writeFileSync(`tests/out/m3/html_${d.json.name.replace(/^\[[^\]]+\]\s*/, '').replace(/[^\w.() -]+/g, '_')}${d.json.convert ? '.html' : ''}`, html); });
nodes['Create documents'] = docItems.map((d, k) => ({ json: { id: 'doc' + k, name: d.json.name, webViewLink: 'https://docs.google.com/document/d/doc' + k } }));
nodes['To image file'] = pkg.map(i => ({ json: { file_name: i.json.file_name } }));
nodes['Upload images'] = pkg.map((i, k) => ({ json: { id: 'img' + k } }));
const idx = await run('Build index', 'n8n/m3/m3_index.js', [{ json: {} }]);
fs.writeFileSync('tests/out/m3/html_00_README.html', idx[0].json.multipart.split('text/html; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0]);
console.log('docs', docItems.length, '| images planned', pkg.length, pkg.map(i => i.json.kind).join(','), '| index ok');
console.log('thumbnail prompt:', pkg[0].json.prompt.slice(0, 260));
