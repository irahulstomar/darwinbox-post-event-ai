// M3 · Read the form: recording file URL (Deepgram) or transcript upload, plus event details.

const f = $input.first();
const binKey = Object.keys(f.binary || {})[0];
const uploaded = binKey ? (await this.helpers.getBinaryDataBuffer(0, binKey)).toString('utf8').trim() : '';
const recordingFile = (f.json['Recording file URL'] || '').trim();
if (!uploaded && !recordingFile) throw new Error('Give a recording file URL (mp3/mp4/m4a) or upload a transcript');
const event = (f.json['Event name'] || '').trim();
const slug = event.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const speakers = String(f.json['Speakers'] || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
const date = new Date().toISOString().slice(0, 10);

return [{ json: {
  event, slug, date, speakers,
  tag: `[${slug}]`,
  folder_name: `Events · ${event} · ${date}`,
  uploaded_transcript: uploaded, recording_file_url: recordingFile,
  watch_url: (f.json['Watch link'] || '').trim(),
  official_chapters: String(f.json['Official chapters (optional, for QA)'] || '').trim(),
} }];
