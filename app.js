/* ═══════════════════════════════════════════════════════════════════
   দৈনিক আজাদী মুভমেন্ট — সার্ভারবিহীন লাইভ সংবাদ ইঞ্জিন
   প্রতিটি পেজ লোডে ভিজিটরের ব্রাউজার CORS-প্রক্সির মাধ্যমে সরাসরি
   ৮টি RSS ফিড টানে → পার্স → শ্রেণিবিন্যাস → রেন্ডার। কোনো ব্যাকএন্ড নেই।
   ═══════════════════════════════════════════════════════════════════ */
"use strict";

/* ── কনফিগ ─────────────────────────────────────────────────────── */
var SOURCES = {
  banglaedition: { rss: "https://www.banglaedition.com/feed/", label: "বাংলা এডিশন" },
  prothomalo: { rss: "https://www.prothomalo.com/feed/", label: "প্রথম আলো" },
  jugantor: { rss: "https://www.jugantor.com/feed/", label: "যুগান্তর" },
  ittefaq: { rss: "https://www.ittefaq.com.bd/feed/", label: "ইত্তেফাক" },
  bdnews24: { rss: "https://bangla.bdnews24.com/?feed=rss2", label: "বিডিনিউজ২৪" },
  somoynews: { rss: "https://somoynews.tv/feed/", label: "সময় নিউজ" },
  banglatribune: { rss: "https://www.banglatribune.com/feed/", label: "বাংলা ট্রিবিউন" },
  bdjournal: { rss: "https://bd-journal.com/feed/latest-rss.xml", label: "বাংলাদেশ জার্নাল" },
  dailybangladesh: { rss: "https://daily-bangladesh.com/rss/rss.xml", label: "ডেইলি বাংলাদেশ" }
};

/* প্রাইমারি: rss2json (JSON API, লাইভ-টেস্টেড ✔) — ফ্রি টিয়ারে দৈনিক ১০,০০০ রিকোয়েস্ট।
   ব্যর্থ হলে XML CORS-প্রক্সি চেইন (corsproxy.io ব্রাউজার-অনলি — ভিজিটরের জন্য কাজ করে)। */
var RSS2JSON = function (u) { return "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(u); };
var PROXIES = [
  function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); },
  function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
  function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); }
];

/* core.js থেকে pure ফাংশন আলিয়াস (index.html-এ core.js app.js-এর আগে লোড হয় — টেস্টযোগ্যতা ও এক-সোর্স) */
var CORE = window.BNE_CORE || {};
var CATEGORIES = CORE.CATEGORIES, CATEGORY_KEYWORDS = CORE.CATEGORY_KEYWORDS;
var bn = CORE.bn, escapeHtml = CORE.escapeHtml, splitSentences = CORE.splitSentences;
var hashId = CORE.hashId, categorize = CORE.categorize, extractTags = CORE.extractTags;
var catMeta = CORE.catMeta, timeAgo = CORE.timeAgo;
var SOURCE_WEIGHTS = CORE.SOURCE_WEIGHTS, breakingScore = CORE.breakingScore;

var CACHE_KEY = "azadi_static_cache_v1";
var CACHE_TTL = 5 * 60 * 1000; // ৫ মিনিট — এর মধ্যে রিফ্রেশ হলে ক্যাশ দেখিয়ে ব্যাকগ্রাউন্ডে হালনাগাদ

/* ── সাইট কনফিগ (সম্পাদকীয় সংবাদ + বিজ্ঞাপন) ─────────────────── */
var siteConfig = window.AZADI_DEFAULT_CONFIG || { settings: {}, editorNews: [], ads: [] };

function mergeConfig(remote) {
  if (remote && typeof remote === "object" && (remote.editorNews || remote.ads || remote.settings)) {
    siteConfig = {
      version: remote.version || siteConfig.version || 1,
      updatedAt: remote.updatedAt || siteConfig.updatedAt || "",
      settings: Object.assign({}, siteConfig.settings, remote.settings || {}),
      editorNews: remote.editorNews || siteConfig.editorNews || [],
      ads: remote.ads || siteConfig.ads || []
    };
  }
}

function loadLocalConfigPreview() {
  /* অ্যাডমিনের একই ব্রাউজারে তাৎক্ষণিক প্রিভিউ — রিমোটের উপরে বসে */
  try {
    var raw = localStorage.getItem("azadi_site_config");
    if (raw) mergeConfig(JSON.parse(raw));
  } catch (e) { /* উপেক্ষা */ }
}

function fetchRemoteConfig() {
  var url = (localStorage.getItem("azadi_remote_url") || (siteConfig.settings && siteConfig.settings.remoteConfigUrl) || "").trim();
  if (!url) return Promise.resolve(false);
  var bust = url + (url.indexOf("?") === -1 ? "?t=" : "&t=") + Date.now();
  return fetchWithTimeout(bust, 8000)
    .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function (cfg) {
      if (cfg && cfg.record) cfg = cfg.record; /* jsonbin v3 meta র‍্যাপার */
      mergeConfig(cfg);
      return true;
    })
    .catch(function () { return false; });
}

function applyEditorNews() {
  state.articles = state.articles.filter(function (a) { return a.source !== "editor"; });
  (siteConfig.editorNews || []).forEach(function (n) {
    if (!n || !n.title) return;
    var plain = String(n.body || "").trim();
    var ts = n.publishedAt && !isNaN(Date.parse(n.publishedAt)) ? Date.parse(n.publishedAt) : Date.now();
    var newId = n.id || hashId(n.title);
    /* একই id-র আগের কপি সরাও (সদৃশ কার্ড প্রতিরোধ) */
    state.articles = state.articles.filter(function (a) { return a.id !== newId; });
    state.articles.push({
      id: newId,
      title: n.title,
      link: "",
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: plain ? plain.split(/\n+/).filter(function (p) { return p.trim().length > 1; }) : [],
      image: n.image || null,
      ts: ts,
      source: "editor",
      sourceLabel: "সম্পাদকীয় ডেস্ক",
      category: n.category || "জাতীয়",
      tags: (n.tags && n.tags.length) ? n.tags : extractTags(n.title + " " + plain),
      lead: !!n.lead
    });
  });
  indexArticles();
}

/* ── বিজ্ঞাপন ইঞ্জিন ──────────────────────────────────────────── */
function ytId(url) {
  var m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function adHtml(ad) {
  var inner = "";
  if (ad.type === "youtube") {
    var id = ytId(ad.youtube);
    if (!id) return "";
    inner = '<div class="ad-video"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/' + id +
      '" title="' + escapeHtml(ad.title || "বিজ্ঞাপন") + '" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
  } else if (ad.type === "image") {
    if (!ad.image) return "";
    var img = '<img loading="lazy" src="' + escapeHtml(ad.image) + '" alt="' + escapeHtml(ad.title || "বিজ্ঞাপন") + '">';
    inner = ad.link
      ? '<a href="' + escapeHtml(resolveHref(ad.link)) + '" target="_blank" rel="noopener sponsored">' + img + "</a>"
      : img;
  } else if (ad.type === "html") {
    inner = ad.html || ""; /* অ্যাডমিন-প্রদত্ত trusted মার্কআপ */
  }
  if (!inner) return "";
  return '<div class="ad-block"><span class="ad-tag">বিজ্ঞাপন</span>' + inner +
    (ad.title && ad.type === "youtube" ? '<div class="ad-title">' + escapeHtml(ad.title) + "</div>" : "") + "</div>";
}

function renderAdSlot(slot) {
  var list = (siteConfig.ads || []).filter(function (a) { return a && a.enabled !== false && a.slot === slot; });
  
  /* Fallback: Render Official Google AdSense Unit (Publisher from site config) */
  if (!list.length) {
    var pubId = (siteConfig.settings && siteConfig.settings.adsensePublisherId) || "ca-pub-8292591084993652";
    var adsenseUnit = '<div class="ad-block ad-adsense-block" style="margin:1rem 0;text-align:center;">' +
      '<span class="ad-tag">স্পনর্সড বিজ্ঞাপন</span>' +
      '<ins class="adsbygoogle" style="display:block" data-ad-client="' + escapeHtml(pubId) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>' +
      '<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>' +
      '</div>';
    return '<div class="ad-slot ad-' + slot + '">' + adsenseUnit + '</div>';
  }
  
  if (list.length > 1) {
    var slotId = 'ad-rotator-' + slot;
    setTimeout(function() { startAdRotator(slotId, list.length); }, 500);
    return '<div class="ad-slot ad-' + slot + ' ad-rotator-container" id="' + slotId + '">' +
      list.map(function(ad, idx) {
        return '<div class="rotator-item ' + (idx === 0 ? 'active' : 'hidden') + '" data-idx="' + idx + '">' + adHtml(ad) + '</div>';
      }).join("") +
      '</div>';
  }
  
  var html = list.map(adHtml).join("");
  return html ? '<div class="ad-slot ad-' + slot + '">' + html + "</div>" : "";
}

var adRotators = {};
function startAdRotator(containerId, count) {
  /* একই স্লটে ডুপ্লিকেট interval প্রতিরোধ (রিরেন্ডারে লিক হয় না) */
  if (adRotators[containerId]) clearInterval(adRotators[containerId]);
  var current = 0;
  adRotators[containerId] = setInterval(function() {
    var container = document.getElementById(containerId);
    if (!container) return;
    var items = container.querySelectorAll('.rotator-item');
    if (!items.length) return;
    items[current].classList.add('hidden');
    items[current].classList.remove('active');
    current = (current + 1) % items.length;
    items[current].classList.remove('hidden');
    items[current].classList.add('active');
  }, 5000);
}

/* ── ইউটিলিটি (pure ফাংশন core.js-এ; DOM-নির্ভর নিচে) ──────────── */
function stripTags(html) {
  var div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

/* ফিড-মেটাডেটা জাঙ্ক পরিষ্কার — "X ডেস্ক 2026-08-24..." জাতীয় অগ্রভাগ-লাইন সরায় */
function cleanArticlePlain(text) {
  if (!text) return "";
  var parts = String(text).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (parts.length > 1) {
    var first = parts[0];
    var metaRe = /(?:ডেস্ক|রিপোর্ট|প্রতিবেদক|করেসপন্ডেন্ট|সংবাদদাতা|বিউরো)/;
    if (first.length < 90 && /\d{4}[-/]\d{1,2}/.test(first) && metaRe.test(first)) {
      parts.shift();
    }
  }
  return parts.join("\n");
}

/* ── ফেচ + পার্স ইঞ্জিন ────────────────────────────────────────── */
function fetchWithTimeout(url, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms);
  return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

/* ধাপ ১: rss2json JSON API → ধাপ ২: XML প্রক্সি চেইন */
function fetchFeedItems(sourceKey) {
  var rssUrl = SOURCES[sourceKey].rss;

  var viaJson = fetchWithTimeout(RSS2JSON(rssUrl), 12000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || data.status !== "ok" || !data.items || !data.items.length) throw new Error("খালি JSON");
      return parseJsonFeed(data.items, sourceKey);
    });

  var viaXml = function (idx) {
    if (idx >= PROXIES.length) return Promise.reject(new Error("সব প্রক্সি ব্যর্থ"));
    return fetchWithTimeout(PROXIES[idx](rssUrl), 12000)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        if (!text || text.length < 200 || text.indexOf("<") === -1) throw new Error("খালি রেসপন্স");
        var items = parseFeed(text, sourceKey);
        if (!items.length) throw new Error("পার্সে শূন্য আইটেম");
        return items;
      })
      .catch(function () { return viaXml(idx + 1); });
  };

  return viaJson.catch(function () { return viaXml(0); });
}

