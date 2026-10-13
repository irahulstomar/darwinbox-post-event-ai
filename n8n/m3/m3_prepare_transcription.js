// M3 · Build the Deepgram request (keyterms = speaker names + capitalised words of the event name).

const inp = $('Read inputs').first().json;
const terms = [...new Set([
  ...inp.speakers.flatMap(s => s.split(/\s+/)),
  ...inp.event.split(/[^A-Za-z0-9-]+/).filter(w => /^[A-Z]/.test(w) && w.length > 3),
].filter(Boolean))].slice(0, 20);
const needDeepgram = !inp.uploaded_transcript;
const params = ['model=nova-3', 'diarize=true', 'paragraphs=true', 'smart_format=true', 'punctuate=true', 'language=en',
  ...terms.map(t => 'keyterm=' + encodeURIComponent(t))].join('&');
return [{ json: {
  need_deepgram: needDeepgram, keyterms: terms,
  dg_method: needDeepgram ? 'POST' : 'GET',
  dg_url: needDeepgram ? `https://api.deepgram.com/v1/listen?${params}` : 'https://api.deepgram.com/v1/projects',
  dg_body: needDeepgram ? { url: inp.recording_file_url } : {},
} }];
