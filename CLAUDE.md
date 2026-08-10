# Dentist SEO Service

Static rebuild of the client's WordPress site **dentistseoservice.com**
(Dental Master Media — dental SEO agency), migrated off PHP so it can run on
Cloudflare Pages.

Live: **https://dentistseo.dpdns.org/**
Repo: `insanemr14-boop/dentistseo` · production branch: `main`

## Layout

```
public/    the deployable site — pre-rendered HTML + all wp-content/wp-includes assets
scripts/   build-pages.mjs — transforms raw WordPress HTML exports into public/
```

There is **no build step on Cloudflare**. `public/` is committed as-is and
served directly.

## Pages build settings

| Setting                | Value    |
|------------------------|----------|
| Production branch      | `main`   |
| Framework preset       | None     |
| Build command          | (blank)  |
| Build output directory | `public` |

## How this clone works

The original site is WordPress (Elementor + Hello theme + CF7) on Hostinger.
`scripts/build-pages.mjs` takes raw HTML exports of each page and:

- rewrites every URL from `dentistseoservice.com` → `dentistseo.dpdns.org`,
  and repoints `dentalmastermedia.com` (the old owner's other site) at ours, so
  no visitor is ever routed back to the original owner
- updates contact info: phone `+91 75085 83782`, email `info@riocloudsolutions.com`
- rewrites the office addresses (Chandigarh HQ; USA/UAE shown as city/country
  only — the original owner's real street addresses are removed)
- strips `?ver=` cache-busters so URLs match the renamed on-disk assets
- removes WordPress runtime endpoints (REST/oEmbed/RSD/feeds/emoji loader,
  Hostinger Reach newsletter plugin)
- hides blog comment forms (`wp-comments-post.php` doesn't exist here)
- points the Contact Form 7 form at **`/api/lead`** and injects a honeypot
- injects a floating WhatsApp / Instagram / LinkedIn bar on every page

The original copy, branding and `robots` meta are kept **as-is** — this is a
content-identical clone of the original, only the contact details and outbound
domains change.

## Contact form → email (SMTP)

`public/_worker.js` is a Pages advanced-mode worker. `POST /api/lead` relays the
form to `LEAD_TO` over **Gmail SMTP** (`smtp.gmail.com:465`, `cloudflare:sockets`);
every other request passes through to the static assets via `env.ASSETS`.

Credentials are **Pages secrets** (never in the repo), set with
`wrangler pages secret put`:

- `GMAIL_USER` — the authenticating Gmail address
- `GMAIL_PASS` — its 16-char app password (spaces are stripped in code)
- `LEAD_TO`    — `info@riocloudsolutions.com`

`wrangler.toml` pins `compatibility_date` recent enough for the socket API — the
worker won't send without it. Test after deploy:
`curl -X POST https://dentistseo.dpdns.org/api/lead --data-urlencode "your-email=test@example.com" ...`
→ HTTP 200 + thank-you page means SMTP succeeded; 502 means it failed (bad creds
/ missing secret).

## Updating content

This is a snapshot, not a CMS. To pull fresh content from the WordPress
original: re-export the raw pages (curl each URL into `<raw-dir>/<slug>/index.html`,
homepage goes in `<raw-dir>/home/`), then:

```bash
node scripts/build-pages.mjs <raw-dir>
```

For small text edits, edit `public/**/index.html` directly.

## Known deviations from the original

- All pages carry `noindex, nofollow` — **inherited from the original site**,
  which has the same meta. Left as-is deliberately (this clone should not
  compete with the client's primary domain in search anyway).
- Blog comments are hidden (static host, no comment backend).
- The Hostinger Reach newsletter block was removed (dead API).
- Popup Maker popups still render, but their analytics beacons 404 silently.
