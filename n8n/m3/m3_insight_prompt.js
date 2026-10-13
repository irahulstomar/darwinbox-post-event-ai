// M3 · Ask DeepSeek for the raw material of the content package: key moments, insights, verbatim quotes, data points.

const inp = $('Read inputs').first().json;
const tr = $('Format transcript').first().json;

const system = `You are a content strategist turning a webinar transcript into source material for a multi-channel content package.
The transcript lines look like "[mm:ss] Speaker N: text"; diarization labels are anonymous, map them to real speakers.
Return ONLY valid JSON (inside string values never use the " character; use ' instead):
{
 "speaker_map": { "Speaker 0": "Full Name", ... },
 "summary": "3 sentences: what the session covered and why it matters",
 "audience": "who this content is for, 1 sentence",
 "key_moments": [ { "start": "mm:ss", "title": "max 6 words", "summary": "1 sentence" } ],
 "insights": [ { "point": "1 sentence insight", "evidence": "VERBATIM transcript excerpt, 8-30 words", "timestamp": "mm:ss" } ],
 "quotes": [ { "quote": "VERBATIM, 12-40 words; must make sense on its own to someone who did not watch (no vague 'they'/'this' references)", "speaker": "Full Name", "timestamp": "mm:ss" } ],
 "data_points": [ { "fact": "short fact with the number or specific detail", "evidence": "VERBATIM excerpt that states it, 6-30 words", "timestamp": "mm:ss" } ],
 "themes": ["3-5 short themes"]
}
Rules:
- key_moments: 6-10, chronological, the first at 00:00, together covering the whole session (these become YouTube chapters).
- insights: 6-8. quotes: 6-8 from different parts of the session. data_points: every concrete number, count, year or named fact that was actually said (3-10).
- Every "evidence" and "quote" must be copied word for word from the transcript (cut at word boundaries only, never paraphrase).
- Never invent facts.`;

return [{ json: { request_body: {
  model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 6000,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: `Event: ${inp.event}\nSpeakers: ${inp.speakers.join('; ') || 'unknown'}\nDuration: ${tr.duration_s || 'unknown'} seconds\n\nTRANSCRIPT:\n${tr.transcript}` },
  ],
} } }];
