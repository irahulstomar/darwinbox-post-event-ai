// M3 · Turn Deepgram's paragraphs into "[mm:ss] Speaker N: text" lines (or pass the uploaded transcript through).

const inp = $('Read inputs').first().json;
const prep = $('Prepare transcription').first().json;
let transcript = inp.uploaded_transcript, source = 'uploaded transcript', duration = null;
if (prep.need_deepgram) {
  const alt = $json.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) throw new Error('Deepgram returned no transcript: ' + JSON.stringify($json).slice(0, 300));
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  transcript = (alt.paragraphs?.paragraphs || []).map(p => `[${mmss(p.start)}] Speaker ${p.speaker}: ${p.sentences.map(s => s.text).join(' ')}`).join('\n');
  source = `Deepgram nova-3 (diarized, keyterms: ${prep.keyterms.join(', ')})`;
  duration = Math.round($json.metadata?.duration || 0);
}
// Duration for chapter validation: Deepgram metadata, else the last timestamp in the uploaded transcript.
if (!duration) {
  const stamps = [...transcript.matchAll(/\[(\d+):(\d{2})\]/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
  duration = stamps.length ? Math.max(...stamps) + 30 : null;
}
return [{ json: { transcript, source, duration_s: duration, chars: transcript.length } }];
