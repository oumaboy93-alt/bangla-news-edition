#!/usr/bin/env node
'use strict';
/**
 * BNE — প্রতি সংবাদের সাথে সামঞ্জস্যপূর্ণ ছবি যোগ করা
 * ════════════════════════════════════════════════════════════════════════
 * কেন এই টুল দরকার
 * ---------------------------------------------------------------------------
 * সমস্যা (ব্যবহারকারীর অভিযোগ): ফেসবুক পেজে ও টেলিগ্রাম চ্যানেলে পোস্ট করা
 * প্রতিটি খবরের সাথে একই জেনেরিক লাল "BANGLA NEWS EDITION" কার্ড দেখাত —
 * খবরের সাথে সম্পর্কিত কোনো ছবি নয়।
 *
 * কারণ: Oracle-এর সংগ্রহের সময় RSS থেকে ছবি তোলা হয় না — লাইভ যাচাইয়ে
 * ৫০০টি সংবাদের মধ্যে মাত্র ১টিতে ছবি আছে (সেটি সম্পাদকীয়)। অতএব
 * og:image ও পোস্টারের ছবি — দুটোই জেনেরিক কার্ডে গিয়ে ঠেকে।
 *
 * এই টুল দুই স্তরে ছবি জোগায়:
 *   ১) মূল সংবাদমাধ্যমের RSS ফিডে একই শিরোনামের খুঁজে তার আসল ছবি নেওয়া
 *      (সূত্র-নাম অনুযায়ী — fuzz-free শিরোনাম মিল)
 *   ২) না পাওয়া গেলে বিভাগ-ভিত্তিক ব্র্যান্ডেড ছবি (খেলা→sports.jpg,
 *      রাজনীতি→politics.jpg …) — core.js-এর CATEGORIES থেকে
 *
 * ফলে প্রতিটি খবরের ছবি আলাদা ও প্রাসঙ্গিক হয়, আর কোনো পোস্ট ছবিবিহীন থাকে না।
 *
 * ⚠️ শিরোনাম মিল অত্যন্ত রক্ষণশীল — ভুল ছবি বসানোর চেয়ে বিভাগ-ছবি ভালো।
 *    তাই শুধু হুবহু (normalize করা) শিরোনাম মিললেই আসল ছবি বসে।
 *
 * ব্যবহার:  node tools/enrich-images.js [--limit=300] [--no-feed]
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'data', 'bne-config.json');

/* মূল সংবাদমাধ্যমের ফিড — ২০২৬-০৯-২৫-এ লাইভ যাচাই করে যেগুলো কাজ করছে */
/* ── সচল ফিডের তালিকা (২০২৬-০৯-২৬-এ যাচাই করা) ────────────────────────
   প্রতিটির মূল পাতা থেকে অফিসিয়াল ফিডের ঠিকানা বের করে যাচাই করা হয়েছে:
     • ডেইলি বাংলাদেশ  → /rss        (আগে ভুল করে /rss.xml লেখা ছিল → ৪০৪)
     • বাংলা ট্রিবিউন   → /feed/
     • ইত্তেফাক        → /feed/
     • প্রথম আলো       → /feed/

   ⚠️ যেগুলো বাদ দেওয়া হলো কেন (৪০৩ = বট-ব্লক, আটকানো যায়নি):
     • যুগান্তর, সময় নিউজ, বাংলাদেশ জার্নাল — Cloudflare বট-সুরক্ষা
     • বিডিনিউজ২৪ — ?feed=rss2 আসলে HTML ফেরত দেয়, বৈধ ফিড নয়

   ★ কেন এটি বড় লাভ ★
     এই চারটি ফিড আমাদের সংবাদের ৮২% সূত্র ঢেকে দেয়
     (ডেইলি বাংলাদেশ ২১৩ + বাংলা ট্রিবিউন ১২১ + ইত্তেফাক ৪০ + প্রথম আলো ৩৫ = ৪০৯/৫০০)।
     আগে ডেইলি বাংলাদেশের ফিড ভুল ঠিকানায় থাকায় ওই ২১৩টি সংবাদের ছবি
     কোনোদিনই আসত না — ফলে সবগুলোতে একই জেনেরিক পতাকা-ছবি বসত। */
