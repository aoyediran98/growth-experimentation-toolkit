# Growth Experimentation Toolkit

One page that follows a test through its life: research → hypothesis → brief → build → run → read-out → learn.

Tools: Synthesise (research to hypotheses), Page audit, Sample size and duration, Brief generator, Variants and persona pre-screen, Roadmap board, Peeking guard, Read-out with CSV import, Learnings library, History.

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
_URL goes here after deploy._