/* rss2json-এর রেডিমেড JSON আইটেম → অভিন্ন আর্টিকেল অবজেক্ট */
function parseJsonFeed(items, sourceKey) {
  var out = [];
  for (var i = 0; i < items.length && out.length < 12; i++) {
    var it = items[i];
    var title = stripTags(it.title || "");
    var link = String(it.link || it.guid || "").trim();
    if (!title || link.indexOf("http") !== 0) continue;

    var desc = it.content || it.description || "";
    var plain = cleanArticlePlain(stripTags(desc));
    var ts = it.pubDate && !isNaN(Date.parse(it.pubDate)) ? Date.parse(it.pubDate) : Date.now();
    var image = it.thumbnail || (it.enclosure && it.enclosure.link) || null;
    if (image && !/^https?:/.test(image)) image = null;
    if (!image) {
      var m = String(desc).match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }
    var fullText = title + " " + plain;

    out.push({
      id: hashId(link),
      title: title,
      link: link,
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: splitSentences(plain),
      image: image,
      ts: ts,
      source: sourceKey,
      sourceLabel: SOURCES[sourceKey].label,
      category: categorize(fullText),
      tags: extractTags(fullText)
    });
  }
  return out;
}

function childText(el, names) {
  for (var i = 0; i < el.children.length; i++) {
    var c = el.children[i];
    var local = (c.localName || c.nodeName || "").toLowerCase();
    var full = (c.nodeName || "").toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (local === names[j] || full === names[j]) return (c.textContent || "").trim();
    }
  }
  return "";
}

function extractImage(el, desc) {
  for (var i = 0; i < el.children.length; i++) {
    var c = el.children[i];
    var name = (c.nodeName || "").toLowerCase();
    var url = c.getAttribute && (c.getAttribute("url") || c.getAttribute("href"));
    if ((name === "media:content" || name === "media:thumbnail") && url) return url;
    if (name === "enclosure" && url) {
      var type = c.getAttribute("type") || "";
      if (type.indexOf("image") === 0 || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return url;
    }
  }
  var m = String(desc || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function parseFeed(xmlText, sourceKey) {
  var doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  var nodes = doc.querySelectorAll("item, entry");
  var out = [];
  for (var i = 0; i < nodes.length && out.length < 12; i++) {
    var el = nodes[i];
    var title = stripTags(childText(el, ["title"]));
    var link = childText(el, ["link", "guid"]);
    if (!link) {
      var linkEl = el.querySelector("link[href]");
      if (linkEl) link = linkEl.getAttribute("href") || "";
    }
    link = link.trim();
    if (!title || link.indexOf("http") !== 0) continue;

    var desc = childText(el, ["content:encoded", "encoded", "description", "summary", "content"]);
    var pub = childText(el, ["pubdate", "published", "updated", "dc:date", "date"]);
    var ts = pub && !isNaN(Date.parse(pub)) ? Date.parse(pub) : Date.now();
    var plain = cleanArticlePlain(stripTags(desc));
    var fullText = title + " " + plain;

    out.push({
      id: hashId(link),
      title: title,
      link: link,
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: splitSentences(plain),
      image: extractImage(el, desc),
      ts: ts,
      source: sourceKey,
      sourceLabel: SOURCES[sourceKey].label,
      category: categorize(fullText),
      tags: extractTags(fullText)
    });
  }
  return out;
}

/* ── স্টেট + ক্যাশ ─────────────────────────────────────────────── */
var state = { articles: [], byId: {}, lastUpdate: 0, sourceStatus: {} };

function indexArticles() {
  state.byId = {};
  state.articles.forEach(function (a) { state.byId[a.id] = a; });
  state.articles.sort(function (a, b) { return b.ts - a.ts; });
}

/* ═══ সম্পাদকীয় লিড (নিয়োগ ক্যাম্পেইন) — এক জায়গায় সংজ্ঞায়িত ═══ */
var RECRUITMENT_ARTICLE = {
  id: "thy-recruitment-2026",
  title: "চীন, লাওস, আলজেরিয়া ও ইরাকে বিশাল নিয়োগ বিজ্ঞপ্তি — THY International AD International Ent.",
  summary: "চীন (গার্মেন্টস ট্রেইনি ৫০,০০০ টাকা), লাওস ($৪৫০), আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মী নিয়োগ। ফ্রি খাবার ও বাসস্থানসহ সরকারি অনূমোদিত ভিসার সম্পূর্ণ আবেদন পদ্ধতি।",
  paragraphs: [
    "চীন, লাওস, আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মসংস্থানের সুবর্ণ সুযোগ নিয়ে এসেছে সরকারি অনুমোদিত বিশ্বস্ত রিক্রুটিং প্রতিষ্ঠান THY International AD International Ent.।",
    "🇨🇳 ১. চীন (China) — গার্মেন্টস সুইং ট্রেইনি: ২০০ জন। ৪ বছরের ট্রেইনি ভিসা। আন্তর্জাতিক মানের ট্রেনিং ও সার্টিফিকেট। বেতন: ৫০,০০০ টাকা।",
    "🇱🇦 ২. লাওস (Laos) — CHINA HUNAN CONSTRUCTION: কনস্ট্রাকশন কাজ। বেতন: ৪৫০ ডলার ($450 USD)। ডিউটি: ৯ ঘণ্টা। বয়স: ২০-৪৫ বছর। ফ্রি খাবার ও বাসস্থান।",
    "🇩🇿 ৩. আলজেরিয়া (Algeria): কার্পেন্টার (২০ জন, $৫৫0), স্টিলওয়ার্কার (১০ জন, $৫৫0), ব্রিকলেয়ার (১০ জন, $৫৫0), ট্রান্সলেটর (১ জন, $৮০০), শেফ (১ জন, $৪৫০)। ২ বছরের অভিজ্ঞতা প্রয়োজন।",
    "🇮🇶 ৪. ইরাক (Iraq): সাধারণ ওয়েল্ডার (৫ জন, $৫৫0), ব্রিকলেয়ার (৫ জন, $৫০০)।",
    "📍 যোগাযোগের ঠিকানা: THY International AD International Ent., এম এম কমপ্লেক্স, লিফট-৭ (পল্লবী মেট্রোস্টেশন সংলগ্ন), মিরপুর ২/১১, ঢাকা। মোবাইল: সাগর — +8801791520269"
  ],
  image: "images/overseas-campaign.webp",
  source: "editor",
  sourceLabel: "সম্পাদকীয় বিশেষ প্রকাশনা",
  category: "প্রবাস",
  lead: true,
  ts: Date.now(),
  tags: ["নিয়োগ", "প্রবাস", "চীন", "লাওস", "আলজেরিয়া", "ইরাক", "THY_International"],
  link: "https://bangla-news-edition.netlify.app/#/news/thy-recruitment-2026"
};

/* শুধু সম্পাদকীয় সিড (ফেব্রিকেটেড জাল নিউজ সম্পূর্ণ বাদ — আসল ফিড রিফ্রেশে মার্জ হয়) */
var SEED_ARTICLES = [RECRUITMENT_ARTICLE];

function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.articles && data.articles.length) {
        state.articles = data.articles;
        state.lastUpdate = data.ts || 0;
        indexArticles();
        return true;
      }
    }
  } catch (e) {}
  state.articles = SEED_ARTICLES;
  state.lastUpdate = Date.now();
  indexArticles();
  return true;
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: state.lastUpdate, articles: state.articles.slice(0, 200) }));
  } catch (e) { /* কোটা শেষ হলে নীরবে উপেক্ষা */ }
}

