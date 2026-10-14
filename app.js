// Forge Kuzey Studio — scenario to scene-by-scene video prompts.
(() => {
  "use strict";
  const D = window.SF_DATA;
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("sf_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("sf_" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("sf_" + k); } catch { /* storage unavailable */ } }
  };

  const state = {
    category: LS.get("category", "daily"),
    structure: "lines",
    lastResult: null,
    ai: false,
    model: ""
  };

  const FIELDS = ["scenario", "dna", "sceneMode", "style", "aspect", "duration", "camera", "pace", "audio", "dialogLang", "target"];
  const NEGATIVE = "no on-screen text, no subtitles, no watermark, no logo, no distorted faces, no extra fingers or limbs, no flicker, no sudden identity change";
  const STORY_ACTS = ["Setup", "Rising conflict", "Climax", "Resolution"];

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lines = () => $("scenario").value.split("\n").map((l) => l.trim()).filter(Boolean);
  const cat = () => D.categories.find((c) => c.id === state.category) || D.categories[0];
  const style = () => D.styles.find((s) => s.id === $("style").value) || D.styles[0];

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function setStatus(msg, isErr = false, busy = false) {
    const s = $("status");
    s.className = "status" + (isErr ? " err" : "");
    s.innerHTML = (busy ? '<span class="spinner"></span>' : "") + esc(msg);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied ✓"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); toast("Copied ✓");
    }
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- UI setup ----------
  function renderCategories(filter = "") {
    const f = filter.toLowerCase();
    $("categories").innerHTML = D.categories
      .filter((c) => !f || c.name.toLowerCase().includes(f))
      .map((c) => `<button class="cat${c.id === state.category ? " on" : ""}" data-id="${c.id}" role="option" aria-selected="${c.id === state.category}">
          <span class="ico">${c.icon}</span><span>${esc(c.name)}</span></button>`).join("");
    $("catBadge").textContent = cat().icon + " " + cat().name;
  }

  function init() {
    $("style").innerHTML = D.styles.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");

    // restore saved form values
    const saved = LS.get("form", {});
    FIELDS.forEach((f) => { if (saved[f] !== undefined) $(f).value = saved[f]; });
    $("continuity").checked = saved.continuity ?? true;
    $("negatives").checked = saved.negatives ?? true;
    if (saved.structure) setStructure(saved.structure);

    const theme = LS.get("theme", null);
    if (theme) document.documentElement.dataset.theme = theme;

    renderCategories();
    updateLineCount();

    $("categories").addEventListener("click", (e) => {
      const b = e.target.closest(".cat");
      if (!b) return;
      state.category = b.dataset.id;
      LS.set("category", state.category);
      renderCategories($("catSearch").value);
    });
    $("catSearch").addEventListener("input", (e) => renderCategories(e.target.value));
    $("structureSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { setStructure(b.dataset.v); saveForm(); }
    });
    $("scenario").addEventListener("input", updateLineCount);
    document.querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("change", saveForm));

    $("generateBtn").addEventListener("click", generate);
    $("suggestBtn").addEventListener("click", () => helper("suggest"));
    $("polishBtn").addEventListener("click", () => helper("polish"));
    $("randomBtn").addEventListener("click", () => helper("random"));
    $("clearScenarioBtn").addEventListener("click", () => { $("scenario").value = ""; updateLineCount(); saveForm(); });

    $("copyAllBtn").addEventListener("click", () => state.lastResult && copy(asText(state.lastResult)));
    $("dlTxtBtn").addEventListener("click", () => state.lastResult && download("forge-kuzey-prompts.txt", asText(state.lastResult), "text/plain"));
    $("dlJsonBtn").addEventListener("click", () => state.lastResult && download("forge-kuzey-prompts.json", JSON.stringify(state.lastResult, null, 2), "application/json"));
    $("results").addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy]");
      if (b && state.lastResult) copy(cardText(state.lastResult.scenes[+b.dataset.copy]));
    });

    $("themeBtn").addEventListener("click", () => {
      const effective = document.documentElement.dataset.theme ||
        (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      const cur = effective === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = cur;
      LS.set("theme", cur);
    });

    // history
    $("historyBtn").addEventListener("click", () => { renderHistory(); $("historyDlg").showModal(); });
    $("closeHistoryBtn").addEventListener("click", () => $("historyDlg").close());
    $("clearHistoryBtn").addEventListener("click", () => { LS.del("history"); renderHistory(); });
    $("historyList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-h]");
      if (!b) return;
      const item = LS.get("history", [])[+b.dataset.h];
      if (item) { showResults(item); $("historyDlg").close(); }
    });

    updateModeHint();

    // First visit: load an example so the page shows what it does.
    if (!LS.get("form", null) && !LS.get("history", []).length) {
      $("scenario").value = EXAMPLE.scenario;
      $("dna").value = EXAMPLE.dna;
      updateLineCount();
      showResults({ created: new Date().toISOString(), engine: "template", example: true, ...exampleResult() }, false);
      setStatus("👀 This is an example. Edit the scenario and press Generate to make your own.");
    }
    checkAI();
  }

  const EXAMPLE = {
    scenario: "A barista opens a tiny café at dawn, flipping the sign to OPEN\nThe first customer, an old man, orders the same coffee he has had for 40 years\nRain starts and strangers crowd inside, sharing tables and stories\nAt closing time the barista finds a handwritten thank-you note on the counter",
    dna: "Mia, 28, short copper hair, freckles, green eyes, mustard knit sweater, brown apron, silver hoop earrings. Location: small corner café with teal tiles and warm Edison bulbs."
  };
  function exampleResult() {
    const s = settings();
    return { category: s.category.name, style: s.style.name, aspect: s.aspect, duration: s.duration,
      dna: s.dna, scenario: s.lines.join("\n"), scenes: templateScenes(s) };
  }

  function setStructure(v) {
    state.structure = v;
    document.querySelectorAll("#structureSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  }
  function updateLineCount() {
    const n = lines().length;
    $("lineCount").textContent = n + (n === 1 ? " line" : " lines");
  }
  function saveForm() {
    const o = {};
    FIELDS.forEach((f) => { o[f] = $(f).value; });
    o.continuity = $("continuity").checked;
    o.negatives = $("negatives").checked;
    o.structure = state.structure;
    LS.set("form", o);
  }
  function updateModeHint() {
    setStatus(state.ai ? "🤖 AI mode is on." : "🧩 Template mode: the AI server isn't available, so prompts come from built-in templates.");
  }

  // ---------- settings snapshot ----------
  function settings() {
    const ls = lines();
    let count;
    if ($("sceneMode").value === "auto") count = state.structure === "story" ? Math.max(4, ls.length) : ls.length;
    else count = +$("sceneMode").value;
    return {
      category: cat(), style: style(), lines: ls, count,
      structure: state.structure,
      dna: $("dna").value.trim().replace(/[.\s]+$/, ""),
      aspect: $("aspect").value, duration: $("duration").value, camera: $("camera").value,
      pace: $("pace").value, audio: $("audio").value, dialogLang: $("dialogLang").value,
      target: $("target").value, continuity: $("continuity").checked, negatives: $("negatives").checked
    };
  }

  // ---------- generation ----------
  async function generate() {
    const s = settings();
    if (!s.lines.length) { setStatus("Write at least one line of scenario first (or use 💡 Suggest).", true); $("scenario").focus(); return; }
    if (s.count > 30) { setStatus("That's a lot of scenes — please keep it to 30 or fewer per run.", true); return; }

    const btn = $("generateBtn");
    btn.disabled = true;
    try {
      let scenes;
      if (state.ai) {
        setStatus(`AI is writing ${s.count} scene${s.count > 1 ? "s" : ""}…`, false, true);
        scenes = await aiScenes(s);
      } else {
        scenes = templateScenes(s);
      }
      const result = {
        created: new Date().toISOString(),
        engine: state.ai ? "AI · " + state.model : "template",
        category: s.category.name, style: s.style.name, aspect: s.aspect, duration: s.duration,
        dna: s.dna, scenario: s.lines.join("\n"), scenes
      };
      showResults(result);
      saveHistory(result);
      setStatus(`✅ ${scenes.length} prompt card${scenes.length > 1 ? "s" : ""} ready.`);
    } catch (err) {
      console.error(err);
      setStatus("⚠️ " + err.message + " — falling back to template mode.", true);
      const scenes = templateScenes(s);
      showResults({ created: new Date().toISOString(), engine: "template", category: s.category.name, style: s.style.name,
        aspect: s.aspect, duration: s.duration, dna: s.dna, scenario: s.lines.join("\n"), scenes });
    } finally {
      btn.disabled = false;
    }
  }

  // Assign scenario lines to scene slots (expanding or compressing as needed).
  function beatsFor(s) {
    const out = [];
    for (let i = 0; i < s.count; i++) {
      const idx = Math.min(s.lines.length - 1, Math.floor((i * s.lines.length) / s.count));
      const firstOfLine = i === 0 || Math.floor(((i - 1) * s.lines.length) / s.count) !== idx;
      const act = s.structure === "story" ? STORY_ACTS[Math.min(3, Math.floor((i * 4) / s.count))] : null;
      out.push({ line: s.lines[idx], continued: !firstOfLine, act });
    }
    return out;
  }

  function audioText(s, i) {
    switch (s.audio) {
      case "silent": return "No audio.";
      case "music": return "Audio: cinematic music bed matching the mood, no dialogue.";
      case "sfx": return "Audio: natural ambient sound and precise sound effects synced to the action, no dialogue.";
      default: return `Audio: natural ambience and synced sound effects; if a character speaks, short natural dialogue in ${s.dialogLang}${i === 0 ? " (write the exact line in quotes)" : ""}.`;
    }
  }

  function templateScenes(s) {
    const cams = D.cameraMoves[s.camera] || D.cameraMoves.auto;
    const paceTxt = { calm: "slow, contemplative pacing", balanced: "natural, steady pacing", viral: "fast, punchy pacing with a strong hook in the first second" }[s.pace];
    return beatsFor(s).map((b, i) => {
      const camera = s.pace === "viral" && i === 0 ? "fast push-in hook shot" : pick(cams, i * 3 + (s.camera === "auto" ? Math.floor(i / 2) : 0));
      const light = pick(D.lighting, i + s.category.name.length);
      const title = (b.act ? b.act + ": " : "") + b.line.replace(/[.!?]+$/, "").slice(0, 70);
      const parts = [];
      parts.push(`${s.style.text}. ${s.category.brief}`);
      if (s.dna) parts.push(`Consistent character & setting (identical in every scene): ${s.dna}.`);
      parts.push(`Scene ${i + 1} of ${s.count}${b.act ? ` (${b.act})` : ""}: ${b.line}${b.continued ? " — continue this moment from a new angle, showing the next beat of the action" : ""}.`);
      if (s.continuity && i > 0) parts.push("Continuity: begins exactly where the previous scene ended — same outfit, props, time of day and location details.");
      parts.push(`Camera: ${camera}. Lighting: ${light}. ${paceTxt[0].toUpperCase() + paceTxt.slice(1)}.`);
      parts.push(audioText(s, i));
      parts.push(`Format: ${s.aspect}, ${s.duration} seconds, single continuous shot, cinematic quality.`);
      return {
        title, prompt: parts.join("\n"), camera, lighting: light,
        negative: s.negatives ? NEGATIVE : ""
      };
    });
  }

  function systemPrompt(s) {
    return `You are an expert AI video director who writes prompts for ${s.target === "veo" ? "Google Gemini / Veo" : "text-to-video models"}.
Write a sequence of shot prompts from the user's scenario.

Rules:
- Produce EXACTLY ${s.count} scenes. ${s.structure === "story" ? "Structure them as a 4-act story (Setup, Rising conflict, Climax, Resolution) and prefix each title with the act." : "Each scenario line maps to scenes in order; if there are more scenes than lines, expand lines into consecutive beats; if fewer, merge lines."}
- Category: "${s.category.name}" — ${s.category.brief}
- Visual style (locked, repeat in every prompt): ${s.style.text}
${s.dna ? `- Character DNA (copy these identity details word-for-word into EVERY prompt so the character and setting never drift): ${s.dna}` : "- Invent one clear main character / subject and describe them identically in every prompt."}
- ${s.continuity ? "Continuity: each scene begins exactly where the previous one ended." : "Scenes may jump in time or location."}
- Each prompt is one self-contained paragraph of 70-130 words covering: subject & appearance, action, setting, camera movement & framing, lighting, mood, and audio.
- Camera preference: ${s.camera}. Pacing: ${s.pace}.
- Audio: ${{ full: `ambient + SFX + short natural dialogue in ${s.dialogLang} (put spoken lines in double quotes)`, sfx: "ambient + SFX, no dialogue", music: "music only, no dialogue", silent: "no audio" }[s.audio]}.
- End every prompt with: "Format: ${s.aspect}, ${s.duration} seconds."
- Never include on-screen text or subtitles. Keep content safe for all audiences.
- Write prompts in English (only dialogue in ${s.dialogLang}).

Respond with JSON only, shape:
{"scenes":[{"title":"short scene title","prompt":"full prompt","camera":"camera move","lighting":"lighting","negative":"${s.negatives ? "negative prompt" : ""}"}]}`;
  }

  // The site's own server holds the Groq key and forwards the request.
  async function callAI(system, user, json) {
    const res = await fetch("api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, json })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    if (!data.text) throw new Error("The AI returned an empty answer");
    return data.text;
  }

  async function checkAI() {
    try {
      const res = await fetch("api/health", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      state.ai = Boolean(data.ai);
      state.model = data.model || "";
    } catch { state.ai = false; }
    if (!state.lastResult || state.lastResult.example) updateModeHint();
  }

  async function aiScenes(s) {
    const user = `Scenario lines:\n${s.lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
    const raw = await callAI(systemPrompt(s), user, true);
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new Error("Couldn't read the AI's answer"); }
    const list = Array.isArray(parsed) ? parsed : parsed.scenes;
    const scenes = (Array.isArray(list) ? list : []).filter((x) => x && x.prompt);
    if (!scenes.length) throw new Error("The AI returned no scenes");
    return scenes.map((x) => ({
      title: String(x.title || "Scene"), prompt: String(x.prompt),
      camera: String(x.camera || ""), lighting: String(x.lighting || ""),
      negative: s.negatives ? String(x.negative || NEGATIVE) : ""
    }));
  }

  // ---------- scenario helpers ----------
  async function helper(kind) {
    const s = settings();
    const btn = $(kind + "Btn");

    if (kind === "polish" && !s.lines.length) { setStatus("Nothing to polish yet — write a few lines first.", true); return; }

    if (!state.ai) {
      if (kind === "polish") {
        const places = ["in a sunlit kitchen", "on a quiet city street at dusk", "in a cozy living room", "on a windy hilltop", "in a busy market", "by a calm lakeshore"];
        $("scenario").value = s.lines.map((l, i) => /\b(in|at|on|by|inside|under)\b/i.test(l) ? cap(l) : `${cap(l.replace(/[.]+$/, ""))} ${pick(places, i)}`).join("\n");
      } else {
        const ideas = kind === "random" ? rand(D.categories).ideas : s.category.ideas;
        const idea = rand(ideas);
        $("scenario").value = expandIdea(idea);
      }
      updateLineCount(); saveForm();
      toast(kind === "polish" ? "Polished (template)" : "Idea added");
      return;
    }

    btn.disabled = true;
    setStatus("AI is thinking…", false, true);
    try {
      const randomCat = rand(D.categories);
      const prompts = {
        suggest: `Write a short video scenario for the category "${s.category.name}" (${s.category.brief}). Give 4-6 lines, one scene per line, each line one vivid sentence with a concrete action and location. Plain text only, no numbering, no title.`,
        random: `Invent a surprising, viral-worthy short video scenario in the category "${randomCat.name}" (${randomCat.brief}). Give 4-6 lines, one scene per line, each one vivid sentence. Plain text only, no numbering, no title.`,
        polish: `Improve these scenario lines for AI video generation. Keep the same number of lines and order. Make each line one vivid sentence with a clear action, a specific location and a visual detail. Fix grammar. Plain text only, no numbering.\n\n${s.lines.join("\n")}`
      };
      const text = await callAI("You help writers create short-form video scenarios. Output only the requested lines.", prompts[kind], false);
      $("scenario").value = text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).join("\n");
      updateLineCount(); saveForm();
      updateModeHint();
    } catch (err) {
      setStatus("⚠️ " + err.message, true);
    } finally {
      btn.disabled = false;
    }
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function expandIdea(idea) {
    return [
      `Establishing shot: ${idea.charAt(0).toLowerCase() + idea.slice(1)}`,
      "A close-up reveals the main character's emotion and a key detail",
      "Something unexpected happens and changes the moment",
      "The character reacts and makes a choice",
      "A warm, memorable final image that could loop back to the start"
    ].join("\n");
  }

  // ---------- results ----------
  function cardText(sc) {
    return sc.prompt + (sc.negative ? `\n\nNegative prompt: ${sc.negative}` : "");
  }
  function asText(r) {
    return `Forge Kuzey Studio — ${r.category} · ${r.style} · ${r.aspect} · ${r.duration}s\n${"=".repeat(60)}\n\n` +
      r.scenes.map((sc, i) => `SCENE ${i + 1}: ${sc.title}\n\n${cardText(sc)}`).join(`\n\n${"-".repeat(60)}\n\n`);
  }
  function showResults(r, scroll = true) {
    state.lastResult = r;
    $("resultsPanel").hidden = false;
    $("resultMeta").textContent = `· ${r.scenes.length} scenes · ${r.example ? "example" : r.engine === "template" ? "template engine" : r.engine}`;
    $("results").innerHTML = r.scenes.map((sc, i) => `
      <article class="card">
        <div class="card-head">
          <h3><span class="num">#${i + 1}</span>${esc(sc.title)}</h3>
          <button class="chip" data-copy="${i}">📋 Copy</button>
        </div>
        <div class="card-body">
          <pre>${esc(sc.prompt)}</pre>
          ${sc.negative ? `<div class="neg"><b>Negative:</b> ${esc(sc.negative)}</div>` : ""}
          <div class="meta">
            ${sc.camera ? `<span class="pill">🎥 ${esc(sc.camera)}</span>` : ""}
            ${sc.lighting ? `<span class="pill">💡 ${esc(sc.lighting)}</span>` : ""}
            <span class="pill">📐 ${esc(r.aspect)}</span><span class="pill">⏱️ ${esc(r.duration)}s</span>
          </div>
        </div>
      </article>`).join("");
    if (scroll) $("resultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveHistory(r) {
    const h = LS.get("history", []);
    h.unshift(r);
    LS.set("history", h.slice(0, 15));
  }
  function renderHistory() {
    const h = LS.get("history", []);
    $("historyList").innerHTML = h.length
      ? h.map((r, i) => `<button class="hist-item" data-h="${i}"><b>${esc(r.category)}</b> · ${r.scenes.length} scenes
          <small>${esc(new Date(r.created).toLocaleString())} — ${esc((r.scenario || "").split("\n")[0].slice(0, 80))}</small></button>`).join("")
      : '<p class="muted">No generations yet.</p>';
  }

  init();
})();
