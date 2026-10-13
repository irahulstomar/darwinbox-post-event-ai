// M2 · Build the DeepSeek request that pulls takeaways + verbatim quotes out of the transcript.

const inp = $('Read inputs').first().json;
const contacts = $('Prepare transcription').first().json.contacts;
const transcript = $('Format transcript').first().json.transcript;
const speakers = contacts.filter(c => c.event_attendance_status === 'speaker')
  .map(c => `${c.firstname} ${c.lastname} (${c.jobtitle || ''}, ${c.company || ''})`);

const system = `You analyse a webinar transcript for post-event marketing.
The transcript lines look like "[mm:ss] Speaker N: text". Diarization labels are anonymous; map them to the real speakers listed.
Return ONLY valid JSON (inside string values never use the " character; use ' instead):
{
 "speaker_map": { "Speaker 0": "Full Name", ... },
 "event_summary": "2 sentences on what the session covered",
 "one_line_hook": "why someone who missed it should watch, max 25 words",
 "takeaways": [
   { "headline": "max 12 words", "detail": "1-2 sentences, faithful to what was said",
     "timestamp": "mm:ss", "speaker": "Full Name", "quote": "VERBATIM from the transcript, 10-35 words" }
 ],
 "best_quote_by_speaker": { "Full Name": { "quote": "VERBATIM, 10-35 words", "timestamp": "mm:ss" } }
}
Rules:
- Give exactly 5 takeaways, most valuable first, spread across the session.
- Quotes must be copied word for word from the transcript (you may cut at word boundaries; never paraphrase or fix grammar).
- Do not invent numbers, customers or claims that are not in the transcript.`;

return [{ json: {
  contacts, speakers,
  request_body: {
    model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Event: ${inp.event}\nSpeakers: ${speakers.join('; ')}\n\nTRANSCRIPT:\n${transcript}` },
    ],
  },
} }];
