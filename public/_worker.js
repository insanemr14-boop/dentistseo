// Cloudflare Pages advanced-mode worker.
// - POST /api/lead  -> emails the contact-form submission to LEAD_TO via Gmail SMTP
// - everything else -> served from the static assets (env.ASSETS)
//
// Secrets (set with `wrangler pages secret put` — never commit them):
//   GMAIL_USER  the Gmail address that authenticates to SMTP
//   GMAIL_PASS  its 16-char app password (spaces are ignored)
//   LEAD_TO     where leads are delivered (info@riocloudsolutions.com)

import { connect } from 'cloudflare:sockets';

const CRLF = '\r\n';

async function smtpSend(env, { subject, body, replyTo }) {
  const user = env.GMAIL_USER;
  const pass = (env.GMAIL_PASS || '').replace(/\s+/g, ''); // app passwords display with spaces
  const to = env.LEAD_TO || 'info@riocloudsolutions.com';
  if (!user || !pass) throw new Error('SMTP not configured');

  const socket = connect(
    { hostname: 'smtp.gmail.com', port: 465 },
    { secureTransport: 'on', allowHalfOpen: false },
  );
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';

  async function expect(codes) {
    while (true) {
      const lines = buf.split(CRLF).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        const code = last.slice(0, 3);
        const resp = buf;
        buf = '';
        if (!codes.includes(code)) throw new Error(`SMTP ${code}: ${resp.trim()}`);
        return;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`SMTP closed early: ${buf.trim()}`);
      buf += dec.decode(value);
    }
  }
  const cmd = async (line, codes) => {
    await writer.write(enc.encode(line + CRLF));
    await expect(codes);
  };

  try {
    await expect(['220']);
    await cmd('EHLO dentistseo.dpdns.org', ['250']);
    await cmd('AUTH LOGIN', ['334']);
    await cmd(btoa(user), ['334']);
    await cmd(btoa(pass), ['235']);
    await cmd(`MAIL FROM:<${user}>`, ['250']);
    await cmd(`RCPT TO:<${to}>`, ['250', '251']);
    await cmd('DATA', ['354']);
    const headers = [
      `From: DentalSEO Leads <${user}>`,
      `To: ${to}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ].filter(Boolean).join(CRLF);
    // Normalise newlines and dot-stuff so a line that is just "." can't end DATA early.
    const safe = body.replace(/\r?\n/g, CRLF).replace(/\r\n\./g, CRLF + '..');
    await cmd(`${headers}${CRLF}${CRLF}${safe}${CRLF}.`, ['250']);
    await cmd('QUIT', ['221']).catch(() => {});
  } finally {
    try { await writer.close(); } catch {}
  }
}

const THANKS = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you</title>
<style>body{margin:0;font-family:Roboto,Arial,sans-serif;background:#f7fafc;color:#1a2b4a;display:flex;
align-items:center;justify-content:center;min-height:100vh;text-align:center}.b{padding:2rem;max-width:520px}
h1{color:#0a6ebd;margin:.2rem 0}a{display:inline-block;margin-top:1.2rem;padding:.75rem 1.75rem;background:#0a6ebd;
color:#fff;text-decoration:none;border-radius:6px;font-weight:600}</style></head>
<body><div class="b"><h1>Thank you!</h1><p>Your enquiry has reached our team. We'll get back to you shortly.</p>
<a href="/">Back to home</a></div></body></html>`;

// Public lead endpoint is shared by every RioCloud site, so it must answer
// cross-origin. No credentials are used, so '*' is safe; the honeypot below
// (not CORS) is what stops bots — CORS never stops a direct POST anyway.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });
      const form = await request.formData();
      // Honeypot: bots fill hidden fields; pretend success and send nothing.
      if (form.get('_gotcha') || form.get('website')) {
        return new Response(THANKS, { headers: { ...CORS, 'content-type': 'text/html' } });
      }
      const fields = {};
      for (const [k, v] of form.entries()) {
        if (!k.startsWith('_') && k !== 'website' && typeof v === 'string' && v.trim()) fields[k] = v.trim();
      }
      const pick = (...keys) => keys.map((k) => fields[k]).find(Boolean) || '';
      const name = pick('your-name', 'name', 'Name', 'fullname');
      const replyTo = pick('your-email', 'email', 'Email', 'your-mail');
      const origin = request.headers.get('origin') || '';
      const site = pick('site') || origin || 'https://dentistseo.dpdns.org';
      let host = site; try { host = new URL(site).hostname; } catch {}
      // Forms send a `subject` describing the offer and the article that
      // produced the lead. Surfacing it in the mail subject is what makes the
      // inbox scannable — otherwise every lead across four sites arrives as
      // the same line and you have to open each one to know what it is.
      const tag = pick('subject');
      const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
      const body =
        `New enquiry from ${site}${CRLF}` +
        `Page: ${request.headers.get('referer') || '(unknown)'}${CRLF}${CRLF}` +
        `${lines}${CRLF}`;
      try {
        await smtpSend(env, {
          subject: `New lead — ${host}${name ? ' — ' + name : ''}${tag ? ' — ' + tag : ''}`,
          body,
          replyTo,
        });
      } catch (e) {
        return new Response(
          `Sorry, we couldn't send that right now. Please email info@riocloudsolutions.com or WhatsApp +91 75085 83782.\n\n(${e.message})`,
          { status: 502, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } },
        );
      }
      const back = pick('redirect');
      if (back && /^https:\/\//.test(back)) {
        return new Response(null, { status: 303, headers: { ...CORS, location: back } });
      }
      return new Response(THANKS, { headers: { ...CORS, 'content-type': 'text/html' } });
    }
    return env.ASSETS.fetch(request);
  },
};
