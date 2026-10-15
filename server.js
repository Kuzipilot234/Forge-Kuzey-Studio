// Forge Kuzey Studio server: serves the site and forwards AI requests.
// Google Gemini is tried first; if every Gemini model fails, Groq takes over (when its key is set).
// Keys live only in environment variables, never in the browser.
// No dependencies; needs Node 18+ (built-in fetch).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
// "gemini-flash-latest" always points at Google's newest Flash model. If one model is
// unknown, busy or out of quota, the next one in the list is tried.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]
  .filter((m, i, a) => m && a.indexOf(m) === i);
// Groq changes its model list often, so the server asks Groq which models the key can use
// and picks from this preference order.
const GROQ_PREFERRED = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
  .filter((m, i, a) => m && a.indexOf(m) === i);
const PROVIDERS = [GEMINI_API_KEY && "gemini", GROQ_API_KEY && "groq"].filter(Boolean);
const RATE_LIMIT = +(process.env.RATE_LIMIT || 30);          // requests per visitor…
const RATE_WINDOW_MS = 10 * 60 * 1000;                       // …per 10 minutes
const MAX_BODY = 20000;                                      // characters
const RETRY_STATUSES = [404, 429, 500, 502, 503];             // worth trying another model

// ---- accounts (optional) ----
// Paste the firebaseConfig block from the Firebase console into the FIREBASE_CONFIG variable.
// When it is set, only signed-in users with a verified email can use the AI, AI_DAILY_LIMIT times a day.
const FIREBASE = parseFirebaseConfig(process.env.FIREBASE_CONFIG);
const AI_DAILY_LIMIT = +(process.env.AI_DAILY_LIMIT || 30);

function parseFirebaseConfig(raw) {
  if (!raw) return null;
  const o = {};
  for (const m of String(raw).matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) o[m[1]] = m[2];
  if (!o.apiKey || !o.projectId) { console.error("FIREBASE_CONFIG is set but has no apiKey/projectId; accounts are off"); return null; }
  return { apiKey: o.apiKey, authDomain: o.authDomain || `${o.projectId}.firebaseapp.com`, projectId: o.projectId, appId: o.appId, messagingSenderId: o.messagingSenderId, storageBucket: o.storageBucket };
}

// Firebase ID tokens are JWTs signed by Google; verify them with Google's public certificates.
let certCache = { certs: null, until: 0 };
async function googleCerts() {
  if (certCache.certs && Date.now() < certCache.until) return certCache.certs;
  const r = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!r.ok) throw new Error("Couldn't load Google certificates");
  const certs = await r.json();
  const maxAge = +(/max-age=(\d+)/.exec(r.headers.get("cache-control") || "") || [0, 3600])[1];
  certCache = { certs, until: Date.now() + maxAge * 1000 };
  return certs;
}
async function verifyIdToken(token) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) throw new Error("Malformed token");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  if (header.alg !== "RS256") throw new Error("Unexpected algorithm");
  const cert = (await googleCerts())[header.kid];
  if (!cert) throw new Error("Unknown key");
  const key = new crypto.X509Certificate(cert).publicKey;
  if (!crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) throw new Error("Bad signature");
  const now = Date.now() / 1000;
  if (payload.aud !== FIREBASE.projectId || payload.iss !== `https://securetoken.google.com/${FIREBASE.projectId}`) throw new Error("Wrong project");
  if (!(payload.exp > now) || !(payload.iat <= now + 300) || !payload.sub) throw new Error("Expired token");
  return payload;
}

const usage = new Map(); // uid -> { day, count }; resets when the server restarts
function useDailyQuota(uid) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(uid);
  const entry = u && u.day === day ? u : { day, count: 0 };
  if (entry.count >= AI_DAILY_LIMIT) return false;
  entry.count++;
  usage.set(uid, entry);
  if (usage.size > 50000) usage.clear();
  return true;
}

const ROOT = __dirname;
const PUBLIC_FILES = { "/": "index.html", "/index.html": "index.html", "/privacy": "privacy.html", "/privacy.html": "privacy.html",
  "/style.css": "style.css", "/data.js": "data.js", "/i18n.js": "i18n.js", "/app.js": "app.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

let geminiModel = GEMINI_MODELS[0];  // remembers the last Gemini model that worked
let groqModels = null;               // filled from Groq's model list on first use
let lastUsed = "";                   // "provider:model" of the last successful answer

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
const hideKeys = (s) => [GEMINI_API_KEY, GROQ_API_KEY].filter(Boolean).reduce((out, k) => out.replaceAll(k, "***"), String(s || ""));

// ---- Gemini ----
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
      const text = (data?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
      if (text) { geminiModel = model; lastUsed = "gemini:" + model; return text; }
      lastError = new AIError(502, `[gemini ${model}] empty answer`);
      continue;
    }
    console.error(`Gemini ${model}:`, r.status, data?.error?.message);
    lastError = new AIError(r.status, `[gemini ${model}] ${data?.error?.message || ""}`);
    if (!RETRY_STATUSES.includes(r.status)) break;
  }
  throw lastError;
}

