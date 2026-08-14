/**
 * Korean book/comics search via Aladin mobile search.
 * GET /api/books?q=사채꾼 우시지마&kind=all|book|comic
 *
 * - Tries multiple query variants (typo-tolerant Hangul, with/without 만화)
 * - Merges & ranks by relevance to the original query
 */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = String(req.query.q || "").trim();
  const kind = String(req.query.kind || "all");
  if (!q) return res.status(400).json({ results: [], error: "q required" });

  try {
    const queries = buildQueries(q, kind);
    const batches = await Promise.all(
      queries.map((query) => searchAladin(query).catch(() => []))
    );

    const merged = mergeAndRank(batches.flat(), q);
    return res.status(200).json({
      results: merged.slice(0, 24),
      source: "aladin",
      query: q,
      tried: queries,
      kind,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ results: [], error: "search failed" });
  }
};

/** Build several search strings to maximize hit rate */
function buildQueries(q, kind) {
  const out = [];
  const push = (s) => {
    const t = String(s || "").trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(q);

  // Typo-tolerant variants FIRST (before adding 만화 which often zeros out)
  hangulTypoVariants(q).forEach(push);

  // Token searches for multi-word queries (e.g. "사채꾼 우지시마")
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length >= 2) {
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
    if (longest) {
      push(longest);
      hangulTypoVariants(longest).forEach(push);
    }
    tokens.forEach((t) => {
      push(t);
      hangulTypoVariants(t).forEach(push);
    });
  }

  // Comic bias last — bare queries already covered
  if (kind === "comic" && !/만화|코믹|comic|manga/i.test(q)) {
    push(`${q} 만화`);
    // also comic-suffixed typo variants (top few)
    hangulTypoVariants(q)
      .slice(0, 2)
      .forEach((v) => push(`${v} 만화`));
  }

  return out.slice(0, 10);
}

/**
 * Generate Hangul variants by swapping similar Choseong (initials)
 * Fixes cases like 우지시마 → 우시지마 (ㅈ↔ㅅ crossed within a word)
 */
function hangulTypoVariants(text) {
  const swaps = {
    9: [12], // ㅅ → ㅈ
    12: [9, 14], // ㅈ → ㅅ, ㅊ
    14: [12], // ㅊ → ㅈ
    2: [3],
    3: [2],
    5: [6],
    6: [5],
  };

  const rebuild = (cho, jung, jong) =>
    String.fromCharCode(0xac00 + cho * 588 + jung * 28 + jong);

  const info = (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return null;
    const s = code - 0xac00;
    return {
      cho: Math.floor(s / 588),
      jung: Math.floor((s % 588) / 28),
      jong: s % 28,
    };
  };

  const variants = new Set();

  // Work token-by-token so "사채꾼 우지시마" → "사채꾼 우시지마"
  const tokens = text.split(/(\s+)/); // keep spaces
  const tokenVariants = tokens.map((token) => {
    if (/^\s+$/.test(token) || token.length < 2) return [token];

    const local = new Set([token]);
    const chars = [...token];

    // Single-position swaps
    for (let i = 0; i < chars.length; i++) {
      const meta = info(chars[i]);
      if (!meta) continue;
      const alts = swaps[meta.cho];
      if (!alts) continue;
      for (const alt of alts) {
        const next = [...chars];
        next[i] = rebuild(alt, meta.jung, meta.jong);
        local.add(next.join(""));
      }
    }

    // Transpose ㅅ↔ㅈ only when BOTH exist in this token (crossed typo)
    let hasS = false;
    let hasJ = false;
    for (const ch of chars) {
      const meta = info(ch);
      if (!meta) continue;
      if (meta.cho === 9) hasS = true;
      if (meta.cho === 12) hasJ = true;
    }
    if (hasS && hasJ) {
      const transposed = chars
        .map((ch) => {
          const meta = info(ch);
          if (!meta) return ch;
          if (meta.cho === 9) return rebuild(12, meta.jung, meta.jong);
          if (meta.cho === 12) return rebuild(9, meta.jung, meta.jong);
          return ch;
        })
        .join("");
      local.add(transposed);
    }

    return [...local];
  });

  // Cartesian product limited: original + each token's best variants swapped one-at-a-time
  // 1) all originals
  variants.add(text);

  // 2) replace one token at a time with each of its variants
  for (let ti = 0; ti < tokenVariants.length; ti++) {
    const options = tokenVariants[ti];
    if (options.length <= 1) continue;
    for (const opt of options) {
      if (opt === tokens[ti]) continue;
      const next = [...tokens];
      next[ti] = opt;
      variants.add(next.join(""));
    }
  }

  return [...variants].filter((v) => v && v !== text);
}

