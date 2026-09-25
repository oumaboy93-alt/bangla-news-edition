'use strict';
/**
 * BNE — Netlify Function-এর জন্য Open Graph হেড বিল্ডার
 * ════════════════════════════════════════════════════════════════════
 * কেন আলাদা ফাইল: Netlify Functions শুধু নিজের ফোল্ডারের ভেতরের ফাইল
 * বান্ডল করে। তাই Oracle সার্ভিসের lib/og.js এখানে কপি করা হয়েছে —
 * একটি সোর্স, দুই রানটাইম। দুটোতেই একই নিয়ম:
 *
 *   • og:image সবসময় absolute https
 *   • og:image:width/height কেবল তখনই, যখন ছবি সত্যিই ১২০০x৬৩০
 *   • og:image:type ছবির আসল এক্সটেনশন অনুযায়ী
 *   • কোনো hash (#) কখনো নয়
 *   • og:url === canonical
 * ════════════════════════════════════════════════════════════════════
 */

const SITE_NAME = 'বাংলা নিউজ এডিশন';
const OG_W = 1200;
const OG_H = 630;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/* ══════════════════════════════════════════════════════════════════════
   ডাবল-এস্কেপ করা সংবাদ-লেখা ঠিক করা (লাইভ সাইটে প্রমাণিত বাগ)
   ──────────────────────────────────────────────────────────────────────
   আগে কেবল `&amp;` → `&` একবার বদলানো হত। কিন্তু Oracle-এর সংগ্রহ ইঞ্জিন
   কিছু সংবাদ দুইবার এস্কেপ করে রাখে, তাই `&amp;lt;a href=&quot;…` একবার
   ডিকোড করেও `&lt;a href=…` হিসেবেই থেকে যেত এবং ফেসবুকের প্রিভিউ কার্ডে
   অর্থহীন কোড-লেখা দেখা যেত।

   এখন সীমিত (সর্বোচ্চ ৩) ধাপে ডিকোড করা হয় এবং অপরিচিত এনটিটি অপরিবর্তিত
   রাখা হয় — তাই স্বাভাবিক লেখার কোনো ক্ষতি হয় না।
   ══════════════════════════════════════════════════════════════════════ */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d',
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', middot: '\u00b7',
  laquo: '\u00ab', raquo: '\u00bb', deg: '\u00b0', times: '\u00d7',
};

function decodeOnce(str) {
  return String(str).replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, ent) => {
      if (ent[0] === '#') {
        const cp = (ent[1] === 'x' || ent[1] === 'X')
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          try { return String.fromCodePoint(cp); } catch (e) { return whole; }
        }
        return whole;
      }
      const key = ent.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
        ? NAMED_ENTITIES[key] : whole;
    }
  );
}

function decodeEntities(s, passes) {
  let out = String(s == null ? '' : s);
  const limit = typeof passes === 'number' ? passes : 3;
  for (let i = 0; i < limit; i++) {
    const next = decodeOnce(out);
    if (next === out) break;   /* আর বদলাচ্ছে না — অতিরিক্ত ডিকোড নয় */
    out = next;
  }
  return out;
}

function stripTags(s) {
  return decodeEntities(s, 3)
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  const t = stripTags(s);
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

function absoluteImage(url, origin) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) return u.replace(/^http:/i, 'https:');
  if (u.startsWith('//')) return 'https:' + u;
  return String(origin).replace(/\/+$/, '') + (u.startsWith('/') ? u : '/' + u);
}

