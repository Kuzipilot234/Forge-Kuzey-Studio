// Forge Kuzey Studio server: serves the site and forwards AI requests to Groq.
// The Groq key lives only in the GROQ_API_KEY environment variable, never in the browser.
// No dependencies; needs Node 18+ (built-in fetch).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const RATE_LIMIT = +(process.env.RATE_LIMIT || 30);          // requests per visitor…
const RATE_WINDOW_MS = 10 * 60 * 1000;                       // …per 10 minutes
const MAX_BODY = 20000;                                      // characters

const ROOT = __dirname;
const PUBLIC_FILES = { "/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/data.js": "data.js", "/app.js": "app.js" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

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

async function handleGenerate(req, res) {
  if (!GROQ_API_KEY) return send(res, 503, { error: "The server has no GROQ_API_KEY set" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: "Too many requests. Please wait a few minutes and try again" });

  let input;
  try { input = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, 400, { error: e.message === "Request is too long" ? e.message : "Invalid request" }); }
  const system = String(input.system || "").slice(0, 8000);
  const user = String(input.user || "").slice(0, 8000);
  if (!user) return send(res, 400, { error: "Empty request" });

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.9,
        max_tokens: 8000,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...(input.json ? { response_format: { type: "json_object" } } : {})
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Groq error", r.status, data?.error?.message);
      return send(res, 502, { error: r.status === 429 ? "The AI is busy right now. Try again in a minute" : "The AI service returned an error" });
    }
    send(res, 200, { text: data?.choices?.[0]?.message?.content || "" });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: "Couldn't reach the AI service" });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/health") return send(res, 200, { ai: Boolean(GROQ_API_KEY), model: GROQ_MODEL });
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
}).listen(PORT, () => console.log(`Forge Kuzey Studio running on port ${PORT} (AI ${GROQ_API_KEY ? "on" : "off"}, model ${GROQ_MODEL})`));
