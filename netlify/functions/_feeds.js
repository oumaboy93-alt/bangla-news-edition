/**
 * BNE — Shared Feed Engine (Netlify Functions-এর জন্য)
 * ৯টি বাংলা RSS সূত্র সার্ভার-সাইড থেকে ফেচ + নরমালাইজ (P2 ইনজেশন)
 * app.js-এর SOURCES/hashId-এর সাথে সামঞ্জস্যপূর্ণ।
 */

const SOURCES = {
  banglaedition: { label: "বাংলা এডিশন", rss: "https://www.banglaedition.com/feed/" },
  prothomalo: { label: "প্রথম আলো", rss: "https://www.prothomalo.com/feed/" },
  jugantor: { label: "যুগান্তর", rss: "https://www.jugantor.com/feed/" },
  ittefaq: { label: "ইত্তেফাক", rss: "https://www.ittefaq.com.bd/feed/" },
  bdnews24: { label: "বিডিনিউজ২৪", rss: "https://bangla.bdnews24.com/?feed=rss2" },
  somoynews: { label: "সময় নিউজ", rss: "https://somoynews.tv/feed/" },
  banglatribune: { label: "বাংলা ট্রিবিউন", rss: "https://www.banglatribune.com/feed/" },
  bdjournal: { label: "বাংলাদেশ জার্নাল", rss: "https://bd-journal.com/feed/latest-rss.xml" },
  dailybangladesh: { label: "ডেইলি বাংলাদেশ", rss: "https://daily-bangladesh.com/rss/rss.xml" }
};

const FEED_TIMEOUT_MS = 6000; /* Netlify ফাংশন সীমা (~১০s) — প্যারালাল ফেচে মোট সময় ≤ সর্বোচ্চ একক সূত্র */
const MAX_ITEMS_PER_SOURCE = 12;

function hashId(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function stripTags(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "") /* CDATA-র্যাপার সরাও */
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageFromXml(xml, fallback) {
  const m = String(xml || "").match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<enclosure[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  if (fallback && /^https?:/.test(fallback)) return fallback;
  return null;
}

/* বিশ্বস্ত টাইমআউট: fetch + AbortController — DNS/কানেক্ট/বডি সব ফেজ কভার করে */
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (BNE-RSS-Proxy; +https://bangla-news-edition.netlify.app)" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("টাইমআউট");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* সার্ভার-সাইড: CORS নেই বলে সরাসরি XML ফেচই যথেষ্ট (rss2json রাউন্ড-ট্রিপ বাদ — দ্রুত ও নির্ভরশীল) */
async function fetchSource(key) {
  const src = SOURCES[key];
  let xml;
  try {
    xml = await fetchText(src.rss);
  } catch (e) {
    throw new Error("ফেচ ব্যর্থ: " + src.label);
  }

  /* সরল XML → আইটেম (DOMParser নেই; regex-ভিত্তিক হালকা পার্স) */
  const items = [];
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < MAX_ITEMS_PER_SOURCE) {
    const block = m[1];
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const linkRaw = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "";
    const link = String(linkRaw).trim() || ((block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || "");
    if (!title || link.indexOf("http") !== 0) continue;
    const desc = stripTags((block.match(/<(?:description|content:encoded|summary)[^>]*>([\s\S]*?)<\/(?:description|content:encoded|summary)>/i) || [])[1] || "");
    const pub = (block.match(/<(?:pubdate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubdate|published|updated)>/i) || [])[1] || "";
    items.push({
      title,
      link,
      summary: desc,
      image: extractImageFromXml(block),
      ts: pub && !isNaN(Date.parse(pub)) ? Date.parse(pub) : Date.now(),
      source: key,
      sourceLabel: src.label
    });
  }
  if (!items.length) throw new Error("খালি ফিড: " + src.label);
  return items;
}

async function fetchAllFeeds() {
  const keys = Object.keys(SOURCES);
  const settled = await Promise.allSettled(keys.map(fetchSource));
  const items = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else errors.push({ source: keys[i], error: String(r.reason && r.reason.message || r.reason) });
  });
  /* একই লিংক ডিডুপ + তারিখ অনুযায়ী সাজানো */
  const seen = new Set();
  const unique = items.filter((it) => {
    if (seen.has(it.link)) return false;
    seen.add(it.link);
    return true;
  }).sort((a, b) => b.ts - a.ts);
  return { items: unique, errors };
}

module.exports = { SOURCES, fetchAllFeeds, fetchSource, hashId };