function mergeArticles(items) {
  var seen = {};
  state.articles.forEach(function (a) { seen[a.id] = true; });
  var added = 0;
  items.forEach(function (a) { if (!seen[a.id]) { state.articles.push(a); seen[a.id] = true; added++; } });
  indexArticles();
  return added;
}

/* P2: সার্ভার-সাইড ইনজেশন (Netlify Function /api/rss-proxy) — প্রথম চেষ্টা; ব্যর্থে ক্লায়েন্ট চেইন */
function fetchViaServerProxy() {
  if (!isHttpHost()) return Promise.reject(new Error("শুধু http হোস্টে"));
  return fetchWithTimeout("/api/rss-proxy", 25000).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (data) {
    if (!data || !Array.isArray(data.items) || !data.items.length) throw new Error("খালি প্রক্সি রেসপন্স");
    return data.items.map(function (it) {
      if (!it || !it.link || !it.title) return null;
      var plain = String(it.summary || "");
      var fullText = it.title + " " + plain;
      return {
        id: hashId(it.link),
        title: it.title,
        link: it.link,
        summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
        paragraphs: splitSentences(plain),
        image: it.image || null,
        ts: it.ts || Date.now(),
        source: it.source || "banglaedition",
        sourceLabel: (SOURCES[it.source] && SOURCES[it.source].label) || "সংবাদ সূত্র",
        category: categorize(fullText),
        tags: extractTags(fullText)
      };
    }).filter(function (x) { return !!x; });
  });
}

function refreshAll(background) {
  var keys = Object.keys(SOURCES);
  setStatus("loading", "সংবাদ সূত্রগুলো থেকে সর্বশেষ খবর আনা হচ্ছে…");

  return fetchViaServerProxy().then(function (proxyItems) {
    /* সার্ভার-প্রক্সি সফল — কিন্তু আংশিক হলে (কিছু সূত্র ব্লকড/খালি) বাকিগুলো ক্লায়েন্ট-চেইন দিয়ে এনে মার্জ
       (mergeArticles লিংক-ডিডুপ করে — সদৃশ/সংঘর্ষ নিরাপদ) */
    var proxySources = {};
    proxyItems.forEach(function (it) { if (it.source) proxySources[it.source] = true; });
    keys.forEach(function (k) { state.sourceStatus[k] = proxySources[k] ? "ok" : "pending"; });
    var missing = keys.filter(function (k) { return !proxySources[k]; });
    if (!missing.length) return proxyItems;
    return Promise.allSettled(
      missing.map(function (key) {
        return fetchFeedItems(key).then(function (items) {
          state.sourceStatus[key] = items.length ? "ok" : "empty";
          return items;
        }).catch(function () {
          state.sourceStatus[key] = "fail";
          return [];
        });
      })
    ).then(function (results) {
      var all = proxyItems.slice();
      results.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
      return all;
    });
  }).catch(function () {
    /* সম্পূর্ণ গ্রেসফুল ডিগ্রেডেশন → ক্লায়েন্ট-সাইড rss2json/প্রক্সি চেইন */
    return Promise.allSettled(
      keys.map(function (key) {
        return fetchFeedItems(key).then(function (items) {
          state.sourceStatus[key] = items.length ? "ok" : "empty";
          return items;
        }).catch(function () {
          state.sourceStatus[key] = "fail";
          return [];
        });
      })
    ).then(function (results) {
      var all = [];
      results.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
      return all;
    });
  }).then(function (all) {
    var added = mergeArticles(all);
    state.lastUpdate = Date.now();
    saveCache();
    var okCount = keys.filter(function (k) { return state.sourceStatus[k] === "ok"; }).length;
    if (state.articles.length) {
      setStatus("ok", "✔ হালনাগাদ সম্পন্ন — " + bn(okCount) + "টি সূত্র সচল, নতুন " + bn(added) + "টি খবর, মোট " + bn(state.articles.length) + "টি");
    } else {
      setStatus("err", "কোনো সূত্র থেকেই খবর আনা যায়নি — ইন্টারনেট সংযোগ পরীক্ষা করে রিফ্রেশ করুন।");
    }
    if (!background || added > 0) render();
  });
}

function setStatus(kind, msg) {
  var bar = document.getElementById("statusbar");
  bar.className = "statusbar container" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  bar.innerHTML = (kind === "loading" ? '<span class="spinner"></span> ' : "") + escapeHtml(msg);
}

/* ── ডায়নামিক OG / সোশ্যাল মেটা আপডেটর ───────────────────────── */
var SITE_ORIGIN = 'https://bangla-news-edition.netlify.app';
var OG_DEFAULTS = {
  title: 'বাংলা নিউজ এডিশন — BANGLA NEWS EDITION',
  desc: 'জাতীয়, প্রবাস, আন্তর্জাতিক ও অর্থনীতির ব্রেকিং সংবাদ পোর্টাল।',
  image: SITE_ORIGIN + '/images/bne-og-cover.jpg',
  url: SITE_ORIGIN + '/'
};

/* ── URL হেল্পার (রিয়েল-পাথ + hash fallback — P1 SEO) ──────────── */
function isHttpHost() { return location.protocol.indexOf('http') === 0; }
function siteOrigin() {
  if (isHttpHost()) return location.origin;
  return SITE_ORIGIN;
}
function sitePath() {
  var p = location.pathname.replace(/\/[^/]*$/, '/');
  return p || '/';
}
function absoluteUrl(rel) {
  if (/^https?:/.test(rel)) return rel;
  return siteOrigin() + sitePath() + String(rel || '').replace(/^\.?\//, '');
}

/* http হোস্টে রিয়েল-পাথ (গুগল-ইনডেক্সযোগ্য), file://-এ hash — দুই-ই কাজ করে */
function newsHref(id) { return isHttpHost() ? '/news/' + encodeURIComponent(id) : '#/news/' + encodeURIComponent(id); }
function catHref(name) { return isHttpHost() ? '/category/' + encodeURIComponent(name) : '#/category/' + encodeURIComponent(name); }
function searchHref(q) { return isHttpHost() ? '/search/' + encodeURIComponent(q) : '#/search/' + encodeURIComponent(q); }
function deskHref(sub) { return isHttpHost() ? '/desk/probashi-bangla-news' + (sub ? '/' + sub : '') : '#/desk/probashi-bangla-news' + (sub ? '/' + sub : ''); }
function homeHref() { return isHttpHost() ? '/' : '#/'; }
function articleUrl(a) { return siteOrigin() + (isHttpHost() ? '/news/' : sitePath() + '#/news/') + encodeURIComponent(a.id); }

/* "#/..." অথবা রিয়েল-পাথ href → হোস্ট-উপযোগী href */
function resolveHref(href) {
  href = String(href || '');
  if (href.indexOf('#/') === 0) {
    var rest = href.slice(2);
    if (!isHttpHost()) return href;
    if (rest.indexOf('news/') === 0) return '/news/' + rest.slice(5);
    if (rest.indexOf('category/') === 0) return '/category/' + rest.slice(9);
    if (rest.indexOf('search/') === 0) return '/search/' + rest.slice(7);
    if (rest.indexOf('desk/probashi-bangla-news') === 0) return '/desk/probashi-bangla-news' + rest.slice(22);
    if (rest === '' || rest === '/') return '/';
    return href;
  }
  return href;
}

/* SPA নেভিগেশন: http হোস্টে pushState, file://-এ hash */
function navigate(href) {
  href = resolveHref(href);
  if (isHttpHost() && href.charAt(0) === '/') {
    history.pushState({}, '', href);
    render();
    window.scrollTo(0, 0);
  } else {
    location.hash = href.replace(/^\/+/, '#/');
  }
}

function setMeta(property, content) {
  var isOg = property.indexOf('og:') === 0;
  var attr = isOg ? 'property' : 'name';
  var el = document.querySelector('meta[' + attr + '="' + property + '"]');
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, property); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

/* NewsArticle JSON-LD (সার্চ ইঞ্জিনের জন্য) */
function setArticleLd(article) {
  var el = document.getElementById('bne-article-ld');
  if (!el) { el = document.createElement('script'); el.id = 'bne-article-ld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
  var ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.summary,
    image: absoluteUrl(article.image || catMeta(article.category).img),
    datePublished: new Date(article.ts).toISOString(),
    dateModified: new Date(article.ts).toISOString(),
    url: articleUrl(article),
    author: { '@type': 'Organization', name: 'বাংলা নিউজ এডিশন' },
    publisher: { '@type': 'Organization', name: 'বাংলা নিউজ এডিশন', logo: { '@type': 'ImageObject', url: absoluteUrl('images/bne-logo.png') } },
    mainEntityOfPage: articleUrl(article)
  };
  el.textContent = JSON.stringify(ld);
}

function removeArticleLd() {
  var el = document.getElementById('bne-article-ld');
  if (el) el.remove();
}

/* ── SEO হেল্পার (P1): canonical + robots + BreadcrumbList ──────── */
function setCanonical(url) {
  var el = document.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
  el.href = url;
}
function setRobots(content) {
  var el = document.querySelector('meta[name="robots"]');
  if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function setBreadcrumbLd(items) {
  var el = document.getElementById('bne-breadcrumb-ld');
  if (!el) { el = document.createElement('script'); el.id = 'bne-breadcrumb-ld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: (items || []).map(function (it, i) {
      return { '@type': 'ListItem', position: i + 1, name: it.name, item: it.url };
    })
  });
}
function removeBreadcrumbLd() {
  var el = document.getElementById('bne-breadcrumb-ld');
  if (el) el.remove();
}
function breadcrumbItem(name, url) { return { name: name, url: url }; }

