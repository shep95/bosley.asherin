# bosley

a quiet room on the internet. a blog with anonymous, text-only conversation under every post.
no accounts, no ads, no tracking, no database.

- **site:** [Astro](https://astro.build) 7, static html for every page, zero javascript you didn't write
- **comments:** two small vercel functions (`/api/challenge`, `/api/comments`); each comment is one json file in vercel blob (object storage, not a database)
- **hosting:** vercel; pages come from the cdn, and an edge guard (`src/middleware.ts`) sits in front of the comment api
- **look:** calm, moody, golden brown. every value is a token in `src/styles/global.css`; see `/styleguide`

## write a post

a post is a markdown file. that's the whole publishing system.

1. add `src/content/posts/my-post.md`:

   ```md
   ---
   title: on writing by lamplight
   description: one sentence for the feed, search results and share cards.
   date: 2026-11-23
   tags: [writing, attention]        # optional, lower-case-with-dashes, up to 6
   cover: ../../assets/lamp.jpg      # optional; put the image in src/assets
   coverAlt: a desk lamp in a dark room
   comments: true                    # default true
   draft: false                      # drafts show only in `npm run dev`
   ---

   your words, in markdown.
   ```

2. commit and push. vercel builds it; the post is live at `/p/my-post` with its own
   rss entry, sitemap entry, open graph card and `BlogPosting` structured data.

files whose name starts with `_` are ignored, so `_ideas.md` stays private to the repo.

## images carry nothing hidden

phones and cameras write gps location, device serial numbers, dates and editing history
into photos. bosley removes all of it, three times over:

1. `npm run images:scrub` rewrites any image in `src/` or `public/` that carries exif, gps,
   xmp, iptc or icc data (orientation is baked in first, so photos stay upright). run it
   before committing a new image — the originals live in git history forever.
2. the build re-encodes every post image to webp at several sizes, with no metadata.
   images under 4 kb are written straight into the page as data urls.
3. the build scrubs its own output again, and ci fails if any committed or published image
   still carries metadata (`npm run images:check`).

## how the conversation works

- **anonymous by default.** a commenter can pick a name; if they do, their browser makes a
  private signing key (it never leaves the device) and signs each comment. everyone sees the
  same short `◆ tag` on everything they sign, so no one else can borrow it.
- **plain text only.** comments are rendered with `textContent`, never as html. 2–1,000
  characters, at most two links; invisible and direction-spoofing characters are removed.
- **no accounts, still no spam.** posting needs a proof-of-work: the browser finds a hash with
  18 leading zero bits (about a second, done while the person types). challenges are signed by
  the server, bound to one post, expire in ten minutes and can't be replayed. there's also a
  per-connection limit of 5 comments per 10 minutes, held in memory under a salted hash.
- **nothing identifying is stored.** a comment file holds the words, the chosen name, the
  public key and signature (if signed), the minute it was posted, and a sha-256 of the private
  delete token. no ip, no device, no location.
- **removal.** the author can remove their comment from the same browser (it holds the delete
  token). the owner can remove any comment with `BOSLEY_ADMIN_KEY`:

  ```sh
  curl -X DELETE https://bosley.asherin.com/api/comments \
    -H "authorization: Bearer $BOSLEY_ADMIN_KEY" -H "content-type: application/json" \
    -d '{"post":"my-post","id":"01J…"}'
  ```

## run it locally

```sh
npm ci
npm run dev        # http://localhost:4321 — comments use an in-memory store
npm run check      # images, typecheck, tests, production build — what ci runs
```

## deploy (vercel)

the project `bosley.asherin` builds from `main` (production) and every other branch (previews).
it needs, for production and preview:

| variable | what |
| --- | --- |
| `POW_SECRET` | 32+ random characters (`openssl rand -hex 32`); signs proof-of-work challenges |
| `BLOB_READ_WRITE_TOKEN` | added when a blob store is connected to the project |
| `BLOB_ACCESS` | `private` (default) or `public`, matching the store |
| `BOSLEY_ADMIN_KEY` | optional, 32+ characters; owner removal of any comment |

without `POW_SECRET` or a blob store, the site still works and the conversation shows
“resting” instead of failing.

## security

- csp: `default-src 'self'` with no inline scripts or styles, `require-trusted-types-for 'script'`,
  `frame-ancestors 'none'`, plus hsts, coop/coep/corp and a deny-all permissions policy (`vercel.json`)
- `src/middleware.ts` runs at the edge in front of the comment api: blocks scrapers, ai-training
  crawlers and scanners, and refuses methods other than get/head except writes to `/api/comments`.
  static pages are served by the cdn directly (they hold nothing private); routes of the old app
  now answer 404
- writes are same-origin only; bodies are capped at 8 kb
- see `SECURITY.md` for scope and reporting

## seo

static html, canonical urls, `sitemap-index.xml`, `rss.xml`, open graph and twitter cards,
`Organization` / `WebSite` / `BlogPosting` / `BreadcrumbList` json-ld, and a robots policy that
welcomes search engines and refuses ai-training crawlers. `seo/` holds the usel international seo
compiler and this site's spec (see `seo/README.md`).
