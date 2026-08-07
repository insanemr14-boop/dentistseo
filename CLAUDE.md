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

- rewrites every URL from `dentistseoservice.com` → `dentistseo.dpdns.org`
  (emails keep the old domain — the `//` prefix match protects them)
- strips `?ver=` cache-busters so URLs match the renamed on-disk assets
- removes WordPress runtime endpoints (REST/oEmbed/RSD/feeds/emoji loader,
  Hostinger Reach newsletter plugin)
- hides blog comment forms (`wp-comments-post.php` doesn't exist here)
- repoints the Contact Form 7 form at **FormSubmit**
  (`https://formsubmit.co/contact@dentistseoservice.com`)

**FormSubmit needs one-time activation**: the first submission emails an
activation link to contact@dentistseoservice.com — the client must click it
once, after which submissions are delivered normally.

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
