// M2 · Summary shown on the form's result page.

const p = $('Personalise').first().json;
const inp = $('Read inputs').first().json;
const segs = $('Split segments').all().map(i => i.json);
const emails = $('Create email').all().map(i => i.json || {});
const lines = segs.map((s, i) =>
  `• ${s.label}: ${s.member_ids.length} contacts, HubSpot email ${emails[i] && emails[i].id ? emails[i].id : '(not created)'}\n   Subjects A/B/C: ${(s.subjects || []).join(' | ')}`);
const message = [
  inp.mode === 'send' ? 'Sent through HubSpot.' : 'Drafts created in HubSpot (nothing sent).',
  `UTM campaign: ${inp.utm_campaign}`,
  '',
  ...lines,
  '',
  `Fact guard: ${(p.takeaways || []).length} verified takeaways used, ${(p.rejected || []).length} unverified quote(s) dropped.`,
  `Guardrail notes: ${(p.issues || []).length ? p.issues.join('; ') : 'none'}.`,
  'Open HubSpot > Marketing > Email to preview, send or see opens and clicks.',
].join('\n');
return [{ json: { message } }];