function guessImageType(url) {
  const p = String(url || '').split('?')[0].toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function slugify(title, id) {
  const base = String(title || '')
    .replace(/['"“”‘’`]/g, '')
    /* \p{M} আবশ্যক — বাংলা কার-চিহ্ন Mark ক্যাটাগরি, Letter নয়। */
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (base || 'article-' + String(id || 'x')).slice(0, 70);
}

function isoDate(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

/** True if a dedicated 1200x630 OG asset is known to exist for this slug. */
function ogAssetExists(origin, slug, availableSlugs) {
  return !!(availableSlugs && availableSlugs.has(slug));
}

function buildArticleHead(article, ctx) {
  const origin = String((ctx && ctx.origin) || '').replace(/\/+$/, '');
  const slug = article.slug || article.id;
  const canonical = `${origin}/news/${encodeURIComponent(slug)}`;

  /* ★ og:image নির্ধারণের ক্রম ★
   *
   *  ১) সংবাদের নিজস্ব ছবি — নিম্নলিখিত যেকোনো একটি:
   *       • /img/<file>     → আমাদের নিজের স্টোরেজ
   *       • images/<file>   → রিপোর বিভাগ-ভিত্তিক ব্র্যান্ডেড ছবি
   *       • https://…       → মূল সংবাদমাধ্যমের আসল ছবি (যাচাই করা)
   *     ব্যবহারকারীর চাওয়া: "নিউজের সাথে যে ছবিটি ছিল সেটাই" যাবে।
   *  ২) না থাকলে Oracle-এর তৈরি ১২০০x৬৩০ ব্র্যান্ডেড কার্ড
   *     (/og/<slug>.jpg, /og/* প্রক্সির মাধ্যমে)।
   *
   * ⚠️ বাইরের ছবি (https://…) কেন এখন গ্রহণ করা হয়:
   *   আগে সব বাইরের ঠিকানা বাদ দেওয়া হত, কারণ অনেক সংবাদমাধ্যম হটলিংক
   *   ব্লক করে (৪০৩) — তখন কার্ডে ছবিই আসত না। কিন্তু পরিণতি ছিল: প্রতিটি
   *   খবরে একই জেনেরিক লাল কার্ড, খবরের সাথে সম্পর্কহীন।
   *
   *   এখন ভরসা করা হয় tools/enrich-images.js-এর যাচাইয়ের উপর — সে
   *   ফেসবুক/টেলিগ্রাম ক্রলার-হেডার দিয়ে প্রতিটি লিংক সত্যিই ছবি ফেরায় কি
   *   না (HTTP 200 + image/* + ন্যূনতম আকার) পরীক্ষা করে; ব্যর্থ হলে
   *   বিভাগ-ভিত্তিক ছবি বসিয়ে দেয়। তাই এখানে যাচাই আর দরকার নেই —
   *   ব্লকড লিংক কখনো কনফিগে পৌঁছায়ই না।
   */
  const raw = String(article.image || article.og_image || '').trim();
  let ownAbs = '';
  if (/^https:\/\//i.test(raw)) {
    ownAbs = raw;                                   /* যাচাই করা বাইরের ছবি */
  } else if (raw) {
    ownAbs = absoluteImage(raw, origin);            /* images/… বা /img/… */
  }

  const img = ownAbs || `${origin}/og/${encodeURIComponent(slug)}.jpg`;
  /* নিজস্ব/বাইরের ছবির প্রকৃত মাপ অজানা — ঘোষণা করা হয় না; তৈরি কার্ড ১২০০x৬৩০ */
  const imgDims = ownAbs ? null : { w: OG_W, h: OG_H };

  const imgType = guessImageType(img);
  const title = stripTags(article.title);
  const desc = truncate(article.summary || article.body || title, 200);
  const published = isoDate(article.published_at || article.publishedAt || article.date);
  const modified = isoDate(article.updated_at || article.updatedAt || published);

  const tags = [];
  tags.push(`<title>${esc(title)} — ${esc(SITE_NAME)}</title>`);
  tags.push(`<link rel="canonical" href="${esc(canonical)}" />`);
  tags.push('<meta name="description" content="' + esc(desc) + '" />');
  tags.push('<meta name="robots" content="index, follow, max-image-preview:large" />');
  tags.push(`<meta property="og:site_name" content="${esc(SITE_NAME)}" />`);
  /* ★ og:locale একটি কঠোর enum — 'bn_BD' বৈধ নয় ★
     Facebook এই মান পার্স করতে পারে না, ফলে ?scrape=true 400 ফেরায়:
       "the given value 'bn_bd' for property 'og:locale:locale'
        could not be parsed as type 'enum'"
     বাংলার জন্য Facebook যে মানটি গ্রহণ করে সেটি 'bn_IN'।
     (Oracle সার্ভারের lib/og.js-এও একই সংশোধন করা হয়েছে।) */
  tags.push('<meta property="og:locale" content="bn_IN" />');
  tags.push('<meta property="og:locale:alternate" content="en_US" />');
  tags.push('<meta property="og:type" content="article" />');
  tags.push(`<meta property="og:title" content="${esc(title)}" />`);
  tags.push(`<meta property="og:description" content="${esc(desc)}" />`);
  tags.push(`<meta property="og:url" content="${esc(canonical)}" />`);
  if (img) {
    tags.push(`<meta property="og:image" content="${esc(img)}" />`);
    tags.push(`<meta property="og:image:secure_url" content="${esc(img)}" />`);
    if (imgDims) {
      tags.push(`<meta property="og:image:width" content="${imgDims.w}" />`);
      tags.push(`<meta property="og:image:height" content="${imgDims.h}" />`);
    }
    tags.push(`<meta property="og:image:type" content="${esc(imgType)}" />`);
    tags.push(`<meta property="og:image:alt" content="${esc(truncate(title, 120))}" />`);
  }
  tags.push(`<meta property="article:published_time" content="${esc(published)}" />`);
  tags.push(`<meta property="article:modified_time" content="${esc(modified)}" />`);
  if (article.category) tags.push(`<meta property="article:section" content="${esc(article.category)}" />`);
  (article.tags || []).slice(0, 8).forEach((t) => {
    tags.push(`<meta property="article:tag" content="${esc(t)}" />`);
  });
  tags.push('<meta name="twitter:card" content="summary_large_image" />');
  tags.push(`<meta name="twitter:title" content="${esc(title)}" />`);
  tags.push(`<meta name="twitter:description" content="${esc(desc)}" />`);
  if (img) tags.push(`<meta name="twitter:image" content="${esc(img)}" />`);
  if (ctx && ctx.fbAppId) tags.push(`<meta property="fb:app_id" content="${esc(ctx.fbAppId)}" />`);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: desc,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    datePublished: published,
    dateModified: modified,
    articleSection: article.category || '',
    keywords: (article.tags || []).join(', '),
    inLanguage: 'bn',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteImage('/images/bne-logo.png', origin) },
    },
  };
  if (img) ld.image = [img];
  if (article.author) {
    ld.author = { '@type': 'Person', name: article.author };
  }
  tags.push(`<script type="application/ld+json">${jsonLd(ld)}</script>`);

  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'হোম', item: origin + '/' },
      { '@type': 'ListItem', position: 2, name: article.category || 'সংবাদ',
        item: `${origin}/category/${encodeURIComponent(article.category || '')}` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
    ],
  };
  tags.push(`<script type="application/ld+json">${jsonLd(crumbs)}</script>`);

  return { tags: tags.join('\n'), canonical, image: img, imageDims: imgDims, title };
}

module.exports = {
  esc, jsonLd, stripTags, truncate, absoluteImage, guessImageType, slugify, isoDate,
  buildArticleHead, SITE_NAME, OG_W, OG_H,
  /* দ্বিগুণ-এস্কেপ ঠিক করার জন্য article-og.js ব্যবহার করে */
  decodeEntities,
};
