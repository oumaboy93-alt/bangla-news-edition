'use strict';
/**
 * BNE — /news/<slug> এর জন্য সার্ভার-রেন্ডার করা HTML + সঠিক OG ট্যাগ
 * ════════════════════════════════════════════════════════════════════
 * সমস্যা যা এটি সমাধান করে (লাইভ সাইটে প্রমাণিত):
 *   ফেসবুকের ক্রলার /news/<slug> চাইলে আগে অভিন্ন index.html পেত —
 *   তাই og:title ছিল সাইটের নাম, og:image ছিল হোমপেজের কভার।
 *   কারণ: সাইটটি SPA, আর ফেসবুক জাভাস্ক্রিপ্ট চালায় না।
 *
 * এখন: এই ফাংশনটি প্রথম বাইটেই খবরের নিজের ট্যাগসহ সম্পূর্ণ HTML দেয়।
 * Oracle সার্ভার (Phase B) চালু হলে এই ফাংশন ঐচ্ছিক হয়ে যাবে — কিন্তু
 * Netlify-তে আজই SMO ফিক্স চালু করতে এটিই পথ।
 * ════════════════════════════════════════════════════════════════════
 */

const OG = require('./_og-lib');

/* বান্ডল করা ডেটা (tools/sync-function-data.js দিয়ে তৈরি) */
let BUNDLED = null;
try { BUNDLED = require('./_data.json'); } catch (e) { BUNDLED = null; }

const REMOTE_FALLBACK = 'https://raw.githubusercontent.com/oumaboy93-alt/bangla-news-edition/main/data/bne-config.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
let remoteCache = { at: 0, data: null };

const CRAWLER_RE = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|Googlebot|bingbot|YandexBot|Applebot/i;

function originOf(event) {
  const h = event.headers || {};
  const proto = h['x-forwarded-proto'] || 'https';
  const host = h['x-forwarded-host'] || h.host || 'bangla-news-edition.netlify.app';
  return `${proto}://${host}`;
}

/** slug বা id দুইভাবেই খোঁজা হয় — পুরনো শেয়ার করা লিংকও কাজ করবে। */
function findArticle(data, key) {
  const list = (data && data.editorNews) || [];
  const k = String(key || '').trim().toLowerCase();
  return (
    list.find((a) => String(a.slug || '').toLowerCase() === k) ||
    list.find((a) => String(a.id || '').toLowerCase() === k) ||
    null
  );
}

async function loadData() {
  if (BUNDLED && (BUNDLED.editorNews || []).length) return BUNDLED;
  if (remoteCache.data && Date.now() - remoteCache.at < CACHE_TTL_MS) return remoteCache.data;
  try {
    const res = await fetch(REMOTE_FALLBACK, { headers: { 'User-Agent': 'BNE-OG/1.0' } });
    if (res.ok) {
      const data = await res.json();
      remoteCache = { at: Date.now(), data };
      return data;
    }
  } catch (e) { /* নেটওয়ার্ক ব্যর্থ হলে বান্ডল করা ডেটাই ভরসা */ }
  return BUNDLED || { editorNews: [] };
}

function shell(bodyHtml, headTags) {
  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headTags}
<link rel="stylesheet" href="/style.css" />
<link rel="stylesheet" href="/ssr.css" />
</head>
<body class="ssr-body">
<header class="ssr-header"><a class="ssr-brand" href="/">বাংলা নিউজ এডিশন</a></header>
${bodyHtml}
<footer class="ssr-footer"><p>© ${new Date().getFullYear()} বাংলা নিউজ এডিশন</p></footer>
<script src="/core.js"></script>
<script src="/app.js" defer></script>
</body>
</html>`;
}

function renderNotFound(origin) {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, follow',
    },
    body: `<!doctype html><html lang="bn"><head><meta charset="utf-8" />
<meta name="robots" content="noindex, follow" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>সংবাদ পাওয়া যায়নি — বাংলা নিউজ এডিশন</title>
<link rel="stylesheet" href="/ssr.css" /></head>
<body class="ssr-body"><main class="ssr-main">
<h1 class="ssr-title">সংবাদটি পাওয়া যায়নি</h1>
<p>আপনি যে সংবাদটি খুঁজছেন সেটি সরানো হয়েছে অথবা লিংকটি ভুল।</p>
<p><a href="${OG.esc(origin)}/">← হোমপেজে ফিরে যান</a></p>
</main></body></html>`,
  };
}

exports.handler = async (event) => {
  const origin = originOf(event);
  const path = event.path || '';

  const m = path.match(/\/news\/(.+?)\/?$/);
  if (!m) return renderNotFound(origin);

  let key;
  try { key = decodeURIComponent(m[1]); } catch (e) { key = m[1]; }

  const data = await loadData();
  const article = findArticle(data, key);
  if (!article) return renderNotFound(origin);

  /* slug না থাকলে id-ই canonical slug (পুরনো শেয়ার করা লিংক অটুট থাকে) */
  const slug = article.slug || article.id;
  const ogSlugs = new Set(
    (data.ogSlugs || (BUNDLED && BUNDLED.ogSlugs) || []).map((s) => String(s))
  );

  const head = OG.buildArticleHead({ ...article, slug }, {
    origin,
    ogSlugs,
    siteCover: '/images/bne-og-cover.jpg',
    fbAppId: (data.settings && data.settings.fbAppId) || '',
  });

  const img = head.image;
  const paras = String(article.body || article.summary || '')
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bodyHtml = `
<main class="ssr-main">
  <nav class="ssr-crumb"><a href="/">হোম</a> › <a href="/category/${encodeURIComponent(article.category || '')}">${OG.esc(article.category || 'সংবাদ')}</a></nav>
  <h1 class="ssr-title">${OG.esc(article.title)}</h1>
  <div class="ssr-meta">
    <span class="ssr-badge">${OG.esc(article.category || 'সংবাদ')}</span>
    <time datetime="${OG.esc(OG.isoDate(article.publishedAt || article.published_at))}">${OG.esc(
      new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' })
        .format(new Date(article.publishedAt || article.published_at || Date.now()))
    )}</time>
  </div>
  ${img ? `<figure class="ssr-hero"><img src="${OG.esc(img)}" alt="${OG.esc(OG.truncate(article.title, 120))}" width="${head.imageDims ? head.imageDims.w : 1024}" height="${head.imageDims ? head.imageDims.h : 571}" /></figure>` : ''}
  <div class="ssr-content">${paras.map((p) => `<p>${OG.esc(p)}</p>`).join('\n')}</div>
  <div class="share-bar">
    <a class="share-btn fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(head.canonical)}">ফেসবুকে শেয়ার</a>
    <a class="share-btn wa" href="https://wa.me/?text=${encodeURIComponent(article.title + ' ' + head.canonical)}">হোয়াটসঅ্যাপ</a>
    <a class="share-btn tg" href="https://t.me/share/url?url=${encodeURIComponent(head.canonical)}">টেলিগ্রাম</a>
  </div>
</main>`;

  const isCrawler = CRAWLER_RE.test(String((event.headers || {})['user-agent'] || ''));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      /* ক্রলারকে কখনো ক্যাশ করা (পুরনো) HTML দেব না */
      'Cache-Control': isCrawler ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300',
      'X-SSR': isCrawler ? 'crawler' : 'public',
      'X-Content-Type-Options': 'nosniff',
    },
    body: shell(bodyHtml, head.tags),
  };
};
