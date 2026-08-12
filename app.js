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

var CATEGORIES = [
  { name: "জাতীয়", badge: "", img: "images/national.jpg" },
  { name: "রাজনীতি", badge: "b-red", img: "images/politics.jpg" },
  { name: "সারাদেশ", badge: "b-teal", img: "images/national.jpg" },
  { name: "অর্থনীতি", badge: "b-amber", img: "images/economy.jpg" },
  { name: "আন্তর্জাতিক", badge: "b-sky", img: "images/international.jpg" },
  { name: "খেলা", badge: "b-indigo", img: "images/sports.jpg" },
  { name: "বিনোদন", badge: "b-fuchsia", img: "images/entertainment.jpg" },
  { name: "শিক্ষা", badge: "b-cyan", img: "images/technology.jpg" },
  { name: "চাকরি", badge: "b-amber", img: "images/economy.jpg" },
  { name: "প্রবাস", badge: "b-sky", img: "images/international.jpg" },
  { name: "ধর্ম", badge: "b-teal", img: "images/national.jpg" },
  { name: "স্বাস্থ্য", badge: "b-teal", img: "images/health.jpg" },
  { name: "প্রযুক্তি", badge: "b-cyan", img: "images/technology.jpg" }
];

var CATEGORY_KEYWORDS = [
  { category: "খেলা", keywords: ["ক্রিকেট", "ফুটবল", "খেলা", "টাইগার", "ম্যাচ", "সিরিজ", "টুর্নামেন্ট", "অলিম্পিক", "বিপিএল", "উইকেট", "গোল"] },
  { category: "আন্তর্জাতিক", keywords: ["যুক্তরাষ্ট্র", "ভারত", "চীন", "রাশিয়া", "ইউক্রেন", "গাজা", "ইসরায়েল", "ফিলিস্তিন", "জাতিসংঘ", "আন্তর্জাতিক", "বিশ্ব", "পাকিস্তান", "ইরান", "যুক্তরাজ্য", "মিয়ানমার"] },
  { category: "অর্থনীতি", keywords: ["অর্থনীতি", "রপ্তানি", "রেমিট্যান্স", "ব্যাংক", "শেয়ারবাজার", "মূল্যস্ফীতি", "বাজেট", "ডলার", "বিনিয়োগ", "রিজার্ভ", "পুঁজিবাজার", "টাকা"] },
  { category: "রাজনীতি", keywords: ["নির্বাচন", "রাজনীতি", "বিএনপি", "আওয়ামী", "জামায়াত", "সংসদ", "মন্ত্রণালয়", "উপদেষ্টা", "সরকার", "ভোট", "মনোনয়ন"] },
  { category: "প্রযুক্তি", keywords: ["প্রযুক্তি", "ইন্টারনেট", "স্মার্টফোন", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "সাইবার", "অ্যাপ", "গুগল", "ফেসবুক", "সফটওয়্যার", "স্টার্টআপ"] },
  { category: "বিনোদন", keywords: ["সিনেমা", "নাটক", "চলচ্চিত্র", "অভিনেতা", "অভিনেত্রী", "গান", "শিল্পী", "বিনোদন", "ওটিটি", "তারকা", "কনসার্ট"] },
  { category: "স্বাস্থ্য", keywords: ["স্বাস্থ্য", "হাসপাতাল", "ডেঙ্গু", "চিকিৎসা", "রোগ", "টিকা", "ভাইরাস", "ওষুধ", "ডাক্তার", "করোনা"] },
  { category: "সারাদেশ", keywords: ["জেলা", "থানা", "উপজেলা", "উপপ্রতিনিধি", "প্রতিনিধি", "গ্রাম", "মেডিসিন", "দুর্ঘটনা", "সারাদেশ"] },
  { category: "শিক্ষা", keywords: ["শিক্ষা", "বিশ্ববিদ্যালয়", "পরীক্ষা", "এসএসসি", "এইচএসসি", "ছাত্র", "শিক্ষার্থী", "শিক্ষক", "কলেজ", "স্কুল", "বুয়েট", "ঢাবি"] },
  { category: "চাকরি", keywords: ["চাকরি", "নিয়োগ", "বিসিএস", "নিয়োগ", "চাকরীর", "আবেদন", "পদ", "বেতন"] },
  { category: "প্রবাস", keywords: ["প্রবাস", "প্রবাসী", "রেমিট্যান্স", "মালয়েশিয়া", "সৌদি", "দুবাই", "কাতার", "ওমান", "মধ্যপ্রাচ্য"] },
  { category: "ধর্ম", keywords: ["ধর্ম", "ইসলাম", "হজ", "ওমরাহ", "নামাজ", "রোজা", "মসজিদ", "মক্কা", "মদিনা", "কুরআন", "হাদিস"] }
];

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
    state.articles.push({
      id: "ed-" + (n.id || hashId(n.title)),
      title: n.title,
      link: "",
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: plain ? plain.split(/\n+/).filter(function (p) { return p.trim().length > 1; }) : [],
      image: n.image || null,
      ts: ts,
      source: "editor",
      sourceLabel: "সম্পাদকীয় ডেস্ক",
      category: n.category || "জাতীয়",
      tags: n.tags || [],
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
      ? '<a href="' + escapeHtml(ad.link) + '" target="_blank" rel="noopener sponsored">' + img + "</a>"
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
  if (!list.length) return "";
  
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

function startAdRotator(containerId, count) {
  var current = 0;
  setInterval(function() {
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

/* ── ইউটিলিটি ──────────────────────────────────────────────────── */
var BN = { 0: "০", 1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬", 7: "৭", 8: "৮", 9: "৯" };
function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function stripTags(html) {
  var div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function timeAgo(ts) {
  var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return bn(s) + " সেকেন্ড আগে";
  var m = Math.floor(s / 60);
  if (m < 60) return bn(m) + " মিনিট আগে";
  var h = Math.floor(m / 60);
  if (h < 24) return bn(h) + " ঘণ্টা আগে";
  var d = Math.floor(h / 24);
  if (d < 30) return bn(d) + " দিন আগে";
  return new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ts));
}

function hashId(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function categorize(text) {
  var best = "জাতীয়", score = 0;
  CATEGORY_KEYWORDS.forEach(function (grp) {
    var s = 0;
    grp.keywords.forEach(function (kw) { if (text.indexOf(kw) !== -1) s++; });
    if (s > score) { score = s; best = grp.category; }
  });
  return best;
}

function extractTags(text) {
  var tags = [];
  CATEGORY_KEYWORDS.forEach(function (grp) {
    grp.keywords.forEach(function (kw) {
      if (tags.length < 5 && text.indexOf(kw) !== -1 && tags.indexOf(kw) === -1) tags.push(kw);
    });
  });
  return tags;
}

function catMeta(name) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].name === name) return CATEGORIES[i];
  return CATEGORIES[0];
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
    var plain = stripTags(desc);
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
      paragraphs: plain ? plain.split(/(?<=[।!?])\s+/).filter(function (p) { return p.length > 1; }) : [],
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
    var plain = stripTags(desc);
    var fullText = title + " " + plain;

    out.push({
      id: hashId(link),
      title: title,
      link: link,
      summary: plain.length > 220 ? plain.slice(0, 220).replace(/\s+\S*$/, "") + "…" : plain,
      paragraphs: plain ? plain.split(/(?<=[।!?])\s+/).filter(function (p) { return p.length > 1; }) : [],
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

var SEED_ARTICLES = [
  {
    id: "seed1",
    title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
    summary: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও পাসপোর্ট সেবায় নতুন ডিজিটাল পোর্টাল চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% প্রণোদনা বোনাস অব্যহত।",
    paragraphs: ["প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও পাসপোর্ট সেবায় নতুন ডিজিটাল পোর্টাল চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% প্রণোদনা বোনাস অব্যহত।", "বাংলাদেশ ব্যাংক ও প্রবাসী কল্যাণ মন্ত্রণালয়ের যৌথ উদ্যোগে প্রবাসীদের জন্য বিশেষ পেনসন ও সঞ্চয়পত্র সুবিধাও চালু রাখা হয়েছে।"],
    source: "banglaedition",
    sourceLabel: "বাংলা নিউজ এডিশন",
    category: "প্রবাস",
    ts: Date.now() - 300000,
    tags: ["প্রবাসী", "রেমিট্যান্স", "বিএমইটি", "স্মার্টকার্ড"],
    link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news"
  },
  {
    id: "seed2",
    title: "ইউরোপ ও মধ্যপ্রাচ্য প্রবাসগমন ভিসা সহায়তা ও নতুন সুযোগ",
    summary: "রোমানিয়া, ইতালি, গ্রীস ও সৌদি আরবে নতুন ওয়ার্ক পারমিট ও পাসপোর্ট নবায়ন প্রক্রিয়ার নতুন নির্দেশনা প্রকাশ।",
    paragraphs: ["ইউরোপ ও মধ্যপ্রাচ্যগামী বাংলাদেশীদের জন্য সরকারিভাবে নতুন নির্দেশিকা জারী করা হয়েছে।"],
    source: "prothomalo",
    sourceLabel: "প্রথম আলো",
    category: "আন্তর্জাতিক",
    ts: Date.now() - 600000,
    tags: ["ভিসা", "ইউরোপ", "সৌদি", "ওয়ার্কপারমিট"],
    link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news"
  },
  {
    id: "seed3",
    title: "দেশের বাজারে স্বর্ণ ও বৈদেশিক মুদ্রার নতুন রেট ঘোষণা",
    summary: "বাংলাদেশ ব্যাংক ও বাজুস কর্তৃক নতুন ডলার লেনদেন ও প্রবাসী রেমিট্যান্স বিনিময় মূল্য প্রকাশ।",
    paragraphs: ["বাংলাদেশ ব্যাংকের নতুন সার্কুলারে বাণিজ্যিক ব্যাংকগুলোতে ডলারের মধ্যবর্তী দর নির্ধারণ করা হয়েছে।"],
    source: "jugantor",
    sourceLabel: "যুগান্তর",
    category: "অর্থনীতি",
    ts: Date.now() - 900000,
    tags: ["অর্থনীতি", "ডলার", "রেমিট্যান্স"],
    link: "https://bangla-news-edition-247.netlify.app/"
  },
  {
    id: "seed4",
    title: "জাতীয় ক্রিকেট দলের আসন্ন সিরিজের সময়সূচী চূড়ান্ত",
    summary: "বাংলাদেশ ক্রিকেট বোর্ড (BCB) কর্তৃক নতুন আন্তর্জাতিক সিরিজের ভেন্যু ও দল ঘোষণা।",
    paragraphs: ["বাংলাদেশ জাতীয় দলের প্রধান নির্বাচক কমিটির মিটিং শেষে স্কোয়াড প্রকাশ করা হয়েছে।"],
    source: "somoynews",
    sourceLabel: "সময় নিউজ",
    category: "খেলা",
    ts: Date.now() - 1200000,
    tags: ["খেলা", "ক্রিকেট", "বিসিবি"],
    link: "https://bangla-news-edition-247.netlify.app/"
  },
  {
    id: "seed5",
    title: "হাইটেক পার্কে তৈরি হচ্ছে প্রবাসীদের জন্য বিশেষ ফ্রিল্যান্সিং হ্যাব",
    summary: "তথ্যপ্রযুক্তি বিভাগ থেকে রেমিট্যান্স যোদ্ধাদের জন্য ডিজিটাল স্কিল ও ফ্রিল্যান্সিং প্রশিক্ষণের উদ্যোগ।",
    paragraphs: ["হাইটেক পার্ক অথরিটি ও আইসিটি ডিভিশনের যৌথ উদ্যোগে নতুন প্রশিক্ষণ কোর্স শুরু হতে যাচ্ছে।"],
    source: "banglatribune",
    sourceLabel: "বাংলা ট্রিবিউন",
    category: "প্রযুক্তি",
    ts: Date.now() - 1500000,
    tags: ["প্রযুক্তি", "ফ্রিল্যান্সিং", "আইসিটি"],
    link: "https://bangla-news-edition-247.netlify.app/"
  }
];

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

function refreshAll(background) {
  var keys = Object.keys(SOURCES);
  setStatus("loading", "সংবাদ সূত্রগুলো থেকে সর্বশেষ খবর আনা হচ্ছে…");
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

/* ── রেন্ডারিং ─────────────────────────────────────────────────── */
function imgOf(a) { return a.image || catMeta(a.category).img; }

function badgeHtml(cat) {
  return '<span class="badge ' + catMeta(cat).badge + '">' + escapeHtml(cat) + "</span>";
}

function cardHtml(a) {
  return '<a class="card" href="#/news/' + a.id + '">' +
    '<span class="thumb"><img loading="lazy" src="' + escapeHtml(imgOf(a)) + '" alt="" onerror="this.src=\'' + catMeta(a.category).img + '\'">' + badgeHtml(a.category) + "</span>" +
    '<span class="body"><h3>' + escapeHtml(a.title) + "</h3><p>" + escapeHtml(a.summary) + "</p>" +
    '<span class="meta"><span>' + timeAgo(a.ts) + "</span><span>" + escapeHtml(a.sourceLabel) + "</span></span></span></a>";
}

function cardSmHtml(a) {
  return '<a class="card-sm" href="#/news/' + a.id + '">' +
    '<img loading="lazy" src="' + escapeHtml(imgOf(a)) + '" alt="" onerror="this.src=\'' + catMeta(a.category).img + '\'">' +
    '<span><span class="cat">' + escapeHtml(a.category) + "</span><h3>" + escapeHtml(a.title) + '</h3><div class="meta">' + timeAgo(a.ts) + "</div></span></a>";
}

function sectionHead(title, href) {
  return '<div class="section-head"><h2>' + escapeHtml(title) + "</h2>" +
    (href ? '<a href="' + href + '">সব দেখুন →</a>' : "") + "</div>";
}

function renderHome(app) {
  document.title = "বাংলা নিউজ এডিশন — সত্য ও বস্তুনিষ্ঠ খবরের বিশ্বস্ত ঠিকানা | BANGLA NEWS EDITION";
  var arts = state.articles.slice();
  if (!arts.length) {
    app.innerHTML = '<div class="empty">এই মুহূর্তে কোনো সংবাদ নেই — কয়েক সেকেন্ড পর স্বয়ংক্রিয়ভাবে চলে আসবে।<br><br><button class="btn" onclick="location.reload()">রিফ্রেশ করুন</button></div>';
    return;
  }
  /* সম্পাদক-নির্ধারিত লিড থাকলে সেটিই প্রধান শিরোনাম */
  for (var li = 0; li < arts.length; li++) {
    if (arts[li].lead) { arts.unshift(arts.splice(li, 1)[0]); break; }
  }
  var lead = arts[0], side = arts.slice(1, 5), grid = arts.slice(5, 14);
  var html = '<section class="hero">' +
    '<a class="hero-lead" href="#/news/' + lead.id + '">' +
    '<img src="' + escapeHtml(imgOf(lead)) + '" alt="" onerror="this.src=\'' + catMeta(lead.category).img + '\'">' +
    '<span class="overlay"></span><span class="content">' + badgeHtml(lead.category) +
    "<h1>" + escapeHtml(lead.title) + '</h1><div class="meta">' + timeAgo(lead.ts) + " · " + escapeHtml(lead.sourceLabel) + "</div></span></a>" +
    '<div class="hero-side">' + side.map(cardSmHtml).join("") + "</div></section>";

  html += renderAdSlot("home_top");

  html += '<section class="section">' + sectionHead("সর্বশেষ সংবাদ") +
    '<div class="grid cols-3">' + grid.map(cardHtml).join("") + "</div></section>";

  html += renderAdSlot("home_middle");

  CATEGORIES.forEach(function (cat) {
    var items = arts.filter(function (a) { return a.category === cat.name; }).slice(0, 4);
    if (!items.length) return;
    html += '<section class="section">' + sectionHead(cat.name, "#/category/" + encodeURIComponent(cat.name)) +
      '<div class="grid cols-4">' + items.map(cardSmHtml).join("") + "</div></section>";
  });
  app.innerHTML = html;
}

function renderCategory(app, name) {
  document.title = escapeHtml(name) + " — বাংলা নিউজ এডিশন | BANGLA NEWS EDITION";
  var items = state.articles.filter(function (a) { return a.category === name; });
  app.innerHTML = '<div class="page-title"><div class="breadcrumb"><a href="#/">প্রচ্ছদ</a> / ' + escapeHtml(name) + "</div>" +
    "<h1>" + escapeHtml(name) + "</h1><p>মোট " + bn(items.length) + "টি সংবাদ</p></div>" +
    (items.length
      ? '<div class="grid cols-3">' + items.map(cardHtml).join("") + "</div>"
      : '<div class="empty">এই বিভাগে এখনো সংবাদ আসেনি — একটু পরে রিফ্রেশ করুন।</div>');
}

function renderArticle(app, id) {
  var a = state.byId[id];
  if (!a) {
    document.title = "সংবাদ পাওয়া যায়নি — বাংলা নিউজ এডিশন";
    app.innerHTML = '<div class="empty"><h2 style="margin-bottom:.6rem">সংবাদটি পাওয়া যায়নি</h2>ফিড হালনাগাদ হওয়ায় লিংকটি পুরনো হয়ে থাকতে পারে।<br><br><a class="btn" href="#/">← প্রচ্ছদে ফিরুন</a></div>';
    return;
  }
  document.title = escapeHtml(a.title) + " — বাংলা নিউজ এডিশন";
  var related = state.articles.filter(function (x) { return x.category === a.category && x.id !== a.id; }).slice(0, 5);
  var body = a.paragraphs.length
    ? a.paragraphs.map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join("")
    : "<p>" + escapeHtml(a.summary) + "</p>";

  app.innerHTML = '<div class="article-wrap"><article class="article">' +
    '<div class="breadcrumb"><a href="#/">প্রচ্ছদ</a> / <a href="#/category/' + encodeURIComponent(a.category) + '">' + escapeHtml(a.category) + "</a></div>" +
    badgeHtml(a.category) + "<h1>" + escapeHtml(a.title) + "</h1>" +
    '<div class="meta-row"><span class="src">' + escapeHtml(a.sourceLabel) + "</span><span>" + timeAgo(a.ts) + "</span></div>" +
    '<figure><img src="' + escapeHtml(imgOf(a)) + '" alt="" onerror="this.src=\'' + catMeta(a.category).img + '\'"></figure>' +
    '<div class="article-body">' + body + "</div>" +
    (a.link
      ? '<div class="source-box">মূল সংবাদের সম্পূর্ণ ভার্সন পড়ুন: <button class="btn" style="background:#047857;" onclick="openBneInAppReader(\'' + escapeHtml(a.link) + '\', \'' + escapeHtml(a.title.replace(/'/g, "\\'")) + '\', \'' + escapeHtml(a.sourceLabel.replace(/'/g, "\\'")) + '\')">📱 বি-এন-ই নেটিভ রীডারে পড়ুন →</button> <a href="' + escapeHtml(a.link) + '" target="_blank" rel="noopener noreferrer" style="margin-left:8px;font-size:0.8rem;color:#64748b;">(মূল সাইটে দেখুন)</a></div>'
      : "") +
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
      '<a href="#/desk/probashi-bangla-news" class="probashi-filter-btn ' + (!subFilter || subFilter === 'all' ? 'active' : '') + '">সব প্রবাস সংবাদ (' + bn(expatArticles.length) + ')</a>' +
      '<a href="#/desk/probashi-bangla-news/remittance" class="probashi-filter-btn ' + (subFilter === 'remittance' ? 'active' : '') + '">💵 রেমিট্যান্স ও ব্যাংকিং</a>' +
      '<a href="#/desk/probashi-bangla-news/visa" class="probashi-filter-btn ' + (subFilter === 'visa' ? 'active' : '') + '">🛂 প্রবাসগমন ও ভিসা গাইড</a>' +
      '<a href="#/desk/probashi-bangla-news/welfare" class="probashi-filter-btn ' + (subFilter === 'welfare' ? 'active' : '') + '">📜 বিএমইটি ও স্মার্ট প্রবাসী কার্ড</a>' +
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
    return '<a href="#/news/' + a.id + '"><span class="dot">●</span>' + escapeHtml(a.title) + "</a>";
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
  var m;
  if ((m = h.match(/^#\/news\/(.+)$/))) return { page: "news", param: m[1] };
  if ((m = h.match(/^#\/category\/(.+)$/))) return { page: "category", param: m[1] };
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
  if (route.page === "news") renderArticle(app, route.param);
  else if (route.page === "category") renderCategory(app, route.param);
  else if (route.page === "probashi-desk") renderProbashiDesk(app, route.param);
  else renderHome(app);
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
      fli.innerHTML = '<a href="#/category/' + encodeURIComponent(cat.name) + '">' + escapeHtml(cat.name) + "</a>";
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

  /* সার্চ ফর্ম সাবমিট হ্যান্ডলার (সিক্রেট পাসওয়ার্ড #৩৮২২১৮ চেক) */
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

      if (normalized === "#382218" || normalized === "382218" || normalized === "#৩৮২২১৮" || normalized === "৩৮২২১৮") {
        try {
          localStorage.setItem("azadi_admin_hash", "382218");
        } catch (err) {}
        location.href = (siteConfig.settings && siteConfig.settings.adminPath) || "admin.html";
        return;
      }

      state.searchQuery = q;
      render();
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
    content.innerHTML =
      '<div class="bne-native-article-wrap">' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<div class="bne-native-meta">সংবাদ পরিবেশনা: <b>' + escapeHtml(sourceLabel) + '</b> · বি-এন-ই সার্বজনীন ডিজিটাল আর্কাইভ</div>' +
        '<div class="bne-native-body">' + bodyHtml + '</div>' +
        '<div class="bne-canonical-footer">' +
          'সংবাদ সুত্র ও পোর্টালে তথ্য ভাণ্ডার: <b>' + escapeHtml(sourceLabel) + '</b> · বাংলা নিউজ এডিশন নেটিভ ডিজিটাল পাঠক' +
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
  sessionStorage.setItem("bne_popup_dismissed", "true");
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
      '<a href="' + escapeHtml(selectedAd.link || "#/desk/probashi-bangla-news") + '">' +
        '<img src="' + escapeHtml(selectedAd.image) + '" alt="' + escapeHtml(selectedAd.title) + '" />' +
      '</a>' +
    '</div>';

  document.body.appendChild(adContainer);

  var popupTriggered = false;
  window.addEventListener("scroll", function () {
    if (popupTriggered || sessionStorage.getItem("bne_popup_dismissed")) return;
    popupTriggered = true;
    setTimeout(function () {
      var modal = document.getElementById("bne-scroll-popup-ad");
      if (modal) modal.classList.remove("hidden");
    }, 5000);
  });
}

document.addEventListener("DOMContentLoaded", init);
