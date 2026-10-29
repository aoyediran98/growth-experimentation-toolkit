---
name: review-share
description: Turn a toolkit variant into a prototype, package control vs variant in the CRO Review template and publish a stakeholder review link under your own Vercel deployment or your own here.now account, gated by your personal publish token; set up the env vars; or hand off to the full CRO Review System plugin for verified live captures. Use for /review-share, "share this variant for review", "stakeholder link", "set up review publishing".
---

# Review share (Growth Suite ↔ CRO Review System, owner-only)

The Variants tab of the toolkit (`public/index.html`, panel `#rvPanel`) builds a stakeholder review from a copy variant and publishes it. Server: `api/review.js` (build + publish) and `api/r.js` (serves published reviews at `/r/<id>`). The review template under `lib/review-template/` is the CRO Review System's own `shell.html`, `review-shell.html`, `styles.css`, `runtime/surface.js`, `runtime/workflow.js`, vendored **unchanged** (`VERSION` 2.3.4). `api/review.js` ports the plugin's `crodeck.py compose` and `share_review.py` publish flow; for the same manifest it produces byte-identical HTML to the plugin's builder.

## Ownership rules (what makes this "mine and mine alone")

- **Only you can publish.** Every capture, build and share request must carry `REVIEW_SHARE_TOKEN` (header `x-review-token`); the panel asks for it and keeps it only in the open tab. Without the env var the API refuses everything with 503.
- **Your own hosting, your own accounts.** Provider `vercel` stores the review in *your* Vercel Blob store and serves it from *your* deployment (`https://<your-app>.vercel.app/r/<id>`). Provider `here.now` uses *your* here.now API key and workspace (`HERENOW_KEY`, `HERENOW_ACCOUNT`). The plugin's bundled shared `digex` key is **not** used and is never copied into this project.
- **No shared state.** Nothing is written to the suite's History, Redis or the `db` capability. The sharing receipt (site slug, version) is returned to the browser and sent back only when you re-publish the same review in that tab. Stakeholder comments live inside the review page (press C), and are handed back through the review's own *Send comments to AI* / *Save working HTML*, never through this suite.
- Reviews on your Blob store can be taken down with `{action:"unshare", id}`.

## One-time setup

```bash
vercel env add REVIEW_SHARE_TOKEN production     # any long secret only you know
# Storage, pick one or both:
#  a) Vercel Blob: Vercel dashboard → Storage → Create Blob store → connect to this project (sets BLOB_READ_WRITE_TOKEN)
#  b) your own here.now account:
vercel env add HERENOW_KEY production            # hnk_… from your here.now account settings
vercel env add HERENOW_ACCOUNT production        # your workspace subdomain
vercel --prod --yes
```
Never paste keys into chat, HTML or git; `api/review.js` refuses to build any page containing an `hnk_…` string.

## Changes made when merging into this project

- The panel sits inside the Variants section (`#tab-variants`), after "Build the variant page".
- A variant built with "Build variant page" (`build.copyVariant` matches the variant) is used as the whole prototype, so element, new-element and redesign changes reach the review; other variants get the headline, subhead and CTA swapped into the control. "Use the builder's control" loads the builder's control so both sides match.
- `api/r.js` serves reviews with `Content-Security-Policy: sandbox allow-scripts …` (no `allow-same-origin`), so scripts inside captured pages cannot act as this site. The template is built to run sandboxed.
- `api/review.js`: `allowOverwrite: true` on re-share (required by current `@vercel/blob`), redirects are followed by hand and private, link-local and internal hosts are refused at every hop, and `/r/<id>` returns 404 when no Blob store is configured.

- Provider `redis` (the default when the toolkit's Upstash database is connected) stores `gxt:review:<id>` = `{ v, data, sha256, sharedAt, title }`, where `data` is the gzipped, base64 `{ m, url }` manifest; `api/r.js` rebuilds the page with `compose()` on every open, so `vercel.json` gives `api/r.js` the template files too. Blob and here.now still work when configured.

## How the panel works

1. Enter your publish token and pick where to publish (the pill confirms "owner verified").
2. **Control**: fetch a public URL (`action:"capture"` fetches it server-side and makes URLs absolute), upload a SingleFile `.html`, or load the example. The suite cannot verify a live capture, so every control is labelled a reconstruction (the plugin's builder enforces the same rule).
3. **Anchors**: the current headline, subhead and CTA are detected (first H1, next text block, first button-like link) and can be edited; matching elements get `data-a="headline|subhead|cta"` so notes can point at them.
4. **Variants**: tick the generated variants; each becomes a prototype with the anchored text replaced. Notes (`kind:"imp"`, before/after, control/variant anchors) are written with AI when available, otherwise from the variant rationale.
5. **Preview review** builds (`action:"build"`) and opens the HTML in a new tab. **Share review link** publishes (`action:"share"`, `provider`, optional `receipt`) and returns the stakeholder link and the `?view=strategist` link. Re-sharing in the same tab updates the same link; "Start a new review" creates a fresh one.

Note: inside a review served from your Vercel domain, the template's own *Copy stakeholder link* button is hidden (it only recognises here.now hosts); use the links shown in the panel, or *Copy page link* inside the review.

## When to use the plugin instead

For a verified live control (multi-step funnels, pages with heavy assets) or Journey reviews, run the full plugin: `/cro-review-system-v2:cro`. Note that its own `cro-share` step publishes to the plugin's shared workspace with the bundled key; for links tied to you, build locally with `crodeck.py build` and upload the resulting control/variant HTML into this panel, which publishes under your accounts.

## Extend

- Add anchors: extend `rvDetect`/`rvAnchorDoc` in the panel and the note titles in `rvBuildPages`.
- Journey reviews: `api/review.js` composes Page reviews only.
- Keep the template files unchanged; to upgrade, copy the new `project/source/*` from the plugin and update `VERSION`.
