#!/usr/bin/env node
'use strict';
/**
 * BNE — প্রতিটি সংবাদের নিজস্ব ছবি সংগ্রহ ও সংরক্ষণ
 * ════════════════════════════════════════════════════════════════════════
 * যে সমস্যার সমাধান এটি করে (ব্যবহারকারীর অভিযোগ, ২০২৬-০৯-২৫)
 * ---------------------------------------------------------------------------
 * প্রতিটি পোস্টে ব্র্যান্ডের লাল কার্ড ছবিটাই দেখাচ্ছিল, খবরের নিজের ছবি নয়।
 *
 * কারণ পরীক্ষা করে দেখা গেল: Oracle-এর সংবাদ ডেটায় `image` ফিল্ড ৫০০টির
 * মধ্যে ৪৯৯টিতেই খালি — অর্থাৎ RSS সংগ্রহ ইঞ্জিন ছবি তুলে রাখে না।
 * ফলাফল: ফেসবুক ও টেলিগ্রামে খবরটির সাথে সম্পর্কহীন একই ছবি বারবার যেত।
 *
 * 🎯 কীভাবে ছবি পাওয়া যায়
 * ---------------------------------------------------------------------------
 * সংবাদের body-এর ভেতরে মূল প্রকাশকের (প্রথম আলো, ডেইলি বাংলাদেশ, ইত্তেফাক,
 * বাংলা ট্রিবিউন…) আসল লিংক টিকে থাকে। ওই পাতাটি ব্রাউজারের মতো User-Agent
 * দিয়ে আনলে তার og:image-ই খবরের আসল ছবি।
 *
 * লাইভ পরীক্ষায় ৬/৬ পাতায় og:image পাওয়া গেছে এবং ছবিগুলো নামানোও গেছে।
 *
 * 💾 কেন আলাদা ফাইল (data/article-images.json)
 * ---------------------------------------------------------------------------
 * প্রতি সিঙ্কে data/bne-config.json Oracle থেকে নতুন করে লেখা হয় — তাই
 * সেখানে ছবি বসালে পরের সিঙ্কেই মুছে যেত। তাই ছবির ম্যাপ আলাদা ফাইলে রাখা
 * হয় (slug → image URL) এবং সিঙ্কের পরে কনফিগে মিশিয়ে দেওয়া হয়।
 *
 * 🧠 কেন failed আছে
 * ---------------------------------------------------------------------------
 * কিছু সংবাদে লিংকই থাকে না, আবার কোনো সাইট রোবট ব্লক করে। সেগুলো চিহ্নিত
 * রাখা হয় যাতে প্রতিবার একই ব্যর্থ অনুরোধে সময় নষ্ট না হয় (৭ দিন পরে
 * আবার চেষ্টা করা হয় — ব্লক সাময়িকও হতে পারে)।
 *
 * ব্যবহার:
 *   node tools/resolve-article-images.js                (ডিফল্ট ৪০টি)
 *   MAX_RESOLVE=200 node tools/resolve-article-images.js
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'data', 'bne-config.json');
const STORE_FILE = path.join(ROOT, 'data', 'article-images.json');

const MAX_RESOLVE = Math.max(1, parseInt(process.env.MAX_RESOLVE || '40', 10) || 40);
const CONCURRENCY = Math.max(1, parseInt(process.env.RESOLVE_CONCURRENCY || '4', 10) || 4);
const FAIL_RETRY_DAYS = 7;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/* Google News-এর রিডাইরেক্ট লিংক থেকে og:image পাওয়া যায় না — এড়িয়ে যাই */
const SKIP_HOSTS = /^(news\.google\.com|www\.google\.com|google\.com)$/i;

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function readStore() {
  const raw = loadJson(STORE_FILE, null);
  if (raw && typeof raw === 'object' && raw.images && typeof raw.images === 'object') {
    return { version: raw.version || 1, updatedAt: raw.updatedAt || '', images: raw.images, failed: raw.failed || {} };
  }
  return { version: 1, updatedAt: '', images: {}, failed: {} };
}

/* ডিকোড ছাড়া লিংক খোঁজা ঠিক নয় — body-তে `&amp;` হিসেবে থাকে */
function decodeAmp(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function pickSourceUrl(body) {
  const found = decodeAmp(body).match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  for (const raw of found) {
    let u;
    try { u = new URL(raw); } catch (e) { continue; }
    if (SKIP_HOSTS.test(u.hostname)) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    /* নিজের সাইটের লিংক হলে অর্থহীন */
    if (/netlify\.app$|nip\.io$/i.test(u.hostname)) continue;
    return u.toString();
  }
  return '';
}

async function fetchWithTimeout(url, ms, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept || 'text/html,application/xhtml+xml' },
    });
  } finally {
    clearTimeout(timer);
  }
}

