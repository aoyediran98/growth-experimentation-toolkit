---
name: growth-suite
description: Deploy, update and extend the Growth Suite (toolkit, Laws of UX audit, regulated copy, ideation room, pricing simulator) on GitHub and Vercel with one API layer and Upstash Redis; add a new tool page; or run any tool's method directly on pasted inputs. Use for /growth-suite, "deploy the suite", "add a tool", "audit this page", "check this copy", "synthesise this research".
---

# Growth Suite

Five static pages under `public/` sharing `api/ai.js`, `api/store.js`, `api/upload.js`, `api/blob.js` and a top nav injected into each page's `<body>`.

Pages: `index.html` (toolkit, 11 tabs), `audit/`, `copy/`, `ideation/`, `pricing/`, `match/` (message match), `funnel/` (funnel diagnostic), `localise/` (localisation scorecard), `qa/` (test QA: control vs variant scan, checklist; see the `test-qa` skill). Each page is self-contained: its own `<style>`, a runtime shim as its first script (routes `claude.use('sample'|'db'|'downloads'|'assets')` to `/api/*` outside claude.ai), then its app script.

Every page loads `/translate.js` just before `</body>`: it adds the language picker (en, es, nl, fr) and the "Translate text" panel to `.suite-nav`. A new page must include it too. Code must not compare on-screen text to English strings (the page may be translated); use data attributes instead.

## Modes
0. **Add-on already applied** — the four pages live in `public/`; `api/ai.js` and `api/store.js` are the toolkit's own, extended (image input on `/api/ai`; hash/set ops on `/api/store`, all keys under the toolkit's `gxt:` namespace). Never replace them with older copies: the toolkit depends on their model ids, streaming, JSON repair and 300s limit.
1. **Run directly** — apply the relevant page's method in conversation: toolkit Method A/B (search `METHOD_A`, `roRun`), audit `rules()`/`LAWS`, copy `COMMON`/`SECTORS`/`REGIONS`, ideation `CRIT`/`scoreOf`, pricing `evaluate()`. Never invent numbers; statistics come from the page's pure functions.
2. **Deploy** — first time.
3. **Update** — change a page; verify; redeploy.
4. **Add a tool** — new folder `public/<slug>/index.html` with its own styles and shim, add a link to the nav in every page (search `suite-nav`), namespace any store keys with `<slug>:`.

Prerequisites: `gh auth status`, `vercel whoami`, `ANTHROPIC_API_KEY`. If missing, give the fix and stop.

## Deploy
1. `npm install`; verify (below).
2. `git init && git add -A && git commit -m "Growth Suite"` then `gh repo create growth-suite --public --source=. --push`.
3. `vercel --yes`; `printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY production`.
4. Redis (needed for ideation sessions, the toolkit roadmap/learnings/history and saved audit reports): Vercel dashboard → project → Storage → Create Database → Upstash for Redis → Connect. Optional Blob for larger ideation images. Wait for confirmation; `vercel env pull .env.local` to check.
5. `vercel --prod --yes`; add the URL to README; commit; push.
6. Smoke test each path: `/match/`, `/funnel/` and `/localise/` each have a Load example button; `/` (Load sample inputs → Synthesise; Read-out sample), `/audit/` (Load sample page → Audit → Save report), `/copy/` (Load example → Generate and check), `/ideation/` (Load sample session; pill must read "Storage: shared"), `/pricing/` (loads with the tension verdict).
7. Report live URL, repo URL, and that the ideation facilitator link (`?f=`) must not be shared.

## Store namespaces
`gxt:state/*` and `gxt:artifact/*` (toolkit), `gxt:audit:reports` (hash), `gxt:session:<id>` and `gxt:s:<id>:*` (ideation), `blob:<id>` (images, written by `api/upload.js`). Keep new tools under their own prefix.

## Verify
```
for f in public/index.html public/audit/index.html public/copy/index.html public/ideation/index.html public/pricing/index.html; do node -e "const s=require('fs').readFileSync('$f','utf8');const m=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];require('fs').writeFileSync('/tmp/chk.js',m.map(x=>x[1]).join('\n'))" && node --check /tmp/chk.js && echo "$f ok"; done
```
Then `npx vercel dev` and walk the smoke test.
