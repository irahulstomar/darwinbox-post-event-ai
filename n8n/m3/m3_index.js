// M3 · README index for the event folder: every asset with its link, plus the quality checks (created as a formatted Google Doc).

const inp = $('Read inputs').first().json;
const v = $('Validate & package').first().json;
const folderId = $('Create event folder').first().json.id;
const planned = $('Documents').all().map(i => i.json);
const docs = $('Create documents').all().map((i, k) => ({ name: i.json.name || planned[k].name, url: i.json.webViewLink || `https://drive.google.com/file/d/${i.json.id}/view` }));
const imgs = $('Upload images').all().map((i, k) => ({ name: $('To image file').all()[k].json.file_name, url: i.json.webViewLink || `https://drive.google.com/file/d/${i.json.id}/view` }));
const md = [
  `# Content package: ${inp.event}`,
  `Tag: ${inp.tag}  ·  Created: ${inp.date}  ·  Folder: https://drive.google.com/drive/folders/${folderId}`,
  '', '## Assets',
  ...[...docs, ...imgs].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(f => `- **${String(f.name).replace(inp.tag + ' ', '')}**: ${f.url}`),
  '', '## Counts',
  `Blog ${v.counts.words} words · ${v.counts.chapters} YouTube chapters · ${v.counts.sections} infographic sections · ${v.counts.linkedin} LinkedIn + ${v.counts.x} X posts`,
  '', '## Fact guard',
  `Insights ${v.guard.insights} · Quotes ${v.guard.quotes} · Data points ${v.guard.data_points} verified (dropped items are listed in "05 Source insights & fact check")`,
  '', '## Quality checks',
  ...v.checks.map(c => `- **${c.pass ? 'PASS' : 'CHECK'}**: ${c.asset}: ${c.rule}${c.note ? ` (${c.note})` : ''}`),
  ...(v.chapterQA ? ['', `AI chapters matched ${v.chapterQA.matched}/${v.chapterQA.total} official chapters (within 90s).`] : []),
].join('\n');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(])_(.+?)_(?=[\s.,;:)]|$)/g, '$1<i>$2</i>')
  .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>');
function mdToHtml(md) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = []; let list = null, quote = [], para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote style="border-left:3px solid #2bb3a3;margin:12px 0;padding:4px 14px;color:#444"><i>${quote.filter(Boolean).map(inline).join('<br>')}</i></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flushAll(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flushAll(); const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^-{3,}$/.test(l.trim())) { flushAll(); out.push('<hr>'); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = l.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); flushQuote(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\s*\d+\.\s+(.*)$/))) { flushPara(); flushQuote(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushList(); flushQuote(); para.push(l.trim());
  }
  flushAll();
  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.5">${out.join('\n')}</body></html>`;
}

const name = `${inp.tag} 00 README: index & quality report`;
const boundary = 'm3index' + Date.now();
const meta = { name, parents: [folderId], mimeType: 'application/vnd.google-apps.document' };
const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
  `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${mdToHtml(md)}\r\n--${boundary}--`;
return [{ json: { name, multipart, content_type: `multipart/related; boundary=${boundary}`, folder_url: `https://drive.google.com/drive/folders/${folderId}` } }];
