// Hub · M2 page data: the latest post-event send (3 segment emails) with HubSpot stats, subject variants and UTMs.

const EVENT = 'Darwinbox Cortex and the AI-Native Era of HCM';
const emails = ($('M2 emails').first().json.results || [])
  .filter(e => String(e.name || '').startsWith(EVENT.slice(0, 40)) && e.state !== 'DRAFT' && / · m2-\d+$/.test(e.name || ''));
// latest run id among sent emails
const runs = [...new Set(emails.map(e => e.name.split(' · ').pop()))].sort();
const run = runs[runs.length - 1];
const latest = emails.filter(e => e.name.endsWith(run));
const contacts = $input.all().flatMap(i => i.json.results || []).map(r => r.properties);
const SEG = { 'Attendees: thank-you': 'attendee', 'No-shows: catch-up': 'no_show', 'Speakers: thank-you': 'speaker' };

const segments = latest.map(e => {
  const label = e.name.split(' · ')[1];
  const seg = SEG[label];
  const c = (e.stats && e.stats.counters) || {};
  const mine = contacts.filter(x => String(x.postevent_email_variant || '').startsWith(seg + '_'));
  const subjects = {};
  mine.forEach(x => { const v = x.postevent_email_variant.split('_')[seg === 'no_show' ? 2 : 1]; subjects[v] = subjects[v] || { variant: v, subject: x.pe_subject, contacts: 0 }; subjects[v].contacts++; });
  const personas = {};
  mine.forEach(x => { const p = x.postevent_email_variant.split('_').slice(seg === 'no_show' ? 3 : 2).join('_'); personas[p] = (personas[p] || 0) + 1; });
  return { label, segment: seg, email_id: e.id, state: e.state, published: e.publishDate,
    recipients: mine.length, sent: c.sent || 0, delivered: c.delivered || 0, opens: c.open || 0, clicks: c.click || 0,
    dropped: c.dropped || 0, bounced: c.bounce || 0,
    subjects: Object.values(subjects).sort((a, b) => a.variant.localeCompare(b.variant)), personas,
    sample_opening_line: (mine.find(x => x.pe_opening_line) || {}).pe_opening_line || '' };
}).sort((a, b) => ['attendee', 'no_show', 'speaker'].indexOf(a.segment) - ['attendee', 'no_show', 'speaker'].indexOf(b.segment));

const utm = (contacts.find(x => x.utm_campaign_postevent) || {}).utm_campaign_postevent || '';
const sample = (contacts.find(x => x.pe_recording_url) || {}).pe_recording_url || '';
return [{ json: {
  generated_at: new Date().toISOString(), run_id: run || null, sent_at: latest[0] ? latest[0].publishDate : null,
  utm_campaign: utm, sample_tracked_link: sample, segments,
  totals: segments.reduce((t, s) => ({ recipients: t.recipients + s.recipients, sent: t.sent + s.sent, delivered: t.delivered + s.delivered,
    opens: t.opens + s.opens, clicks: t.clicks + s.clicks, dropped: t.dropped + s.dropped }), { recipients: 0, sent: 0, delivered: 0, opens: 0, clicks: 0, dropped: 0 }),
  note: 'HubSpot developer test accounts only deliver to users of the account; other sends are logged as dropped. A paid Marketing Hub account delivers to everyone.',
} }];
