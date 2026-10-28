/* Translation for every page of the suite: English, Spanish, Dutch and French.
   1. A language picker in the shared nav translates the whole page (labels, buttons, placeholders and results, including
      results that appear later), using /api/ai. Translations are cached per language in this browser, so each string is
      only sent once and switching back to English restores the original text.
   2. "Translate text" opens a panel that converts pasted text between any two of the four languages.
   What people type into fields is never changed by the page translation; use the panel for that. */
(function () {
  const LANGS = { en: "English", es: "Spanish", nl: "Dutch", fr: "French" };
  const NATIVE = { en: "English", es: "Español", nl: "Nederlands", fr: "Français" };
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "SVG", "TEMPLATE", "IFRAME", "CANVAS"]);
  const ATTRS = ["placeholder", "title", "aria-label"];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem("gxt." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("gxt." + k, JSON.stringify(v)); } catch (e) {} },
  };

  let lang = LANGS[ls.get("lang", "en")] ? ls.get("lang", "en") : "en";
  const cache = {}; // lang -> { english: translated }
  const dict = (l) => cache[l] || (cache[l] = ls.get("tr.v1." + l, {}));
  const original = new WeakMap(); // text node -> English text
  const applied = new WeakMap(); // text node -> text this script last wrote
  const attrOriginal = new WeakMap(); // element -> { attr: English }

  async function ai(body) {
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  /* ---------- which text gets translated ---------- */
  const worth = (t) => t.length > 1 && /\p{L}{2,}/u.test(t) && !/^(https?:\/\/|www\.)\S+$/i.test(t) && !/^[\w.+-]+@[\w.-]+$/.test(t);
  function skipped(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (SKIP.has(n.tagName) || n.isContentEditable || (n.hasAttribute && (n.hasAttribute("data-no-translate") || n.getAttribute("translate") === "no"))) return true;
    }
    return false;
  }
  function textNodes(root) {
    const out = [];
    if (root.nodeType === 3) return root.parentElement && !skipped(root.parentElement) ? [root] : [];
    if (root.nodeType !== 1 || skipped(root)) return out;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && !skipped(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  }
  function attrEls(root) {
    if (root.nodeType !== 1) return [];
    const sel = ATTRS.map((a) => `[${a}]`).join(",");
    return [...(root.matches(sel) ? [root] : []), ...root.querySelectorAll(sel)].filter((el) => !skipped(el.parentElement || el) || el.tagName === "TEXTAREA");
  }
  // true when `shown` is a translation this script produced for the English string `eng`, in any language
  const ours = (eng, shown) => eng != null && Object.keys(LANGS).some((l) => l !== "en" && dict(l)[eng.trim()] === shown);
  const englishOf = (n) => {
    if (applied.get(n) !== n.data) original.set(n, n.data); // the page wrote new English text since we last touched it
    return original.has(n) ? original.get(n) : (original.set(n, n.data), n.data);
  };

  /* ---------- translating strings, in batches, with the cache ---------- */
  async function translateStrings(list, to, onProgress) {
    const d = dict(to);
    const todo = [...new Set(list.filter((s) => !(s in d)))];
    const batches = [];
    for (let i = 0, cur = [], size = 0; i < todo.length; i++) {
      cur.push(todo[i]);
      size += todo[i].length;
      if (cur.length >= 80 || size > 5000 || i === todo.length - 1) (batches.push(cur), (cur = []), (size = 0));
    }
    let done = 0;
    const run = async (b) => {
      const prompt = `Translate each string in the JSON array below from English into ${LANGS[to]}. This is the interface and output of a conversion-rate-optimisation and A/B-testing toolkit, so use the terms practitioners in that language actually use (keep widely used English terms such as CTA, A/B test, ICE, SRM where they are normal in ${LANGS[to]}).
Rules: return a JSON array of exactly ${b.length} strings, in the same order. Keep numbers, percentages, currency, dates, units, URLs, emails, code, Markdown symbols, placeholders like {x} or [TO CONFIRM], and brand or product names (Growth Suite, Claude, Juniper) unchanged. Keep the same capitalisation style (for example, all-caps labels stay all-caps). If a string is already in ${LANGS[to]} or cannot be translated, return it unchanged.
${JSON.stringify(b)}`;
      try {
        const j = await ai({ input: prompt, json: true, tier: "quick" });
        const v = Array.isArray(j.value) ? j.value : Array.isArray(j.value?.strings) ? j.value.strings : null;
        if (v && v.length === b.length) b.forEach((s, i) => { if (typeof v[i] === "string" && v[i].trim()) d[s] = v[i]; });
      } catch (e) {
        console.warn("translation batch failed", e);
      }
      done++;
      onProgress && onProgress(done, batches.length);
    };
    for (let i = 0; i < batches.length; i += 4) await Promise.all(batches.slice(i, i + 4).map(run));
    ls.set("tr.v1." + to, d);
    return d;
  }

  /* ---------- applying a language to the page ---------- */
  let busy = false, queued = new Set(), timer = null;
  const wrap = (eng, t) => { const m = eng.match(/^(\s*)[\s\S]*?(\s*)$/); return m[1] + t + m[2]; };
  function write(n, text) { if (n.data !== text) { applied.set(n, text); n.data = text; } else applied.set(n, text); }

  async function applyTo(roots, showProgress) {
    const nodes = roots.flatMap(textNodes), els = roots.flatMap(attrEls);
    if (lang === "en") {
      nodes.forEach((n) => { if (original.has(n) && applied.get(n) === n.data) write(n, original.get(n)); });
      els.forEach((el) => { const o = attrOriginal.get(el); if (o) for (const a in o) el.setAttribute(a, o[a]); });
      return;
    }
    const strings = [];
    nodes.forEach((n) => { const e = englishOf(n).trim(); if (worth(e)) strings.push(e); });
    els.forEach((el) => {
      const o = attrOriginal.get(el) || {};
      ATTRS.forEach((a) => { if (el.hasAttribute(a)) { const cur = el.getAttribute(a); if (!(a in o) || (o[a] !== cur && !ours(o[a], cur))) o[a] = cur; if (worth(o[a].trim())) strings.push(o[a].trim()); } });
      attrOriginal.set(el, o);
    });
    const target = lang;
    const d = await translateStrings(strings, target, showProgress ? (a, b) => status(`Translating ${a}/${b}…`) : null);
    if (target !== lang) return; // language changed while we waited
    nodes.forEach((n) => { const e = englishOf(n), k = e.trim(); if (d[k]) write(n, wrap(e, d[k])); });
    els.forEach((el) => { const o = attrOriginal.get(el); for (const a in o) { const k = o[a].trim(); if (d[k]) el.setAttribute(a, d[k]); } });
  }

  async function setLang(l) {
    lang = l;
    ls.set("lang", l);
    document.documentElement.lang = l;
    sel && (sel.value = l);
    if (l === "en") { await applyTo([document.body]); status(""); return; }
    status("Translating…");
    busy = true;
    try { await applyTo([document.body], true); status(""); }
    catch (e) { status("Translation failed: " + e.message); }
    busy = false;
    flush();
  }

  /* New or changed content (results, re-rendered lists) is translated as it appears. */
  function flush() {
    if (busy || lang === "en" || !queued.size) return;
    const roots = [...queued].filter((n) => n.isConnected);
    queued.clear();
    busy = true;
    applyTo(roots, true).catch(() => {}).finally(() => { busy = false; status(""); if (queued.size) schedule(); });
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 400); };
  new MutationObserver((muts) => {
    if (lang === "en") return;
    for (const m of muts) {
      if (m.type === "characterData") { if (applied.get(m.target) !== m.target.data) queued.add(m.target); }
      else if (m.type === "attributes") { if (!ATTRS.includes(m.attributeName)) continue; const o = attrOriginal.get(m.target), v = m.target.getAttribute(m.attributeName); if (!o || (o[m.attributeName] !== v && !ours(o[m.attributeName], v))) queued.add(m.target); }
      else m.addedNodes.forEach((n) => queued.add(n));
    }
    if (queued.size) schedule();
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  /* ---------- controls in the shared nav, and the text panel ---------- */
  const css = document.createElement("style");
  css.textContent = `.tr-ctl{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:13px}
.tr-ctl select{font:inherit;font-size:13px;width:auto;padding:3px 6px;border-radius:999px}
.tr-ctl button{font:inherit;font-size:13px;cursor:pointer;color:var(--muted);background:none;border:1px solid var(--line);border-radius:999px;padding:3px 10px}
.tr-ctl button:hover{background:var(--soft)}
.tr-status{color:var(--muted);font-size:12px}
.tr-panel{position:fixed;right:16px;bottom:16px;z-index:50;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:14px;display:flex;flex-direction:column;gap:10px}
.tr-panel[hidden]{display:none}
.tr-panel .tr-row{display:flex;flex-wrap:wrap;gap:8px;align-items:end}
.tr-panel label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);flex:1 1 120px}
.tr-panel select,.tr-panel textarea{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.tr-panel textarea{min-height:110px;resize:vertical;font-size:14px}
.tr-panel .tr-head{display:flex;justify-content:space-between;align-items:center;font-weight:600}
.tr-panel .tr-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tr-panel .tr-actions button{font:inherit;font-size:13px;cursor:pointer;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px;padding:5px 12px}
.tr-panel .tr-actions button.tr-go{background:var(--accent);color:var(--accent-fg,#fff);border-color:var(--accent);font-weight:600}`;
  document.head.appendChild(css);

  const opts = (withAuto) => (withAuto ? '<option value="auto">Detect</option>' : "") + Object.keys(LANGS).map((k) => `<option value="${k}">${NATIVE[k]}</option>`).join("");
  const ctl = document.createElement("span");
  ctl.className = "tr-ctl";
  ctl.setAttribute("data-no-translate", "");
  ctl.innerHTML = `<select aria-label="Page language">${opts(false)}</select><button type="button">Translate text</button><span class="tr-status" aria-live="polite"></span>`;
  const sel = ctl.querySelector("select");
  const statusEl = ctl.querySelector(".tr-status");
  function status(t) { statusEl.textContent = t; }
  sel.value = lang;
  sel.onchange = () => setLang(sel.value);
  (document.querySelector(".suite-nav") || document.body.insertBefore(Object.assign(document.createElement("div"), { className: "suite-nav" }), document.body.firstChild)).appendChild(ctl);

  const panel = document.createElement("div");
  panel.className = "tr-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Translate text");
  panel.innerHTML = `<div class="tr-head"><span>Translate text</span><div class="tr-actions"><button type="button" data-x>Close</button></div></div>
<div class="tr-row"><label>From<select data-from>${opts(true)}</select></label><div class="tr-actions"><button type="button" data-swap aria-label="Swap languages">⇄</button></div><label>To<select data-to>${opts(false)}</select></label></div>
<label>Text<textarea data-in placeholder="Paste research verbatims, copy, a brief or a read-out"></textarea></label>
<div class="tr-actions"><button type="button" class="tr-go" data-go>Translate</button><span class="tr-status" data-st></span></div>
<label>Translation<textarea data-out readonly></textarea></label>
<div class="tr-actions"><button type="button" data-copy>Copy</button><button type="button" data-use>Replace the text above</button></div>`;
  document.body.appendChild(panel);
  const $p = (s) => panel.querySelector(s);
  $p("[data-to]").value = lang === "en" ? "es" : lang;
  ctl.querySelector("button").onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) $p("[data-in]").focus(); };
  $p("[data-x]").onclick = () => (panel.hidden = true);
  $p("[data-swap]").onclick = () => { const f = $p("[data-from]"), t = $p("[data-to]"); if (f.value === "auto") return; [f.value, t.value] = [t.value, f.value]; const a = $p("[data-in]"), b = $p("[data-out]"); if (b.value) [a.value, b.value] = [b.value, ""]; };
  $p("[data-copy]").onclick = () => { const v = $p("[data-out]").value; if (v) navigator.clipboard.writeText(v).then(() => ($p("[data-st]").textContent = "Copied")).catch(() => {}); };
  $p("[data-use]").onclick = () => { const v = $p("[data-out]").value; if (v) { $p("[data-in]").value = v; $p("[data-out]").value = ""; } };
  $p("[data-go]").onclick = async () => {
    const text = $p("[data-in]").value.trim(), from = $p("[data-from]").value, to = $p("[data-to]").value, st = $p("[data-st]");
    if (!text) { st.textContent = "Paste some text first."; return; }
    if (from === to) { $p("[data-out]").value = text; return; }
    st.textContent = "Translating…";
    const prompt = `Translate the text below ${from === "auto" ? "" : `from ${LANGS[from]} `}into ${LANGS[to]}. If it is already entirely in ${LANGS[to]}, return it unchanged. It comes from conversion-rate-optimisation work (research verbatims, landing-page copy, test briefs, read-outs), so keep the meaning, tone and register exact, use the terms practitioners in ${LANGS[to]} actually use, and for marketing copy write it as a native copywriter would rather than word for word. Keep line breaks, list markers, Markdown, source tags in square brackets, numbers, prices, dates, URLs and brand names unchanged. Return only the translation, with no notes.

${text}`;
    try { const j = await ai({ input: prompt, json: false, tier: "default", long: text.length > 12000 }); $p("[data-out]").value = (j.text || "").trim(); st.textContent = j.truncated ? "The text was too long; only the first part was translated." : ""; }
    catch (e) { st.textContent = "Something went wrong: " + e.message; }
  };

  document.documentElement.lang = lang;
  if (lang !== "en") setLang(lang);
})();
