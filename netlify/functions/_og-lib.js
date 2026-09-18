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

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
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
     ১) সংবাদের নিজস্ব ছবি (আমাদের /img/ স্টোরেজে রাখা) — চাকরির
        বিজ্ঞপ্তির পোস্টার বা সংবাদের আসল ছবি। ব্যবহারকারীর চাওয়া:
        "নিউজের সাথে যে ছবিটি ছিল সেটাই" যাবে।
     ২) না থাকলে আমাদের তৈরি ১২০০x৬৩০ ব্র্যান্ডেড কার্ড। */
  const ownRel = String(article.image || article.og_image || '');
  const ownAbs = /^\/img\//.test(ownRel) ? `${origin}${ownRel}` : (/^https?:/i.test(ownRel) ? '' : '');

   *
   * আগের ক্রম ছিল:
   *   ১) প্রি-জেনারেট করা asset (রেপোতে আগে থেকে রাখা — মাত্র কয়েকটি)
   *   ২) আর্টিকেলের নিজের ছবি
   *   ৩) সাইটের কভার
   *
   * সমস্যা: সংগৃহীত (RSS) সংবাদের ক্ষেত্রে ২ নম্বর পথে যেত এবং ছবির
   * ঠিকানা হত সোর্স সাইটের — যা হটলিংক ব্লক করে (bd-journal-এ HTTP 403
   * যাচাইকৃত)। ফলে ফেসবুকের প্রিভিউ কার্ডে কোনো ছবি আসত না, এবং
   * width/height ঘোষণা করা যেত না (মাপ অজানা)।
   * সেই সঙ্গে ১ নম্বর পথ কেবল রেপোতে আগে থেকে থাকা ছবির জন্য কাজ করত,
   * তাই নতুন সংবাদের /og/<slug>.jpg ৪০৪ দিত।
   *
   * এখন: Oracle সার্ভার (lib/ogimage.js) যেকোনো slug-এর জন্য চাহিদা
   * অনুযায়ী ১২০০x৬৩০ ব্র্যান্ডেড কার্ড তৈরি করে, আর netlify.toml-এর
   * /og/* প্রক্সি সেটি পরিবেশন করে। তাই সবসময় (ক) ছবি নিশ্চিত,
   * (খ) সঠিক মাপ ঘোষণা করা যায় — ফেসবুক বড় কার্ড রেন্ডার করে। */
  const img = ownAbs || `${origin}/og/${encodeURIComponent(slug)}.jpg`;
  /* নিজস্ব ছবির প্রকৃত মাপ অজানা — ঘোষণা করা হয় না; তৈরি কার্ড ১২০০x৬৩০ */
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
};
