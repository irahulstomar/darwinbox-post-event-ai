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

// Hub · M4: apply the AI layer: validated score adjustments (clamped to ±15), anomalies, narrative.
// A number guard flags any number in the narrative that isn't in the metrics.
const m = $('Build AI prompt').first().json.metrics;
let ai = {}, aiError = '';
try { ai = parseAI($json, 'M4 analysis'); } catch (e) { aiError = e.message.slice(0, 200); }

const adj = {};
(Array.isArray(ai.score_adjustments) ? ai.score_adjustments : []).forEach(a => {
  const d = Math.max(-15, Math.min(15, Math.round(Number(a.delta) || 0)));
  if (a.id) adj[String(a.id)] = { delta: d, reason: String(a.reason || '').slice(0, 160) };
});
const top_contacts = m.top_contacts.map(p => {
  const a = adj[p.id] || { delta: 0, reason: '' };
  return { ...p, ai_delta: a.delta, ai_reason: a.reason, interest_score: Math.max(0, Math.min(100, p.base_score + a.delta)) };
}).sort((x, y) => y.interest_score - x.interest_score);

const known = new Set(JSON.stringify(m).match(/\d+(\.\d+)?/g) || []);
const narrative = String(ai.narrative || '');
const unknownNumbers = (narrative.match(/\d+(\.\d+)?/g) || []).filter(n => !known.has(n) && !['7', '14', '30'].includes(n));
const sev = { high: 0, medium: 1, low: 2 };
const anomalies = (Array.isArray(ai.anomalies) ? ai.anomalies : []).filter(a => a && a.title)
  .sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3));

return [{ json: {
  generated_at: new Date().toISOString(), model: 'deepseek-v4-pro',
  headline: ai.headline || '', narrative, anomalies, top_contacts,
  checks: { unknown_numbers_in_narrative: unknownNumbers, ai_error: aiError, adjustments_applied: Object.keys(adj).length },
} }];