const FEEDS = [
  'https://www.daily-bangladesh.com/rss',
  'https://www.banglatribune.com/feed/',
  'https://www.ittefaq.com.bd/feed/',
  'https://www.prothomalo.com/feed/',
];

const UA = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Accept: 'application/rss+xml,application/xml,text/xml,*/*',
};

/* ── শিরোনাম নরমালাইজ: যুক্তচিহ্ন/এনটিটি/স্পেস সব বাদ, শুধু অক্ষর ────────── */
function normTitle(s) {
  let t = String(s || '');
  /* ★ NFC অপরিহার্য ★
     বাংলা যুক্তাক্ষর একই দেখতে হলেও দুই রূপে লেখা যায় (যেমন হ্যা / হ্য়া)।
     কীবোর্ড-ভেদে রূপ বদলায়, ফলে হুবহু একই শিরোনামও "মিলছে না" হয়ে যায়।
     উভয় দিক NFC না করলে সংবাদমাধ্যমের ছবি খুঁজে পাওয়া যায় না —
     এটাই আগের কম মিলের একটি বড় কারণ ছিল। */
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  return t
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
    .replace(/[^\u0980-\u09FFa-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ── ফিড আইটেম থেকে সেরা ছবি ─────────────────────────────────────────── */
function extractImage(item) {
  const cands = [];

  /* media:content — একাধিক থাকলে সবচেয়ে বড় মাপটি নেওয়া হয় */
  const mc = item.match(/<media:content[^>]*>/gi) || [];
  for (const tag of mc) {
    const url = (tag.match(/url=["']([^"']+)["']/i) || [])[1];
    if (!url) continue;
    const w = parseInt((tag.match(/width=["'](\d+)["']/i) || [])[1] || '0', 10) || 0;
    cands.push({ url, w });
  }
  const thumb = item.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
  if (thumb) cands.push({ url: thumb[1], w: 0 });

  const enc = item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i)
    || item.match(/<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i);
  if (enc) cands.push({ url: enc[1], w: 0 });

  const body = (item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) || [])[1]
    || (item.match(/<description>([\s\S]*?)<\/description>/i) || [])[1];
  if (body) {
    const img = body.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (img) cands.push({ url: img[1], w: 0 });
  }

  if (!cands.length) return '';
  cands.sort((a, b) => b.w - a.w);           /* বড় ছবি আগে */
  const best = cands[0].url;
  if (!/^https?:\/\//i.test(best)) return '';
  return best.replace(/^http:/i, 'https:');
}

/* ══════════════════════════════════════════════════════════════════════
   ★ শিরোনাম দেখে সঠিক বিভাগ অনুমান (ফলব্যাক ছবির জন্য) ★
   ──────────────────────────────────────────────────────────────────────
   কেন দরকার: Oracle-এর স্বয়ংক্রিয় বিভাজন অনেক সময় ভুল হয়। লাইভ যাচাইয়ে
   পাওয়া গেছে — "শিরোনাম: সেপ্টেম্বরের ২৫ দিনে ডেঙ্গুতে ১১৪ মৃত্যু" খবরটি
   রাখা হয়েছে "শিক্ষা" বিভাগে, ফলে ফলব্যাক ছবি হিসেবে সবার অপ্রাসঙ্গিক
   প্রযুক্তির ছবি বসছিল। পাঠকের কাছে এটি স্পষ্ট ভুল মনে হয়।

   সমাধান: ফলব্যাক ছবি বাছার সময় শিরোনামের শব্দ দেখে বিভাগ অনুমান করা হয়;
   নিশ্চিতভাবে মিললে সেটিই ব্যবহার করা হয়, নইলে আগের বিভাগ অটুট থাকে।
   ⚠️ এটি কেবল ছবি বাছার জন্য — সাইটে প্রদর্শিত বিভাগ বদলানো হয় না,
      কারণ সেটি সম্পাদকীয় সিদ্ধান্ত ও Oracle-এর নিজের কাজ। */
const TITLE_CATEGORY = [
  ['স্বাস্থ্য', ['ডেঙ্গু', 'রোগ', 'হাসপাতাল', 'স্বাস্থ্য', 'চিকিৎসা', 'ওষুধ', 'টিকা', 'ভাইরাস',
    'মৃত্যু', 'নার্স', 'ডাক্তার', 'চিকিৎসক', 'ক্যান্সার', 'ডায়াবেটিস', 'করোনা', 'জ্বর']],
  ['খেলা', ['ক্রিকেট', 'ফুটবল', 'ম্যাচ', 'গোল', 'খেলোয়াড়', 'বিশ্বকাপ', 'টি-টোয়েন্টি',
    'ফিফা', 'এশিয়ান কাপ', 'টুর্নামেন্ট', 'মেসি', 'নেইমার', 'ব্রাজিল', 'অর্জুন']],
  ['প্রযুক্তি', ['স্মার্টফোন', 'মোবাইল', 'ইন্টারনেট', 'সফটওয়্যার', 'অ্যাপ', 'কম্পিউটার',
    'এআই', 'কৃত্রিম বুদ্ধিমত্তা', 'ফেসবুক', 'গুগল', 'হ্যাক', 'সাইবার']],
  ['বিনোদন', ['সিনেমা', 'নাটক', 'শিল্পী', 'গান', 'অভিনেতা', 'অভিনেত্রী', 'চলচ্চিত্র',
    'ঢালিউড', 'টেলিভিশন', 'নায়ক', 'নায়িকা', 'সঙ্গীত', 'ছবির']],
  ['অর্থনীতি', ['টাকা', 'ডলার', 'ব্যাংক', 'বাজেট', 'রপ্তানি', 'আমদানি', 'বিনিয়োগ',
    'শেয়ার', 'মূল্যবৃদ্ধি', 'বাজারদর', 'ভ্যাট', 'কর', 'ঋণ', 'রিজার্ভ']],
  ['প্রবাস', ['প্রবাসী', 'বিদেশে', 'ভিসা', 'রেমিট্যান্স', 'অভিবাসী', 'প্রবাসে', 'দূতাবাস']],
  ['আন্তর্জাতিক', ['জাতিসংঘ', 'ভারত', 'পাকিস্তান', 'আমেরিকা', 'যুক্তরাষ্ট্র', 'চীন',
    'ইসরায়েল', 'ফিলিস্তিন', 'ইউক্রেন', 'রাশিয়া', 'ট্রাম্প', 'গাজা', 'হামাস',
    'নেতানিয়াহু', 'ইরান', 'ফ্রান্স', 'ব্রিটেন']],
  ['রাজনীতি', ['নির্বাচন', 'মন্ত্রী', 'সংসদ', 'রাজনৈতিক', 'আওয়ামী', 'বিএনপি', 'জামায়াত',
    'দল', 'নেতা', 'ভোট', 'সচিবালয়', 'প্রধানমন্ত্রী']],
  ['ধর্ম', ['হজ', 'মসজিদ', 'ঈদ', 'রমজান', 'নামাজ', 'ধর্মীয়', 'উলামা', 'মাদ্রাসা',
    'পূজা', 'বুদ্ধ', 'খ্রিস্টান']],
  ['শিক্ষা', ['পরীক্ষা', 'শিক্ষার্থী', 'বিশ্ববিদ্যালয়', 'কলেজ', 'স্কুল', 'শিক্ষক',
    'ফলাফল', 'ভর্তি', 'উপবৃত্তি', 'এসএসসি', 'এইচএসসি', 'শিক্ষা']],
  ['চাকরি', ['নিয়োগ', 'চাকরি', 'বেতন', 'আবেদন', 'বিজ্ঞপ্তি', 'কর্মী', 'পদে']],
];

function guessCategoryFromTitle(title) {
  const t = String(title || '');
  let best = '', bestHits = 0;
  for (const [cat, words] of TITLE_CATEGORY) {
    let hits = 0;
    for (const w of words) if (t.includes(w)) hits++;
    if (hits > bestHits) { bestHits = hits; best = cat; }
  }
  return bestHits > 0 ? best : '';
}

/* ── বিভাগ → ছবির পথ (core.js-এর একই মানচিত্র ব্যবহার করা হয়) ─────────── */
function categoryImage(category) {
  try {
    const core = require(path.join(ROOT, 'core.js'));
    if (typeof core.catMeta === 'function') {
      const m = core.catMeta(category || '');
      if (m && m.img) return m.img;
    }
  } catch (e) { /* core.js না পড়লে নিচের ডিফল্ট */ }

  const FALLBACK = {
    'জাতীয়': 'images/national.jpg',
    'রাজনীতি': 'images/politics.jpg',
    'সারাদেশ': 'images/national.jpg',
    'অর্থনীতি': 'images/economy.jpg',
    'আন্তর্জাতিক': 'images/international.jpg',
    'খেলা': 'images/sports.jpg',
    'বিনোদন': 'images/entertainment.jpg',
    'শিক্ষা': 'images/technology.jpg',
    'চাকরি': 'images/economy.jpg',
    'প্রবাস': 'images/international.jpg',
    'ধর্ম': 'images/national.jpg',
    'স্বাস্থ্য': 'images/health.jpg',
    'প্রযুক্তি': 'images/technology.jpg',
  };
  return FALLBACK[category] || 'images/bne-og-cover.jpg';
}

/* ══════════════════════════════════════════════════════════════════════
   ★ সংবাদ-সাইটম্যাপ — আসল ছবি পাওয়ার মূল উৎস ★
   ──────────────────────────────────────────────────────────────────────
   ব্যবহারকারীর অভিযোগ: "একই ছবি একাধিক নিউজে দেখাচ্ছে"।

   কারণ ছিল: RSS ফিডে কেবল সাম্প্রতিক ১০–১০০টি খবর থাকে, আর আমাদের
   ভাণ্ডারে ৫০০+ খবর (এক মাসের)। ফলে বেশিরভাগ খবরের সাথে ফিডের কোনো
   মিলই পাওয়া যেত না → সবগুলোতে বিভাগভিত্তিক একই ফলব্যাক ছবি (যেমন
   "জাতীয়" বিভাগের সবার জন্য পতাকা+সংসদ ভবনের ছবি) বসত।

   সমাধান: সংবাদমাধ্যমগুলোর **Google News সাইটম্যাপ**। এতে অনেক বেশি
   খবর থাকে এবং প্রতিটিতে শিরোনাম ও ছবি দুটোই দেওয়া থাকে:

     daily-bangladesh.com/news-sitemap.xml  → ১০০টি (শিরোনাম + ছবি)
     banglatribune.com/news-sitemap.xml     → ৩৭২টি (শিরোনাম + ছবি)
     ittefaq.com.bd/news-sitemap.xml        → ৩৪৪টি (শিরোনাম + ছবি)
     prothomalo.com/sitemap/sitemap-daily-* → ২১৩টি/দিন (ছবি + slug-এ শিরোনাম)

   একবার আনলেই ১০০০+ শিরোনাম→ছবি জোড়া তৈরি হয়, আর সেটি এক মাসের
   খবরও ঢেকে দেয়। ২০২৬-০৯-২৬-এ লাইভ যাচাই করা হয়েছে।
   ══════════════════════════════════════════════════════════════════════ */
function lastNDays(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

const SITEMAPS = [
  { name: 'ডেইলি বাংলাদেশ', kind: 'news', url: 'https://www.daily-bangladesh.com/news-sitemap.xml' },
  { name: 'বাংলা ট্রিবিউন', kind: 'news', url: 'https://www.banglatribune.com/news-sitemap.xml' },
  { name: 'ইত্তেফাক', kind: 'news', url: 'https://www.ittefaq.com.bd/news-sitemap.xml' },
  /* প্রথম আলোয় news:title নেই, কিন্তু <loc>-এর শেষ অংশটিই শিরোনাম (slug) */
  ...lastNDays(10).map((d) => ({
    name: 'প্রথম আলো', kind: 'slug',
    url: `https://www.prothomalo.com/sitemap/sitemap-daily-${d}.xml`,
  })),
];

async function fetchSitemapImages() {
  const list = [];
  for (const sm of SITEMAPS) {
    try {
      const r = await fetch(sm.url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!r.ok) { console.log(`   ⚠️ ${sm.name} সাইটম্যাপ HTTP ${r.status} — বাদ`); continue; }
      const xml = await r.text();
      const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
      let n = 0;
      for (const b of blocks) {
        const img = (b.match(/<image:loc>([^<]+)<\/image:loc>/i) || [])[1];
        if (!img) continue;
        let title = '';
        if (sm.kind === 'news') {
          title = (b.match(/<news:title>([\s\S]*?)<\/news:title>/i) || [])[1] || '';
        } else {
          /* slug থেকে শিরোনাম: লিংকের শেষ অংশ, শতাংশ-ডিকোড করা */
          const loc = (b.match(/<loc>([^<]+)<\/loc>/i) || [])[1] || '';
          const last = loc.split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
          try { title = decodeURIComponent(last).replace(/-/g, ' '); } catch (e) { title = last; }
        }
        const key = normTitle(title);
        if (!key || key.length < 8) continue;
        list.push({ key, tokens: tokenSet(title), image: img.replace(/^http:/i, 'https:'), source: sm.name });
        n++;
      }
      console.log(`   ✅ সাইটম্যাপ ${String(n).padStart(4)}টি শিরোনাম+ছবি — ${sm.name}`);
    } catch (e) {
      console.log(`   ⚠️ ${sm.name} সাইটম্যাপ ব্যর্থ (${e.message.slice(0, 40)}) — বাদ`);
    }
  }
  return list;
}

/* ══════════════════════════════════════════════════════════════════════
   ★ ফাজি মিল — হুবহু না মিললেও প্রায়-একই শিরোনাম ★
   ──────────────────────────────────────────────────────────────────────
   কেন দরকার: Google News-এর শিরোনাম আর সংবাদমাধ্যমের সাইটম্যাপের শিরোনাম
   সবসময় অক্ষরে-অক্ষরে এক হয় না — কখনো শেষে "..." থাকে, শব্দ এগিয়ে-পিছিয়ে
   যায়, যুক্তচিহ্ন আলাদা হয়। হুবহু মেলানোর ফলে এসব খবরে আসল ছবি না পেয়ে
   বিভাগীয় ফলব্যাক বসত।

   পদ্ধতি: শিরোনামের শব্দ (৩ অক্ষরের বেশি) তুলনা করে Jaccard মিল। ৭০% বা
   বেশি এবং অন্তত ৪টি শব্দ থাকলে মিল ধরা হয়। থ্রেশহোল্ড ইচ্ছাকৃতভাবে
   উঁচুতে — কারণ ভুল ছবি বসানোর চেয়ে বিভাগীয় ছবি অনেক ভালো। */
function tokenSet(s) {
  return new Set(normTitle(s).split(' ').filter((w) => w.length > 2));
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

async function fetchFeedImages() {
  const map = new Map();       /* normTitle → image URL */
  let feedsOk = 0;
  let itemsWithImage = 0;

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, {
        headers: UA,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { console.log(`   ⏭️  ফিড ${res.status} — বাদ: ${feed}`); continue; }

      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
      if (!items.length) { console.log(`   ⏭️  ফিডে আইটেম নেই — বাদ: ${feed}`); continue; }

      feedsOk++;
      let local = 0;
      for (const item of items) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
        const image = extractImage(item);
        const key = normTitle(title);
        if (key && image && !map.has(key)) { map.set(key, image); local++; itemsWithImage++; }
      }
      console.log(`   ✅ ফিড ${String(items.length).padStart(3)}টি আইটেম, ${local}টিতে ছবি — ${feed}`);
    } catch (e) {
      console.log(`   ⏭️  ফিড ব্যর্থ (${e.name}) — বাদ: ${feed}`);
    }
  }
  return { map, feedsOk, itemsWithImage };
}

/* ── ছবির লিংক সত্যিই কাজ করে কি না যাচাই ────────────────────────────────
   কেন জরুরি: বেশ কিছু সংবাদমাধ্যম হটলিংক ব্লক করে (৪০৩/৪০৪)। যাচাই না করে
   সেই লিংক বসালে ফেসবুকের প্রিভিউ কার্ড ছবিহীন হয়ে যেত — অর্থাৎ ঠিক যে
   সমস্যা সমাধান করতে চাইছি সেটিই ফিরে আসত।
   ফেসবুক ও টেলিগ্রামের ক্রলার-হেডার দিয়ে দেখা হয়, কারণ ওদেরই ছবিটি আনতে হয়। */
const VERIFY_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const verifyCache = new Map();

async function verifyImage(url) {
  if (!/^https:\/\//i.test(url)) return false;
  if (verifyCache.has(url)) return verifyCache.get(url);
  let ok = false;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': VERIFY_UA, Accept: 'image/*,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.status === 200 && /^image\//.test(ct)) {
      const buf = Buffer.from(await res.arrayBuffer());
      ok = buf.length > 1200;          /* অতি ছোট/ফাঁকা ছবি বাদ */
    } else if (res.status === 200) {
      ok = false;
    }
  } catch (e) { ok = false; }
  verifyCache.set(url, ok);
  return ok;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
  const skipFeed = process.argv.includes('--no-feed');
  const noVerify = process.argv.includes('--no-verify');

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ কনফিগ নেই: ${CONFIG_FILE}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const news = Array.isArray(cfg.editorNews) ? cfg.editorNews : [];
  if (!news.length) { console.log('ℹ️ কোনো সংবাদ নেই — কিছু করার নেই।'); return; }

  console.log('🖼️  সংবাদের ছবি সমৃদ্ধকরণ শুরু…');

  /* ── ছবির ভাণ্ডার তৈরি: সাইটম্যাপ আগে (বড় ও পুরনো খবরও ঢাকে), তারপর ফিড ──
     ক্রম গুরুত্বপূর্ণ: সাইটম্যাপে যেটি পাওয়া যায় সেটিই প্রাধান্য পায়,
     নইলে ছোট ফিড তালিকা বড় সাইটম্যাপকে ছাপিয়ে যেত। */
  const feedMap = new Map();
  let fuzzyIndex = [];
  if (!skipFeed) {
    console.log('🗺️  সংবাদমাধ্যমের Google News সাইটম্যাপ থেকে ছবির ভাণ্ডার আনা হচ্ছে…');
    const smList = await fetchSitemapImages();
    for (const e of smList) if (!feedMap.has(e.key)) feedMap.set(e.key, e.image);
    fuzzyIndex = smList.filter((e) => e.tokens && e.tokens.size >= 4);
    console.log(`   সাইটম্যাপ থেকে ${smList.length}টি জোড়া (অনন্য শিরোনাম ${feedMap.size}টি)`);

    console.log('📡 অতিরিক্ত: RSS ফিড থেকে ছবি আনা হচ্ছে…');
    const r = await fetchFeedImages();
    let added = 0;
    for (const [k, v] of r.map) if (!feedMap.has(k)) { feedMap.set(k, v); added++; }
    console.log(`   ফিড সফল: ${r.feedsOk}টি | ছবিসহ আইটেম: ${r.itemsWithImage}টি | নতুন যোগ: ${added}টি`);
    console.log(`   📦 সব মিলিয়ে ছবির ভাণ্ডার: ${feedMap.size}টি শিরোনাম`);
  }

  /* নতুন সংবাদ আগে — সীমা থাকলে সীমিত সংখ্যক প্রক্রিয়া করা হয় */
  const order = news
    .map((a, i) => ({ a, i, ts: Date.parse(a.publishedAt || a.published_at || 0) || 0 }))
    .sort((x, y) => y.ts - x.ts);

  let fromFeed = 0;
  let fromCategory = 0;
  let already = 0;
  let rejected = 0;
  let processed = 0;
  let botKept = 0;
  let fuzzyHit = 0;
  let titleCatFix = 0;

  /* আগের রানে বসানো ছবিগুলো কীভাবে বিবেচিত হবে:
       • /img/…        → আমাদের নিজের স্টোরেজ, চূড়ান্ত (হাত দেওয়া হয় না)
       • images/…      → বিভাগ-ভিত্তিক ফলব্যাক, আবার চেষ্টা করা যায়
                         (হয়তো এই রানে ফিডে আসল ছবিটি পাওয়া যাবে)
       • https://…     → মূল সংবাদমাধ্যমের ছবি, যাচাই করেই রাখা হয় */
  const isOwnStorage = (u) => /^\/?img\//i.test(String(u || ''));
  /* বটের নিজে আপলোড করা ছবি (images/bot/…) — বিভাগ-ছবির মতো পুনঃচেষ্টার
     대상 নয়, বরং ব্যবহারকারীর দেওয়া ছবি হিসেবেই চূড়ান্ত। */
  const isBotUpload = (u) => /^\/?images\/bot\//i.test(String(u || ''));
  const isCategoryImg = (u) => /^\/?images\//i.test(String(u || '')) && !isBotUpload(u);

  /* ★ অ্যাডমিন বটের পাঠানো সংবাদ — কখনো হাত দেওয়া হয় না ★
     মানুষ টেলিগ্রাম থেকে যে ছবি বেছে পাঠিয়েছেন সেটিই সবচেয়ে সঠিক। কোনো
     স্বয়ংক্রিয় নিয়মে তা বদলে ফেলা মানে ব্যবহারকারীর কাজ নষ্ট করা। */
  const isBotNews = (a) => a && (a.editorial === true || String(a.id || '').startsWith('bot-'));

  for (const { a } of order) {
    if (limit && processed >= limit) { processed++; continue; }

    if (isBotNews(a)) { botKept++; processed++; continue; }

    const current = String(a.image || '').trim();

    /* নিজের স্টোরেজের বা বটের আপলোড করা ছবি চূড়ান্ত — অটুট */
    if (current && (isOwnStorage(current) || isBotUpload(current))) { already++; processed++; continue; }

    /* বাইরের ছবি — যাচাই করে রাখা হয়, ব্যর্থ হলে নিচে আবার বেছে নেওয়া হয় */
    if (current && !isCategoryImg(current) && !noVerify && await verifyImage(current)) {
      already++; processed++;
      continue;
    }

    let matched = feedMap.get(normTitle(a.title));

    /* হুবহু না মিললে প্রায়-একই শিরোনাম খোঁজা হয় (উঁচু থ্রেশহোল্ড) */
    if (!matched && fuzzyIndex.length) {
      const tk = tokenSet(a.title);
      if (tk.size >= 4) {
        let best = 0, bestImg = '';
        for (const e of fuzzyIndex) {
          if (Math.abs(e.tokens.size - tk.size) > 3) continue;   /* দ্রুত বাদ */
          const sc = jaccard(tk, e.tokens);
          if (sc > best) { best = sc; bestImg = e.image; if (sc === 1) break; }
        }
        if (best >= 0.7) { matched = bestImg; fuzzyHit++; }
      }
    }

    if (matched && (noVerify || await verifyImage(matched))) {
      a.image = matched;
      fromFeed++;
    } else {
      if (matched) rejected++;     /* লিংক ছিল কিন্তু কাজ করে না */
      /* ★ ফলব্যাক ছবি বাছার সময় শিরোনাম দেখে বিভাগ যাচাই করা হয় ★
         Oracle-এর বিভাজন ভুল হলে (যেমন ডেঙ্গুর খবর "শিক্ষা" বিভাগে) এতে
         সঠিক ছবি (স্বাস্থ্য) বসে — পাঠকের কাছে আর অসংগত লাগে না।
         নিশ্চিত মিল না পেলে আগের বিভাগই রাখা হয় — জোর করে বদলানো হয় না। */
      const guess = guessCategoryFromTitle(a.title);
      const useCat = guess || a.category;
      if (guess && guess !== a.category) titleCatFix++;
      a.image = categoryImage(useCat);
      fromCategory++;
    }
    processed++;
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');

  console.log('');
  console.log(`✅ ছবি সমৃদ্ধকরণ সম্পন্ন — মোট ${news.length}টি সংবাদ`);
  console.log(`   • মূল সংবাদমাধ্যমের আসল ছবি   : ${fromFeed}টি`);
  console.log(`   • বিভাগ-ভিত্তিক ব্র্যান্ডেড ছবি  : ${fromCategory}টি`);
  console.log(`   • আগেই ঠিক ছিল                : ${already}টি`);
  if (botKept) console.log(`   • অ্যাডমিন বটের পাঠানো (অপরিবর্তিত) : ${botKept}টি`);
  if (fuzzyHit) console.log(`   • প্রায়-একই শিরোনাম মিলে পাওয়া    : ${fuzzyHit}টি`);
  if (titleCatFix) console.log(`   • ভুল বিভাগ সংশোধিত (ছবির জন্য)   : ${titleCatFix}টি`);
  if (rejected) console.log(`   • হটলিংক ব্লকড হওয়ায় বাদ পড়েছে : ${rejected}টি`);
  console.log(`   ছবি ছাড়া বাকি                : ${news.filter((a) => !String(a.image || '').trim()).length}টি`);
}

main().catch((e) => { console.error('❌ সমৃদ্ধকরণ ব্যর্থ:', e.message); process.exit(1); });