// ---- Groq ----
async function groqModelList() {
  if (groqModels) return groqModels;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${GROQ_API_KEY}` } });
    const data = await r.json();
    const ids = (data?.data || []).filter((m) => m.active !== false).map((m) => m.id);
    const chat = ids.filter((id) => !/whisper|guard|tts|orpheus|playai|vision|embed/i.test(id));
    const list = [...GROQ_PREFERRED.filter((id) => ids.includes(id)), ...chat.filter((id) => !GROQ_PREFERRED.includes(id))];
    if (list.length) groqModels = list;
  } catch (err) {
    console.error("Couldn't read Groq's model list:", err.message);
  }
  return groqModels || GROQ_PREFERRED;
}

async function callGroq(system, user, json) {
  const models = (await groqModelList()).slice(0, 4);
  let lastError;
  for (const model of models) {
    for (const useJsonMode of json ? [true, false] : [false]) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model, temperature: 0.9, max_tokens: 8000,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          ...(useJsonMode ? { response_format: { type: "json_object" } } : {})
        })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = data?.choices?.[0]?.message?.content || "";
        if (text) { lastUsed = "groq:" + model; return text; }
        lastError = new AIError(502, `[groq ${model}] empty answer`);
        break;
      }
      console.error(`Groq ${model}:`, r.status, data?.error?.message);
      lastError = new AIError(r.status, `[groq ${model}] ${data?.error?.message || ""}`);
      // A 400 in JSON mode may just mean the model doesn't support it: retry once without.
      if (!(r.status === 400 && useJsonMode)) break;
    }
    if (lastError && !RETRY_STATUSES.includes(lastError.status) && lastError.status !== 400) break;
  }
  throw lastError;
}

async function askAI(system, user, json) {
  let lastError;
  for (const provider of PROVIDERS) {
    try {
      return provider === "gemini" ? await callGemini(system, user, json) : await callGroq(system, user, json);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function handleGenerate(req, res) {
  if (!PROVIDERS.length) return send(res, 503, { error: "The server has no AI key set" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: "Too many requests. Please wait a few minutes and try again" });

  if (FIREBASE) {
    const token = (/^Bearer (.+)$/.exec(req.headers.authorization || "") || [])[1];
    if (!token) return send(res, 401, { error: "Sign in to use the AI", code: "auth" });
    let user;
    try { user = await verifyIdToken(token); }
    catch (err) { return send(res, 401, { error: "Your sign-in has expired. Please sign in again", code: "auth" }); }
    if (!user.email_verified) return send(res, 403, { error: "Verify your email first", code: "verify" });
    if (!useDailyQuota(user.sub)) return send(res, 429, { error: "Daily AI limit reached", code: "daily" });
  }

  let input;
  try { input = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, 400, { error: e.message === "Request is too long" ? e.message : "Invalid request" }); }
  const system = String(input.system || "").slice(0, 8000);
  const user = String(input.user || "").slice(0, 8000);
  if (!user) return send(res, 400, { error: "Empty request" });

  try {
    send(res, 200, { text: await askAI(system, user, input.json) });
  } catch (err) {
    if (!(err instanceof AIError)) console.error(err);
    const status = err instanceof AIError ? err.status : 0;
    // "detail" carries the provider's own reason (never a key) so problems can be diagnosed.
    const detail = `${status || "network"} ${hideKeys(err.message)}`.slice(0, 300);
    send(res, 502, { error: status === 429 ? "The AI is busy right now. Try again in a minute" : status ? "The AI service returned an error" : "Couldn't reach the AI service", detail });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/health") {
    // The Firebase web config is public by design (it identifies the project, it is not a secret).
    return send(res, 200, { ai: PROVIDERS.length > 0, providers: PROVIDERS, model: lastUsed || (PROVIDERS[0] === "gemini" ? "gemini:" + geminiModel : PROVIDERS[0] || ""),
      auth: FIREBASE, dailyLimit: FIREBASE ? AI_DAILY_LIMIT : null });
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
}).listen(PORT, () => console.log(`Forge Kuzey Studio running on port ${PORT} (AI: ${PROVIDERS.join(" → ") || "off"}; accounts: ${FIREBASE ? "on, project " + FIREBASE.projectId : "off"})`));
