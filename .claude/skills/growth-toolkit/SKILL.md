---
name: growth-toolkit
description: Deploy, update and extend the Growth Experimentation Toolkit (static page + Vercel functions + Upstash Redis) on GitHub and Vercel, or run any of its methods (synthesis, brief, read-out) directly on pasted inputs. Use for /growth-toolkit, "deploy the toolkit", "add a tool to the toolkit".
---

# Growth Experimentation Toolkit

A single page (`public/index.html`) with ten tools following a test from research to learnings, two Vercel serverless functions (`api/ai.js` for Claude, `api/store.js` for persistence), and Upstash Redis for shared, durable state (roadmap, learnings library, run history).

## Modes

1. **Run directly** — the user pasted research inputs, a brief, or results. Apply the matching method embedded in `public/index.html` (search for `METHOD_A`, the brief prompt in `briefRun`, or the read-out prompt in `roRun`) and answer in the conversation. For a read-out, compute the statistics with the functions in the page's `Stats (pure)` block (copy them into a Node one-liner) before writing any narrative. Never invent numbers.
2. **Deploy** — first time. Steps below.
3. **Update** — change a tool, add a tool, fix a bug. Edit, verify, commit, push, redeploy.

Prerequisites for 2 and 3: `gh auth status`, `vercel whoami`, `ANTHROPIC_API_KEY` in the environment. If any is missing, give the exact fix and stop.

## Deploy (first time)

1. `npm install`.
2. Verify the page parses: extract the inline script and run `node --check` on it (there is a snippet in the Verify section).
3. `git init && git add -A && git commit -m "Growth Experimentation Toolkit"` then `gh repo create growth-experimentation-toolkit --public --source=. --push`.
4. `vercel --yes` to link the project, then `printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY production`.
5. Persistence: tell the user to open the Vercel dashboard → the project → Storage → Create Database → **Upstash for Redis** → Connect. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Wait for them to confirm, then `vercel env pull .env.local` to check the vars exist. If they skip this, say plainly that history and the roadmap will not be shared or durable.
6. `vercel --prod --yes`. Put the URL in README under "Live", commit, push.
7. Smoke test: `curl -s -X POST <url>/api/ai -H 'content-type: application/json' -d '{"input":"Reply with the word ok","json":false}'` returns `{"text":"ok"...}`; `curl -s '<url>/api/store?key=state/roadmap'` returns `{"value":null,"persistent":true}` (persistent must be true if Redis was connected).
8. Report the live URL and repo URL.

## Update

- Make the change in `public/index.html` (UI and methods) or `api/*.js` (server).
- Each tool is a `<section class="tool" id="tab-...">` plus a nav button in `#rail` and a block in the script marked `/* ---------- N Name ---------- */`. To add a tool: copy that pattern, give it a `bank(kind, title, payload)` call on success so it lands in History, and add a `case` to `reopen()`.
- Keep every number computed in the `Stats (pure)` block, never by the model.
- Verify (below), then `git commit -am "<what changed>"`, `git push`, `vercel --prod --yes`.
- Never commit `.env.local` or any key. `git status` before every commit.

## Verify

```
node -e 'const s=require("fs").readFileSync("public/index.html","utf8");const m=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];require("fs").writeFileSync("/tmp/gxt.js",m.map(x=>x[1]).join("\n"))' && node --check /tmp/gxt.js
```
Then run `npx vercel dev`, open the page, press "Load sample" in Synthesise and Read-out, and confirm both produce output and appear in History.

## Demo notes

Before an interview: run the hiring company's reviews through Synthesise, send the top hypothesis to Brief, then to Read-out with the sample numbers, and show History holding all three. Lead with the fact that the statistics are computed in code and the model is only allowed to narrate.
