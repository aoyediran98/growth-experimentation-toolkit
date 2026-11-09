/* Demo banner. On the public demo deployment (/api/demo says so) every page explains that AI results are pre-recorded
   from the examples and that visitors' changes stay in their browser. On the real toolkit this does nothing. */
(async function () {
  let demo = false;
  try { demo = (await fetch("/api/demo").then((r) => r.json())).demo === true; } catch (e) {}
  if (!demo) return;
  document.documentElement.classList.add("gxt-demo");

  const css = document.createElement("style");
  css.textContent = `.demo-banner{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:10px 0 4px;padding:10px 14px;border-radius:8px;background:var(--accent-soft);color:var(--fg);font-size:13.5px;line-height:1.45}
.demo-banner strong{color:var(--accent);text-transform:uppercase;letter-spacing:.06em;font-size:12px}`;
  document.head.appendChild(css);
  const b = document.createElement("div");
  b.className = "demo-banner";
  b.setAttribute("role", "note");
  b.innerHTML = "<strong>Demo</strong><span>This is a working copy of the Growth Experimentation Toolkit. The AI results are real but pre-recorded, so use the <b>Load example</b> or <b>Load sample</b> buttons and run them. The statistics tools run live, and anything you add stays in your browser.</span>";
  const nav = document.querySelector(".suite-nav");
  if (nav) nav.insertAdjacentElement("afterend", b);
  else document.body.insertBefore(b, document.body.firstChild);

  // The storage badge on the toolkit says "shared"; in the demo nothing is shared or kept.
  const pill = document.getElementById("storePill");
  if (pill) {
    // Only replace the toolkit's own labels, so a translated version of ours is left alone.
    const fix = () => { if (/^Storage: (shared|this browser|checking)$/.test(pill.textContent.trim())) { pill.textContent = "Storage: this visit only"; pill.className = "pill warn"; } };
    new MutationObserver(fix).observe(pill, { childList: true, characterData: true, subtree: true });
    fix();
  }

  // The prototype builder in the Variants review panel: the example control comes with the example brief it was recorded with.
  const EXAMPLE = {
    rvGoal: "More first-time visitors start the assessment",
    rvSuccess: "Assessment start rate up 10%, refund rate unchanged",
    rvChange: "Change the headline to promise a two-minute eligibility check, move the monthly price and what it includes directly under the button, and add a small trust bar under the price with the CQC and GMC registrations.",
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#rvSampleBtn")) return;
    setTimeout(() => {
      for (const [id, v] of Object.entries(EXAMPLE)) { const el = document.getElementById(id); if (el && !el.value.trim()) el.value = v; }
      const mode = document.getElementById("rvProtoMode"); if (mode) mode.value = "edits";
    }, 0);
  });
})();
