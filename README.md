# 🎬 Forge Kuzey Studio

Turn a scenario into consistent, cinematic, **scene-by-scene prompts for Gemini / Veo** (or any text-to-video model).

## Features

- **26 categories**: Everyday Life, Cute Animals, Living Fruit People, ASMR, Magic Restoration, Infinite Zoom, FOOH City Illusion, Music Video and more. Each one steers the prompt style.
- **Guided 3 steps** (idea, look, format) with a live summary, in **English, Türkçe, Español and Deutsch**.
- Write the idea in plain sentences, in any language, or tell it as a **4-act story**.
- **Character DNA lock** keeps the face, outfit, colours and location identical in every scene.
- **Visual style lock**: live action, 3D animation, anime, claymation, cyberpunk, 80s film and more.
- **Scene count**: Auto (one per line) or a fixed 3 / 5 / 10 / 20.
- **Advanced controls**: aspect ratio (9:16 / 16:9 / 1:1), clip length, camera language, pacing, audio and dialogue language, continuity mode, negative prompts.
- **Scenario helpers**: 💡 Suggest, ✨ Polish & add locations, 🎲 Random idea.
- **Output**: copy one card or all of them, download `.txt` / `.json`, and reopen recent runs from history.
- **Two engines**:
  - 🤖 **AI mode**: [Google Gemini](https://aistudio.google.com/apikey) writes the prompts, using one shared key kept on the server.
  - 🧩 **Template mode**: used automatically when the AI server isn't available.

## How the API key works

The API key is **never** in this repo or in the browser. It is stored in the `GEMINI_API_KEY` environment variable on the server. `server.js` serves the site and forwards AI requests to Gemini, and to Groq as a backup if `GROQ_API_KEY` is also set. Each visitor is limited to 30 AI requests per 10 minutes so nobody can use up the quota.

**To change the key:** Render dashboard → your service → **Environment** → edit `GEMINI_API_KEY` → **Save changes**. Render restarts the site with the new key, and nothing in the code changes.

Optional environment variables:

| Variable | Default | Meaning |
|----------|---------|---------|
| `GEMINI_MODEL` | `gemini-flash-latest` | Any Gemini model name. If Google rejects it, a few known model names are tried in turn. |
| `GROQ_API_KEY` | (none) | Backup AI. Used when every Gemini model is busy or failing, or on its own if there is no Gemini key. The server picks a model your Groq key can use. |
| `GROQ_MODEL` | (auto) | Force a specific Groq model |
| `RATE_LIMIT` | `30` | AI requests per visitor per 10 minutes |

## Accounts (optional)

When `FIREBASE_CONFIG` is set, visitors can sign up (email + password with a verification link, or Google) and their storyboards are saved to their account. The AI then only works for signed-in users with a verified email, up to `AI_DAILY_LIMIT` requests per person per day (default 30). Without it, the site works as before.

1. Create a project at [Firebase console](https://console.firebase.google.com) and add a **Web app**. Copy its `firebaseConfig` block.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. **Authentication → Settings → Authorized domains:** add your site address (e.g. `forge-kuzey-studio.onrender.com`).
4. **Firestore Database → Create database**, then paste `firestore.rules` into **Rules** and publish.
5. On Render, add `FIREBASE_CONFIG` and paste the whole `firebaseConfig` block as the value.

| Variable | Default | Meaning |
|----------|---------|---------|
| `FIREBASE_CONFIG` | (none) | The Firebase web config. Turns accounts on. |
| `AI_DAILY_LIMIT` | `30` | AI requests per signed-in user per day |

## Deploy on Render

1. In the [Render dashboard](https://dashboard.render.com), click **New → Blueprint**, pick this repo, enter your `GEMINI_API_KEY` when asked, then click **Apply**.
   You can also use **New → Web Service**: pick this repo, set runtime *Node*, build command `npm install`, start command `node server.js`, plan *Free*, and add the `GEMINI_API_KEY` environment variable.
2. The site is served at `https://forge-kuzey-studio.onrender.com` (or a similar name) and redeploys on every push to `main`.

On Render's free plan the server sleeps after about 15 minutes without visitors. The next visit then takes up to a minute to load.

## Run locally

You need Node.js 18 or newer.

```bash
GEMINI_API_KEY=your_key node server.js
```

Then open http://localhost:3000.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Small Node server: serves the site and forwards AI requests to Gemini |
| `index.html` | Page layout |
| `style.css` | Styles (dark and light theme) |
| `data.js` | Categories, visual styles, camera moves, idea seeds. Edit this file to add your own. |
| `app.js` | Wizard, generator logic, AI calls, history |
| `i18n.js` | All interface text in English, Turkish, Spanish and German. Copy a block to add a language. |
| `render.yaml` | Render deployment settings |
| `privacy.html` | Privacy policy (English and Turkish) |
| `firestore.rules` | Security rules for saved storyboards (paste into Firebase) |
