// Tests the Deepgram-by-URL path of M2 with Deepgram's public sample file.
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodes = {};
const $ = n => ({ first: () => nodes[n][0], all: () => nodes[n] });
const run = async (name, file, input, ctx = {}) => (nodes[name] = await new AsyncFunction('$', '$input', '$json', fs.readFileSync(file, 'utf8')).call(ctx, $, { first: () => input[0], all: () => input }, input[0]?.json));
await run('Read inputs', 'n8n/m2/m2_read_inputs.js', [{ json: { 'Event name': 'Darwinbox Cortex and the AI-Native Era of HCM', 'Recording file URL': 'https://dpgr.am/spacewalk.wav', 'Watch link for emails': 'https://www.youtube.com/watch?v=dtNFhRtZYgk', Mode: 'Create drafts only' } }]);
await run('Prepare transcription', 'n8n/m2/m2_prepare_transcription.js', [{ json: { results: [{ id: '1', properties: { firstname: 'Jayant', lastname: 'Paleti', company: 'Darwinbox', event_attendance_status: 'speaker' } }] } }]);
const p = nodes['Prepare transcription'][0].json;
console.log(p.dg_method, p.dg_url.slice(0, 160));
const dg = await fetch(p.dg_url, { method: p.dg_method, headers: { Authorization: 'Token ' + env.DEEPGRAM_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(p.dg_body) }).then(r => r.json());
const out = await run('Format transcript', 'n8n/m2/m2_format_transcript.js', [{ json: dg }]);
console.log(out[0].json.source, '|', out[0].json.duration_s, 's |', out[0].json.transcript.slice(0, 200));
