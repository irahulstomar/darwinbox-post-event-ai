// M2 · Decide how to get the transcript and build the Deepgram request.
// Keyterm prompting with the event + speaker names fixes brand/name spellings (e.g. "Darwinbox", "Jayant").

const inp = $('Read inputs').first().json;
const contacts = $input.all().flatMap(i => i.json.results || []).map(r => ({ id: r.id, ...r.properties }));
const speakers = contacts.filter(c => c.event_attendance_status === 'speaker');
const terms = [...new Set([
  ...speakers.flatMap(s => [s.firstname, s.lastname, s.company]),
  ...inp.event.split(/[^A-Za-z0-9-]+/).filter(w => /^[A-Z]/.test(w) && w.length > 3),
].filter(Boolean))].slice(0, 20);
const needDeepgram = !inp.uploaded_transcript;
// (n8n's Code sandbox has no URL/URLSearchParams, so build the query string by hand)
const params = ['model=nova-3', 'diarize=true', 'paragraphs=true', 'smart_format=true', 'punctuate=true', 'language=en',
  ...terms.map(t => 'keyterm=' + encodeURIComponent(t))].join('&');

return [{ json: {
  contacts, need_deepgram: needDeepgram, keyterms: terms,
  // Without a recording to transcribe, call a harmless Deepgram endpoint instead (keeps the flow branch-free).
  dg_method: needDeepgram ? 'POST' : 'GET',
  dg_url: needDeepgram ? `https://api.deepgram.com/v1/listen?${params}` : 'https://api.deepgram.com/v1/projects',
  dg_body: needDeepgram ? { url: inp.recording_file_url } : {},
} }];
