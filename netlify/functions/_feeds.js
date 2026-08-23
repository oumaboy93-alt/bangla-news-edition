/**
 * BNE — Shared Feed Engine (Netlify Functions-এর জন্য)
 * ৯টি বাংলা RSS সূত্র সার্ভার-সাইড থেকে ফেচ + নরমালাইজ (P2 ইনজেশন)
 * app.js-এর SOURCES/hashId-এর সাথে সামঞ্জস্যপূর্ণ।
 */

const https = require('https');

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

const FEED_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_SOURCE = 12;

function hashId(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractImageFromXml(xml, fallback) {
  const m = String(xml || "").match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<enclosure[^>]*url=["']([^"']+)["']/i) ||
            String(xml || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  if (fallback && /^https?:/.test(fallback)) return fallback;
  return null;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FEED_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 400) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      if (res.statusCode >= 300 && res.headers.location) {
        res.resume();
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("timeout", () => { req.destroy(new Error("টাইমআউট")); });
    req.on("error", reject);
  });
}

/* rss2json API → ব্যর্থ হলে সরাসরি XML পার্স */
async function fetchSource(key) {
  const src = SOURCES[key];
  let xml = null;
  try {
    const apiUrl = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(src.rss);
    const jsonText = await fetchText(apiUrl);
    const json = JSON.parse(jsonText);
    if (json && json.status === "ok" && Array.isArray(json.items)) {
      return json.items.slice(0, MAX_ITEMS_PER_SOURCE).map((it) => ({
        title: stripTags(it.title),
        link: String(it.link || "").trim(),
        summary: stripTags(it.description || it.content || ""),
        image: (it.thumbnail && /^https?:/.test(it.thumbnail)) ? it.thumbnail : null,
        ts: it.pubDate && !isNaN(Date.parse(it.pubDate)) ? Date.parse(it.pubDate) : Date.now(),
        source: key,
        sourceLabel: src.label
      }));
    }
  } catch (e) { /* নিচে XML fallback */ }

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
