#!/usr/bin/env node
'use strict';
/**
 * BNE — Oracle → রেপো কনটেন্ট সিঙ্ক
 * ════════════════════════════════════════════════════════════════════
 * কেন দরকার: সাইটের সব পৃষ্ঠা GitHub-এর data/bne-config.json থেকে
 * ডেটা পড়ে (settings.remoteConfigUrl)। অ্যাডমিন প্যানেল বা স্বয়ংক্রিয়
 * সংগ্রহ যত সংবাদই তৈরি করুক — সেগুলো কেবল Oracle ডেটাবেজে থাকে।
 * সিঙ্ক না হলে লাইভ সাইটে সেই সংবাদ পৌঁছায় না এবং ফেসবুকের প্রিভিউ
 * কার্ডে "সংবাদ পাওয়া যায়নি" দেখায় (ঠিক এই কারণেই হয়েছিল)।
 *
 * এই স্ক্রিপ্ট Oracle-এর পাবলিক /api/config থেকে কনটেন্ট এনে স্থানীয়
 * কনফিগে মেলায়, তারপর Netlify বিল্ড স্বয়ংক্রিয়ভাবে OG ফাংশনের ডেটাও
 * হালনাগাদ করে।
 *
 * ⚠️ স্থানীয় settings (remoteConfigUrl, siteName, adminPath) কখনো
 *    মুছে ফেলা হয় না — কেবল editorNews ও ads প্রতিস্থাপিত হয়।
 *    নইলে সাইট নিজেই নিজের কনফিগ খুঁজে পেত না।
 *
 * ব্যবহার:  node tools/sync-from-oracle.js
 * (netlify.toml-এর build.command এটিকে স্বয়ংক্রিয়ভাবে চালায় না —
 *  বরং .github/workflows/sync-content.yml নির্দিষ্ট সময়ে চালায়)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'bne-config.json');
const ORACLE = (process.env.ORACLE_ORIGIN || 'https://bne.147-224-13-31.nip.io').replace(/\/+$/, '');

/* ══════════════════════════════════════════════════════════════════════════
   ★ সম্পাদকীয় সংবাদ — অ্যাডমিন বট যেগুলো লেখে ★
   ──────────────────────────────────────────────────────────────────────────
   কেন আলাদা ফাইল দরকার (খুব জরুরি):
     এই সিঙ্ক প্রতিবার Oracle-এর editorNews দিয়ে স্থানীয় কনফিগ **সম্পূর্ণ
     প্রতিস্থাপন** করে (নিচে দেখুন — `editorNews: mergedNews`)। তাই অ্যাডমিন
     বট যদি সরাসরি data/bne-config.json-এ সংবাদ লিখত, তবে পরের সিঙ্কেই
     সেটি মুছে যেত — অর্থাৎ টেলিগ্রাম থেকে পাঠানো খবর কয়েক মিনিট পরেই
     গায়েব হয়ে যেত।

     তাই বটের লেখা সংবাদ আলাদা ফাইলে রাখা হয় এবং প্রতিটি সিঙ্কে সেগুলো
     Oracle-এর কনটেন্টের **সামনে** জুড়ে দেওয়া হয়। ফলে বটের পাঠানো খবর
     স্থায়ীভাবে থাকে, আর অটো-সংগৃহীত খবরও ঠিক থাকে।

   ছবির ক্ষেত্রেও হুবহু একই কৌশল ব্যবহার করা হয়েছে
   (data/article-images.json) — কারণ সেটিও প্রতি সিঙ্কে হারিয়ে যেত।
   ══════════════════════════════════════════════════════════════════════════ */
const EDITORIAL_FILE = path.join(ROOT, 'data', 'editorial-news.json');

function loadEditorial() {
  try {
    const d = JSON.parse(fs.readFileSync(EDITORIAL_FILE, 'utf8'));
    return {
      news: Array.isArray(d.news) ? d.news.filter((n) => n && n.title && n.slug) : [],
      ads: Array.isArray(d.ads) ? d.ads.filter((a) => a && (a.title || a.body)) : [],
      /* adOverrides — বিদ্যমান বিজ্ঞাপন বদলানো/বন্ধ করা/মোছার জন্য */
      adOverrides: (d.adOverrides && typeof d.adOverrides === 'object') ? d.adOverrides : {},
    };
  } catch (e) {
    return { news: [], ads: [], adOverrides: {} };   /* ফাইল না থাকলে সমস্যা নেই */
  }
}

