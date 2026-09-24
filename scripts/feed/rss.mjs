// ============================================================
// rss.mjs: reads RSS and Atom feeds.
//
// RSS/Atom are standard "what's new" lists that blogs and podcasts
// publish. Each entry has a title, a link, a date and a short blurb.
// This file pulls those four things out, with no extra packages.
// ============================================================

const UA = 'Mozilla/5.0 (StrideFeed; personal learning app)';

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

// Turn HTML/XML snippets into plain text.
export function plain(text = '') {
  return decode(
    String(text)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function tag(block, names) {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    if (m) return m[1];
  }
  return '';
}

function link(block) {
  // Atom: <link rel="alternate" href="..."/>   RSS: <link>...</link>
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
    || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)
    || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (alt) return decode(alt[1]);
  return plain(tag(block, ['link']));
}

export function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const when = plain(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const date = when ? new Date(when) : null;
    return {
      title: plain(tag(b, ['title'])),
      link: link(b),
      date: date && !isNaN(date) ? date.toISOString() : null,
      snippet: plain(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 400),
    };
  }).filter((it) => it.title && it.link);
}

// For sites without a feed: find article links on a page that match a pattern.
export function parseLinks(html, pattern, base) {
  const re = new RegExp(`href=["'](${pattern})["']`, 'g');
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(re)) {
    const url = new URL(m[1], base).href;
    if (!seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out;
}

// Read an article page's title and summary from its standard "meta" tags.
export function pageMeta(html) {
  const meta = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
    return m ? plain(m[1]) : '';
  };
  return {
    title: meta('og:title') || plain(tag(html, ['title'])),
    snippet: (meta('og:description') || meta('description')).slice(0, 400),
    date: meta('article:published_time') || null,
  };
}
