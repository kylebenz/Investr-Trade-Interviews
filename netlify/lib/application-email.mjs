// Builds the plain-text email, HTML email and PDF for a closer application.
// Used by netlify/functions/submit-application.mjs.
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';

const LIMITS = { sections: 10, fieldsPerSection: 60, totalFields: 150, label: 160, value: 3000, question: 1200, title: 80 };
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_FATHOM = /^https:\/\/fathom\.video\/\S+$/i;
const RE_VOCAROO = /^https:\/\/(vocaroo\.com|voca\.ro)\/[A-Za-z0-9_-]\S*$/i;

// Strip control characters (keep newlines and tabs) and trim to a max length.
function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Validates the JSON body sent by index.html and returns a normalised application,
 * or { error } with a message that is safe to show to the candidate.
 */
export function validateSubmission(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.sections)) return { error: 'The application was empty or malformed.' };
  if (body.sections.length === 0 || body.sections.length > LIMITS.sections) return { error: 'The application has an unexpected shape.' };

  let total = 0;
  const sections = [];
  for (const s of body.sections) {
    if (!s || !Array.isArray(s.fields) || s.fields.length > LIMITS.fieldsPerSection) return { error: 'The application has an unexpected shape.' };
    const fields = [];
    for (const f of s.fields) {
      if (!f || typeof f !== 'object') continue;
      const label = clean(f.label, LIMITS.label);
      if (!label) continue;
      const field = { label, value: clean(f.value, LIMITS.value) };
      if (f.question) field.question = clean(f.question, LIMITS.question);
      fields.push(field);
      total++;
    }
    sections.push({ title: clean(s.title, LIMITS.title) || 'Section', fields });
  }
  if (total > LIMITS.totalFields) return { error: 'The application has too many fields.' };

  const all = sections.flatMap((s) => s.fields);
  const get = (label) => (all.find((f) => f.label === label) || {}).value || '';
  const name = get('Full Legal Name').replace(/\s+/g, ' ');
  const email = get('Email');
  if (!name) return { error: 'Your full legal name is missing.' };
  if (!RE_EMAIL.test(email)) return { error: 'Your email address looks invalid.' };

  const fathom = all.filter((f) => /^Fathom Deal \d+ URL$/.test(f.label) && RE_FATHOM.test(f.value)).length;
  const vocaroo = all.filter((f) => /^Q\d+ Vocaroo Link$/.test(f.label) && RE_VOCAROO.test(f.value)).length;
  if (fathom < 3) return { error: 'All 3 Fathom recording links are required.' };
  if (vocaroo < 5) return { error: 'All 5 Vocaroo links are required.' };

  return { app: { name, email, submittedAt: new Date(), sections } };
}

// Characters the standard PDF fonts cannot draw and that do not decompose with NFKD.
const TRANSLIT = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ø': 'O', 'ø': 'o', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Œ': 'OE', 'œ': 'oe',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '≥': '>=', '≤': '<=', '≠': '!=', '×': 'x', '−': '-', '‐': '-', '‑': '-', '\u00A0': ' ' };
export const transliterate = (s) => String(s).replace(/[ŁłĐđØøĦħıŒœ→←↔⇒≥≤≠×−‐‑\u00A0]/g, (c) => TRANSLIT[c] || c);

