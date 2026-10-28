---
name: test-qa
description: Pre-launch QA for A/B tests: compare control and variant HTML for tracking, events, content and visual design, classify differences as in-scope or clashes, and run the QA checklist. Use for /test-qa, "QA this test", "compare control and variant", "is this test ready to launch".
---

# Test QA

The page `public/qa/index.html` does this interactively. Use this skill to run the same method in Claude Code on supplied files, or to extend the page.

## Method (run directly on control + variant HTML)
1. **Scope first.** Ask what is supposed to change (elements, copy, CTA, price) and the primary metric event name. Everything else that differs is a clash until justified. If the user has approved design images (mockups or screenshots) for the control and/or variants, read them and derive the scope from them: list what the design shows changing and what must stay the same, then confirm with the user.
2. **Scan each page** for: GTM / GA4 / UA / pixel ids; `dataLayer.push({event:...})` and `gtag('event',...)` names, including inside `onclick` attributes; tracking data-attributes; experiment-tool scripts and variant markers (`data-exp`, `data-variant`); consent manager; external scripts; CTAs with text, href and tracking; forms with action, method and field names; links and broken links; headings and H1 count; prices; title, canonical, robots, lang, viewport; fonts and font sources; colours; images, missing alt, empty src; duplicate ids; HTML size.
3. **Compare** control vs each variant per check. Same = identical. Changed = differs and matches the scope. Clash = differs and not in scope, or any tracking/quality item that differs (ids, events, consent, scripts, CTA tracking, forms, alt, duplicate ids, viewport, H1 count). Variant markers are expected to differ. The primary metric event must be found, as a whole token, on every page.
4. **Diff the visible copy** word by word and list added/removed phrases.
5. **Checklist.** Auto items from the scan (same ids, metric event everywhere, same event names, variant identifiable, consent present, CTA tracking equal, same form endpoint, no broken links, fonts/colours/images in scope, one H1 + viewport, no duplicate ids). Manual items to list for the user: sticky assignment, UTM/click-id preservation, no flicker, SRM check after 24h, form validation states, goal counted once, 375/768/1280 and cross-browser checks, design sign-off, compliance sign-off.
6. **Design check.** When design images were supplied, treat them as the source of truth per page: a difference that matches that page's design is intended; one that contradicts it, or appears on a page whose design does not show it, is accidental. List design mismatches (missing elements, different copy or CTA label, colours, fonts) as far as the HTML allows.
7. **Verdict.** Not ready if any clash; list blockers (tracking, events, consent, CTA destination, price) separately from out-of-scope design changes to accept or revert. Never call a test launch-ready with a tracking clash.

## Extend the page
- Checks: `CATS` (label → scanner key) and `scanPage()`; tracking/quality keys in `TRACK_KEYS`.
- Scope matching words: `scopeMatches()`.
- Checklist: `CHECKS` (auto functions receive the comparison result; manual items persist in localStorage under the test name).
- Design images: per page `pages[i].designs` (uploaded via `input[data-design]`, shrunk to ≤1600px JPEG by `shrink()`); `designImages()` flattens them for the AI calls; `#derive` fills `#scope` from the images (hidden when the runtime has no image support); the AI review passes them as `images` and returns `designMismatches`; previews show them beside each render. Max 3 images per page, capped by `sample.limits().images.maxCount` overall.
- Example: `$('sample').onclick`; the variant has four planted defects (renamed event, consent script removed, missing alt, changed image) and two out-of-scope changes (price, font and colour). Keep `<\/script>` escaped inside the example strings.
