// Forge Kuzey Studio server: serves the site and forwards AI requests to Google Gemini
// (or Groq, if only a Groq key is set). Keys live only in environment variables, never in the browser.
// No dependencies; needs Node 18+ (built-in fetch).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
// "gemini-flash-latest" always points at Google's newest Flash model. If Google rejects a name,
// the next one in the list is tried.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]
  .filter((m, i, a) => m && a.indexOf(m) === i);
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const PROVIDER = GEMINI_API_KEY ? "gemini" : GROQ_API_KEY ? "groq" : "";
const RATE_LIMIT = +(process.env.RATE_LIMIT || 30);          // requests per visitor…
const RATE_WINDOW_MS = 10 * 60 * 1000;                       // …per 10 minutes
const MAX_BODY = 20000;                                      // characters

const ROOT = __dirname;
const PUBLIC_FILES = { "/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/data.js": "data.js", "/i18n.js": "i18n.js", "/app.js": "app.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

let geminiModel = GEMINI_MODELS[0]; // remembers the first model name that worked

// ---- simple in-memory rate limiter ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) { reject(new Error("Request is too long")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

class AIError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function callGemini(system, user, json) {
  const order = [geminiModel, ...GEMINI_MODELS.filter((m) => m !== geminiModel)];
  let lastError;
  for (const model of order) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192, ...(json ? { responseMimeType: "application/json" } : {}) }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      geminiModel = model;
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
    }
    console.error(`Gemini error with ${model}:`, r.status, data?.error?.message);
    lastError = new AIError(r.status, `[${model}] ${data?.error?.message || ""}`);
    // Only an unknown model name is worth retrying with another name.
    if (r.status !== 404) break;
  }
  throw lastError;
}

async function callGroq(system, user, json) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL, temperature: 0.9, max_tokens: 8000,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(json ? { response_format: { type: "json_object" } } : {})
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Groq error", r.status, data?.error?.message);
    throw new AIError(r.status, data?.error?.message);
  }
  return data?.choices?.[0]?.message?.content || "";
}

async function handleGenerate(req, res) {
  if (!PROVIDER) return send(res, 503, { error: "The server has no AI key set" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: "Too many requests. Please wait a few minutes and try again" });

  let input;
  try { input = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, 400, { error: e.message === "Request is too long" ? e.message : "Invalid request" }); }
  const system = String(input.system || "").slice(0, 8000);
  const user = String(input.user || "").slice(0, 8000);
  if (!user) return send(res, 400, { error: "Empty request" });

  try {
    const text = PROVIDER === "gemini" ? await callGemini(system, user, input.json) : await callGroq(system, user, input.json);
    send(res, 200, { text });
  } catch (err) {
    if (!(err instanceof AIError)) console.error(err);
    const status = err instanceof AIError ? err.status : 0;
    // "detail" carries the provider's own reason (never the key) so problems can be diagnosed.
    const detail = `${status || "network"} ${String(err.message || "").replaceAll(GEMINI_API_KEY || "\u0000", "***").replaceAll(GROQ_API_KEY || "\u0000", "***")}`.slice(0, 300);
    send(res, 502, { error: status === 429 ? "The AI is busy right now. Try again in a minute" : status ? "The AI service returned an error" : "Couldn't reach the AI service", detail });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/health") {
    return send(res, 200, { ai: Boolean(PROVIDER), provider: PROVIDER, model: PROVIDER === "gemini" ? geminiModel : PROVIDER === "groq" ? GROQ_MODEL : "" });
  }
  if (url.pathname === "/api/generate") {
    if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
    return handleGenerate(req, res);
  }
  const file = PUBLIC_FILES[url.pathname];
  if (!file || req.method !== "GET") return send(res, 404, "Not found", "text/plain; charset=utf-8");
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 500, "Server error", "text/plain; charset=utf-8");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)], "Cache-Control": "no-cache" });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Forge Kuzey Studio running on port ${PORT} (AI: ${PROVIDER || "off"}${PROVIDER === "gemini" ? ", model " + geminiModel : ""})`));
