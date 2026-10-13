// M3 · Turn each markdown document into styled HTML and wrap it in a Drive multipart upload.
// Drive converts HTML into a properly formatted Google Doc (real headings, bold, lists, quotes, links).

const folderId = $('Create event folder').first().json.id;
const docs = $('Validate & package').first().json.docs;

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
const transcriptHtml = t => `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:10.5pt">` +
  String(t).split('\n').map(l => { const m = l.match(/^(\[[\d:]+\])\s*([^:]+):\s*(.*)$/); return m ? `<p><b>${esc(m[1])} ${esc(m[2])}:</b> ${esc(m[3])}</p>` : `<p>${esc(l)}</p>`; }).join('') + '</body></html>';

const boundary = 'm3boundary' + Date.now();
return docs.map(d => {
  const isHtmlFile = !d.convert;                                 // the data-accurate infographic stays a real .html file
  const html = isHtmlFile ? d.content : (/Transcript$/.test(d.name) ? transcriptHtml(d.content) : mdToHtml(d.content));
  const meta = { name: d.name, parents: [folderId], mimeType: isHtmlFile ? 'text/html' : 'application/vnd.google-apps.document' };
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
  return { json: { name: d.name, convert: d.convert, multipart, content_type: `multipart/related; boundary=${boundary}` } };
});
