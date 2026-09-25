'use strict';
/**
 * BNE — সার্ভার-সাইড বটের মূল লাইব্রেরি
 * ════════════════════════════════════════════════════════════════════════
 * কেন আলাদা করে লেখা হলো (ল্যাপটপের bot.js-এর বদলে)
 * ---------------------------------------------------------------------------
 * ব্যবহারকারীর আপত্তি ছিল স্পষ্ট: "আমার ল্যাপটপ বন্ধ থাকলেও যেন শুধু বটকে
 * ইন্টারনেটে মেসেজ দিলেই কাজ করে"। আগে বট চলত ল্যাপটপে (launchd) এবং
 * টেলিগ্রামের long polling ব্যবহার করত — ল্যাপটপ বন্ধ হলে বট সম্পূর্ণ বন্ধ।
 *
 * এখন এই কোডটি Netlify Functions-এ চলে — অর্থাৎ Netlify-এর সার্ভারে, সবসময়
 * চালু। পড়ার জন্য কোনো টোকেনও লাগে না: রেপোটি সর্বজনীন (PUBLIC), তাই
 * raw.githubusercontent.com থেকে সরাসরি সর্বশেষ ডেটা আনা হয়।
 *
 * ⚠️ Netlify Functions নিজের ফোল্ডারের বাইরের ফাইল পড়তে পারে না, তাই
 *    ল্যাপটপের insights.js / assistant.js এখানে পোর্ট করা হয়েছে। দুটো
 *    আলাদা কোডবেস হয়ে যাওয়া এড়াতে ভবিষ্যতে একটি জায়গায় রাখা উচিত —
 *    এখন সার্ভারেরটাই প্রধান, কারণ এটিই সবসময় চলে।
 */

const CACHE = new Map();          /* URL → { at, data }  (ফাংশন গরম থাকলে দ্রুত) */
const CACHE_TTL = 60 * 1000;      /* ১ মিনিট — এর মধ্যে আবার আনতে হয় না */

const REPO = process.env.BOT_REPO || 'oumaboy93-alt/bangla-news-edition';
const BRANCH = process.env.BOT_BRANCH || 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://bangla-news-edition-bd.netlify.app').replace(/\/+$/, '');

/** রিমোট JSON আনা — এক মিনিট ক্যাশে রাখা হয় (Telegram-এ দ্রুত উত্তর দিতে) */
async function fetchJson(url, ttl = CACHE_TTL) {
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'BNE-Bot/2.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    CACHE.set(url, { at: Date.now(), data });
    return data;
  } catch (e) {
    /* ব্যর্থ হলে পুরনো ক্যাশে থাকলে সেটিই ব্যবহার করা হয় — বট চুপ করে যায় না */
    if (hit) return hit.data;
    throw e;
  }
}

const CFG_URL = `${RAW}/data/bne-config.json`;
const ED_URL = `${RAW}/data/editorial-news.json`;
const POSTED_URL = `${RAW}/last_posted.json`;

/** সাইটের বর্তমান কনটেন্ট + বটের নিজের লেখা + বিজ্ঞাপন */
async function loadSite() {
  const [conf, ed] = await Promise.all([
    fetchJson(CFG_URL).catch(() => ({ editorNews: [], ads: [] })),
    fetchJson(ED_URL).catch(() => ({ news: [], ads: [], adOverrides: {} })),
  ]);
  return buildSite(conf, ed);
}

