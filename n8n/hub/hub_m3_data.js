// Hub · M3 page data: the latest content package in Google Drive (files, links, image previews, QA checks from the README).

const folder = ($('Find latest package').first().json.files || [])[0];
if (!folder) return [{ json: { found: false } }];
const files = ($('List package files').first().json.files || []).map(f => {
  const clean = String(f.name).replace(/^\[[^\]]+\]\s*/, '');
  const kind = /\.png$|\.jpg$/i.test(f.name) ? 'image' : /\.html$/i.test(f.name) ? 'html' : /skipped/.test(f.name) ? 'note' : 'doc';
  return { id: f.id, name: clean, kind, mime: f.mimeType, url: f.webViewLink, preview: kind === 'image' ? `hub-img?id=${f.id}` : null, created: f.createdTime };
}).sort((a, b) => a.name.localeCompare(b.name));

const readme = String($json.data || $json || '');
const checks = readme.split('\n').map(l => l.trim()).filter(l => /^[-*•]?\s*\**(PASS|CHECK)\**:/.test(l.replace(/^[-*•]\s*/, '')))
  .map(l => { const t = l.replace(/^[-*•]\s*/, '').replace(/\*\*/g, ''); return { pass: t.startsWith('PASS'), text: t.replace(/^(PASS|CHECK):\s*/, '') }; });
const counts = (readme.match(/Blog \d+ words[^\n]*/) || [''])[0];
const guard = (readme.match(/Insights [^\n]*verified[^\n]*/) || [''])[0];
const chapters = (readme.match(/AI chapters matched[^\n]*/) || [''])[0];

return [{ json: {
  found: true, generated_at: new Date().toISOString(),
  folder: { id: folder.id, name: folder.name, url: `https://drive.google.com/drive/folders/${folder.id}`, created: folder.createdTime },
  images: files.filter(f => f.kind === 'image'), docs: files.filter(f => f.kind !== 'image'),
  checks, counts, guard, chapters,
} }];
