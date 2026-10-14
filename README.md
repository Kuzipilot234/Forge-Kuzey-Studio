# 🎬 Forge Kuzey Studio — SceneForge Prompt Studio

Turn a scenario into consistent, cinematic, **scene-by-scene prompts for Gemini / Veo** (or any text-to-video model).

## Features

- **26 categories**: Everyday Life, Cute Animals, Living Fruit People, ASMR, Magic Restoration, Infinite Zoom, FOOH City Illusion, Music Video and more. Each one steers the prompt style.
- **One line = one scene**, or a **4-act story** structure.
- **Character DNA lock** keeps the face, outfit, colours and location identical in every scene.
- **Visual style lock**: live action, 3D animation, anime, claymation, cyberpunk, 80s film and more.
- **Scene count**: Auto (one per line) or a fixed 3 / 5 / 10 / 20.
- **Advanced controls**: aspect ratio (9:16 / 16:9 / 1:1), clip length, camera language, pacing, audio and dialogue language, continuity mode, negative prompts.
- **Scenario helpers**: 💡 Suggest, ✨ Polish & add locations, 🎲 Random idea.
- **Output**: copy one card or all of them, download `.txt` / `.json`, and reopen recent runs from history.
- **Two engines**:
  - 🤖 **AI mode**: [Groq](https://console.groq.com) writes the prompts, using one shared key kept on the server.
  - 🧩 **Template mode**: used automatically when the AI server isn't available.

## How the API key works

The Groq key is **never** in this repo or in the browser. It is stored in the `GROQ_API_KEY` environment variable on the server. `server.js` serves the site and forwards AI requests to Groq. Each visitor is limited to 30 AI requests per 10 minutes so nobody can use up the quota.

**To change the key:** Render dashboard → your service → **Environment** → edit `GROQ_API_KEY` → **Save changes**. Render restarts the site with the new key, and nothing in the code changes.

Optional environment variables:

| Variable | Default | Meaning |
|----------|---------|---------|
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Any Groq chat model |
| `RATE_LIMIT` | `30` | AI requests per visitor per 10 minutes |

## Deploy on Render

1. In the [Render dashboard](https://dashboard.render.com), click **New → Blueprint**, pick this repo, enter your `GROQ_API_KEY` when asked, then click **Apply**.
   You can also use **New → Web Service**: pick this repo, set runtime *Node*, build command `npm install`, start command `node server.js`, plan *Free*, and add the `GROQ_API_KEY` environment variable.
2. The site is served at `https://forge-kuzey-studio.onrender.com` (or a similar name) and redeploys on every push to `main`.

On Render's free plan the server sleeps after about 15 minutes without visitors. The next visit then takes up to a minute to load.

## Run locally

You need Node.js 18 or newer.

```bash
GROQ_API_KEY=your_key node server.js
```

Then open http://localhost:3000.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Small Node server: serves the site and forwards AI requests to Groq |
| `index.html` | Page layout |
| `style.css` | Styles (dark and light theme) |
| `data.js` | Categories, visual styles, camera moves, idea seeds. Edit this file to add your own. |
| `app.js` | Generator logic, AI calls, history |
| `render.yaml` | Render deployment settings |
