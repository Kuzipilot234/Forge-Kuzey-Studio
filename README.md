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
  - 🤖 **Gemini AI mode**: add your own free Gemini API key in ⚙️ (from [Google AI Studio](https://aistudio.google.com/apikey)).
  - 🧩 **Template mode**: works offline with no key at all.

Your API key is stored only in your own browser (`localStorage`) and is sent only to Google's API.

## Run locally

It's a plain static site with no build step. Open `index.html` in a browser, or run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. Open **Settings → Pages**.
3. Set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
4. After about a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page layout |
| `style.css` | Styles (dark and light theme) |
| `data.js` | Categories, visual styles, camera moves, idea seeds. Edit this file to add your own. |
| `app.js` | Generator logic, Gemini API calls, history |

## Deploy on Render

This repo includes a `render.yaml` Blueprint.

1. In the [Render dashboard](https://dashboard.render.com), click **New → Blueprint** and pick this repo, then **Apply**.
   You can also use **New → Static Site**: pick this repo, leave the build command empty, and set the publish directory to `.`.
2. Render serves the site at `https://forge-kuzey-studio.onrender.com` (or a similar name) and redeploys on every push to `main`.
