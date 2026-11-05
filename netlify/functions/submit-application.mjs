// POST /api/submit-application
// Emails each closer application from your Gmail account to MAIL_TO, with the full
// application in the email body and a formatted PDF attached.
//
// Netlify environment variables (Site configuration > Environment variables):
//   GMAIL_USER          the Gmail address that sends the email, e.g. kylebenzduhilag0@gmail.com
//   GMAIL_APP_PASSWORD  a 16-character Google App Password (NOT your normal Gmail password)
//   MAIL_TO             optional; where applications go. Defaults to GMAIL_USER.
//   SMTP_HOST/SMTP_PORT optional; only if you switch away from Gmail.
import nodemailer from 'nodemailer';
import { validateSubmission, buildText, buildHtml, buildPdf, pdfFilename } from '../lib/application-email.mjs';

export const config = { path: '/api/submit-application' };

const MAX_BODY = 250_000; // bytes

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });

  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const to = process.env.MAIL_TO || user;
  if (!user || !pass) {
    console.error('submit-application: GMAIL_USER or GMAIL_APP_PASSWORD is not set');
    return json(503, { ok: false, error: 'Email delivery is not configured yet.' });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'The application is too large to send.' });

  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'The application could not be read.' }); }

  // Honeypot: real people never fill this hidden field. Accept silently, send nothing.
  if (body && body._honey) return json(200, { ok: true });

  const { app, error } = validateSubmission(body);
  if (error) return json(422, { ok: false, error });

  let pdf;
  try {
    pdf = await buildPdf(app);
  } catch (e) {
    console.error('submit-application: PDF build failed', e);
    pdf = null; // still send the email without the attachment
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: { name: 'Investr Trades Applications', address: user },
      to,
      replyTo: { name: app.name, address: app.email },
      subject: `New Closer Application: ${app.name}`.replace(/[\r\n]+/g, ' '),
      text: buildText(app),
      html: buildHtml(app),
      attachments: pdf ? [{ filename: pdfFilename(app), content: Buffer.from(pdf), contentType: 'application/pdf' }] : [],
    });
  } catch (e) {
    console.error('submit-application: sendMail failed', e && e.message);
    return json(502, { ok: false, error: 'The email could not be sent.' });
  }

  return json(200, { ok: true });
};
