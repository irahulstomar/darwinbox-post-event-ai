// M2 · Read the "Event closed" form. Transcript upload is optional: without it, the recording file is transcribed by Deepgram.

const f = $input.first();
const binKey = Object.keys(f.binary || {})[0];
const uploaded = binKey ? (await this.helpers.getBinaryDataBuffer(0, binKey)).toString('utf8').trim() : '';
const recordingFile = (f.json['Recording file URL'] || '').trim();
if (!uploaded && !recordingFile) throw new Error('Give a recording file URL (mp3/mp4/m4a) or upload a transcript');
const event = (f.json['Event name'] || '').trim();
const slug = event.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

return [{ json: {
  event, slug, runId: 'm2-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12),
  uploaded_transcript: uploaded, recording_file_url: recordingFile,
  recording_url: (f.json['Watch link for emails'] || recordingFile).trim(),
  cta_url: (f.json['CTA link'] || '').trim(),
  from_name: (f.json['From name'] || 'Webinar Team').trim(),
  reply_to: (f.json['Reply-to email'] || '').trim(),
  mode: String(f.json['Mode'] || '').toLowerCase().startsWith('send') ? 'send' : 'draft',
  utm_campaign: `${slug}-postevent`,
} }];
