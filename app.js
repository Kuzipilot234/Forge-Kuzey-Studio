// Forge Kuzey Studio: idea -> look -> format -> storyboard of video prompts.
(() => {
  "use strict";
  const D = window.SF_DATA;
  const I = window.SF_I18N;
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("fks_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fks_" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("fks_" + k); } catch { /* storage unavailable */ } }
  };

  const NEGATIVE = "no on-screen text, no subtitles, no watermark, no logo, no distorted faces, no extra fingers or limbs, no flicker, no sudden identity change";
  const STORY_ACTS = ["Setup", "Rising conflict", "Climax", "Resolution"];
  const ASPECT = { vertical: "9:16", wide: "16:9", square: "1:1" };
  const LANG_NAMES = { en: "English", tr: "Turkish", es: "Spanish", de: "German" };
  const SAVED = ["lang", "category", "style", "platform", "tool", "scenes", "length", "idea", "ch", "story", "camera", "pace", "audio", "dialogLang", "dialogTouched", "continuity", "negatives"];

  const state = Object.assign({
    lang: detectLang(), category: "daily", style: "real", platform: "vertical", tool: "flow", scenes: "auto", length: "8",
    idea: "", ch: { who: "", look: "", outfit: "", place: "" }, story: false, camera: "auto", pace: "balanced",
    audio: "full", dialogLang: null, dialogTouched: false, continuity: true, negatives: true
  }, pickSaved(LS.get("draft", {})), { step: 1, allTypes: false, ai: false, model: "", lastResult: null, busy: false,
    authCfg: null, user: null, dailyLimit: null, fb: null, authMode: "signin", histList: [] });
  if (!I[state.lang]) state.lang = "en";
  if (!state.dialogLang) state.dialogLang = LANG_NAMES[state.lang];

  function detectLang() {
    const saved = LS.get("draft", {}).lang;
    if (saved) return saved;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return I[nav] ? nav : "en";
  }
  function pickSaved(o) {
    const out = {};
    SAVED.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; });
    return out;
  }
  function save() {
    const o = {};
    SAVED.forEach((k) => { o[k] = state[k]; });
    LS.set("draft", o);
  }

  // ---------- helpers ----------
  const t = (key, vars) => String(I[state.lang]?.[key] ?? I.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const catById = (id) => D.categories.find((c) => c.id === id) || D.categories[0];
  const styleById = (id) => D.styles.find((s) => s.id === id) || D.styles[0];
  const loc = (o) => (o && (o[state.lang] || o.en)) || "";
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 1700);
  }
  function setStatus(msg, isErr = false, busy = false) {
    const el = $("status");
    el.className = "status" + (isErr ? " err" : "");
    el.innerHTML = (busy ? '<span class="spinner"></span>' : "") + esc(msg);
  }
  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast(message ? "✓ " + message : t("toast.copied") + " ✓");
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- rendering ----------
  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute("aria-label", el.title); });
    renderExamples(); renderTypes(); renderStyles(); renderTools(); renderControls(); renderGuide(); renderChars(); renderMode(); renderSummary(); renderCount();
    if (state.lastResult) renderResults(state.lastResult);
  }

  function renderExamples() {
    $("examples").innerHTML = (I[state.lang].examples || I.en.examples)
      .map((ex, i) => `<button class="chip" data-ex="${i}">${catById(ex.cat).icon} ${esc(ex.label)}</button>`).join("");
  }

  function renderTypes() {
    let list = state.allTypes ? D.categories : D.featured.map(catById);
    if (!list.some((c) => c.id === state.category)) list = [...list, catById(state.category)];
    $("types").innerHTML = list.map((c) => `
      <button class="type" role="radio" aria-checked="${c.id === state.category}" data-cat="${c.id}">
        <span class="ico" aria-hidden="true">${c.icon}</span>
        <span><b>${esc(loc(c.name))}</b><small>${esc(loc(c.short))}</small></span>
      </button>`).join("");
    $("moreTypes").textContent = state.allTypes ? t("s2.less") : t("s2.more", { n: D.categories.length });
  }

  function renderStyles() {
    $("styles").innerHTML = D.styles.map((s) => `
      <button class="stylec" role="radio" aria-checked="${s.id === state.style}" data-style="${s.id}">
        <span class="sw" style="background:${s.swatch}"></span><span>${esc(loc(s.name))}</span>
      </button>`).join("");
  }

  const toolById = (id) => D.tools.find((x) => x.id === id) || D.tools[0];
  const toolName = (tool) => tool.name || t("tool.other");

  function renderTools() {
    $("tools").innerHTML = D.tools.map((x) => `
      <button class="toolc" role="radio" aria-checked="${x.id === state.tool}" data-tool="${x.id}">
        <span class="t-ico" aria-hidden="true">${esc(x.icon)}</span>
        <span><b>${esc(toolName(x))}</b><small>${esc(t(`tool.${x.id}.sub`))}</small></span>
      </button>`).join("");
    const tool = toolById(state.tool);
    $("toolSilent").hidden = tool.audio;
    $("toolSilent").textContent = tool.audio ? "" : t("tool.silent", { tool: toolName(tool) });
  }

  function renderGuide() {
    $("guideList").innerHTML = ["flow", "kling", "dreamina", "pika"].map((id) => {
      const x = toolById(id);
      return `<li><a href="${x.url}" target="_blank" rel="noopener">${esc(x.name)}</a> — ${esc(t("guide." + id))}</li>`;
    }).join("");
  }

  function renderControls() {
    const tool = toolById(state.tool);
    if (!tool.lengths.includes(+state.length)) state.length = String(tool.def);
    $("lengthSeg").innerHTML = tool.lengths.map((n) => `<button data-v="${n}">${esc(t("s3.sec", { n }))}</button>`).join("");
    document.querySelectorAll("#platforms button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.pf === state.platform)));
    document.querySelectorAll("#scenesSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === String(state.scenes)));
    document.querySelectorAll("#lengthSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === String(state.length)));
    $("idea").value = state.idea;
    $("chWho").value = state.ch.who; $("chLook").value = state.ch.look;
    $("chOutfit").value = state.ch.outfit; $("chPlace").value = state.ch.place;
    $("story").checked = state.story; $("continuity").checked = state.continuity; $("negatives").checked = state.negatives;
    $("camera").value = state.camera; $("pace").value = state.pace; $("audio").value = state.audio;
    $("dialogLang").value = state.dialogLang;
  }

  // AI can be used when the server has a key and, if accounts are on, the visitor is signed in and verified.
  const aiAllowed = () => state.ai && (!state.authCfg || Boolean(state.user && state.user.emailVerified));

  function renderMode() {
    const b = $("modeBadge");
    const allowed = aiAllowed();
    b.textContent = !state.ai ? t("mode.tpl") : allowed ? "● " + t("mode.ai") : t("mode.signin");
    b.classList.toggle("on", allowed);
    $("improveBtn").hidden = !state.ai;
    renderAccount();
  }

  function renderCount() {
    const n = splitIdea(state.idea).length;
    $("ideaCount").textContent = n ? `${t("sum.scenes")}: ~${Math.min(8, Math.max(3, n))}` : "";
  }

  function renderSummary() {
    const c = catById(state.category);
    const idea = state.idea.trim();
    const who = state.ch.who.trim();
    const pfKey = { vertical: "pf.vertical", wide: "pf.wide", square: "pf.square" }[state.platform];
    const scenes = state.scenes === "auto" ? t("s3.auto") : `${state.scenes} · ${t("sum.total", { s: state.scenes * state.length })}`;
    const rows = [
      [t("sum.idea"), idea ? (idea.length > 110 ? idea.slice(0, 110) + "…" : idea) : t("sum.empty"), !idea, 1],
      [t("sum.type"), `${c.icon} ${loc(c.name)}`, false, 2],
      [t("sum.style"), loc(styleById(state.style).name), false, 2],
      [t("sum.char"), who || t("sum.none"), !who, 2],
      [t("sum.format"), `${t(pfKey)} · ${ASPECT[state.platform]} · ${t("s3.sec", { n: state.length })} · ${toolName(toolById(state.tool))}`, false, 3],
      [t("sum.scenes"), scenes, false, 3]
    ];
    $("summaryList").innerHTML = rows.map(([k, v, empty, step]) => `
      <div class="sum-row"><dt>${esc(k)}</dt><dd class="${empty ? "empty" : ""}">${esc(v)}</dd>
      <button data-go="${step}">${esc(t("sum.edit"))}</button></div>`).join("");
  }

  function goStep(n) {
    state.step = n;
    [1, 2, 3].forEach((i) => { $("step" + i).hidden = i !== n; });
    document.querySelectorAll("#stepper button").forEach((b) => {
      const s = +b.dataset.step;
      b.classList.toggle("on", s === n);
      b.classList.toggle("done", s < n);
      if (s === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    const top = document.querySelector(".wizard").getBoundingClientRect().top;
    if (top < 0) document.querySelector(".wizard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- scene building ----------
  function splitIdea(text) {
    return String(text || "").split(/\n+/)
      .flatMap((l) => l.split(/(?<=[.!?。])\s+/))
      .map((s) => s.trim()).filter((s) => s.length > 1);
  }

  function settings() {
    const sentences = splitIdea(state.idea);
    const fixed = state.scenes === "auto" ? null : +state.scenes;
    const ch = state.ch;
    const dna = [ch.who.trim(), ch.look.trim() && "appearance: " + ch.look.trim(), ch.outfit.trim() && "outfit: " + ch.outfit.trim(),
      ch.place.trim() && "location: " + ch.place.trim()].filter(Boolean).join("; ");
    return {
      sentences, fixed,
      count: fixed || (state.story ? 4 : Math.min(8, Math.max(3, sentences.length))),
      category: catById(state.category), style: styleById(state.style),
      aspect: ASPECT[state.platform], duration: state.length, dna, tool: toolById(state.tool),
      story: state.story, camera: state.camera, pace: state.pace, audio: state.audio,
      dialogLang: state.dialogLang, continuity: state.continuity, negatives: state.negatives
    };
  }

  function audioText(s, i) {
    if (!s.tool.audio) return ""; // this tool makes silent clips
    switch (s.audio) {
      case "silent": return "No audio.";
      case "music": return "Audio: cinematic music bed matching the mood, no dialogue.";
      case "sfx": return "Audio: natural ambient sound and precise sound effects synced to the action, no dialogue.";
      default: return `Audio: natural ambience and synced sound effects; if a character speaks, one short natural line of dialogue in ${s.dialogLang}${i === 0 ? " (write the exact words in quotes)" : ""}.`;
    }
  }

  function templateScenes(s) {
    const cams = D.cameraMoves[s.camera] || D.cameraMoves.auto;
    const paceTxt = { calm: "Slow, contemplative pacing.", balanced: "Natural, steady pacing.", viral: "Fast, punchy pacing with a strong hook in the first second." }[s.pace];
    const beats = ["", "closer angle on the details of this moment", "the reaction that follows", "the moment builds to its peak"];
    const src = s.sentences.length ? s.sentences : [s.category.ideas[0]];
    const out = [];
    for (let i = 0; i < s.count; i++) {
      const idx = Math.min(src.length - 1, Math.floor((i * src.length) / s.count));
      const prevIdx = i === 0 ? -1 : Math.min(src.length - 1, Math.floor(((i - 1) * src.length) / s.count));
      const repeat = idx === prevIdx ? (out.filter((o) => o._idx === idx).length) : 0;
      const line = src[idx].replace(/[.!?。]+$/, "");
      const act = s.story ? STORY_ACTS[Math.min(3, Math.floor((i * 4) / s.count))] : null;
      const camera = s.pace === "viral" && i === 0 ? "fast push-in hook shot" : pick(cams, i * 3 + Math.floor(i / 2));
      const light = pick(D.lighting, i + s.category.id.length);
      const parts = [
        `${s.style.text}. ${s.category.brief}`,
        s.dna && `Same character and setting in every scene: ${s.dna}.`,
        `Scene ${i + 1} of ${s.count}${act ? ` (${act})` : ""}: ${line}${repeat ? ` — ${pick(beats.slice(1), repeat - 1)}` : ""}.`,
        s.continuity && i > 0 && "Continuity: starts exactly where the previous scene ended, with the same outfit, props, time of day and location details.",
        `Camera: ${camera}. Lighting: ${light}. ${paceTxt}`,
        audioText(s, i),
        `Format: ${s.aspect}, ${s.duration} seconds, one continuous shot, cinematic quality.`
      ].filter(Boolean);
      out.push({ _idx: idx, title: (act ? act + ": " : "") + line.slice(0, 80), prompt: parts.join("\n"), camera, lighting: light, negative: s.negatives ? NEGATIVE : "" });
    }
    return out.map(({ _idx, ...rest }) => rest);
  }

  function systemPrompt(s) {
    const countRule = s.fixed
      ? `Produce EXACTLY ${s.fixed} scenes.`
      : s.story ? "Produce EXACTLY 4 scenes." : "Produce between 3 and 8 scenes, whatever best fits the idea (usually one per key moment).";
    const [minW, maxW] = s.tool.words;
    return `You are an expert AI video director. You turn a short video idea into a storyboard of shot prompts for ${s.tool.ai}.

Rules:
- ${countRule}
- The idea may be written in any language. Understand it and keep all names, places and details.
- ${s.story ? "Structure the scenes as a 4-act story: Setup, Rising conflict, Climax, Resolution." : "Follow the order of events in the idea; split or expand moments so every scene is one clear shot."}
- Video type: "${s.category.name.en}". ${s.category.brief}
- Visual style (repeat it in every prompt): ${s.style.text}
${s.dna ? `- Character and setting (copy these details word for word into EVERY prompt so nothing drifts between scenes): ${s.dna}` : "- Invent one clear main character or subject and describe them identically in every prompt."}
- ${s.continuity ? "Continuity: each scene starts exactly where the previous one ended." : "Scenes may jump in time or place."}
- Each "prompt" is one paragraph of ${minW}-${maxW} words IN ENGLISH covering: subject and appearance, action, setting, camera movement and framing, lighting${s.tool.audio ? ", mood and sound" : " and mood"}.${maxW <= 90 ? " This tool works best with short, clear prompts: one main action per scene, no long lists of details." : ""}
- Camera preference: ${s.camera}. Pacing: ${s.pace}.
- Sound: ${!s.tool.audio ? "this tool makes silent clips, so do not describe sound, music or dialogue; show emotions through faces and body language" : { full: `ambience, sound effects and short natural dialogue in ${s.dialogLang} (put spoken words in double quotes)`, sfx: "ambience and sound effects, no dialogue", music: "music only, no dialogue", silent: "no audio" }[s.audio]}.
- End every prompt with: "Format: ${s.aspect}, ${s.duration} seconds."
- No on-screen text or subtitles. Keep everything safe for all audiences.
- Write each "title" (max 8 words) in ${LANG_NAMES[state.lang]}.

Also write a social media pack for posting the finished video on ${PLATFORM_NAMES[state.platform]}, ${socialRules()}

Respond with JSON only, in this shape:
{"scenes":[{"title":"short scene title","prompt":"full English prompt","camera":"camera move in English","lighting":"lighting in English"}],
 "social":{"title":"...","hook":"...","caption":"...","hashtags":["#..."],"music":"..."}}`;
  }

  // ---------- social media pack ----------
  const PLATFORM_NAMES = { vertical: "TikTok, Instagram Reels and YouTube Shorts", wide: "YouTube", square: "Instagram" };
  const SOCIAL_RULES = `written in ${"${LANG}"}:
- "title": catchy video title, max 70 characters.
- "hook": short text to show on screen in the first 2 seconds, max 8 words.
- "caption": 1-3 short sentences that make people curious, ending with a question or call to action. Up to 2 fitting emoji.
- "hashtags": 8-12 hashtags without spaces, mixing popular and specific ones.
- "music": the style, mood and tempo of background music plus 1-2 sound effects to add. Describe the style; don't name copyrighted songs.`;
  const socialRules = () => SOCIAL_RULES.replace("${LANG}", LANG_NAMES[state.lang]);

  function cleanSocial(x) {
    if (!x || typeof x !== "object") return null;
    const tags = (Array.isArray(x.hashtags) ? x.hashtags : String(x.hashtags || "").split(/[\s,]+/))
      .map((h) => String(h).trim().replace(/^#*/, "#").replace(/\s+/g, "")).filter((h) => h.length > 1).slice(0, 15);
    const out = { title: String(x.title || "").slice(0, 120), hook: String(x.hook || "").slice(0, 80),
      caption: String(x.caption || "").slice(0, 600), hashtags: tags, music: String(x.music || "").slice(0, 300) };
    return out.title || out.caption ? out : null;
  }

  // A simple pack without AI, used in template mode and for older storyboards.
  function templateSocial(r) {
    const c = catById(r.category);
    const first = splitIdea(r.idea)[0] || loc(c.name);
    const tag = (s) => "#" + String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ığüşöç]/g, "");
    const platformTags = { vertical: ["#shorts", "#reels", "#fyp"], wide: ["#youtube"], square: ["#instagram", "#reels"] }[r.platform] || [];
    return {
      title: first.replace(/[.!?。]+$/, "").slice(0, 70),
      hook: (first.split(/\s+/).slice(0, 6).join(" ") + "…"),
      caption: `${first} ${t("soc.cta")}`,
      hashtags: [...new Set([tag(c.name.en), "#aivideo", "#aiart", ...platformTags, "#storytime"])],
      music: t("soc.musicTpl"),
      template: true
    };
  }

  function socialText(soc) {
    return [soc.title, soc.hook && `🎬 ${soc.hook}`, soc.caption, soc.hashtags.join(" "), soc.music && `🎵 ${soc.music}`].filter(Boolean).join("\n\n");
  }

  function renderSocial(r) {
    const soc = r.social || templateSocial(r);
    state.lastSocial = soc;
    const row = (key, label, value) => value ? `
      <div class="soc-row"><div class="soc-label">${esc(label)}</div>
        <div class="soc-value">${esc(value)}</div>
        <button class="copy small" data-soc="${key}">${esc(t("res.copy"))}</button></div>` : "";
    $("social").innerHTML = `
      <div class="soc-head">
        <div><h3>📱 ${esc(t("soc.title"))}</h3><p class="hint">${esc(t("soc.sub", { platform: PLATFORM_NAMES[r.platform] || PLATFORM_NAMES.vertical }))}</p></div>
        <div class="btn-row">
          <button class="soft" data-soc="all">📋 ${esc(t("res.copyAll"))}</button>
          ${state.ai ? `<button class="soft" id="socAiBtn">✨ ${esc(t(soc.template ? "soc.ai" : "soc.again"))}</button>` : ""}
        </div>
      </div>
      ${row("title", t("soc.videoTitle"), soc.title)}
      ${row("hook", t("soc.hook"), soc.hook)}
      ${row("caption", t("soc.caption"), soc.caption)}
      ${row("hashtags", t("soc.hashtags"), soc.hashtags.join(" "))}
      ${row("music", t("soc.music"), soc.music)}`;
  }

  async function socialAI() {
    const r = state.lastResult;
    if (!r) return;
    if (!aiAllowed()) { openAuth(state.user ? "verify" : "signin", false); return; }
    const btn = $("socAiBtn");
    if (btn) btn.disabled = true;
    setStatus(t("status.thinking"), false, true);
    try {
      const raw = await callAI(
        `You write social media posts for short AI videos. Write a pack for ${PLATFORM_NAMES[r.platform] || PLATFORM_NAMES.vertical}, ${socialRules()}\nRespond with JSON only: {"title":"...","hook":"...","caption":"...","hashtags":["#..."],"music":"..."}`,
        `Video idea:\n${r.idea}\n\nScenes:\n${r.scenes.map((sc, i) => `${i + 1}. ${sc.title}`).join("\n")}`, true);
      const soc = cleanSocial(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")));
      if (!soc) throw new Error("No social pack");
      r.social = soc;
      renderSocial(r);
      setStatus("");
    } catch (err) {
      console.error(err);
      if (err.code === "auth" || err.code === "verify") { setStatus(""); openAuth(err.code === "verify" ? "verify" : "signin", false); return; }
      setStatus(err.code === "daily" ? t("status.daily") : t("status.fallback"), true);
    } finally {
      if ($("socAiBtn")) $("socAiBtn").disabled = false;
    }
  }

  async function callAI(system, user, json) {
    const headers = { "Content-Type": "application/json" };
    if (state.user) headers.Authorization = "Bearer " + await state.user.getIdToken();
    const res = await fetch("api/generate", { method: "POST", headers, body: JSON.stringify({ system, user, json }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Server error ${res.status}`);
      err.code = data.code;
      throw err;
    }
    if (!data.text) throw new Error("Empty answer");
    return data.text;
  }

  async function checkAI() {
    try {
      const res = await fetch("api/health", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      state.ai = Boolean(data.ai);
      state.model = data.model || "";
      if (data.auth) {
        state.authCfg = data.auth;
        state.dailyLimit = data.dailyLimit;
        initAuth();
      }
    } catch { state.ai = false; }
    renderMode();
  }

  async function aiScenes(s) {
    const raw = await callAI(systemPrompt(s), `Video idea:\n${state.idea.trim()}`, true);
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new Error("Unreadable answer"); }
    const list = Array.isArray(parsed) ? parsed : parsed.scenes;
    const scenes = (Array.isArray(list) ? list : []).filter((x) => x && x.prompt);
    if (!scenes.length) throw new Error("No scenes");
    return {
      social: Array.isArray(parsed) ? null : cleanSocial(parsed.social),
      scenes: scenes.slice(0, 12).map((x) => ({
        title: String(x.title || "").slice(0, 100), prompt: String(x.prompt),
        camera: String(x.camera || ""), lighting: String(x.lighting || ""),
        negative: s.negatives ? NEGATIVE : ""
      }))
    };
  }

  // ---------- actions ----------
  async function generate(opts = {}) {
    if (state.busy) return;
    if (!state.idea.trim()) {
      goStep(1);
      setStatus(t("status.needIdea"), true);
      $("idea").focus();
      return;
    }
    const wantAI = state.ai && !opts.template;
    if (wantAI && !aiAllowed()) { openAuth(state.user ? "verify" : "signin", true); return; }
    const s = settings();
    setBusy(true);
    let scenes, social = null, engine = "template", fellBack = false, daily = false;
    try {
      if (wantAI) {
        setStatus(t("status.writing"), false, true);
        ({ scenes, social } = await aiScenes(s));
        engine = "ai";
      }
    } catch (err) {
      console.error(err);
      if (err.code === "auth" || err.code === "verify") {
        setBusy(false); setStatus("");
        openAuth(err.code === "verify" ? "verify" : "signin", true);
        return;
      }
      daily = err.code === "daily";
      fellBack = true;
    }
    if (!scenes) scenes = templateScenes(s);
    const result = {
      created: new Date().toISOString(), engine, category: state.category, style: state.style,
      platform: state.platform, tool: state.tool, aspect: s.aspect, duration: s.duration, dna: s.dna, idea: state.idea.trim(), scenes,
      ...(social ? { social } : {})
    };
    renderResults(result);
    saveHistory(result);
    setStatus(daily ? t("status.daily") : fellBack ? t("status.fallback") : t("status.ready"), fellBack);
    setBusy(false);
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setBusy(b) {
    state.busy = b;
    ["generateBtn", "sumGenerate"].forEach((id) => { $(id).disabled = b; });
  }

  async function surprise() {
    const examples = I[state.lang].examples || I.en.examples;
    if (!aiAllowed()) {
      const options = examples.filter((e) => e.text !== state.idea);
      const ex = rand(options.length ? options : examples);
      useIdea(ex.text, ex.cat);
      return;
    }
    const c = catById(rand(D.featured));
    await aiHelper(
      `Write one fresh, surprising short-video idea in ${LANG_NAMES[state.lang]} for the video type "${c.name.en}" (${c.brief}). Use 3-4 short sentences, each one a clear visual moment with a place. Plain text only, no title, no list.`,
      (text) => useIdea(text, c.id),
      "surpriseBtn"
    );
  }

  async function improve() {
    if (!state.idea.trim()) { setStatus(t("status.needImprove"), true); $("idea").focus(); return; }
    if (!aiAllowed()) { openAuth(state.user ? "verify" : "signin", false); return; }
    await aiHelper(
      `Improve this short-video idea for AI video generation. Answer in the same language the idea is written in. Keep the story and names. Use 3-6 short sentences, each one a clear visual moment with a specific place and one vivid detail. Plain text only, no title, no list.\n\nIdea:\n${state.idea.trim()}`,
      (text) => { state.idea = text; renderControls(); renderSummary(); renderCount(); save(); toast(t("toast.improved")); },
      "improveBtn"
    );
  }

  async function aiHelper(prompt, onText, btnId) {
    const btn = $(btnId);
    btn.disabled = true;
    setStatus(t("status.thinking"), false, true);
    try {
      const text = await callAI("You help people write short video ideas. Output only the requested text.", prompt, false);
      onText(text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).join(" "));
      setStatus("");
    } catch (err) {
      console.error(err);
      if (err.code === "auth" || err.code === "verify") { setStatus(""); openAuth(err.code === "verify" ? "verify" : "signin", false); return; }
      setStatus(err.code === "daily" ? t("status.daily") : t("status.fallback"), true);
      if (btnId === "surpriseBtn") { const ex = rand(I[state.lang].examples || I.en.examples); useIdea(ex.text, ex.cat); }
    } finally {
      btn.disabled = false;
    }
  }

  function useIdea(text, cat) {
    state.idea = text;
    if (cat) state.category = cat;
    renderControls(); renderTypes(); renderSummary(); renderCount(); save();
    toast(t("toast.idea"));
  }

  function restart() {
    state.idea = "";
    state.ch = { who: "", look: "", outfit: "", place: "" };
    state.lastResult = null;
    $("results").hidden = true;
    renderControls(); renderSummary(); renderCount(); save();
    setStatus("");
    goStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("idea").focus();
  }

  // ---------- results ----------
  function cardText(sc) {
    return sc.prompt + (sc.negative ? `\n\nNegative prompt: ${sc.negative}` : "");
  }
  function asText(r) {
    const c = catById(r.category);
    return `Forge Kuzey Studio — ${loc(c.name)} · ${loc(styleById(r.style).name)} · ${r.aspect} · ${r.duration}s\n${"=".repeat(60)}\n\n` +
      r.scenes.map((sc, i) => `${t("res.scene", { n: i + 1 }).toUpperCase()}: ${sc.title}\n\n${cardText(sc)}`).join(`\n\n${"-".repeat(60)}\n\n`) +
      `\n\n${"=".repeat(60)}\n${t("soc.title").toUpperCase()}\n\n${socialText(r.social || templateSocial(r))}`;
  }

  function renderResults(r) {
    state.lastResult = r;
    $("results").hidden = false;
    const len = +r.duration;
    const tool = toolById(r.tool || "flow");
    $("resMeta").textContent = t("res.meta", { n: r.scenes.length, aspect: r.aspect, total: r.scenes.length * len }) + " · " + toolName(tool);
    $("how1").textContent = t("res.how1", { tool: tool.url ? toolName(tool) : t("tool.other").toLowerCase() });
    const openBtn = (i) => tool.url
      ? `<a class="open-tool" href="${tool.url}" target="_blank" rel="noopener" data-open="${i}">${esc(t("res.open", { tool: toolName(tool) }))} ↗</a>` : "";
    $("board").innerHTML = r.scenes.map((sc, i) => `
      <article class="shot">
        <div class="shot-side">
          <span class="n">${String(i + 1).padStart(2, "0")}</span>
          <span class="lbl">${esc(t("res.scene", { n: i + 1 }))}</span>
          <span class="tc">${mmss(i * len)}–${mmss((i + 1) * len)}</span>
        </div>
        <div class="shot-main">
          <div class="shot-top">
            <h3>${esc(sc.title || t("res.scene", { n: i + 1 }))}${r.example ? `<span class="example-badge">${esc(t("res.example"))}</span>` : ""}</h3>
            <div class="shot-actions">
              <button class="copy" data-copy="${i}">${esc(t("res.copy"))}</button>
              ${openBtn(i)}
            </div>
          </div>
          <pre>${esc(sc.prompt)}</pre>
          <div class="tags">
            ${sc.camera ? `<span class="tag">🎥 ${esc(sc.camera)}</span>` : ""}
            ${sc.lighting ? `<span class="tag">💡 ${esc(sc.lighting)}</span>` : ""}
          </div>
          ${sc.negative ? `<div class="avoid"><b>${esc(t("res.avoid"))}</b> ${esc(sc.negative)}</div>` : ""}
        </div>
      </article>`).join("");
    renderSocial(r);
  }

  // Signed-in users keep their storyboards in Firestore (users/{uid}/storyboards); everyone also keeps a local copy.
  const cloudOn = () => Boolean(state.fb && state.user && state.user.emailVerified);
  const storyboardsRef = () => state.fb.db.collection("users").doc(state.user.uid).collection("storyboards");

  function saveHistory(r) {
    const h = LS.get("history", []);
    h.unshift(r);
    LS.set("history", h.slice(0, 15));
    if (cloudOn()) {
      const { example, ...doc } = r;
      storyboardsRef().add(JSON.parse(JSON.stringify(doc)))
        .then(() => toast(t("hist.cloud") + " ✓"))
        .catch((err) => console.error("Cloud save failed", err));
    }
  }

  async function renderHistory() {
    let list = LS.get("history", []);
    if (cloudOn()) {
      try {
        const snap = await storyboardsRef().orderBy("created", "desc").limit(30).get();
        list = snap.docs.map((d) => ({ ...d.data(), _id: d.id }));
      } catch (err) { console.error("Cloud history failed", err); }
    }
    state.histList = list;
    $("historyList").innerHTML = list.length
      ? list.map((r, i) => `<button class="hist-item" data-h="${i}"><b>${catById(r.category).icon} ${esc(loc(catById(r.category).name))}</b> · ${(r.scenes || []).length}
          <small>${esc(new Date(r.created).toLocaleString(state.lang))} — ${esc((r.idea || "").slice(0, 80))}</small></button>`).join("")
      : `<p class="hint">${esc(t("hist.empty"))}</p>`;
  }

  async function clearHistory() {
    LS.del("history");
    if (cloudOn()) {
      try {
        const snap = await storyboardsRef().limit(200).get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
      } catch (err) { console.error("Cloud clear failed", err); }
    }
    renderHistory();
  }

  // ---------- saved characters ----------
  // Signed-in users keep them in Firestore (users/{uid}/characters); otherwise they stay on this device.
  const charsRef = () => state.fb.db.collection("users").doc(state.user.uid).collection("characters");
  const MAX_CHARS = 30;

  async function loadCharacters() {
    let list = LS.get("chars", []);
    if (cloudOn()) {
      try {
        const snap = await charsRef().orderBy("created", "desc").limit(MAX_CHARS).get();
        list = snap.docs.map((d) => ({ ...d.data(), _id: d.id }));
      } catch (err) { console.error("Couldn't load characters", err); }
    }
    state.chars = list;
    renderChars();
  }

  function renderChars() {
    const list = state.chars || [];
    $("charSaved").innerHTML = list.length
      ? `<span class="char-label">${esc(t("chars.saved"))}</span>` + list.map((c, i) => `
        <span class="char-chip">
          <button class="char-use" data-char="${i}" title="${esc([c.look, c.outfit, c.place].filter(Boolean).join(" · "))}">👤 ${esc(c.name)}</button>
          <button class="char-del" data-chardel="${i}" aria-label="${esc(t("chars.delete", { name: c.name }))}">×</button>
        </span>`).join("")
      : "";
    $("charNote").textContent = state.authCfg && !cloudOn() ? t("chars.local") : list.length ? "" : t("chars.empty");
  }

  async function saveCharacter() {
    const ch = state.ch;
    if (!ch.who.trim()) { toast(t("chars.needWho")); $("chWho").focus(); return; }
    const name = ch.who.trim().split(/[,;]/)[0].slice(0, 40);
    const doc = { name, who: ch.who.trim(), look: ch.look.trim(), outfit: ch.outfit.trim(), place: ch.place.trim(), created: new Date().toISOString() };
    const same = (state.chars || []).filter((c) => c.name.toLowerCase() === name.toLowerCase());
    try {
      if (cloudOn()) {
        await Promise.all(same.filter((c) => c._id).map((c) => charsRef().doc(c._id).delete()));
        await charsRef().add(doc);
      } else {
        const local = LS.get("chars", []).filter((c) => c.name.toLowerCase() !== name.toLowerCase());
        local.unshift(doc);
        LS.set("chars", local.slice(0, MAX_CHARS));
      }
      toast(t("chars.savedToast", { name }) + " ✓");
    } catch (err) {
      console.error(err);
      toast(t("err.generic"));
    }
    loadCharacters();
  }

  function useCharacter(i) {
    const c = state.chars[i];
    if (!c) return;
    state.ch = { who: c.who || "", look: c.look || "", outfit: c.outfit || "", place: c.place || "" };
    renderControls(); renderSummary(); save();
    toast("👤 " + c.name);
  }

  async function deleteCharacter(i) {
    const c = state.chars[i];
    if (!c) return;
    try {
      if (cloudOn() && c._id) await charsRef().doc(c._id).delete();
      else LS.set("chars", LS.get("chars", []).filter((x) => x.name !== c.name));
      toast(t("chars.deleted"));
    } catch (err) {
      console.error(err);
      toast(t("err.generic"));
    }
    loadCharacters();
  }

  // ---------- accounts (Firebase) ----------
  const FB_VERSION = "10.12.2";
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    });
  }

  async function initAuth() {
    try {
      for (const lib of ["app", "auth", "firestore"]) await loadScript(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-${lib}-compat.js`);
      const app = window.firebase.initializeApp(state.authCfg);
      const auth = app.auth();
      auth.languageCode = state.lang;
      state.fb = { auth, db: app.firestore(), google: new window.firebase.auth.GoogleAuthProvider() };
      auth.onAuthStateChanged((u) => {
        state.user = u;
        renderMode();
        loadCharacters();
        if (u && u.emailVerified && $("authDlg").open && $("authVerify").hidden === false) $("authDlg").close();
      });
    } catch (err) {
      console.error("Accounts unavailable", err);
    }
    renderAccount();
  }

  function renderAccount() {
    const b = $("accountBtn");
    b.hidden = !state.authCfg;
    if (!state.authCfg) return;
    const u = state.user;
    b.innerHTML = u
      ? `<span class="avatar">${esc((u.email || "?")[0].toUpperCase())}</span>${esc(u.email || "")}`
      : esc(t("nav.signin"));
  }

  function authError(err) {
    const code = String(err && err.code || "").replace("auth/", "");
    const map = {
      "invalid-credential": "err.invalid", "wrong-password": "err.invalid", "user-not-found": "err.invalid", "invalid-login-credentials": "err.invalid",
      "email-already-in-use": "err.exists", "weak-password": "err.weak", "invalid-email": "err.email", "missing-email": "err.email",
      "too-many-requests": "err.many", "network-request-failed": "err.network",
      "popup-closed-by-user": "err.popup", "cancelled-popup-request": "err.popup", "unauthorized-domain": "err.domain",
      "requires-recent-login": "auth.recent"
    };
    if (!map[code]) console.error(err);
    return t(map[code] || "err.generic");
  }
  function authMsg(msg, isErr = false, id = "authMsg") {
    const el = $(id);
    el.textContent = msg || "";
    el.classList.toggle("err", isErr);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const signup = mode === "signup";
    $("authTitle").textContent = t(signup ? "auth.signupTitle" : "auth.signinTitle");
    $("authSubmit").textContent = t(signup ? "auth.signupBtn" : "auth.signinBtn");
    $("switchModeBtn").textContent = t(signup ? "auth.toSignin" : "auth.toSignup");
    $("authPass").autocomplete = signup ? "new-password" : "current-password";
    $("passHint").hidden = !signup;
    $("privacyNote").hidden = !signup;
    $("forgotBtn").hidden = signup;
    authMsg("");
  }

  function openAuth(view, forAI) {
    if (!state.fb) { if (state.authCfg) toast(t("err.generic")); return; }
    $("authNote").hidden = !forAI;
    const verify = view === "verify" && state.user;
    $("authForms").hidden = Boolean(verify);
    $("authVerify").hidden = !verify;
    if (verify) $("verifyText").textContent = t("auth.verifyText", { email: state.user.email });
    else setAuthMode(view === "signup" ? "signup" : "signin");
    authMsg("");
    if (!$("authDlg").open) $("authDlg").showModal();
  }

  async function submitAuth(e) {
    e.preventDefault();
    const email = $("authEmail").value.trim();
    const pass = $("authPass").value;
    const btn = $("authSubmit");
    btn.disabled = true;
    authMsg("");
    try {
      if (state.authMode === "signup") {
        const cred = await state.fb.auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.sendEmailVerification();
        state.user = cred.user;
        openAuth("verify", !$("authNote").hidden);
      } else {
        const cred = await state.fb.auth.signInWithEmailAndPassword(email, pass);
        state.user = cred.user;
        if (!cred.user.emailVerified) openAuth("verify", !$("authNote").hidden);
        else { $("authDlg").close(); toast("✓ " + cred.user.email); }
      }
      $("authPass").value = "";
      renderMode();
    } catch (err) {
      authMsg(authError(err), true);
    } finally {
      btn.disabled = false;
    }
  }

  async function googleSignIn() {
    authMsg("");
    try {
      const cred = await state.fb.auth.signInWithPopup(state.fb.google);
      state.user = cred.user;
      $("authDlg").close();
      renderMode();
      toast("✓ " + (cred.user.email || ""));
    } catch (err) {
      authMsg(authError(err), true);
    }
  }

  async function forgotPassword() {
    const email = $("authEmail").value.trim();
    if (!email) { authMsg(t("auth.needEmail"), true); $("authEmail").focus(); return; }
    try {
      await state.fb.auth.sendPasswordResetEmail(email);
      authMsg(t("auth.resetSent", { email }));
    } catch (err) {
      authMsg(authError(err), true);
    }
  }

  async function checkVerified() {
    try {
      await state.user.reload();
      state.user = state.fb.auth.currentUser;
      if (state.user.emailVerified) {
        await state.user.getIdToken(true); // refresh so the server sees the verified email
        $("authDlg").close();
        renderMode();
        toast("✓ " + state.user.email);
      } else {
        authMsg(t("auth.notYet"), true);
      }
    } catch (err) {
      authMsg(authError(err), true);
    }
  }

  async function resendVerification() {
    try {
      await state.user.sendEmailVerification();
      authMsg(t("auth.resent"));
    } catch (err) {
      authMsg(authError(err), true);
    }
  }

  async function signOut() {
    await state.fb.auth.signOut();
    state.user = null;
    if ($("accountDlg").open) $("accountDlg").close();
    if ($("authDlg").open) $("authDlg").close();
    renderMode();
  }

  function openAccount() {
    if (!state.user) { openAuth("signin", false); return; }
    if (!state.user.emailVerified) { openAuth("verify", false); return; }
    $("accountEmail").textContent = state.user.email || "";
    $("accountLimit").textContent = state.dailyLimit ? t("auth.limit", { n: state.dailyLimit }) : "";
    $("deleteAccountBtn").dataset.armed = "";
    authMsg("", false, "accountMsg");
    $("accountDlg").showModal();
  }

  async function deleteAccount() {
    const btn = $("deleteAccountBtn");
    // Firebase only lets an account be deleted shortly after signing in; check first so nothing is half-deleted.
    const lastSignIn = Date.parse(state.user.metadata && state.user.metadata.lastSignInTime) || 0;
    if (Date.now() - lastSignIn > 4 * 60 * 1000) { authMsg(t("auth.recent"), true, "accountMsg"); return; }
    if (!btn.dataset.armed) { btn.dataset.armed = "1"; authMsg(t("auth.deleteConfirm"), true, "accountMsg"); return; }
    btn.disabled = true;
    try {
      const snap = await storyboardsRef().limit(500).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
      const chars = await charsRef().limit(200).get();
      await Promise.all(chars.docs.map((d) => d.ref.delete()));
      await state.user.delete();
      state.user = null;
      LS.del("history");
      $("accountDlg").close();
      renderMode();
      toast(t("auth.deleted"));
    } catch (err) {
      authMsg(authError(err), true, "accountMsg");
    } finally {
      btn.disabled = false;
      btn.dataset.armed = "";
    }
  }

  // ---------- events ----------
  function bind() {
    $("lang").innerHTML = I.LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join("");
    $("lang").value = state.lang;
    $("lang").addEventListener("change", (e) => {
      state.lang = e.target.value;
      if (!state.dialogTouched) state.dialogLang = LANG_NAMES[state.lang];
      if (state.fb) state.fb.auth.languageCode = state.lang;
      save(); applyI18n(); renderControls(); setAuthMode(state.authMode);
      if (state.user && $("authDlg").open) $("verifyText").textContent = t("auth.verifyText", { email: state.user.email });
    });

    document.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) { goStep(+go.dataset.go); return; }
      const st = e.target.closest("#stepper [data-step]");
      if (st) { goStep(+st.dataset.step); return; }
    });

    $("idea").addEventListener("input", (e) => { state.idea = e.target.value; renderSummary(); renderCount(); save(); });
    $("examples").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ex]");
      if (!b) return;
      const ex = (I[state.lang].examples || I.en.examples)[+b.dataset.ex];
      useIdea(ex.text, ex.cat);
    });
    $("surpriseBtn").addEventListener("click", surprise);
    $("improveBtn").addEventListener("click", improve);

    $("types").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      state.category = b.dataset.cat; renderTypes(); renderSummary(); save();
    });
    $("moreTypes").addEventListener("click", () => { state.allTypes = !state.allTypes; renderTypes(); });
    $("styles").addEventListener("click", (e) => {
      const b = e.target.closest("[data-style]");
      if (!b) return;
      state.style = b.dataset.style; renderStyles(); renderSummary(); save();
    });
    [["chWho", "who"], ["chLook", "look"], ["chOutfit", "outfit"], ["chPlace", "place"]].forEach(([id, k]) =>
      $(id).addEventListener("input", (e) => { state.ch[k] = e.target.value; renderSummary(); save(); }));

    $("platforms").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pf]");
      if (!b) return;
      state.platform = b.dataset.pf; renderControls(); renderSummary(); save();
    });
    $("scenesSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      state.scenes = b.dataset.v; renderControls(); renderSummary(); save();
    });
    $("tools").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tool]");
      if (!b) return;
      state.tool = b.dataset.tool; renderTools(); renderControls(); renderSummary(); save();
    });
    $("lengthSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      state.length = b.dataset.v; renderControls(); renderSummary(); save();
    });
    ["camera", "pace", "audio"].forEach((id) => $(id).addEventListener("change", (e) => { state[id] = e.target.value; save(); }));
    $("dialogLang").addEventListener("change", (e) => { state.dialogLang = e.target.value; state.dialogTouched = true; save(); });
    ["story", "continuity", "negatives"].forEach((id) => $(id).addEventListener("change", (e) => { state[id] = e.target.checked; save(); }));

    $("generateBtn").addEventListener("click", generate);
    $("sumGenerate").addEventListener("click", generate);

    $("board").addEventListener("click", (e) => {
      // "Open in <tool>": copy the prompt, then let the link open the tool in a new tab.
      const open = e.target.closest("[data-open]");
      if (open && state.lastResult) {
        copyText(cardText(state.lastResult.scenes[+open.dataset.open]), t("res.copiedFor", { tool: toolName(toolById(state.lastResult.tool || "flow")) }));
        return;
      }
      const b = e.target.closest("[data-copy]");
      if (!b || !state.lastResult) return;
      copyText(cardText(state.lastResult.scenes[+b.dataset.copy]));
      b.classList.add("done"); b.textContent = t("toast.copied") + " ✓";
      setTimeout(() => { b.classList.remove("done"); b.textContent = t("res.copy"); }, 1600);
    });
    $("copyAllBtn").addEventListener("click", () => state.lastResult && copyText(asText(state.lastResult)));
    $("dlTxtBtn").addEventListener("click", () => state.lastResult && download("forge-kuzey-prompts.txt", asText(state.lastResult), "text/plain"));
    $("dlJsonBtn").addEventListener("click", () => state.lastResult && download("forge-kuzey-prompts.json", JSON.stringify(state.lastResult, null, 2), "application/json"));
    $("restartBtn").addEventListener("click", restart);

    $("historyBtn").addEventListener("click", () => { renderHistory(); $("historyDlg").showModal(); });
    $("closeHistoryBtn").addEventListener("click", () => $("historyDlg").close());
    $("clearHistoryBtn").addEventListener("click", clearHistory);
    $("historyList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-h]");
      if (!b) return;
      const r = state.histList[+b.dataset.h];
      if (r) { renderResults(r); $("historyDlg").close(); $("results").scrollIntoView({ behavior: "smooth" }); }
    });

    // saved characters
    $("saveCharBtn").addEventListener("click", saveCharacter);
    $("charSaved").addEventListener("click", (e) => {
      const del = e.target.closest("[data-chardel]");
      if (del) { deleteCharacter(+del.dataset.chardel); return; }
      const use = e.target.closest("[data-char]");
      if (use) useCharacter(+use.dataset.char);
    });

    // social media pack
    $("social").addEventListener("click", (e) => {
      if (e.target.closest("#socAiBtn")) { socialAI(); return; }
      const b = e.target.closest("[data-soc]");
      if (!b || !state.lastSocial) return;
      const soc = state.lastSocial;
      const key = b.dataset.soc;
      copyText(key === "all" ? socialText(soc) : key === "hashtags" ? soc.hashtags.join(" ") : soc[key]);
    });

    // accounts
    $("accountBtn").addEventListener("click", openAccount);
    $("authClose").addEventListener("click", () => $("authDlg").close());
    $("accountClose").addEventListener("click", () => $("accountDlg").close());
    $("authForm").addEventListener("submit", submitAuth);
    $("googleBtn").addEventListener("click", googleSignIn);
    $("forgotBtn").addEventListener("click", forgotPassword);
    $("switchModeBtn").addEventListener("click", () => setAuthMode(state.authMode === "signup" ? "signin" : "signup"));
    $("useTemplatesBtn").addEventListener("click", () => { $("authDlg").close(); generate({ template: true }); });
    $("verifiedBtn").addEventListener("click", checkVerified);
    $("resendBtn").addEventListener("click", resendVerification);
    $("verifySignout").addEventListener("click", signOut);
    $("signoutBtn").addEventListener("click", signOut);
    $("deleteAccountBtn").addEventListener("click", deleteAccount);

    const theme = LS.get("theme", null);
    if (theme) document.documentElement.dataset.theme = theme;
    $("themeBtn").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      LS.set("theme", next);
    });
  }

  // ---------- start ----------
  state.chars = LS.get("chars", []);
  bind();
  renderControls();
  applyI18n();
  goStep(1);

  // First visit: show an example storyboard so people see what they will get.
  if (!LS.get("history", []).length && !state.idea) {
    const ex = (I[state.lang].examples || I.en.examples)[0];
    const keep = state.idea;
    state.idea = ex.text;
    const s = settings();
    state.idea = keep;
    renderResults({ created: new Date().toISOString(), engine: "template", example: true, category: ex.cat, style: state.style,
      platform: state.platform, tool: state.tool, aspect: s.aspect, duration: s.duration, dna: "", idea: ex.text,
      scenes: templateScenes({ ...s, count: 3, category: catById(ex.cat) }) });
    setStatus(t("status.example"));
  }
  checkAI();
})();
