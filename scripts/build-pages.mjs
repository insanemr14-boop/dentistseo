#!/usr/bin/env node
// Transforms raw WordPress HTML exports (scratchpad/raw/<page>/index.html)
// into clean static pages under public/. Idempotent: re-run after re-exporting.
//
// Usage: node scripts/build-pages.mjs <raw-dir>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAW = process.argv[2];
const OUT = new URL('../public', import.meta.url).pathname;
if (!RAW || !existsSync(RAW)) {
  console.error('usage: node scripts/build-pages.mjs <raw-dir>');
  process.exit(1);
}

const NEW_HOST = 'dentistseo.dpdns.org';
const OLD_HOST = 'dentistseoservice.com';
const CONTACT_EMAIL = 'info@riocloudsolutions.com';

// Contact details shown on the site. The originals came from the WordPress
// source; rewrite them on every build so a fresh export can't reintroduce the
// old ones. One number is used for all countries.
const NEW_PHONE = '+91 75085 83782';
const CONTACT_REWRITES = [
  ['contact@dentistseoservice.com', CONTACT_EMAIL],
  ['sales@dentistseoservice.com', CONTACT_EMAIL],
  ['+91 73558 87989', NEW_PHONE],
  ['+1 732 647 4247', NEW_PHONE],
];

// Keep the original site's wording and design exactly as-is. Only its addresses
// and the domains it points at change — so it reads identically to the original
// but no visitor is ever routed back to the old owner (their live site or their
// other agency domain). Footer "location" line shows international coverage; the
// contact-page address is just the city.
const INFO_REWRITES = [
  // Repoint the old owner's domains at ours. Runs AFTER the host rewrite, so the
  // only bare "dentistseoservice.com" left here are in brand text
  // (<title>/og:site_name/schema), not asset URLs.
  ['dentistseoservice.com', NEW_HOST],
  ['dentalmastermedia.com', NEW_HOST],
  // Footer office boxes: our real HQ is Chandigarh; the old owner's US/UAE
  // street addresses are replaced with city/country only so we keep the
  // international look without publishing (or leaking mail to) their offices.
  ['E-203, Phase 8B, Industrial Area, Sector 74, Punjab, India', 'Chandigarh, India'],
  ['4120 Quakerbridge Rd, Lawrence Township NJ, USA', 'Serving clients across the USA'],
  ['704, B8 Building, Al Barsha 1, Dubai, UAE', 'Dubai, UAE'],
  // Contact-page address line.
  ['Plot No 337, Industrial Area, Phase 2, Chandigarh 160002', 'Chandigarh'],
];

// Social profiles (RioCloud's) + WhatsApp/click-to-call, injected as a
// self-contained floating bar so it shows on every page regardless of the
// original Elementor layout. Inline SVG + inline styles keep it CSP-safe.
const WA = '917508583782';
const SOCIAL_HTML = `<div id="dss-social" style="position:fixed;right:14px;bottom:14px;z-index:99999;display:flex;flex-direction:column;gap:10px;font-family:sans-serif">
<a href="https://wa.me/${WA}" target="_blank" rel="noopener" aria-label="WhatsApp" style="width:48px;height:48px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)"><svg width="26" height="26" viewBox="0 0 32 32" fill="#fff"><path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.5.7 4.8 1.9 6.8L3 29l6.9-2.3c1.9 1 4.1 1.6 6.1 1.6 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4 1.3 1.3-3.9-.3-.4c-1.1-1.7-1.6-3.6-1.6-5.6 0-5.7 4.6-10.3 10.3-10.3S26.3 9.8 26.3 15.5 21.7 25.7 16 25.7zm5.7-7.7c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.2 3.4 5.3 4.7 2 .8 2.7.9 3.7.8.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z"/></svg></a>
<a href="https://www.instagram.com/riocloud.in/" target="_blank" rel="noopener" aria-label="Instagram" style="width:48px;height:48px;border-radius:50%;background:radial-gradient(circle at 30% 110%,#fdd,#d62976 45%,#962fbf 75%,#4f5bd5);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)"><svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1012 18.6 6.6 6.6 0 0012 5.4zm0 10.9a4.3 4.3 0 110-8.6 4.3 4.3 0 010 8.6zm6.8-11.2a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/></svg></a>
<a href="https://www.linkedin.com/company/rio-cloud-solutions/" target="_blank" rel="noopener" aria-label="LinkedIn" style="width:48px;height:48px;border-radius:50%;background:#0a66c2;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)"><svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5V9h3v10zM6.5 7.7a1.8 1.8 0 110-3.5 1.8 1.8 0 010 3.5zM19 19h-3v-5.3c0-1.3 0-2.9-1.8-2.9S12 12.2 12 13.6V19H9V9h2.9v1.4h.04c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7V19z"/></svg></a>
</div>`;