export function formatDate(d) {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function pdfFilename(app) {
  const slug = transliterate(app.name).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'Applicant';
  return `Closer-Application-${slug}-${app.submittedAt.toISOString().slice(0, 10)}.pdf`;
}

/* ---------------- Plain text ---------------- */
export function buildText(app) {
  const out = [];
  out.push('NEW CLOSER APPLICATION · INVESTR TRADES');
  out.push('');
  out.push(`Applicant: ${app.name}`);
  out.push(`Email:     ${app.email}`);
  out.push(`Received:  ${formatDate(app.submittedAt)}`);
  out.push('');
  out.push('Reply to this email to contact the applicant. The full application is also attached as a PDF.');
  for (const s of app.sections) {
    out.push('');
    out.push(s.title.toUpperCase());
    out.push('-'.repeat(Math.min(60, s.title.length)));
    for (const f of s.fields) {
      const value = f.value.includes('\n') ? '\n    ' + f.value.split('\n').join('\n    ') : f.value;
      out.push(`${f.label}: ${value}`);
      if (f.question) out.push(`    Question: ${f.question}`);
    }
  }
  out.push('');
  out.push('Trading involves risk. Past results do not guarantee future performance.');
  return out.join('\n');
}

/* ---------------- HTML ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isUrl = (v) => /^https:\/\/\S+$/i.test(v);

export function buildHtml(app) {
  const rows = (s) => s.fields.map((f) => {
    const value = isUrl(f.value)
      ? `<a href="${esc(f.value)}" style="color:#9A6A12;word-break:break-all">${esc(f.value)}</a>`
      : esc(f.value).replace(/\n/g, '<br>');
    const q = f.question ? `<div style="margin-top:4px;font-size:12px;line-height:1.5;color:#6B6B6B;font-weight:400">${esc(f.question)}</div>` : '';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #EEE;vertical-align:top;width:38%;font-size:13px;color:#555;font-weight:600">${esc(f.label)}${q}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #EEE;vertical-align:top;font-size:14px;color:#111">${value}</td>
    </tr>`;
  }).join('');

  const sections = app.sections.map((s) => `
    <h2 style="font-family:Georgia,serif;font-size:18px;color:#111;margin:28px 0 8px;padding-bottom:6px;border-bottom:2px solid #E8A93E">${esc(s.title)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">${rows(s)}</table>`).join('');

  return `<!doctype html><html><body style="margin:0;background:#F4F3EF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px">
    <div style="background:#0A0B0D;border-radius:10px 10px 0 0;padding:22px 24px">
      <div style="color:#E8A93E;font-size:11px;letter-spacing:3px;font-weight:700">INVESTR TRADES</div>
      <div style="color:#F5F3EE;font-family:Georgia,serif;font-size:24px;font-weight:700;margin-top:6px">New closer application</div>
    </div>
    <div style="background:#FFF;border-radius:0 0 10px 10px;padding:20px 24px 28px">
      <p style="margin:0;font-size:15px;color:#111"><strong>${esc(app.name)}</strong> &middot; <a href="mailto:${esc(app.email)}" style="color:#9A6A12">${esc(app.email)}</a></p>
      <p style="margin:6px 0 0;font-size:13px;color:#666">Received ${esc(formatDate(app.submittedAt))}. Reply to this email to contact the applicant. The full application is attached as a PDF.</p>
      ${sections}
      <p style="margin:28px 0 0;font-size:12px;color:#888">Trading involves risk. Past results do not guarantee future performance.</p>
    </div>
  </div></body></html>`;
}

/* ---------------- PDF ---------------- */
const GOLD = rgb(0.91, 0.663, 0.243);   // #E8A93E
const INK = rgb(0.067, 0.067, 0.067);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.88, 0.88, 0.88);
const DARK = rgb(0.039, 0.043, 0.051);  // #0A0B0D
const LINK = rgb(0.6, 0.41, 0.07);