/* রিয়েল-পাথ বা hash href → পরম canonical URL */
function canonicalFor(href) {
  href = String(href || '');
  if (href.charAt(0) === '/') return siteOrigin() + href;
  if (href.indexOf('#/') === 0) return siteOrigin() + sitePath() + href.slice(1);
  return href;
}

function updateOgMeta(article) {
  var title = (article.title || OG_DEFAULTS.title) + ' — বাংলা নিউজ এডিশন';
  var desc = article.summary || OG_DEFAULTS.desc;
  var image = article.image || catMeta(article.category).img;
  if (!image || image.indexOf('http') !== 0) image = OG_DEFAULTS.image;
  var url = articleUrl(article);
  setMeta('og:title', title); setMeta('og:description', desc);
  setMeta('og:image', image); setMeta('og:url', url); setMeta('og:type', 'article');
  setMeta('twitter:title', title); setMeta('twitter:description', desc.slice(0, 200)); setMeta('twitter:image', image);
  setCanonical(url);
  setRobots('index, follow');
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem(article.category, canonicalFor(catHref(article.category))),
    breadcrumbItem(article.title, url)
  ]);
  setArticleLd(article);
}

function resetOgMeta() {
  setMeta('og:title', OG_DEFAULTS.title); setMeta('og:description', OG_DEFAULTS.desc);
  setMeta('og:image', OG_DEFAULTS.image); setMeta('og:url', OG_DEFAULTS.url); setMeta('og:type', 'website');
  setMeta('twitter:title', OG_DEFAULTS.title); setMeta('twitter:description', OG_DEFAULTS.desc); setMeta('twitter:image', OG_DEFAULTS.image);
  setCanonical(OG_DEFAULTS.url);
  setRobots('index, follow');
  removeArticleLd();
  removeBreadcrumbLd();
}

function bneShareCopyLink(btn, url) {
  try {
    navigator.clipboard.writeText(url).then(function() {
      var orig = btn.textContent; btn.textContent = '✅ কপি হয়েছে!';
      setTimeout(function() { btn.textContent = orig; }, 2000);
    });
  } catch(e) { window.prompt('এই লিংকটি কপি করুন:', url); }
}

/* ── রেন্ডারিং ─────────────────────────────────────────────────── */
function imgOf(a) { return a.image || catMeta(a.category).img; }

function badgeHtml(cat) {
  return '<span class="badge ' + catMeta(cat).badge + '">' + escapeHtml(cat) + "</span>";
}

function cardHtml(a) {
  return '<a class="card" href="' + newsHref(a.id) + '">' +
    '<span class="thumb"><img loading="lazy" src="' + escapeHtml(imgOf(a)) + '" alt="' + escapeHtml(a.title) + '" onerror="this.src=\'' + catMeta(a.category).img + '\'">' + badgeHtml(a.category) + "</span>" +
    '<span class="body"><h3>' + escapeHtml(a.title) + "</h3><p>" + escapeHtml(a.summary) + "</p>" +
    '<span class="meta"><span>' + timeAgo(a.ts) + "</span><span>" + escapeHtml(a.sourceLabel) + "</span></span></span></a>";
}

function cardSmHtml(a) {
  return '<a class="card-sm" href="' + newsHref(a.id) + '">' +
    '<img loading="lazy" src="' + escapeHtml(imgOf(a)) + '" alt="' + escapeHtml(a.title) + '" onerror="this.src=\'' + catMeta(a.category).img + '\'">' +
    '<span><span class="cat">' + escapeHtml(a.category) + "</span><h3>" + escapeHtml(a.title) + '</h3><div class="meta">' + timeAgo(a.ts) + "</div></span></a>";
}

function sectionHead(title, href) {
  return '<div class="section-head"><h2>' + escapeHtml(title) + "</h2>" +
    (href ? '<a href="' + href + '">সব দেখুন →</a>' : "") + "</div>";
}

