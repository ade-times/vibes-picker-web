const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function parseTitleYear(displayName) {
  const decoded = decodeHtmlEntities(displayName);
  const match = decoded.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (match) return { title: match[1].trim(), year: parseInt(match[2]) };
  return { title: decoded.trim(), year: null };
}

function parseWatchlistHTML(html) {
  const films = [];
  const chunks = html.split(/class="react-component"/);

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tagEnd = chunk.indexOf('>');
    if (tagEnd === -1) continue;
    const attrs = chunk.substring(0, tagEnd);

    const linkMatch = attrs.match(/data-target-link="\/film\/([^"]+)\/"/);
    if (!linkMatch) continue;

    const slug = linkMatch[1];
    const nameMatch = attrs.match(/data-item-full-display-name="([^"]*)"/);
    const altNameMatch = attrs.match(/data-item-name="([^"]*)"/);
    const displayName = (nameMatch && nameMatch[1]) || (altNameMatch && altNameMatch[1]) || '';

    const { title, year } = parseTitleYear(displayName);
    films.push({ slug, title: title || slug.replace(/-/g, ' '), year });
  }

  const seen = new Set();
  return films.filter(f => {
    if (seen.has(f.slug)) return false;
    seen.add(f.slug);
    return true;
  });
}

function hasNextPage(html) {
  return html.includes('>Older<') || html.includes('>Next<');
}

// ── Route: Letterboxd scraper ──

async function handleScraper(url) {
  const user = url.searchParams.get('user');
  const page = parseInt(url.searchParams.get('page') || '1');

  if (!user) {
    return jsonResponse({ error: 'Missing "user" query parameter' }, 400);
  }

  const watchlistUrl = `https://letterboxd.com/${user}/watchlist/page/${page}/`;

  try {
    const res = await fetch(watchlistUrl, { headers: HEADERS });

    if (res.status === 404) {
      return jsonResponse({ error: `User "${user}" not found or watchlist is private` }, 404);
    }
    if (!res.ok) {
      return jsonResponse({ error: `Letterboxd returned status ${res.status}` }, 502);
    }

    const html = await res.text();
    const films = parseWatchlistHTML(html);
    const hasNext = hasNextPage(html);

    return jsonResponse({ films, page, has_next: hasNext });
  } catch (err) {
    return jsonResponse({ error: `Failed to fetch watchlist: ${err.message}` }, 500);
  }
}

// ── Route: TMDB proxy ──

async function handleTMDB(url, path, env) {
  const tmdbKey = env.TMDB_API_KEY;
  if (!tmdbKey) {
    return jsonResponse({ error: 'TMDB API key not configured on server' }, 500);
  }

  const tmdbPath = path.replace('/tmdb', '');
  const params = new URLSearchParams(url.search);
  const isBearer = tmdbKey.startsWith('eyJ');

  if (!isBearer) {
    params.set('api_key', tmdbKey);
  }

  const tmdbUrl = `https://api.themoviedb.org/3${tmdbPath}?${params.toString()}`;
  const headers = { Accept: 'application/json' };
  if (isBearer) {
    headers['Authorization'] = `Bearer ${tmdbKey}`;
  }

  const res = await fetch(tmdbUrl, { headers });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: CORS_HEADERS });
}

// ── Route: Gemini proxy ──

async function handleGemini(request, env) {
  const geminiKey = env.GEMINI_API_KEY;
  if (!geminiKey) {
    return jsonResponse({ error: 'Gemini API key not configured on server' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { model, system, message, maxTokens } = payload;
  const geminiModel = model || 'gemini-2.0-flash';
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: message }] }],
    generationConfig: {
      maxOutputTokens: maxTokens || 1000,
      responseMimeType: 'application/json',
    },
  };

  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  try {
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.text();
    return new Response(data, { status: res.status, headers: CORS_HEADERS });
  } catch (err) {
    return jsonResponse({ error: `Gemini request failed: ${err.message}` }, 502);
  }
}

// ── Router ──

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/tmdb/')) {
      return handleTMDB(url, path, env);
    }

    if (path === '/gemini' && request.method === 'POST') {
      return handleGemini(request, env);
    }

    return handleScraper(url);
  },
};