/* ── বিজ্ঞাপনের স্থায়ী পরিচয় ───────────────────────────────────────────
   mergeUnique যে চাবি ব্যবহার করে ঠিক সেই একই চাবি এখানে ব্যবহার করা হয়,
   নইলে override কোনোদিন মিলত না। */
function adKey(a) {
  return String((a && (a.slug || a.id || a.title)) || '').trim();
}

/* ── adOverrides প্রয়োগ ───────────────────────────────────────────────
   ★ কেন দরকার ★
   সাইটের বিজ্ঞাপনগুলো Oracle থেকে আসে এবং প্রতি সিঙ্কে নতুন করে লেখা হয়।
   তাই অ্যাডমিন বট থেকে সরাসরি কোনো বিজ্ঞাপন বদলালে কয়েক মিনিটের মধ্যেই
   সেটি হারিয়ে যেত।

   সমাধান: বদলগুলো আলাদা করে `adOverrides`-এ রাখা হয় (চাবি = বিজ্ঞাপনের
   অপরিবর্তিত পরিচয়), আর প্রতিটি সিঙ্কে সেগুলো নতুন করে বসিয়ে দেওয়া হয়।
   ফলে সিঙ্ক যতবারই চলে, সম্পাদকের করা পরিবর্তন অটুট থাকে।

   সমর্থিত override:
     { enabled: false }                 → বিজ্ঞাপন বন্ধ
     { _deleted: true }                 → তালিকা থেকে বাদ
     { title, image, link, slot, type } → যেকোনো ঘর বদলানো */
function applyAdOverrides(ads, overrides) {
  const keys = Object.keys(overrides || {});
  if (!keys.length) return { ads, changed: 0 };

  let changed = 0;
  const out = [];
  for (const ad of ads) {
    const ov = overrides[adKey(ad)];
    if (!ov) { out.push(ad); continue; }
    if (ov._deleted) { changed++; continue; }         /* তালিকা থেকে বাদ */
    /* override-এর ঘরগুলো বিজ্ঞাপনের উপরে বসানো হয় (বাকি সব অটুট) */
    const merged = Object.assign({}, ad);
    for (const k of Object.keys(ov)) {
      if (k === '_deleted') continue;
      merged[k] = ov[k];
    }
    /* বদল হয়েছে কি না — অকারণ কমিট এড়াতে তুলনা করা হয় */
    if (JSON.stringify(merged) !== JSON.stringify(ad)) changed++;
    out.push(merged);
  }
  return { ads: out, changed };
}