/* og:image → twitter:image → link rel=image_src ক্রমে চেষ্টা */
function extractImageUrl(html) {
  const pats = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m && m[1]) {
      const val = m[1].trim();
      if (/^https?:\/\//i.test(val)) return val;
      /* প্রোটোকল-আপেক্ষিক */
      if (val.startsWith('//')) return 'https:' + val;
    }
  }
  return '';
}

async function resolveOne(article) {
  const pageUrl = pickSourceUrl(article.body || article.summary || '');
  if (!pageUrl) return { ok: false, reason: 'no-source-link' };

  let html;
  try {
    const res = await fetchWithTimeout(pageUrl, 22000);
    if (res.status !== 200) return { ok: false, reason: 'page-http-' + res.status };
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !/text\/html|application\/xhtml/.test(ct)) return { ok: false, reason: 'page-not-html' };
    html = await res.text();
  } catch (e) {
    return { ok: false, reason: 'page-' + (e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 40)) };
  }

  const imgUrl = extractImageUrl(html);
  if (!imgUrl) return { ok: false, reason: 'no-og-image' };

  /* ছবিটা সত্যিই আনা যায় কি না — এখানেই যাচাই (মৃত/ব্লকড লিংক বাদ) */
  try {
    const res = await fetchWithTimeout(imgUrl, 22000, 'image/*');
    if (res.status !== 200) return { ok: false, reason: 'img-http-' + res.status };
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!/^image\//.test(ct)) return { ok: false, reason: 'img-not-image' };
    const len = Number(res.headers.get('content-length') || 0);
    /* খুব ছোট ছবি আইকন/ট্র্যাকিং পিক্সেল — ব্যবহারের অযোগ্য */
    if (len && len < 8000) return { ok: false, reason: 'img-too-small' };
    await res.arrayBuffer();
  } catch (e) {
    return { ok: false, reason: 'img-' + (e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 40)) };
  }

  return { ok: true, image: imgUrl, source: pageUrl };
}

function isRecentlyFailed(store, slug) {
  const when = store.failed[slug];
  if (!when) return false;
  const t = Date.parse(when);
  if (isNaN(t)) return false;
  return (Date.now() - t) < FAIL_RETRY_DAYS * 86400 * 1000;
}

async function main() {
  const cfg = loadJson(CONFIG_FILE, null);
  if (!cfg || !Array.isArray(cfg.editorNews)) {
    console.error('❌ data/bne-config.json পড়া গেল না বা editorNews নেই।');
    process.exit(1);
  }

  const store = readStore();
  const articles = cfg.editorNews;

  /* আগে যেগুলো কনফিগেই ছবি আছে সেগুলো স্টোরে তুলে রাখি (এক-সোর্স) */
  for (const a of articles) {
    const slug = a.slug || a.id;
    if (slug && a.image) store.images[slug] = a.image;
  }

  const pending = articles.filter((a) => {
    const slug = a.slug || a.id;
    if (!slug) return false;
    if (store.images[slug]) return false;          /* আগেই পাওয়া গেছে */
    if (isRecentlyFailed(store, slug)) return false; /* সম্প্রতি ব্যর্থ */
    return true;
  });

  console.log(`🖼️  ছবি-সংগ্রহ শুরু — মোট ${articles.length}টি সংবাদ`);
  console.log(`   আগে থেকেই আছে: ${Object.keys(store.images).length}টি`);
  console.log(`   এই চক্রে চেষ্টা: ${Math.min(pending.length, MAX_RESOLVE)}টি (সীমা ${MAX_RESOLVE})`);

  const batch = pending.slice(0, MAX_RESOLVE);
  let ok = 0, fail = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < batch.length) {
      const a = batch[cursor++];
      const slug = a.slug || a.id;
      let r;
      try { r = await resolveOne(a); } catch (e) { r = { ok: false, reason: 'unexpected' }; }

      if (r.ok) {
        store.images[slug] = r.image;
        delete store.failed[slug];
        ok++;
        console.log(`   ✅ ${slug.slice(0, 44)}`);
      } else {
        store.failed[slug] = new Date().toISOString();
        fail++;
        if (r.reason !== 'no-source-link') {
          console.log(`   ⏭️  ${slug.slice(0, 44)} — ${r.reason}`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

  store.version = (Number(store.version) || 1) + 1;
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2) + '\n');

  console.log('');
  console.log(`✅ সংরক্ষিত মোট ছবি: ${Object.keys(store.images).length}টি`);
  console.log(`   এই চক্রে সফল ${ok}টি, ব্যর্থ ${fail}টি`);
  if (pending.length > batch.length) {
    console.log(`   ⏳ বাকি ${pending.length - batch.length}টি — পরের চক্রে`);
  }
}

main().catch((e) => { console.error('❌ ছবি-সংগ্রহ ব্যর্থ:', e.message); process.exit(1); });
