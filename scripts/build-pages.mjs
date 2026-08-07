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
const CONTACT_EMAIL = 'contact@dentistseoservice.com';

const pages = readdirSync(RAW, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const page of pages) {
  const src = join(RAW, page, 'index.html');
  if (!existsSync(src)) continue;
  let html = readFileSync(src, 'utf8');

  // 1. Point every URL (plain + JSON-escaped) at the new host. The `//` prefix
  //    keeps email addresses on the old domain untouched.
  html = html.replaceAll(`//${OLD_HOST}`, `//${NEW_HOST}`);
  html = html.replaceAll(`\\/\\/${OLD_HOST}`, `\\/\\/${NEW_HOST}`);

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

  const outDir = page === 'home' ? OUT : join(OUT, page);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`built ${page === 'home' ? '/' : `/${page}/`} (${(html.length / 1024).toFixed(0)} KB)`);
}
