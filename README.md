# Growth Experimentation Toolkit

One page that follows a test through its life: research → hypothesis → brief → build → run → read-out → learn.

Tools: Synthesise (research to hypotheses), Page audit (pasted copy, uploaded HTML or screenshots of pages and ads), Fuse insights (synthesis + audit), Sample size and duration, Brief generator, Variants and persona pre-screen with a variant-page builder that edits an uploaded control HTML, Message match, Funnel diagnostic, Localisation scorecard and Test QA (control vs variant scan for tracking, events, content and design, with a launch checklist) pages alongside the UX audit, Regulated copy, Ideation room and Pricing simulator, Roadmap board (ten steps from idea capture to rollout, with each idea's brief, variants, built page and read-out saved to it), Peeking guard, Read-out with CSV import, Learnings library, History.

The Variants tab can also package control vs variant as a stakeholder review (CRO Review System template) and publish it at `/r/<id>` on this deployment. Only the holder of `REVIEW_SHARE_TOKEN` can fetch, build or publish; reviews are stored in the toolkit's own Upstash database (only the review's own content, compressed; the page is rebuilt from the template when opened), or in a Vercel Blob store or your own here.now account if you add one. One-time setup: `vercel env add REVIEW_SHARE_TOKEN production`, then redeploy.

Every page has a language picker in the top nav (English, Spanish, Dutch, French) that translates the page, including results as they appear, and a "Translate text" panel that converts pasted text between any two of those languages (`public/translate.js`).

All statistics (sample size, power, two-proportion test with CI, SRM chi-square, Holm correction, annualised value at CI bounds, Monte Carlo peeking simulation) are computed in the browser in plain JavaScript. The model only writes narrative around numbers it is handed.

## Run locally
```
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npx vercel dev
```

## Deploy
See `.claude/skills/growth-toolkit/SKILL.md`, or by hand:
```
gh repo create growth-experimentation-toolkit --public --source=. --push
vercel --yes
printf '%s' "$ANTHROPIC_API_KEY" | vercel env add ANTHROPIC_API_KEY production
# In the Vercel dashboard: Storage → Create → Upstash for Redis → connect to this project (sets KV_* vars)
vercel --prod --yes
```
Without Redis the app still works; roadmap, learnings and history then live in each visitor's browser only.

## Live
https://gxt-vercel.vercel.app