export async function buildPdf(app) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Closer Application: ${app.name}`);
  doc.setAuthor('Investr Trades Inc.');
  doc.setSubject('Closer application');
  doc.setCreationDate(app.submittedAt);

  const F = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    serif: await doc.embedFont(StandardFonts.TimesRomanBold),
  };

  // Standard PDF fonts only cover Windows-1252. Swap anything else for a safe stand-in.
  const okCache = new Map();
  const safe = (text) => {
    let out = '';
    for (const ch of transliterate(text).normalize('NFC')) {
      if (ch === '\n') { out += ch; continue; }
      if (!okCache.has(ch)) {
        let ok = true;
        try { F.reg.widthOfTextAtSize(ch, 10); } catch { ok = false; }
        okCache.set(ch, ok);
      }
      if (okCache.get(ch)) { out += ch; continue; }
      const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      out += stripped && stripped !== ch && [...stripped].every((c) => { try { F.reg.widthOfTextAtSize(c, 10); return true; } catch { return false; } }) ? stripped : '?';
    }
    return out;
  };

  const W = 612, H = 792, M = 54, CW = W - M * 2;
  let page, y;

  const wrap = (text, font, size, width) => {
    const lines = [];
    for (const para of safe(text).split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        if (!word) continue;
        const attempt = line + word;
        if (font.widthOfTextAtSize(attempt, size) <= width) { line = attempt; continue; }
        if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
        if (/^\s+$/.test(word)) continue;
        // Break very long words (e.g. URLs) character by character.
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > width) { lines.push(chunk); chunk = ch; } else chunk += ch;
        }
        line = chunk;
      }
      lines.push(line.trimEnd());
    }
    return lines;
  };

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h) => { if (y - h < M + 20) newPage(); };

  const addLink = (url, x, yBottom, w, h) => {
    const annot = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, yBottom, x + w, yBottom + h], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    const ref = doc.context.register(annot);
    const existing = page.node.lookup(PDFName.of('Annots'));
    if (existing) existing.push(ref); else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  };

  const drawLines = (lines, font, size, color, lead, x = M, url) => {
    for (const ln of lines) {
      ensure(lead);
      y -= lead;
      page.drawText(ln, { x, y, size, font, color });
      if (url && ln) addLink(url, x, y - 2, font.widthOfTextAtSize(ln, size), size + 3);
    }
  };

  // Cover band
  newPage();
  page.drawRectangle({ x: 0, y: H - 128, width: W, height: 128, color: DARK });
  page.drawText('INVESTR TRADES', { x: M, y: H - 52, size: 9, font: F.bold, color: GOLD, characterSpacing: 2.5 });
  page.drawText('Closer Application', { x: M, y: H - 86, size: 26, font: F.serif, color: rgb(0.96, 0.95, 0.93) });
  page.drawText(safe(`${app.name}  ·  ${app.email}`).slice(0, 110), { x: M, y: H - 108, size: 10, font: F.reg, color: rgb(0.66, 0.66, 0.66) });
  y = H - 128 - 26;
  drawLines([safe(`Received ${formatDate(app.submittedAt)}`)], F.reg, 9, GREY, 12);

  for (const s of app.sections) {
    ensure(60);
    y -= 26;
    page.drawText(safe(s.title), { x: M, y, size: 15, font: F.serif, color: INK });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 1.5, color: GOLD });
    y -= 4;

    for (const f of s.fields) {
      const labelLines = wrap(f.label, F.bold, 8.5, CW);
      const qLines = f.question ? wrap(f.question, F.ital, 9, CW) : [];
      const valueText = f.value || 'Not provided';
      const valueLines = wrap(valueText, F.reg, 10.5, CW);
      // Keep label + first lines of value together
      ensure(10 + labelLines.length * 11 + Math.min(qLines.length, 3) * 12 + Math.min(valueLines.length, 2) * 14);
      y -= 8;
      drawLines(labelLines.map((l) => l.toUpperCase()), F.bold, 8.5, GREY, 11);
      if (qLines.length) { drawLines(qLines, F.ital, 9, GREY, 12); y -= 2; }
      const url = isUrl(f.value) ? f.value : null;
      drawLines(valueLines, F.reg, 10.5, url ? LINK : INK, 14, M, url);
      y -= 6;
      ensure(2);
      page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: LIGHT });
    }
  }

  // Footers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`${app.name} · Closer application`), { x: M, y: 30, size: 8, font: F.reg, color: GREY });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - F.reg.widthOfTextAtSize(label, 8), y: 30, size: 8, font: F.reg, color: GREY });
  });

  return doc.save();
}