const pages = readdirSync(RAW, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const page of pages) {
  const src = join(RAW, page, 'index.html');
  if (!existsSync(src)) continue;
  let html = readFileSync(src, 'utf8');

  // 0. Swap the client's contact details in first, before any URL rewriting.
  for (const [from, to] of CONTACT_REWRITES) html = html.replaceAll(from, to);

  // 1. Point every URL (plain + JSON-escaped) at the new host. The `//` prefix
  //    keeps email addresses on the old domain untouched.
  html = html.replaceAll(`//${OLD_HOST}`, `//${NEW_HOST}`);
  html = html.replaceAll(`\\/\\/${OLD_HOST}`, `\\/\\/${NEW_HOST}`);

  // 1b. Name / location / competitor-link updates (must run after the host
  //     rewrite so only brand-text "dentistseoservice.com" remains).
  for (const [from, to] of INFO_REWRITES) html = html.replaceAll(from, to);

  // 2. Drop ?ver= / ?generated= cache-buster query strings on local assets so
  //    they match the renamed files on disk.
  html = html.replace(
    new RegExp(`(https://${NEW_HOST}/[^"'\\s<>]+?)\\?[^"'\\s<>]*`, 'g'),
    (m, base) => (/[.](css|js|png|jpe?g|gif|svg|webp|woff2?|ttf|ico)$/i.test(base) ? base : m),
  );

  // 3. Remove WordPress runtime endpoints that do not exist on a static host.
  html = html
    .replace(/<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*>\s*/g, '')
    .replace(/<link[^>]+rel=["']EditURI["'][^>]*>\s*/g, '')
    .replace(/<link[^>]+rel=["']shortlink["'][^>]*>\s*/g, '')
    .replace(/<link[^>]+rel=["']alternate["'][^>]+wp-json[^>]*>\s*/g, '')
    .replace(/<link[^>]+rel=["']pingback["'][^>]*>\s*/g, '');

  // 3b. Emoji loader, RSS feed autodiscovery, and the Hostinger Reach
  //     newsletter plugin all depend on WordPress endpoints — drop them.
  html = html
    .replace(/<script[^>]*>[^<]*(?:_wpemojiSettings|"concatemoji")[\s\S]*?<\/script>\s*/g, '')
    .replace(/<link[^>]+rel=['"]dns-prefetch['"][^>]+s\.w\.org[^>]*>\s*/g, '')
    .replace(/<link[^>]+application\/rss\+xml[^>]*>\s*/g, '')
    .replace(/<link[^>]+hostinger-reach[^>]*>\s*/g, '')
    .replace(/<script[^>]+hostinger-reach[^>]*><\/script>\s*/g, '')
    .replace(/<script[^>]*>[^<]*hostinger-reach\/v1\/contact[\s\S]*?<\/script>\s*/g, '');

  // 3c. Blog comments post to wp-comments-post.php, which no longer exists.
  //     Hide the whole comments area rather than show a dead form.
  if (html.includes('id="comments"')) {
    html = html.replace('</head>', '<style>#comments.comments-area{display:none}</style></head>');
  }

  // 4. Contact Form 7 cannot POST to a static host. Repoint the form at
  //    FormSubmit (delivers to the practice inbox) and drop the CF7 JS that
  //    would otherwise hijack the submit with a dead REST call.
  html = html.replace(/<form action="[^"]*#wpcf7[^"]*"/g, () =>
    `<form action="https://formsubmit.co/${CONTACT_EMAIL}"`);
  html = html.replace(/(<form action="https:\/\/formsubmit\.co\/[^"]*"[^>]*method="post")([^>]*)>/g,
    (m, head, rest) => `${head}${rest.replace(' novalidate="novalidate"', '')}>` +
      `<input type="hidden" name="_subject" value="New enquiry from ${NEW_HOST}">` +
      `<input type="hidden" name="_template" value="table">`);
  html = html
    .replace(/<script[^>]+contact-form-7[^>]*><\/script>\s*/g, '')
    .replace(/<script[^>]*>\s*var wpcf7[^<]*<\/script>\s*/g, '');

  // 5. Floating social / WhatsApp bar on every page.
  if (!html.includes('id="dss-social"')) html = html.replace('</body>', `${SOCIAL_HTML}</body>`);

  const outDir = page === 'home' ? OUT : join(OUT, page);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`built ${page === 'home' ? '/' : `/${page}/`} (${(html.length / 1024).toFixed(0)} KB)`);
}