/* ═══ P6: রিড-হিস্টরি ও রেকমেন্ডেশন (প্রাইভেসি-ফার্স্ট, লোকাল; ব্রেকিং-স্কোর core.js-এ) ═══ */
var HISTORY_KEY = "bne_read_history";
function getReadHistory() {
  try { var raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(raw) ? raw : []; }
  catch (e) { return []; }
}
function recordRead(id) {
  try {
    var h = getReadHistory().filter(function (x) { return x !== id; });
    h.unshift(id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 30)));
  } catch (e) {}
}
/* পড়ার ইতিহাস থেকে ক্যাটাগরি+ট্যাগ মিলিয়ে ৪টি ব্যক্তিগত পছন্দ */
function personalPicks(arts) {
  var hist = getReadHistory();
  if (hist.length < 3) return [];
  var readSet = new Set(hist);
  var cats = {}, tags = {};
  hist.slice(0, 8).forEach(function (id) {
    var a = state.byId[id];
    if (!a) return;
    cats[a.category] = (cats[a.category] || 0) + 1;
    (a.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
  });
  var recs = arts.filter(function (a) {
    if (readSet.has(a.id)) return false;
    var score = (cats[a.category] || 0) * 2;
    (a.tags || []).forEach(function (t) { if (tags[t]) score += tags[t]; });
    return score >= 2;
  });
  recs.sort(function (a, b) { return breakingScore(b) - breakingScore(a); });
  return recs.slice(0, 4);
}

/* ═══ হিরো অটো-রোটেশন ইঞ্জিন (P7: নিউজ ১০s → বিজ্ঞাপন ৩s → লুপ) ═══ */
var heroRotatorTimer = null;

function clearHeroTimer() {
  if (heroRotatorTimer) { clearTimeout(heroRotatorTimer); heroRotatorTimer = null; }
}

/* অ্যাড-লিংক: hash → রিয়েল-পাথ (রিয়েল-পাথ রাউটিং সক্রিয় থাকলে) */
function resolveHref(link) {
  if (!link) return homeHref();
  var l = String(link).trim();
  if (l.indexOf("#/news/") === 0) return newsHref(decodeURIComponent(l.slice(7)));
  if (l.indexOf("#/category/") === 0) return catHref(decodeURIComponent(l.slice(11)));
  if (l.indexOf("#/desk/") === 0) return deskHref(l.indexOf("/", 7) > 0 ? l.slice(l.indexOf("/", 7) + 1) : null);
  if (l.indexOf("#/search/") === 0) return searchHref(decodeURIComponent(l.slice(9)));
  if (l.indexOf("#/") === 0 || l === "#") return homeHref();
  return l;
}

/* বিজ্ঞাপন স্লাইড: কনফিগের home_top/home_middle ছবি-অ্যাড + সম্পাদকীয় (ডিডুপসহ) */
function heroAdSlides() {
  var out = [];
  var editorial = state.articles.filter(function (a) { return a.source === "editor"; })[0];
  if (editorial) out.push({ image: imgOf(editorial), title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — চীন, লাওস, আলজেরিয়া ও ইরাক", href: resolveHref("#/news/" + editorial.id), tag: "বিজ্ঞাপন" });
  (siteConfig.ads || []).forEach(function (ad) {
    if (!ad || !ad.enabled || ad.type !== "image" || !ad.image) return;
    if (ad.slot !== "home_top" && ad.slot !== "home_middle") return;
    out.push({ image: ad.image, title: ad.title || "বিজ্ঞাপন", href: resolveHref(ad.link), tag: "বিজ্ঞাপন" });
  });
  var seen = {}, uniq = [];
  out.forEach(function (s) { var k = s.image + "|" + s.title; if (!seen[k]) { seen[k] = 1; uniq.push(s); } });
  return uniq;
}

function buildHeroSlides(heroNews) {
  var ads = heroAdSlides();
  var slides = [];
  heroNews.forEach(function (n, i) {
    slides.push({ type: "news", article: n });
    if (ads.length) slides.push({ type: "ad", ad: ads[i % ads.length] });
  });
  if (!ads.length) slides = heroNews.map(function (n) { return { type: "news", article: n }; });
  return slides;
}

function heroRotatorHtml(slides) {
  var inner = slides.map(function (s, i) {
    var isAd = s.type === "ad";
    var tag = isAd ? '<span class="ad-flag">বিজ্ঞাপন</span>' : badgeHtml(s.article.category);
    var title = isAd ? escapeHtml(s.ad.title) : escapeHtml(s.article.title);
    var meta = isAd ? "স্পনর্সড কনটেন্ট" : timeAgo(s.article.ts) + " · " + escapeHtml(s.article.sourceLabel);
    var href = isAd ? s.ad.href : newsHref(s.article.id);
    var img = isAd ? escapeHtml(s.ad.image) : escapeHtml(imgOf(s.article));
    var fb = isAd ? catMeta("প্রবাস").img : catMeta(s.article.category).img;
    return '<a class="hero-slide' + (i === 0 ? " active" : "") + '" href="' + href + '" data-dur="' + (isAd ? 3000 : 10000) + '" aria-hidden="' + (i === 0 ? "false" : "true") + '">' +
      '<img src="' + img + '" alt="' + title + '" loading="' + (i === 0 ? "eager" : "lazy") + '" onerror="this.src=\'' + fb + '\'">' +
      '<span class="overlay"></span><span class="content">' + tag +
      "<h1>" + title + '</h1><div class="meta">' + meta + "</div></span></a>";
  }).join("");
  var dots = '<div class="hero-dots">' + slides.map(function (_, i) {
    return '<button class="' + (i === 0 ? "active" : "") + '" data-i="' + i + '" aria-label="স্লাইড ' + (i + 1) + '"></button>';
  }).join("") + "</div>";
  return '<div class="hero-rotator" id="hero-rotator">' + inner + dots + "</div>";
}

/* অটো-রোটেশন চালু (হোম পেজে, render-এর পরে) — hover-পজ + reduced-motion স্ট্যাটিক */
function startHeroRotator() {
  var rot = document.getElementById("hero-rotator");
  if (!rot) return;
  var slides = Array.prototype.slice.call(rot.querySelectorAll(".hero-slide"));
  if (slides.length < 2) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var dots = Array.prototype.slice.call(rot.querySelectorAll(".hero-dots button"));
  var i = 0;
  function show(idx) {
    i = idx;
    slides.forEach(function (s, k) {
      s.classList.toggle("active", k === idx);
      s.setAttribute("aria-hidden", k === idx ? "false" : "true");
    });
    dots.forEach(function (d, k) { d.classList.toggle("active", k === idx); });
  }
  function schedule() {
    clearHeroTimer();
    var dur = parseInt(slides[i].getAttribute("data-dur"), 10) || 10000;
    heroRotatorTimer = setTimeout(function () { show((i + 1) % slides.length); schedule(); }, dur);
  }
  rot.addEventListener("mouseenter", clearHeroTimer, { passive: true });
  rot.addEventListener("mouseleave", schedule, { passive: true });
  dots.forEach(function (d) {
    d.addEventListener("click", function () {
      clearHeroTimer();
      show(parseInt(d.getAttribute("data-i"), 10));
      schedule();
    });
  });
  schedule();
}

function renderHome(app) {
  document.title = "বাংলা নিউজ এডিশন — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা | BANGLA NEWS EDITION";
  resetOgMeta();
  var arts = state.articles.slice();
  if (!arts.length) {
    app.innerHTML = '<div class="empty">এই মুহূর্তে কোনো সংবাদ নেই — কয়েক সেকেন্ড পর স্বয়ংক্রিয়ভাবে চলে আসবে।<br><br><button class="btn" onclick="location.reload()">রিফ্রেশ করুন</button></div>';
    return;
  }
  /* হিরো: আসল ব্রেকিং নিউজ প্রধান (বিজ্ঞাপন নয়) — অটো-রোটেশন: নিউজ ১০s → বিজ্ঞাপন ৩s → লুপ */
  var nonEd = arts.filter(function (a) { return a.source !== "editor"; });
  var heroNews = nonEd.slice(0, 25).sort(function (a, b) { return breakingScore(b) - breakingScore(a); }).slice(0, 4);
  if (!heroNews.length) heroNews = arts.slice(0, 1); /* শুধু সম্পাদকীয় থাকলেও হিরো খালি থাকে না */
  var side = nonEd.filter(function (a) { return heroNews.indexOf(a) === -1; }).slice(0, 4);
  var grid = nonEd.filter(function (a) { return heroNews.indexOf(a) === -1 && side.indexOf(a) === -1; }).slice(0, 9);
  var slides = buildHeroSlides(heroNews);
  var html = '<section class="hero">' + heroRotatorHtml(slides) +
    '<div class="hero-side">' + side.map(cardSmHtml).join("") + "</div></section>";

  html += renderAdSlot("home_top");

  html += '<section class="section">' + sectionHead("সর্বশেষ সংবাদ") +
    '<div class="grid cols-3">' + grid.map(cardHtml).join("") + "</div></section>";

  /* P6: ব্যক্তিগত পছন্দ — পড়ার ইতিহাসের ভিত্তিতে (প্রাইভেসি-ফার্স্ট) */
  var picks = personalPicks(arts);
  if (picks.length >= 3) {
    html += '<section class="section">' + sectionHead("আপনার জন্য") +
      '<div class="grid cols-4">' + picks.map(cardSmHtml).join("") + "</div></section>";
  }

  html += renderAdSlot("home_middle");

  CATEGORIES.forEach(function (cat) {
    var items = arts.filter(function (a) { return a.category === cat.name; }).slice(0, 4);
    if (!items.length) return;
    html += '<section class="section">' + sectionHead(cat.name, catHref(cat.name)) +
      '<div class="grid cols-4">' + items.map(cardSmHtml).join("") + "</div></section>";
  });
  app.innerHTML = html;
}

function renderCategory(app, name) {
  document.title = escapeHtml(name) + " — বাংলা নিউজ এডিশন | BANGLA NEWS EDITION";
  resetOgMeta();
  setCanonical(canonicalFor(catHref(name)));
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem(name, canonicalFor(catHref(name)))
  ]);
  var items = state.articles.filter(function (a) { return a.category === name; });
  app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / ' + escapeHtml(name) + "</div>" +
    "<h1>" + escapeHtml(name) + "</h1><p>মোট " + bn(items.length) + "টি সংবাদ</p></div>" +
    (items.length
      ? '<div class="grid cols-3">' + items.map(cardHtml).join("") + "</div>"
      : '<div class="empty">এই বিভাগে এখনো সংবাদ আসেনি — একটু পরে রিফ্রেশ করুন।</div>');
}

function renderSearch(app, q) {
  q = String(q || "").trim();
  document.title = (q ? "“" + q + "” — " : "") + "খোঁজার ফলাফল — বাংলা নিউজ এডিশন";
  resetOgMeta();
  /* সার্চ পেজ সার্চ-ইঞ্জিনে ইনডেক্স হবে না (ডুপ্লিকেট কনটেন্ট এড়াতে) */
  setRobots('noindex, follow');
  setCanonical(OG_DEFAULTS.url);
  var items = [];
  if (q) {
    var lq = q.toLowerCase();
    items = state.articles.filter(function (a) {
      return (a.title + " " + (a.summary || "") + " " + (a.tags || []).join(" ")).toLowerCase().indexOf(lq) !== -1;
    });
  }
  app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / খোঁজার ফলাফল</div>' +
    "<h1>" + (q ? "“" + escapeHtml(q) + "”" : "খোঁজার ফলাফল") + "</h1>" +
    "<p>মোট " + bn(items.length) + "টি সংবাদ পাওয়া গেছে</p></div>" +
    (items.length
      ? '<div class="grid cols-3">' + items.map(cardHtml).join("") + "</div>"
      : '<div class="empty">“<b>' + escapeHtml(q) + '</b>” — এই শব্দের সাথে মিলে যাওয়া কোনো সংবাদ পাওয়া যায়নি।<br><br><a class="btn" href="' + homeHref() + '">← প্রচ্ছদে ফিরুন</a></div>');
}

function renderArticle(app, id) {
  var a = state.byId[id];
  if (!a && (id === "thy-recruitment-2026" || id.indexOf("thy") !== -1 || id.indexOf("recruitment") !== -1)) {
    a = RECRUITMENT_ARTICLE;
    state.byId[a.id] = a;
  }
  if (!a) {
    document.title = "সংবাদ পাওয়া যায়নি — বাংলা নিউজ এডিশন";
    resetOgMeta();
    setRobots('noindex, follow');
    app.innerHTML = '<div class="empty"><h2 style="margin-bottom:.6rem">সংবাদটি পাওয়া যায়নি</h2>ফিড হালনাগাদ হওয়ায় লিংকটি পুরনো হয়ে থাকতে পারে।<br><br><a class="btn" href="' + homeHref() + '">← প্রচ্ছদে ফিরুন</a></div>';
    return;
  }
  document.title = escapeHtml(a.title) + " — বাংলা নিউজ এডিশন";
  recordRead(a.id); /* P6: রিড-হিস্টরি (রেকমেন্ডেশনের জন্য) */
  /* Dynamic social meta for Facebook/WhatsApp/Telegram share preview */
  updateOgMeta(a);
  var related = state.articles.filter(function (x) { return x.category === a.category && x.id !== a.id; }).slice(0, 5);
  var body = a.paragraphs.length
    ? a.paragraphs.map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join("")
    : "<p>" + escapeHtml(a.summary) + "</p>";

  var figureHtml = a.id === "thy-recruitment-2026"
    ? '<div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));margin-top:1.2rem;">' +
        '<figure style="margin:0;"><img src="images/overseas-campaign.webp" alt="Recruitment Photo Banner" style="width:100%;border-radius:10px;"></figure>' +
        '<figure style="margin:0;"><img src="images/overseas-campaign-poster.webp" alt="Recruitment Infographic Poster" style="width:100%;border-radius:10px;"></figure>' +
      '</div>'
    : '<figure><img src="' + escapeHtml(imgOf(a)) + '" alt="" onerror="this.src=\'' + catMeta(a.category).img + '\'"></figure>';

  app.innerHTML = '<div class="article-wrap"><article class="article">' +
    '<div class="breadcrumb"><a href="' + homeHref() + '">প্রচ্ছদ</a> / <a href="' + catHref(a.category) + '">' + escapeHtml(a.category) + "</a></div>" +
    badgeHtml(a.category) + "<h1>" + escapeHtml(a.title) + "</h1>" +
    '<div class="meta-row"><span class="src">' + escapeHtml(a.sourceLabel) + "</span><span>" + timeAgo(a.ts) + "</span></div>" +
    figureHtml +
    '<div class="article-body">' + body + "</div>" +
        (a.link
      ? '<div class="source-box">মূল সংবাদের সম্পূর্ণ ভার্সন পড়ুন: ' +
        (a.link.indexOf('http') === 0 ? '<a class="btn" style="background:#0f172a;" href="' + escapeHtml(a.link) + '" target="_blank" rel="noopener nofollow">মূল ওয়েবসাইটে পড়ুন ↗</a> ' : '') +
        '<button class="btn" style="background:#047857;" onclick="openBneInAppReader(\'' + escapeHtml(a.link) + '\', \'' + escapeHtml(a.title.replace(/'/g, "\\'")) + '\', \'' + escapeHtml(a.sourceLabel.replace(/'/g, "\\'")) + '\')">📱 বি-এন-ই নেটিভ রীডারে পড়ুন →</button></div>'
      : "") +
    (function() {
  var shareUrl2 = articleUrl(a);
  var fbUrl2 = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl2);
  var waUrl2 = 'https://wa.me/?text=' + encodeURIComponent(a.title + ' — বাংলা নিউজ এডিশন পড়ুন: ' + shareUrl2);
  var tgUrl2 = 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl2) + '&text=' + encodeURIComponent(a.title);
  return '<div class="social-share-bar" style="margin:1.2rem 0;display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">' +
    '<span style="font-size:0.82rem;font-weight:700;color:#64748b;margin-right:2px;">📤 শেয়ার করুন:</span>' +
    '<a href="' + fbUrl2 + '" target="_blank" rel="noopener" style="background:#1877f2;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.82rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">📘 Facebook</a>' +
    '<a href="' + waUrl2 + '" target="_blank" rel="noopener" style="background:#25d366;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.82rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">💬 WhatsApp</a>' +
    '<a href="' + tgUrl2 + '" target="_blank" rel="noopener" style="background:#0088cc;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.82rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">✈️ Telegram</a>' +
    '<button onclick="bneShareCopyLink(this, \'' + shareUrl2 + '\')" style="background:#64748b;color:#fff;padding:6px 14px;border-radius:20px;font-size:0.82rem;font-weight:700;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">🔗 লিংক কপি</button>' +
    '</div>';
})() +
    renderAdSlot("article_bottom") +
    (a.tags.length ? '<div class="tags">' + a.tags.map(function (t) { return "<span>#" + escapeHtml(t) + "</span>"; }).join("") + "</div>" : "") +
    "</article><aside>" + renderAdSlot("article_sidebar") + sectionHead("সম্পর্কিত সংবাদ") +
    '<div style="display:grid;gap:.8rem">' +
    (related.length ? related.map(cardSmHtml).join("") : '<div class="empty">এই বিভাগে আর কোনো সংবাদ নেই।</div>') +
    "</div></aside></div>";
  window.scrollTo(0, 0);
}

var PROBASHI_KEYWORDS = [
  "প্রবাসী", "প্রবাস", "রেমিট্যান্স", "ভিসা", "আকামা", "পাসপোর্ট", "বিএমইটি", "প্রবাসী কল্যাণ", 
  "জনশক্তি", "সৌদি", "মালয়েশিয়া", "দুবাই", "কাতার", "কুয়েত", "ওমান", "ইউরোপ", "রোমানিয়া", 
  "ইতালি", "গ্রীস", "মাল্টা", "জাপান", "কোরিয়া", "ওয়ার্ক পারমিট", "এয়ারপোর্ট", "ওয়েজ আর্নার্স"
];

function isProbashiArticle(article) {
  if (article.category === "প্রবাস") return true;
  var text = (article.title + " " + article.summary + " " + (article.tags || []).join(" ")).toLowerCase();
  for (var i = 0; i < PROBASHI_KEYWORDS.length; i++) {
    if (text.indexOf(PROBASHI_KEYWORDS[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

function renderProbashiDesk(app, subFilter) {
  document.title = "প্রবাস বাংলা নিউজ — বাংলা নিউজ এডিশন | BANGLA NEWS EDITION";
  resetOgMeta();
  setCanonical(canonicalFor(deskHref(subFilter || "")));
  setBreadcrumbLd([
    breadcrumbItem('প্রচ্ছদ', OG_DEFAULTS.url),
    breadcrumbItem('প্রবাস বাংলা নিউজ', canonicalFor(deskHref('')))
  ]);
  var expatArticles = state.articles.filter(isProbashiArticle);
  if (!expatArticles.length) {
    expatArticles = state.articles.filter(function(a) { return a.category === "প্রবাস" || a.category === "আন্তর্জাতিক"; });
  }

  var filtered = expatArticles.slice();
  if (subFilter === 'remittance') {
    filtered = expatArticles.filter(function(a) { return /রেমিট্যান্স|টাকা|ব্যাংক|ডলার|প্রণোদনা|রিজার্ভ/i.test(a.title + a.summary); });
  } else if (subFilter === 'visa') {
    filtered = expatArticles.filter(function(a) { return /ভিসা|আকামা|ওয়ার্ক পারমিট|নিয়োগ|সৌদি|মালয়েশিয়া|ইউরোপ|রোমানিয়া|ইতালি|জাপান|কোরিয়া/i.test(a.title + a.summary); });
  } else if (subFilter === 'welfare') {
    filtered = expatArticles.filter(function(a) { return /বিএমইটি|পাসপোর্ট|প্রবাসী কল্যাণ|স্মার্ট|কার্ড|এয়ারপোর্ট|হেল্প/i.test(a.title + a.summary); });
  }
  if (!filtered.length) filtered = expatArticles;

  var html = '<div class="probashi-desk-banner">' +
    '<h2>✈️ প্রবাস বাংলা নিউজ ডেস্ক — প্রবাসীদের আস্থা ও বিশ্বস্ত খবরের ঠিকানা</h2>' +
    '<p>বিশ্বজুড়ে বসবাসরত প্রবাসী এবং প্রবাসগমনেচ্ছু বাংলাদেশীদের জন্য বিশেষায়িত খবর, বৈধ উপায়ে রেমিট্যান্স তথ্য, ভিসা আপডেট, বিএমইটি স্মার্ট প্রবাসী কার্ড গাইড ও বিশেষ নিয়োগ বিজ্ঞপ্তি।</p>' +
    '<div class="probashi-filter-bar">' +
      '<a href="' + deskHref('') + '" class="probashi-filter-btn ' + (!subFilter || subFilter === 'all' ? 'active' : '') + '">সব প্রবাস সংবাদ (' + bn(expatArticles.length) + ')</a>' +
      '<a href="' + deskHref('remittance') + '" class="probashi-filter-btn ' + (subFilter === 'remittance' ? 'active' : '') + '">💵 রেমিট্যান্স ও ব্যাংকিং</a>' +
      '<a href="' + deskHref('visa') + '" class="probashi-filter-btn ' + (subFilter === 'visa' ? 'active' : '') + '">🛂 প্রবাসগমন ও ভিসা গাইড</a>' +
      '<a href="' + deskHref('welfare') + '" class="probashi-filter-btn ' + (subFilter === 'welfare' ? 'active' : '') + '">📜 বিএমইটি ও স্মার্ট প্রবাসী কার্ড</a>' +
    '</div></div>';

  html += renderAdSlot("probashi_hub");
  html += renderAdSlot("probashi_top");
  html += '<div class="grid cols-3" style="margin-top:1.2rem">' +
    (filtered.length ? filtered.map(cardHtml).join("") : '<div class="empty">এই মুহূর্তে প্রবাস সংবাদের ফিল্টারে কোনো খবর নেই।</div>') +
    '</div>';

  app.innerHTML = html;
  window.scrollTo(0, 0);
}

function renderTicker() {
  var wrap = document.getElementById("ticker-wrap");
  var track = document.getElementById("ticker");
  var top = state.articles.slice(0, 8);
  if (!top.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  track.innerHTML = top.map(function (a) {
    return '<a href="' + newsHref(a.id) + '"><span class="dot">●</span>' + escapeHtml(a.title) + "</a>";
  }).join("");
}

function renderNav() {
  var route = parseRoute();
  document.querySelectorAll("#nav-list a").forEach(function (link) {
    var nav = link.getAttribute("data-nav");
    var active = (route.page === "home" && nav === "home") || 
                 (route.page === "category" && nav === route.param) ||
                 (route.page === "probashi-desk" && nav === "probashi-desk");
    link.classList.toggle("active", active);
  });
}

function parseRoute() {
  var h = decodeURIComponent(location.hash || "");
  var path = location.pathname;
  var m;
  /* http হোস্টে রিয়েল-পাথ আগে (netlify.toml redirect → index.html) */
  if (isHttpHost()) {
    if ((m = path.match(/^\/news\/([^/]+)/))) return { page: "news", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/category\/([^/]+)/))) return { page: "category", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/search\/([^/]+)/))) return { page: "search", param: decodeURIComponent(m[1]) };
    if ((m = path.match(/^\/desk\/probashi-bangla-news(?:\/(.+))?$/))) {
      return { page: "probashi-desk", param: m[1] ? decodeURIComponent(m[1]) : null };
    }
  }
  if ((m = h.match(/^#\/news\/(.+)$/))) return { page: "news", param: m[1] };
  if ((m = h.match(/^#\/category\/(.+)$/))) return { page: "category", param: m[1] };
  if ((m = h.match(/^#\/search\/(.+)$/))) return { page: "search", param: m[1] };
  if ((m = h.match(/^#\/desk\/probashi-bangla-news(?:\/(.+))?$/)) || h === "#/probashi") {
    return { page: "probashi-desk", param: m ? m[1] : null };
  }
  return { page: "home", param: null };
}

/* ── নিরাপত্তা ও আড়ালকরণ ইঞ্জিন (অ্যাডমিন-অনলি সুরক্ষা) ────────── */
function secureAndCleanUI() {
  var isAdmin = false;
  try {
    isAdmin = !!localStorage.getItem("azadi_admin_hash");
  } catch (e) {}

  if (isAdmin) {
    document.body.classList.add("show-admin");
  } else {
    document.body.classList.remove("show-admin");
  }

  // ১. স্ট্যাটাস বার হ্যান্ডলিং — সাধারণ ভিজিটরদের জন্য সম্পূর্ণ আড়াল (প্রিমিয়াম লুক)
  var bar = document.getElementById("statusbar");
  if (bar) {
    if (isAdmin) {
      bar.style.setProperty("display", "flex", "important");
    } else {
      bar.style.setProperty("display", "none", "important");
    }
  }

  // ২. স্পর্শকাতর কীওয়ার্ড আড়ালকরণ — আরএসএস ফিড, সংরক্ষিত, ড্যাশবোর্ড, অটোমেশন, উৎস ইত্যাদি
  var dangerousKeywords = ["আরএসএস", "ফিড", "সংরক্ষিত", "ড্যাশবোর্ড", "অটোমেশন", "উৎস", "সূত্র", "rss", "feed", "dashboard", "automation", "source", "saved"];

  // ৩. নেভিগেশন বার, ফুটার, মেনু ইত্যাদি স্ক্যান করা (সংবাদের বডি যাতে নষ্ট না হয়)
  var elements = document.querySelectorAll("nav a, footer a, nav li, footer li, .mainnav a, .mainnav li, .site-footer li, .site-footer a");
  elements.forEach(function (el) {
    var txt = (el.textContent || el.innerText || "").toLowerCase();
    var match = false;
    for (var k = 0; k < dangerousKeywords.length; k++) {
      if (txt.indexOf(dangerousKeywords[k]) !== -1) {
        match = true;
        break;
      }
    }
    if (match) {
      if (!isAdmin) {
        el.style.setProperty("display", "none", "important");
        if (el.tagName === "A" && el.parentNode && el.parentNode.tagName === "LI") {
          el.parentNode.style.setProperty("display", "none", "important");
        }
      } else {
        el.classList.add("admin-only");
      }
    }
  });
}

function render() {
  var app = document.getElementById("app");
  var route = parseRoute();
  clearHeroTimer(); /* পুরনো রোটেশন টাইমার বন্ধ (লিক প্রতিরোধ) */
  if (route.page === "news") renderArticle(app, route.param);
  else if (route.page === "category") renderCategory(app, route.param);
  else if (route.page === "search") renderSearch(app, route.param);
  else if (route.page === "probashi-desk") renderProbashiDesk(app, route.param);
  else renderHome(app);
  if (route.page === "home") startHeroRotator();
  renderTicker();
  renderNav();
  secureAndCleanUI();
}

function startLiveClock() {
  function update() {
    var now = new Date();
    var timeEl = document.getElementById("live-time");
    var dateEl = document.getElementById("today-date");

    if (timeEl) {
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      timeEl.textContent = bn(h) + ":" + bn(m) + ":" + bn(s);
    }
    if (dateEl) {
      var weekday = new Intl.DateTimeFormat("bn-BD", { weekday: "long" }).format(now);
      var fullDate = new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", year: "numeric" }).format(now);
      dateEl.textContent = weekday + ", " + fullDate;
    }
  }
  update();
  setInterval(update, 1000);
}

/* ── বুটস্ট্র্যাপ ──────────────────────────────────────────────── */
function init() {
  startLiveClock();
  document.getElementById("footer-year").textContent = "© " + bn(new Date().getFullYear()) + " বাংলা নিউজ এডিশন";

  var footCats = document.getElementById("footer-cats");
  if (footCats) {
    footCats.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var fli = document.createElement("li");
      fli.innerHTML = '<a href="' + catHref(cat.name) + '">' + escapeHtml(cat.name) + "</a>";
      footCats.appendChild(fli);
    });
  }
  var footSources = document.getElementById("footer-sources");
  Object.keys(SOURCES).forEach(function (key) {
    var li = document.createElement("li");
    li.textContent = SOURCES[key].label;
    footSources.appendChild(li);
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);

  /* SPA লিংক ডেলিগেশন — রিয়েল-পাথ ও hash উভয় href কাজ করে (P1) */
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document && !(el.tagName === "A" && el.getAttribute("href"))) el = el.parentNode;
    if (!el || el === document) return;
    var href = el.getAttribute("href") || "";
    if (!href || /^(https?:|mailto:|tel:|javascript:)/i.test(href)) return;
    if (href.charAt(0) === "#" && href.charAt(1) !== "/") return; /* পেজ-অ্যাঙ্কর skip */
    if (href.indexOf("#/") === 0 || (isHttpHost() && href.charAt(0) === "/")) {
      e.preventDefault();
      navigate(href);
    }
  });

  /* সার্চ ফর্ম সাবমিট হ্যান্ডলার (গোপন অ্যাডমিন ট্রিগার — SHA-256 ডাইজেস্ট চেক) */
  var searchForm = document.getElementById("search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("search-input");
      var q = (input ? input.value : "").trim();
      if (!q) return;

      var normalized = q.replace(/[০-৯]/g, function (d) {
        var map = { "০":"0", "১":"1", "২":"2", "৩":"3", "৪":"4", "৫":"5", "৬":"6", "৭":"7", "৮":"8", "৯":"9" };
        return map[d] || d;
      });

      /* গোপন অ্যাডমিন ট্রিগার — প্লেইনটেক্সট নেই; SHA-256 ডাইজেস্ট তুলনা (সার্ভার-অথ P5-এর আগের সেতু) */
      var ADMIN_TRIGGER_HASH = "8c32cf6ed5feb952acfa9eeb45ca32492b102f3372b1d48aa8ba3899958ffbeb";
      var digestPromise = (window.crypto && crypto.subtle)
        ? crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
          }).catch(function () { return null; })
        : Promise.resolve(null);
      digestPromise.then(function (h) {
        if (h === ADMIN_TRIGGER_HASH) {
          try { localStorage.setItem("azadi_admin_hash", "1"); } catch (err) {}
          location.href = (siteConfig.settings && siteConfig.settings.adminPath) || "admin.html";
        } else {
          /* সার্চ রুটে নেভিগেট (রিয়েল-পাথ বা hash — হোস্ট অনুযায়ী) */
          navigate(searchHref(q));
          if (input) input.blur();
        }
      });
    });
  }

  /* গোপন অ্যাডমিন ট্রিগার — ফুটারের সাল-লেখায় ২.৫ সেকেন্ডের মধ্যে ৭ বার ট্যাপ */
  var taps = 0, tapTimer = null;
  document.getElementById("footer-year").addEventListener("click", function () {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { taps = 0; }, 2500);
    if (taps >= 7) {
      taps = 0;
      location.href = (siteConfig.settings && siteConfig.settings.adminPath) || "admin.html";
    }
  });

  /* ⚡ মাস্টার try-catch-finally রেন্ডার লুপ (ইনফিনিট লোডিং লুপ প্রতিরোধ) */
  try {
    var skElement = document.getElementById("skeleton");
    if (skElement && skElement.parentNode) skElement.parentNode.removeChild(skElement);
    var sbElement = document.getElementById("statusbar");
    if (sbElement) sbElement.style.display = "none";

    loadCache();
    applyEditorNews(); /* ক্যাশ/ফিড যাই হোক, সম্পাদকীয় লিড সর্বদা দৃশ্যমান */
    render();

    fetchRemoteConfig().then(function () {
      loadLocalConfigPreview();
      applyEditorNews();
      render();
    }).catch(function () {});

    refreshAll(true).then(function () {
      applyEditorNews();
      render();
    }).catch(function () {});
  } catch (err) {
    console.error("Init execution error caught:", err);
    state.articles = SEED_ARTICLES;
    indexArticles();
    render();
  } finally {
    var skFinal = document.getElementById("skeleton");
    if (skFinal && skFinal.parentNode) skFinal.parentNode.removeChild(skFinal);
    var sbFinal = document.getElementById("statusbar");
    if (sbFinal) sbFinal.style.display = "none";
    initGlobalAdManager();
  }

  /* ট্যাব খোলা থাকলেও প্রতি ৫ মিনিটে ব্যাকগ্রাউন্ড হালনাগাদ */
  setInterval(function () {
    fetchRemoteConfig().then(function () {
      loadLocalConfigPreview();
      refreshAll(true).then(function () { applyEditorNews(); render(); });
    }).catch(function () {});
  }, CACHE_TTL);
}

/* ═══ BNE Native Readability Extractor (Zero iFrames) ═══ */
function openBneInAppReader(url, title, sourceLabel) {
  var modal = document.getElementById("bne-reader-modal");
  if (!modal) return;

  var loader = document.getElementById("bne-reader-loader");
  var content = document.getElementById("bne-reader-content");
  var titleEl = document.getElementById("bne-reader-title");

  if (titleEl) titleEl.textContent = title || "বাংলা নিউজ এডিশন — নেটিভ সংবাদ পাঠক";
  if (loader) loader.classList.remove("hidden");
  if (content) {
    content.classList.add("hidden");
    content.innerHTML = "";
  }

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  /* CORS প্রক্সির মাধ্যমে মূল সংবাদের Raw HTML ফেচ */
  var proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(url);

  fetchWithTimeout(proxyUrl, 10000)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var rawHtml = data ? data.contents : "";
      if (!rawHtml) throw new Error("Empty HTML content");

      var parser = new DOMParser();
      var doc = parser.parseFromString(rawHtml, "text/html");

      /* স্ক্রিপ্ট, স্টাইল, নেভিগেশন ও এক্সটার্নাল অ্যাড রিমুভ */
      var unwanted = doc.querySelectorAll("script, style, nav, footer, header, aside, iframe, form, button, .ad, .advertisement");
      unwanted.forEach(function (el) { el.remove(); });

      /* মূল কনটেন্ট রুট এলিমেন্ট সিলেকশন */
      var articleEl = doc.querySelector("article, .post-content, .article-body, .main-content, main");
      var htmlPayload = "";

      if (articleEl) {
        htmlPayload = articleEl.innerHTML;
      } else {
        var ps = doc.querySelectorAll("p, img, h1, h2, h3");
        var parts = [];
        ps.forEach(function (p) {
          if (p.textContent.trim().length > 20 || p.tagName === "IMG") {
            parts.push(p.outerHTML);
          }
        });
        htmlPayload = parts.join("");
      }

      if (!htmlPayload || htmlPayload.length < 50) {
        throw new Error("Content extraction fallback needed");
      }

      renderNativeModalContent(title, htmlPayload, url, sourceLabel || "সংবাদ মাধ্যম");
    })
    .catch(function () {
      /* ফলব্যাক: প্রাক-প্রসেস করা টেক্সট ও সামারি রেন্ডার */
      var fallbackHtml = '<h3>' + escapeHtml(title) + '</h3><p>সংবাদটির বিস্তারিত অংশ সরাসরি রিডঅ্যাবিলিটি পোর্টালে লোড করা হয়েছে। মূল সংবাদের সম্পূর্ণ ভার্সন পড়তে নিচের বোতামে ক্লিক করুন।</p>';
      renderNativeModalContent(title, fallbackHtml, url, sourceLabel || "সংবাদ মাধ্যম");
    });
}

function renderNativeModalContent(title, bodyHtml, url, sourceLabel) {
  var loader = document.getElementById("bne-reader-loader");
  var content = document.getElementById("bne-reader-content");

  if (loader) loader.classList.add("hidden");
  if (content) {
    var editorialBox =
      '<div class="bne-editorial-note-box" style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;padding:1rem;border-radius:6px;margin-bottom:1.2rem;font-size:0.88rem;color:#166534;line-height:1.6;">' +
        '<b>📝 বি-এন-ই এডিটরিয়াল নোট:</b> এই সংবাদটি স্বয়ংক্রিয়ভাবে সংগৃহীত এবং আমাদের সম্পাদকীয় নীতি অনুযায়ী ফিল্টারকৃত। সংবাদের মূল সোর্স: <b>' + escapeHtml(sourceLabel) + '</b>। (বি-এন-ই নেটিভ ইন-অ্যাপ প্রকাশনা)' +
      '</div>';

    content.innerHTML =
      '<div class="bne-native-article-wrap">' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<div class="bne-native-meta">সংবাদ পরিবেশনা: <b>' + escapeHtml(sourceLabel) + '</b> · বি-এন-ই কিউরেটেড প্রকাশনা</div>' +
        editorialBox +
        '<div class="bne-native-body">' + bodyHtml + '</div>' +
        '<div class="bne-canonical-footer">' +
          'সংবাদ সুত্র ও পোর্টালে তথ্য ভাণ্ডার: <b>' + escapeHtml(sourceLabel) + '</b> · বাংলা নিউজ এডিশন ডিজিটাল কিউরেটর আর্কাইভ' +
        '</div>' +
      '</div>';
    content.classList.remove("hidden");
  }
}

function closeBneInAppReader() {
  var modal = document.getElementById("bne-reader-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  var content = document.getElementById("bne-reader-content");
  if (content) content.innerHTML = "";
  document.body.style.overflow = "";
}

/* Global Smart Ad Engine Handlers */
function closeStickyBottomAd() {
  var ad = document.getElementById("bne-sticky-bottom-ad");
  if (ad) ad.remove();
}

function closeScrollPopupAd() {
  var modal = document.getElementById("bne-scroll-popup-ad");
  if (modal) modal.classList.add("hidden");
  sessionStorage.setItem("recruitment_ad_dismissed", "true");
}

function initGlobalAdManager() {
  var activeAds = (siteConfig.ads || []).filter(function (a) { return a.enabled && a.type === "image"; });
  if (!activeAds.length) {
    if (window.AZADI_DEFAULT_CONFIG && window.AZADI_DEFAULT_CONFIG.ads) {
      activeAds = window.AZADI_DEFAULT_CONFIG.ads.filter(function (a) { return a.enabled && a.type === "image"; });
    }
  }

  var selectedAd = activeAds[0] || {
    title: "AD International Enterprises — PU Technology & Anti-Rust",
    image: "images/ad_int_poster.jpg",
    link: "#/desk/probashi-bangla-news"
  };

  var existing = document.getElementById("bne-sticky-bottom-ad");
  if (existing) existing.remove();

  var adContainer = document.createElement("div");
  adContainer.id = "bne-sticky-bottom-ad";
  adContainer.className = "bne-sticky-bottom-ad";
  adContainer.innerHTML =
    '<button class="bne-ad-close-btn" onclick="closeStickyBottomAd()" title="বিজ্ঞাপন বন্ধ করুন [✕]">✕</button>' +
    '<div class="bne-ad-tag-label">📢 স্পন্সরড বিজ্ঞাপন | BNE</div>' +
    '<div class="bne-ad-content">' +
      '<a href="' + escapeHtml(resolveHref(selectedAd.link || "#/desk/probashi-bangla-news")) + '">' +
        '<img src="' + escapeHtml(selectedAd.image) + '" alt="' + escapeHtml(selectedAd.title) + '" />' +
      '</a>' +
    '</div>';

  document.body.appendChild(adContainer);

  var popupTriggered = false;
  window.addEventListener("scroll", function () {
    /* 🔴 Reading Progress Bar Logic */
    var progressBar = document.getElementById("bne-progress-bar");
    if (progressBar) {
      var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var scrolled = (height > 0) ? (winScroll / height) * 100 : 0;
      progressBar.style.width = scrolled + "%";
    }
  });

  // Auto-Popup recruitment campaign interstitial ad 3 seconds after page load
  if (!sessionStorage.getItem("recruitment_ad_dismissed")) {
    setTimeout(function () {
      var modal = document.getElementById("bne-scroll-popup-ad");
      if (modal) modal.classList.remove("hidden");
    }, 3000);
  }
}

/* 🌓 Theme & Mobile Drawer Initializer */
function initUiInteractions() {
  /* Restore Saved Theme */
  var savedTheme = localStorage.getItem("bne-theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("force-dark");
    document.body.classList.add("force-dark");
  }

  var themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function() {
      var isDark = document.documentElement.classList.toggle("force-dark");
      document.body.classList.toggle("force-dark");
      localStorage.setItem("bne-theme", isDark ? "dark" : "light");
    });
  }

  /* Mobile Drawer Toggle */
  var menuBtn = document.getElementById("mobile-menu-btn");
  var drawer = document.getElementById("mobile-drawer");
  var overlay = document.getElementById("drawer-overlay");
  var closeBtn = document.getElementById("drawer-close-btn");

  function openDrawer() {
    if (drawer) drawer.classList.add("active");
    if (overlay) overlay.classList.add("active");
  }
  function closeDrawer() {
    if (drawer) drawer.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
  }

  if (menuBtn) menuBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  /* Close drawer on nav link click */
  if (drawer) {
    drawer.querySelectorAll("a").forEach(function(link) {
      link.addEventListener("click", closeDrawer);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUiInteractions);
} else {
  initUiInteractions();
}

document.addEventListener("DOMContentLoaded", init);
