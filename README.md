# Vibes Picker (Web)

A single-page HTML tool that recommends films from any Letterboxd watchlist. No server needed -- everything runs in the browser except Letterboxd scraping (handled by a Cloudflare Worker).

## How it works

1. Enter a Letterboxd username
2. The app scrapes their watchlist, fetches film details from TMDB, and builds a search index using in-browser embeddings
3. Describe the vibe you want and get 3 recommendations powered by Claude

All film data and embeddings are cached in your browser (IndexedDB). Return visits are instant.

## Setup

You need two API keys (both free to get):

- **TMDB API key**: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com/)

Enter them in the settings (gear icon) on first visit. They're stored in your browser's localStorage and never sent to any server other than the respective APIs.

## Architecture

- **Frontend**: Single `index.html` file (~800 lines), no build step, no framework
- **Letterboxd scraping**: Cloudflare Worker (`vibes-scraper/`) deployed at `vibes-scraper.ade71193.workers.dev`
- **Film details**: TMDB API (called directly from browser via CORS)
- **Embeddings**: Transformers.js (`all-MiniLM-L6-v2`) running in-browser via WebAssembly
- **Recommendations**: Anthropic Claude API (called directly from browser via CORS)
- **Storage**: IndexedDB for films + embeddings, localStorage for API keys

## Hosting

Host `index.html` anywhere that serves static files. GitHub Pages is the easiest:

1. Create a repo on GitHub
2. Push `index.html`
3. Enable GitHub Pages (Settings > Pages > Deploy from branch > main)
4. Access at `https://yourusername.github.io/repo-name/`

## Deploying the Worker (if you fork this)

```bash
cd vibes-scraper
npm install -g wrangler
wrangler login
npx wrangler deploy
```

Update the `SCRAPER_URL` in `index.html` to point to your Worker URL.