function buildSite(conf, ed) {
  const norm = (a) => Object.assign({}, a, {
    ts: a.ts || (a.publishedAt && !isNaN(Date.parse(a.publishedAt)) ? Date.parse(a.publishedAt) : 0),
  });
  const bySlug = new Map();
  (conf.editorNews || []).forEach((a) => { if (a && a.slug) bySlug.set(a.slug, norm(a)); });
  (ed.news || []).forEach((a) => { if (a && a.slug) bySlug.set(a.slug, norm(a)); });   /* সম্পাদকের লেখা জেতে */

  const adKeyOf = (a) => String((a && (a.slug || a.id || a.title)) || '').trim();
  const ov = (ed.adOverrides && typeof ed.adOverrides === 'object') ? ed.adOverrides : {};

  const rawAds = (ed.ads || []).map((a) => Object.assign({ _from: 'editorial' }, a))
    .concat((conf.ads || []).map((a) => Object.assign({ _from: 'config' }, a)));

  const ads = [], seen = new Set();
  for (const a of rawAds) {
    const k = adKeyOf(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const patch = ov[k];
    if (patch && patch._deleted) continue;
    ads.push(Object.assign({ _key: k }, a, patch || {}));
  }

  return { news: Array.from(bySlug.values()), ads, adOverrides: ov };
}

/* ── হেডলাইন ───────────────────────────────────────────────────────────
   সাইটের app.js যেভাবে বাছাই করে হুবহু সেভাবেই — nonEditorial, ৭২ ঘণ্টার
   মধ্যে, গুরুত্ব অনুযায়ী সাজিয়ে প্রথম ৪টি। (core.js-এর breakingScore-এর
   সরল সংস্করণ: বিভাগের গুরুত্ব + তাজাত্ব + সূত্রের ভার।) */
const CAT_WEIGHT = { 'ব্রেকিং': 1.6, 'জাতীয়': 1.35, 'আন্তর্জাতিক': 1.25, 'রাজনীতি': 1.2, 'খেলা': 1.1, 'বিনোদন': 0.95, 'প্রবাস': 1.0, 'অর্থনীতি': 1.05, 'প্রযুক্তি': 0.95, 'স্বাস্থ্য': 0.95 };

function breakingScore(a, now) {
  const ts = a.ts || 0;
  if (!ts) return 0;
  const hours = (now - ts) / 3600000;
  if (hours < 0 || hours > 72) return 0;
  const recency = Math.exp(-hours / 12);
  const cat = CAT_WEIGHT[a.category] || 1;
  return Math.round(recency * cat * 10000) / 10000;
}

function currentHeadlines(site, topN, now) {
  now = now || Date.now();
  const list = site.news.filter((a) => !a.editorial && a.ts && (now - a.ts) < 72 * 3600 * 1000);
  list.sort((a, b) => breakingScore(b, now) - breakingScore(a, now));
  return list.slice(0, topN).map((a) => ({
    title: a.title, slug: a.slug, category: a.category,
    ageMin: Math.round((now - a.ts) / 60000),
    url: `${SITE_ORIGIN}/news/${encodeURIComponent(a.slug)}`,
  }));
}

function byHour(site, hours, now) {
  now = now || Date.now();
  const out = [];
  for (let h = 0; h < hours; h++) {
    const hi = now - h * 3600 * 1000;
    const lo = hi - 3600 * 1000;
    const items = site.news
      .filter((a) => a.ts && a.ts > lo && a.ts <= hi)
      .sort((a, b) => b.ts - a.ts)
      .map((a) => ({ title: a.title, category: a.category }));
    out.push({ hour: h, label: h === 0 ? 'গত ১ ঘণ্টা' : `${h}–${h + 1} ঘণ্টা আগে`, items });
  }
  return out;
}

const AD_SLOT_LABEL = {
  home_top: 'হোমপেজ — উপর', home_middle: 'হোমপেজ — মাঝ',
  article_bottom: 'সংবাদের পাতায় — নিচ', article_sidebar: 'সংবাদের পাতায় — পাশ',
  probashi_hub: 'প্রবাসী বিভাগ — প্রধান', probashi_top: 'প্রবাসী বিভাগ — উপর',
};

function adList(site) {
  return site.ads.map((a, i) => ({
    index: i,
    key: a._key,
    edited: !!(site.adOverrides && site.adOverrides[a._key]),
    title: a.title || '(শিরোনাম নেই)',
    slot: a.slot || '', slotLabel: AD_SLOT_LABEL[a.slot] || a.slot || '—',
    enabled: a.enabled !== false,
    type: a.type || 'image',
    image: a.image || '', link: a.link || '',
    live: a.enabled !== false && (a.type === 'html' ? !!a.link : !!a.image),
  }));
}

async function postStatus() {
  const d = await fetchJson(POSTED_URL).catch(() => ({ posted: [] }));
  const all = (d.posted || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const pick = (ch) => all.find((p) => Array.isArray(p.channels) && p.channels.includes(ch)) || null;
  const fmt = (p) => (p ? {
    title: p.title, ts: p.ts, url: p.url || p.link,
    ageMin: Math.round((Date.now() - (p.ts || 0)) / 60000), channels: p.channels || [],
  } : null);
  return {
    total: all.length,
    lastAny: fmt(all[0] || null),
    lastTelegram: fmt(pick('telegram')),
    lastFacebook: fmt(pick('facebook')),
    channelsTracked: all.some((p) => Array.isArray(p.channels)),
  };
}

/* ── দৈনিক বিশ্লেষণ (ল্যাপটপ সংস্করণের অনুরূপ) ───────────────────────── */
async function dailyReport() {
  const site = await loadSite();
  const now = Date.now();
  const news = site.news;
  const since = now - 24 * 3600 * 1000;
  const last24 = news.filter((a) => a.ts && a.ts >= since);
  const prev24 = news.filter((a) => a.ts && a.ts >= since - 24 * 3600 * 1000 && a.ts < since);

  const byClock = new Array(24).fill(0);
  last24.forEach((a) => { byClock[new Date(a.ts).getHours()]++; });

  const catCount = {};
  last24.forEach((a) => { catCount[a.category || 'অন্যান্য'] = (catCount[a.category || 'অন্যান্য'] || 0) + 1; });
  const cats = Object.entries(catCount).sort((a, b) => b[1] - a[1]);

  const withImg = last24.filter((a) => String(a.image || '').trim()).length;
  const ps = await postStatus();
  const posted24 = (ps.lastAny ? 1 : 0);

  const ads = adList(site);
  const adsOff = ads.filter((a) => !a.enabled);
  const adsBroken = ads.filter((a) => a.enabled && !a.live);

  const recs = [];
  const offPeak = byClock.slice(1, 6).reduce((s, n) => s + n, 0);
  const peak = byClock.slice(8, 12).reduce((s, n) => s + n, 0) + byClock.slice(19, 23).reduce((s, n) => s + n, 0);
  if (last24.length >= 20 && offPeak > peak) {
    recs.push({ id: 'publish_window', impact: 'মাঝারি',
      text: 'খবরের ঢল গভীর রাতে বেশি — পাঠক-সক্রিয় সময় (সকাল ৮–১১টা, সন্ধ্যা ৭–রাত ১১টা) পোস্টে জোর দিলে রিচ বাড়ে।' });
  }
  if (last24.length && withImg / last24.length < 0.8) {
    recs.push({ id: 'image_ratio', impact: 'মাঝারি',
      text: `আজকের খবরের ${Math.round((withImg / last24.length) * 100)}%-এ ছবি আছে। সব খবরে ছবি নিশ্চিত করা ভালো।` });
  }
  if (cats.length && cats[0][1] / Math.max(1, last24.length) > 0.45) {
    recs.push({ id: 'category_mix', impact: 'মাঝারি',
      text: `আজ প্রায় অর্ধেক খবর "${cats[0][0]}" বিভাগের — বৈচিত্র্য আনলে পাঠক বেশি সময় থাকেন।` });
  }
  if (adsOff.length) {
    recs.push({ id: 'ads_off', impact: 'মাঝারি',
      text: `${adsOff.length}টি বিজ্ঞাপন বন্ধ অবস্থায় আছে — চালু না করলে ওই জায়গাগুলো ফাঁকা থাকে ও আয় হারায়।` });
  }
  if (adsBroken.length) {
    recs.push({ id: 'ads_broken', impact: 'উচ্চ',
      text: `${adsBroken.length}টি বিজ্ঞাপন "চালু" দেখাচ্ছে কিন্তু সাইটে ঠিকভাবে বসছে না (ছবি বা লিংক নেই)।` });
  }
  if (prev24.length && ((last24.length - prev24.length) / Math.max(1, prev24.length)) <= -0.25) {
    recs.push({ id: 'inflow_drop', impact: 'উচ্চ',
      text: `খবরের ঢল ${Math.abs(Math.round(((last24.length - prev24.length) / Math.max(1, prev24.length)) * 100))}% কমেছে (${prev24.length} → ${last24.length})।` });
  }
  if (!ps.lastAny || (Date.now() - (ps.lastAny.ts || 0)) > 3 * 3600 * 1000) {
    recs.push({ id: 'no_posts', impact: 'উচ্চ',
      text: '৩ ঘণ্টার বেশি সময় ধরে চ্যানেল/পেজে কিছু পোস্ট হয়নি — নিয়মিত পোস্ট না হলে পেজের রিচ পড়ে যায়।' });
  }

  return {
    totals: { articles: news.length, last24h: last24.length, prev24h: prev24.length, withImage: withImg },
    categories: cats.slice(0, 6),
    busiestHours: byClock.map((n, h) => ({ n, h })).sort((a, b) => b.n - a.n).slice(0, 3)
      .filter((x) => x.n > 0).map((x) => `${String(x.h).padStart(2, '0')}:০০`),
    posting: { last24h: posted24, lastFacebook: ps.lastFacebook, lastTelegram: ps.lastTelegram, total: ps.total },
    ads: { total: ads.length, off: adsOff.length, broken: adsBroken.length },
    recommendations: recs,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   উদ্দেশ্য বোঝা (ল্যাপটপ assistant.js-এর সারসংক্ষেপ)
   ══════════════════════════════════════════════════════════════════════ */
function normalize(s) {
  let t = String(s || '');
  if (typeof t.normalize === 'function') t = t.normalize('NFC');   /* বাংলা যুক্তাক্ষরের রূপ-ভেদ এড়াতে */
  return t.toLowerCase()
    .replace(/[।,?!;:"'`’‘“”\-–—()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const KW = {
  headlines: ['হেডলাইন', 'হেড লাইন', 'শিরোনাম', 'কার্সেল', 'টপ নিউজ', 'উপরের খবর', 'প্রধান খবর', 'মূল খবর'],
  hourly: ['এই ঘণ্টা', 'এই ঘন্টা', 'গত ঘণ্টা', 'গত ঘন্টা', 'ঘণ্টায়', 'ঘন্টায়', 'ঘণ্টাভিত্তিক',
    'কোন কোন নিউজ', 'কোন কোন খবর', 'নতুন নিউজ', 'নতুন খবর', 'খবর এসেছে', 'নিউজ এসেছে',
    'কী খবর', 'কি খবর', 'কী এসেছে', 'কি এসেছে', 'খবরের ঢল', 'আজ কী'],
  posted: ['পোস্ট হয়েছে', 'পোস্ট হলো', 'পোস্ট করেছ', 'ফেসবুকে গেছে', 'ফেসবুকে পোস্ট',
    'চ্যানেলে গেছে', 'চ্যানেলে পোস্ট', 'সর্বশেষ পোস্ট', 'শেষ পোস্ট', 'কী পোস্ট'],
  ads: ['বিজ্ঞাপন', 'বিজ্ঞাপনগুলো', 'অ্যাড', 'স্পন্সর', 'ads'],
  status: ['অবস্থা', 'রিপোর্ট', 'কেমন চলছে', 'কেমন আছে', 'স্ট্যাটাস', 'সারসংক্ষেপ'],
  daily: ['দৈনিক', 'পরামর্শ', 'কী করা দরকার', 'কি করা দরকার', 'বিশ্লেষণ', 'কী করলে ভালো',
    'কি করলে ভালো', 'রিচ বাড়াতে', 'উন্নতি', 'সুপারিশ', 'মতামত'],
  autoOn: ['অটো চালু', 'অটো-প্রকাশ চালু', 'স্বয়ংক্রিয় চালু', 'auto on', 'অটো অন'],
  autoOff: ['অটো বন্ধ', 'অটো-প্রকাশ বন্ধ', 'স্বয়ংক্রিয় বন্ধ', 'auto off', 'অটো অফ'],
  autoStatus: ['অটো', 'অটো-প্রকাশ', 'স্বয়ংক্রিয়'],
  newNews: ['নতুন সংবাদ', 'নতুন খবর দিতে', 'খবর যোগ', 'সংবাদ যোগ', 'সংবাদ দিতে চাই', 'নিউজ দিতে চাই'],
  newAd: ['বিজ্ঞাপন দিতে', 'বিজ্ঞাপন যোগ', 'নতুন বিজ্ঞাপন', 'অ্যাড দিতে'],
  list: ['আমার সংবাদ', 'আমার খবর', 'তালিকা', 'লিস্ট', 'কতগুলো সংবাদ'],
  help: ['সাহায্য', 'হেল্প', 'help', 'কী করতে পারো', 'কি করতে পারো', 'কী কী পারো'],
  greeting: ['হ্যালো', 'হেলো', 'আসসালামু', 'শুভ সকাল', 'শুভ সন্ধ্যা', 'কেমন আছো', 'হাই'],
  publish: ['প্রকাশ কর', 'পোস্ট কর', 'পাবলিশ কর', 'ছেড়ে দাও'],
  cancel: ['বাতিল', 'ক্যান্সেল', 'cancel', 'দরকার নেই'],
  approve: ['হ্যাঁ', 'হ্যা', 'ঠিক আছে', 'করে দাও', 'হয়ে যাক', 'আপডেট কর', 'সম্মতি', 'অনুমতি', 'yes', 'ok', 'ঠিক'],
  deny: ['না', 'করব না', 'পরে', 'এখন না', 'লাগবে না', 'no'],
};
function has(t, list) { return list.some((k) => t.includes(normalize(k))); }
function extractNumber(t) { const m = t.match(/(?:#|নম্বর\s*|নাম্বার\s*)?(\d+)/); return m ? parseInt(m[1], 10) : null; }

function adAction(t) {
  const list = has(t, ['দেখাও', 'দেখাতে', 'তালিকা', 'লিস্ট', 'কী আছে', 'কি আছে', 'কোন কোন', 'কতগুলো', 'জানতে']);
  const del = has(t, ['মুছে', 'ডিলিট', 'delete', 'হটাও', 'বাদ দাও']);
  const off = has(t, ['বন্ধ কর', 'বন্ধ করে', 'নিষ্ক্রিয় কর', 'অফ কর', 'off কর', 'লুকাও']);
  const on = has(t, ['চালু কর', 'চালু করে', 'সক্রিয় কর', 'অন কর', 'on কর']);
  const edit = has(t, ['পরিবর্তন', 'বদলে', 'এডিট', 'edit', 'নতুন ছবি', 'নতুন লিংক']);
  if (del) return 'delete';
  if (off) return 'off';
  if (on) return 'on';
  if (edit) return 'edit';
  if (list) return 'show';
  return null;
}

const STRONG = ['headlines', 'hourly', 'posted', 'ads', 'ad_on', 'ad_off', 'ad_delete', 'ad_view',
  'ad_edit', 'daily', 'status', 'list', 'help', 'auto_on', 'auto_off', 'auto_status',
  'new_news', 'new_ad', 'cancel', 'publish'];

function parseIntent(raw) {
  const t = normalize(raw);
  const num = extractNumber(t);
  if (!t) return { intent: 'unknown', number: num };

  if (has(t, KW.ads)) {
    if (has(t, KW.newAd) && !has(t, ['বন্ধ', 'চালু', 'মুছে'])) return { intent: 'new_ad', number: num };
    const act = adAction(t);
    if (act === 'delete') return { intent: 'ad_delete', number: num };
    if (act === 'off') return { intent: 'ad_off', number: num };
    if (act === 'on') return { intent: 'ad_on', number: num };
    if (act === 'edit') return { intent: 'ad_edit', number: num };
    if (act === 'show' && num !== null) return { intent: 'ad_view', number: num };
    return { intent: 'ads', number: num };
  }
  if (has(t, KW.posted) || ((t.includes('ফেসবুক') || t.includes('চ্যানেল')) && t.includes('পোস্ট'))) {
    return { intent: 'posted', number: num };
  }
  if (has(t, KW.hourly)) return { intent: 'hourly', number: num };
  if (has(t, KW.headlines)) return { intent: 'headlines', number: num };
  if (has(t, KW.autoOn)) return { intent: 'auto_on', number: num };
  if (has(t, KW.autoOff)) return { intent: 'auto_off', number: num };
  if (has(t, KW.daily)) return { intent: 'daily', number: num };
  if (has(t, KW.status)) return { intent: 'status', number: num };
  if (has(t, KW.list)) return { intent: 'list', number: num };
  if (has(t, KW.help)) return { intent: 'help', number: num };
  if (has(t, KW.newNews)) return { intent: 'new_news', number: num };
  if (has(t, KW.autoStatus)) return { intent: 'auto_status', number: num };

  /* সম্ভাষণ অনুমোদনের আগে — "হ্যালো"-র ভেতরে "হ্যা" থাকে */
  if (has(t, KW.greeting)) return { intent: 'greeting', number: num };
  if (has(t, KW.cancel)) return { intent: 'cancel', number: num };
  if (has(t, KW.publish)) return { intent: 'publish', number: num };
  if (t.split(' ').length <= 4) {
    if (has(t, KW.approve)) return { intent: 'approve', number: num };
    if (has(t, KW.deny)) return { intent: 'deny', number: num };
  }
  const qWord = ['কী', 'কি', 'কেন', 'কীভাবে', 'কিভাবে', 'কত', 'কখন', 'মত কী', 'পরামর্শ', 'বলো তো']
    .some((w) => t.includes(normalize(w)));
  if (/[?]$/.test(String(raw).trim()) || (qWord && t.split(' ').length <= 12)) {
    return { intent: 'chat', number: num };
  }
  return { intent: 'news_text', number: num };
}

/* ── ছোট সহায়ক ──────────────────────────────────────────────────────── */
function bn(n) { return String(n).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ageText(min) {
  const m = Number(min) || 0;
  if (m < 1) return 'এইমাত্র';
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) { const r = m % 60; return r ? `${bn(h)} ঘণ্টা ${bn(r)} মিনিট আগে` : `${bn(h)} ঘণ্টা আগে`; }
  return `${bn(Math.floor(h / 24))} দিন আগে`;
}
function chLabel(c) { return c === 'facebook' ? 'ফেসবুক' : c === 'telegram' ? 'টেলিগ্রাম' : String(c); }

module.exports = {
  REPO, BRANCH, RAW, SITE_ORIGIN,
  fetchJson, loadSite, buildSite, currentHeadlines, byHour, adList, postStatus, dailyReport,
  parseIntent, normalize, bn, esc, ageText, chLabel, AD_SLOT_LABEL, STRONG,
  CFG_URL, ED_URL, POSTED_URL,
};