async function searchAladin(searchWord) {
  const url =
    "https://www.aladin.co.kr/m/msearch.aspx?SearchTarget=book&SearchWord=" +
    encodeURIComponent(searchWord);

  const upstream = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
  });

  if (!upstream.ok) return [];
  const html = await upstream.text();
  return parseAladin(html);
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCover(url) {
  if (!url) return "";
  let u = url.startsWith("//") ? "https:" + url : url;
  u = u.replace(/^http:/, "https:");
  u = u.replace("/SpineShelf/", "/cover200/");
  return u;
}

function parseAladin(html) {
  const results = [];
  const seen = new Set();
  const re =
    /browse_list_box[^>]*itemId="(\d+)"([\s\S]*?)(?=<div class="browse_list_box|$)/g;
  let m;
  while ((m = re.exec(html)) !== null && results.length < 30) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk = m[0];
    const titleM = chunk.match(/b_book_t[^>]*>([\s\S]*?)<\/span>/);
    const imgM = chunk.match(/cover_area[\s\S]*?<img[^>]+src="([^"]+)"/i);
    const authorM = chunk.match(/AuthorSearch=[^"]+">([^<]+)</);
    const pubM = chunk.match(/PublisherSearch=[^"]+">([^<]+)</);
    const title = stripTags(titleM && titleM[1]);
    if (!title) continue;
    const author = stripTags(authorM && authorM[1]);
    const publisher = stripTags(pubM && pubM[1]);
    results.push({
      title,
      subtitle: [author, publisher].filter(Boolean).join(" · "),
      imageUrl: normalizeCover(imgM && imgM[1]),
      sourceId: "aladin-" + id,
      author,
      publisher,
    });
  }
  return results;
}

function normalizeForScore(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣]/g, "");
}

/** Simple relevance: token overlap + substring bonus */
function scoreItem(item, query) {
  const q = normalizeForScore(query);
  const title = normalizeForScore(item.title);
  const author = normalizeForScore(item.author);
  if (!q || !title) return 0;

  let score = 0;
  if (title.includes(q)) score += 100;
  if (title.startsWith(q)) score += 40;

  const qTokens = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(normalizeForScore);

  for (const t of qTokens) {
    if (title.includes(t)) score += 35;
    if (author.includes(t)) score += 20;
  }

  // Soft match for typo: allow 1-char choseong swap distance on tokens
  for (const t of qTokens) {
    for (const v of hangulTypoVariants(t)) {
      const nv = normalizeForScore(v);
      if (nv && title.includes(nv)) score += 28;
    }
  }

  if (item.imageUrl) score += 5;
  // Prefer single volumes slightly over giant sets when query is short
  if (/세트|전\d+권/.test(item.title)) score -= 8;

  return score;
}

function mergeAndRank(items, query) {
  const map = new Map();
  for (const item of items) {
    if (!item || !item.sourceId) continue;
    if (!map.has(item.sourceId)) map.set(item.sourceId, item);
  }
  return [...map.values()]
    .map((item) => ({ ...item, _score: scoreItem(item, query) }))
    .sort((a, b) => b._score - a._score || a.title.localeCompare(b.title, "ko"))
    .map(({ _score, ...rest }) => rest);
}