/* slug অনুযায়ী ডিডুপ — সম্পাদকীয় সংবাদই জেতে (মানুষ যা লিখেছে তা সবার আগে) */
function mergeUnique(editorial, remote) {
  const seen = new Set();
  const out = [];
  for (const item of [...editorial, ...remote]) {
    const key = String(item.slug || item.id || item.title || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ স্থানীয় কনফিগ নেই: ${FILE}`);
    process.exit(1);
  }
  const local = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  let remote;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${ORACLE}/api/config`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    remote = await res.json();
  } catch (e) {
    // নেটওয়ার্ক ব্যর্থ হলে স্থানীয় কনফিগ অটুট রাখা হয় — সাইট কখনো ভাঙে না
    console.error(`⚠️ Oracle থেকে আনা যায়নি (${e.message}) — স্থানীয় কনফিগ অপরিবর্তিত রাখা হলো।`);
    process.exit(0);
  }

  /* ══════════════════════════════════════════════════════════════════════
     ★ আবর্জনা শিরোনাম ছেঁকে ফেলা ★
     ──────────────────────────────────────────────────────────────────────
     লাইভ যাচাইয়ে পাওয়া গেছে — Oracle-এর সংগ্রহে কিছু "সংবাদ" আসলে সংবাদই
     নয়, বরং লেখকের পরিচিতি বা ফিডের টেমপ্লেট। যেমন:

        "অজয় দাশগুপ্ত Writer related all news"
        "সৌরভ হোসেন সিয়াম, নারায়ণগঞ্জ প্রতিনিধি Writer related all news"

     এগুলো সাইটে গেলে পাঠক বিভ্রান্ত হন এবং ব্র্যান্ডের বিশ্বাসযোগ্যতা নষ্ট
     হয়। তাই ভাণ্ডারে ঢোকার আগেই সরিয়ে ফেলা হয়।

     ⚠️ সতর্কতা: ছাঁকনিটি ইচ্ছাকৃতভাবে সংকীর্ণ রাখা হয়েছে যাতে সত্যিকারের
     কোনো খবর ভুলে বাদ না পড়ে। কেবল স্পষ্ট টেমপ্লেট-লেখা ও খালি শিরোনাম
     বাদ যায় — নইলে আসল সংবাদ হারানোর ঝুঁকি থেকে যায়। */
  const JUNK_TITLE = [
    /writer\s*related/i,
    /related\s*all\s*news/i,
    /^\s*[^।!?]{0,70}(প্রতিনিধি|স্টাফ রিপোর্টার|সংবাদদাতা)\s*$/,
    /^\s*(সংবাদ|নিউজ|খবর|ব্রেকিং)\s*$/,
  ];
  const isJunkTitle = (t) => {
    const s2 = String(t || '').trim();
    if (s2.length < 8) return true;
    return JUNK_TITLE.some((re) => re.test(s2));
  };

  const rawRemoteNews = Array.isArray(remote.editorNews) ? remote.editorNews : [];
  const remoteNews = rawRemoteNews.filter((a) => a && !isJunkTitle(a.title));
  const junkDropped = rawRemoteNews.length - remoteNews.length;

  const remoteAds = Array.isArray(remote.ads) ? remote.ads : [];
  if (junkDropped > 0) console.log(`🧹 আবর্জনা শিরোনাম বাদ দেওয়া হলো: ${junkDropped}টি`);

  /* অ্যাডমিন বটের পাঠানো সংবাদ/বিজ্ঞাপন — Oracle-এর কনটেন্টের সামনে জুড়ে দেওয়া হয় */
  const editorial = loadEditorial();
  const mergedNews = mergeUnique(editorial.news, remoteNews);
  const mergedAdsRaw = mergeUnique(editorial.ads, remoteAds);

  /* সম্পাদকের করা বিজ্ঞাপন-পরিবর্তন (বন্ধ/মুছে ফেলা/বদলানো) বসানো হয় */
  const ovApplied = applyAdOverrides(mergedAdsRaw, editorial.adOverrides);
  const mergedAds = ovApplied.ads;

  if (editorial.news.length || editorial.ads.length || Object.keys(editorial.adOverrides).length) {
    console.log(`🤖 অ্যাডমিন বটের কনটেন্ট: সংবাদ ${editorial.news.length}টি, বিজ্ঞাপন ${editorial.ads.length}টি` +
      (Object.keys(editorial.adOverrides).length ? `, বিজ্ঞাপন-পরিবর্তন ${Object.keys(editorial.adOverrides).length}টি` : '') +
      ` — Oracle-এর সাথে মেলানো হলো।`);
  }

  /* কেবল কনটেন্ট বদলেছে কি না — নইলে অকারণ কমিট হবে না */
  const sameNews = JSON.stringify(local.editorNews || []) === JSON.stringify(mergedNews);
  const sameAds = JSON.stringify(local.ads || []) === JSON.stringify(mergedAds);
  if (sameNews && sameAds) {
    console.log(`✅ পরিবর্তন নেই — ${mergedNews.length}টি সংবাদ ইতিমধ্যে সমন্বিত।`);
    process.exit(0);
  }

  /* স্থানীয় settings রক্ষা করে কনটেন্ট প্রতিস্থাপন */
  const settings = { ...(local.settings || {}) };
  const rs = remote.settings || {};
  if (rs.siteName) settings.siteName = rs.siteName;
  if (rs.adsense_publisher_id) settings.adsensePublisherId = rs.adsense_publisher_id;
  if (rs.ga4_measurement_id) settings.ga4MeasurementId = rs.ga4_measurement_id;

  const merged = {
    version: (Number(local.version) || 0) + 1,
    updatedAt: new Date().toISOString(),
    syncedFrom: ORACLE,
    settings,
    editorNews: mergedNews,
    ads: mergedAds,
  };

  fs.writeFileSync(FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`✅ সিঙ্ক সম্পন্ন — সংবাদ ${(local.editorNews || []).length} → ${mergedNews.length}` +
    ` | বিজ্ঞাপন ${(local.ads || []).length} → ${mergedAds.length}`);
  for (const a of mergedNews.slice(0, 8)) {
    const tag = a.editorial ? '✍️ ' : '';
    console.log(`   • ${tag}[${a.category || '—'}] ${String(a.title || '').slice(0, 52)}`);
  }
}

main().catch((e) => { console.error('❌ সিঙ্ক ব্যর্থ:', e.message); process.exit(1); });
