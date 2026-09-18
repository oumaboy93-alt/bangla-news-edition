/**
 * 🤖 BNE DYNAMIC NEWS SOCIAL POSTER ENGINE V6 — DUAL DISPATCH
 * -----------------------------------------------------------
 * টেলিগ্রাম চ্যানেল + ফেসবুক পেজ — দুটোতেই প্রিভিউসহ স্বয়ংক্রিয় পোস্ট।
 *
 * কীভাবে কাজ করে:
 *   1. ৯টি বাংলা RSS ফিড থেকে সর্বশেষ সংবাদ সংগ্রহ
 *   2. last_posted.json-এ আগের পোস্টগুলোর লিংক রাখা হয় — সদৃশ পোস্ট কখনো হয় না
 *   3. প্রতিটি রানে "নতুন" সংবাদগুলো (dedupe করে) MAX_POSTS_PER_RUN পর্যন্ত ব্যাচে পোস্ট হয়
 *   4. টেলিগ্রাম: ছবিসহ কার্ড (sendPhoto) → ব্যর্থ হলে টেক্সট (sendMessage)
 *   5. ফেসবুক: link মোডে feed পোস্ট (link + message → OG প্রিভিউ কার্ড) —
 *      FB_POST_MODE=photo দিলে ছবি+ক্যাপশন পোস্ট (photos endpoint)
 *
 * 🔐 নিরাপত্তা: কোনো টোকেন কোডে থাকে না — সব GitHub Secrets-এর env থেকে:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FB_PAGE_TOKEN, FB_PAGE_ID,
 *   FB_POST_MODE (link|photo), MAX_POSTS_PER_RUN (ডিফল্ট 5)
 */

const fs = require('fs');
const https = require('https');

/* ── ক্রেডেনশিয়াল (শুধু env) ── */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@bne0999";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "";
/* SMO/P1 — ডিফল্ট এখন "link"।
   photo মোডে ফেসবুক কোনো প্রিভিউ কার্ড বানায় না, ফলে লিংক ক্লিক গণনাই হয় না
   এবং ফেসবুক পেজে CTR-সিগন্যাল তৈরি হয় না। তাই লিংক-শেয়ারই ডিফল্ট;
   "photo" কেবল সচেতনভাবে override করলে ব্যবহৃত হবে। */
const FB_POST_MODE = (process.env.FB_POST_MODE || "link").toLowerCase() === "photo" ? "photo" : "link";
if (FB_POST_MODE === "photo") {
  console.log("⚠️ FB_POST_MODE=photo — লিংক প্রিভিউ ও ক্লিক-ট্র্যাকিং বন্ধ থাকবে।");
}

/* SMO/P1 — সোর্স: "api" (meta-service publish queue) অথবা "legacy" (সরাসরি RSS) */
const POSTER_MODE = (process.env.POSTER_MODE || "api").toLowerCase() === "legacy" ? "legacy" : "api";
const META_API_BASE = (process.env.META_API_BASE || "https://bangla-news-edition.netlify.app").replace(/\/+$/, "");
const QUEUE_TOKEN = process.env.QUEUE_TOKEN || "";
const MAX_POSTS_PER_RUN = Math.max(1, parseInt(process.env.MAX_POSTS_PER_RUN || "5", 10) || 5);
const FORCE_MODE = process.argv.includes('--force');
const GRAPH_VERSION = "v26.0"; /* Graph API বর্তমান ভার্সন */
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || ""; /* টোকেন-এক্সপায়ারি অ্যালার্টের ঠিকানা */
const IG_USER_ID = process.env.IG_USER_ID || ""; /* সেট করলে ইনস্টাগ্রাম ক্রস-পোস্ট (FB_PAGE_TOKEN দরকার) */

/* P4: retry + এক্সপোনেনশিয়াল ব্যাকঅফ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function postWithRetry(fn, label, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ok = await fn();
    if (ok) return true;
    if (attempt < retries) {
      const wait = 3000 * Math.pow(2, attempt);
      console.log(`🔄 [${label}] পুনরায় চেষ্টা (${attempt + 1}/${retries}) — ${wait / 1000}সে পরে...`);
      await sleep(wait);
    }
  }
  return false;
}

/* টোকেন-সমস্যা ধরা পড়লে অ্যাডমিন টেলিগ্রামে সতর্কতা */
function isTokenError(body) {
  return /Session has expired|OAuthException|Invalid OAuth|Error validating access token|expired/i.test(String(body || ""));
}
async function alertAdminTokenIssue(channel, body) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;
  const msg = `⚠️ BNE অ্যালার্ট: ${channel} টোকেন সমস্যা!\n\n${String(body || "").slice(0, 400)}\n\nটোকেন রিফ্রেশ করুন: repo → Settings → Secrets`;
  try { await postTelegramMessage(escHtml(msg)); } catch (e) {}
}

/* SITE_BASE env-ওভাররাইডযোগ্য — ডিফল্ট: বর্তমান প্রোডাকশন ডোমেইন */
const SITE_BASE = process.env.SITE_BASE || "https://bangla-news-edition.netlify.app";

/* সাইটের app.js-এর SOURCES-এর সাথে মিলিয়ে ৯টি ফিড */
const RSS_FEEDS = [
  "https://www.banglaedition.com/feed/",
  "https://www.prothomalo.com/feed/",
  "https://www.jugantor.com/feed/",
  "https://www.ittefaq.com.bd/feed/",
  "https://bangla.bdnews24.com/?feed=rss2",
  "https://somoynews.tv/feed/",
  "https://www.banglatribune.com/feed/",
  "https://bd-journal.com/feed/latest-rss.xml",
  "https://daily-bangladesh.com/rss/rss.xml"
];

/* ── ইউটিলিটি ── */

/* app.js-এর hashId-এর হুবহু কপি — ডিপ-লিংক সঠিক আর্টিকেলে যাবে */
function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

/* Telegram parse_mode=HTML / FB message-এর জন্য এস্কেপ */
function escHtml(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function httpsJson(method, hostname, path, formParams, extraHeaders) {
  return new Promise((resolve) => {
    const body = new URLSearchParams(formParams || {}).toString();
    const headers = Object.assign(
      { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      extraHeaders || {}
    );
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, body: data, json });
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message, json: null }));
    req.write(body);
    req.end();
  });
}

/* ── ফিড ফেচ ── */
/* ── VG-12: সরাসরি RSS ফেচ + পার্স (rss2json সম্পূর্ণ বাদ) ────────────────
   আগে api.rss2json.com ব্যবহার হতো। ফ্রি প্ল্যানে ফিড আপডেট হতো মাত্র ঘণ্টায়
   একবার, অথচ ওয়ার্কফ্লো চলে প্রতি ৩০ মিনিটে — ফলে প্রায় অর্ধেক রান একই
   ক্যাশড ডেটা প্রসেস করত, আর তৃতীয় পক্ষের রেট-লিমিটে পুরো রান থেমে যেত।
   এখন নিজেরাই XML পড়ি — কোনো নির্ভরতা নেই, কোনো ক্যাশ-ল্যাগ নেই। */
function decodeXmlEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlBlock(xml, tag) {
  const m = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

function xmlAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(String(xml)))) out.push(m[1]);
  return out;
}

function fetchSingleFeed(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      timeout: 9000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BNE-RSS/1.0; +https://bangla-news-edition.netlify.app)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchSingleFeed(res.headers.location)); /* রিডাইরেক্ট অনুসরণ */
      }
      if (res.statusCode !== 200) {
        console.error(`⚠️ [Feed] HTTP ${res.statusCode} → ${url}`);
        res.resume();
        return resolve([]);
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const blocks = xmlAllBlocks(data, "item");
          const entries = blocks.length ? blocks : xmlAllBlocks(data, "entry");
          const items = entries.slice(0, 25).map((b) => {
            const title = decodeXmlEntities(xmlBlock(b, "title").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
            let link = decodeXmlEntities(xmlBlock(b, "link")).trim() || decodeXmlEntities(xmlBlock(b, "guid")).trim();
            if (!link) {
              const href = b.match(/<link[^>]+href=["']([^"']+)["']/i);
              if (href) link = href[1];
            }
            const content = decodeXmlEntities(xmlBlock(b, "content:encoded")) || decodeXmlEntities(xmlBlock(b, "content"));
            const description = decodeXmlEntities(xmlBlock(b, "description")) || decodeXmlEntities(xmlBlock(b, "summary"));
            const pubDate = decodeXmlEntities(xmlBlock(b, "pubDate")) || decodeXmlEntities(xmlBlock(b, "published")) || decodeXmlEntities(xmlBlock(b, "updated"));
            /* enclosure → extractBestImage যেই আকার আশা করে */
            let enclosure = null;
            const enc = b.match(/<enclosure[^>]*>/i);
            if (enc) {
              const u = (enc[0].match(/url=["']([^"']+)["']/i) || [])[1];
              const t = (enc[0].match(/type=["']([^"']+)["']/i) || [])[1] || "";
              if (u) enclosure = { link: u, type: t };
            }
            const mediaUrl = (b.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i) || [])[1] || "";
            return { title, link, description, content, pubDate, enclosure, thumbnail: mediaUrl };
          }).filter((it) => it.title && /^https?:/.test(it.link));
          if (!items.length) console.error(`⚠️ [Feed] কোনো আইটেম পাওয়া যায়নি → ${url}`);
          resolve(items);
        } catch (e) {
          console.error(`⚠️ [Feed] পার্স ব্যর্থ (${e.message}) → ${url}`);
          resolve([]);
        }
      });
    });
    req.on("timeout", () => { req.destroy(); console.error(`⚠️ [Feed] টাইমআউট → ${url}`); resolve([]); });
    req.on("error", (e) => { console.error(`⚠️ [Feed] নেটওয়ার্ক এরর (${e.message}) → ${url}`); resolve([]); });
  });
}

/* ── অ্যাড/ট্র্যাকিং-পিক্সেল ফিল্টার ──
   সংবাদ সাইটগুলোর RSS-এ অ্যাড-পিক্সেল (alicdn, doubleclick, ট্র্যাকিং ইত্যাদি) প্রথম <img> হিসেবে থাকে।
   এগুলো কখনো খবরের ছবি নয় — তাই বাদ দেওয়া হয়। */
const JUNK_IMG_RE = /alicdn\.com|doubleclick|googlesyndication|googleadservices|facebook\.com\/tr|google-analytics|googletagmanager|analytics|tracking|impression|\.gif|adserver|ad\.|pixel|banner|placeholder|spacer|icons?\/|logo/i;

function isJunkImage(url) {
  return JUNK_IMG_RE.test(String(url || ""));
}

/* RSS আইটেম থেকে "আসল" সংবাদ ছবি বের করা (ক্রম অনুযায়ী):
   1) content+description-এর সব <img> → জাঙ্ক বাদ → আকার (width×height) অনুযায়ী সবচেয়ে বড়টি
   2) enclosure (ছবি-টাইপ হলে)
   3) media:thumbnail (জাঙ্ক নয় হলে)
   কিছু না পেলে null — পোস্টার তখন টেক্সট-পোস্টে যায় (লিংক-প্রিভিউসহ), কোনো স্টক ছবি বসায় না */
function extractBestImage(it) {
  const html = `${it.content || ""} ${it.description || ""}`;
  const imgs = [];
  const imgRe = /<img[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
    if (!src || !/^https?:/.test(src) || isJunkImage(src)) continue;
    const w = parseInt((tag.match(/width=["']?(\d+)/i) || [])[1], 10) || 0;
    const h = parseInt((tag.match(/height=["']?(\d+)/i) || [])[1], 10) || 0;
    imgs.push({ src, w, h, area: Math.max(w * (h || w), 1) });
  }
  /* আকার-সহ ছবি অগ্রাধিকার; আকার ছাড়া ছবিগুলো পরে (আকারহীন পিক্সেল বাদ পড়ে না যেন) */
  imgs.sort((a, b) => b.area - a.area);
  if (imgs.length) return imgs[0].src;

  if (it.enclosure && /^image\//i.test(it.enclosure.type || "") && /^https?:/.test(it.enclosure.link || "") && !isJunkImage(it.enclosure.link)) {
    return it.enclosure.link;
  }
  const th = it.thumbnail;
  if (th && /^https?:/.test(th) && !isJunkImage(th)) return th;
  return null;
}

/* ── SMO/P0: পোর্টাল URL বিল্ডার — hash কখনোই নয় ────────────────────────
   ফেসবুক ও টেলিগ্রাম URL-এর # অংশ ফেলে দেয়, ফলে পুরনো `${SITE_BASE}/#/news/<id>`
   লিংক সবসময় হোমপেজে গিয়ে ঠেকে যেত এবং কোনো প্রিভিউ কার্ড তৈরি হতো না।
   এখন রিয়েল পাথ ব্যবহৃত হয়: /news/<slug|id>  — সাথে UTM ট্র্যাকিং। */
const UTM_QUERY = "?utm_source=facebook&utm_medium=social&utm_campaign=bne";

function assertRealUrl(url) {
  const u = String(url || "");
  if (!u) throw new Error("খালি URL");
  if (u.indexOf("#") !== -1) throw new Error(`hash URL প্রত্যাখ্যাত → ${u}`);
  if (!/^https:\/\//i.test(u)) throw new Error(`https ছাড়া URL প্রত্যাখ্যাত → ${u}`);
  return u;
}

/** একমাত্র URL ফ্যাক্টরি — রিয়েল পাথ, ট্রেইলিং স্ল্যাশ ছাড়া। */
function portalUrl(item, withUtm) {
  const base = String(SITE_BASE || "").replace(/\/+$/, "");
  const key = item.slug || item.id;
  const bare = assertRealUrl(`${base}/news/${encodeURIComponent(key)}`);
  return withUtm ? `${bare}${UTM_QUERY}&utm_content=${encodeURIComponent(key)}` : bare;
}

/* RSS আইটেম → অভিন্ন নিউজ অবজেক্ট */
function normalizeItem(it) {
  const title = stripHtml(it.title || "");
  const link = String(it.link || it.guid || "").trim();
  if (!title || link.indexOf("http") !== 0) return null;
  const summary = stripHtml(it.description || it.content || "").slice(0, 165);
  const image = extractBestImage(it);
  const ts = it.pubDate && !isNaN(Date.parse(it.pubDate)) ? Date.parse(it.pubDate) : Date.now();
  const id = hashId(link);
  const slug = it.slug || ""; /* meta-service দিলে slug, না দিলে id */
  const item2 = { title, link, summary, image, ts, id, slug };
  item2.url = portalUrl(item2, true);   /* রিয়েল পাথ + UTM — hash নয় */
  return item2;
}

/* ── টেলিগ্রাম ── */
function postTelegramPhoto(caption, imageUrl) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN) { console.log("ℹ️ [Telegram] TELEGRAM_BOT_TOKEN সেট নেই — ফটো পোস্ট স্কিপ।"); return resolve(false); }
    httpsJson("POST", "api.telegram.org", `/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      chat_id: TELEGRAM_CHAT_ID, photo: imageUrl, caption, parse_mode: "HTML"
    }).then((r) => {
      if (r.status === 200) { console.log(`✅ [Telegram] ছবিসহ পোস্ট সফল → ${TELEGRAM_CHAT_ID}`); resolve(true); }
      else { console.error(`⚠️ [Telegram] ফটো ব্যর্থ (${r.status}): ${r.body.slice(0, 200)}`); resolve(false); }
    });
  });
}

function postTelegramMessage(text) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN) { console.log("ℹ️ [Telegram] TELEGRAM_BOT_TOKEN সেট নেই — মেসেজ পোস্ট স্কিপ।"); return resolve(false); }
    httpsJson("POST", "api.telegram.org", `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: "false"
    }).then((r) => {
      if (r.status === 200) { console.log(`✅ [Telegram] টেক্সট পোস্ট সফল → ${TELEGRAM_CHAT_ID}`); resolve(true); }
      else { console.error(`❌ [Telegram] মেসেজ ব্যর্থ (${r.status}): ${r.body.slice(0, 200)}`); resolve(false); }
    });
  });
}

/* ── ফেসবুক (প্রিভিউসহ) ── */

/* link মোড: feed পোস্ট + link → ফেসবুক OG ট্যাগ থেকে প্রিভিউ কার্ড দেখায় */
function postFacebookLink(message, link) {
  return new Promise((resolve) => {
    if (!FB_PAGE_TOKEN || !FB_PAGE_ID) { console.log("ℹ️ [Facebook] FB_PAGE_TOKEN/FB_PAGE_ID সেট নেই — স্কিপ।"); return resolve(false); }
    httpsJson("POST", "graph.facebook.com", `/${GRAPH_VERSION}/${FB_PAGE_ID}/feed`, {
      message, link, access_token: FB_PAGE_TOKEN
    }).then((r) => {
      if (r.status === 200 && r.json && r.json.id) { console.log(`✅ [Facebook] লিংক পোস্ট সফল (প্রিভিউসহ) → post ${r.json.id}`); resolve(true); }
      else {
        console.error(`❌ [Facebook] feed পোস্ট ব্যর্থ (${r.status}): ${r.body.slice(0, 300)}`);
        if (isTokenError(r.body)) alertAdminTokenIssue("Facebook", r.body);
        resolve(false);
      }
    });
  });
}

/* photo মোড: ছবি + ক্যাপশন পোস্ট (টেলিগ্রামের মতো ভিজ্যুয়াল) — FB নিজে URL ফেচ করবে */
function postFacebookPhoto(caption, imageUrl) {
  return new Promise((resolve) => {
    if (!FB_PAGE_TOKEN || !FB_PAGE_ID) { console.log("ℹ️ [Facebook] FB_PAGE_TOKEN/FB_PAGE_ID সেট নেই — স্কিপ।"); return resolve(false); }
    httpsJson("POST", "graph.facebook.com", `/${GRAPH_VERSION}/${FB_PAGE_ID}/photos`, {
      url: imageUrl, caption, access_token: FB_PAGE_TOKEN
    }).then((r) => {
      if (r.status === 200 && r.json && r.json.id) { console.log(`✅ [Facebook] ছবি পোস্ট সফল → post ${r.json.id}`); resolve(true); }
      else {
        console.error(`❌ [Facebook] photos পোস্ট ব্যর্থ (${r.status}): ${r.body.slice(0, 300)}`);
        if (isTokenError(r.body)) alertAdminTokenIssue("Facebook", r.body);
        resolve(false);
      }
    });
  });
}

/* ── SMO/P1: Facebook OG ক্যাশ রিফ্রেশ (?scrape=true) ────────────────────
   OG ট্যাগ ঠিক করার পরেও ফেসবুক তার পুরনো (হোমপেজ) প্রিভিউ ধরে রাখে।
   তাই প্রতিটি সফল পোস্টের পরেই ক্যাশ রিফ্রেশ করা হয় — এতে নতুন প্রিভিউ কার্ড
   সাথে সাথে সক্রিয় হয় এবং ক্লিক অ্যাট্রিবিউশন শুরু হয়। */
const FB_APP_TOKEN = process.env.FB_APP_TOKEN
  || (process.env.FB_APP_ID && process.env.FB_APP_SECRET
      ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : "");

function refreshOgCache(bareUrl) {
  return new Promise((resolve) => {
    if (!FB_APP_TOKEN) { console.log("ℹ️ [OG] FB_APP_TOKEN/FB_APP_ID নেই — scrape রিফ্রেশ স্কিপ।"); return resolve(false); }
    const clean = String(bareUrl).split("?")[0];
    httpsJson("POST", "graph.facebook.com", `/${GRAPH_VERSION}/`, {
      id: clean, scrape: "true", access_token: FB_APP_TOKEN
    }).then((r) => {
      if (r.status === 200) { console.log(`✅ [OG] প্রিভিউ ক্যাশ রিফ্রেশ → ${clean}`); resolve(true); }
      else { console.error(`⚠️ [OG] scrape ব্যর্থ (${r.status}): ${r.body.slice(0, 160)}`); resolve(false); }
    });
  });
}

/* ── SMO/P1: Oracle meta-service publish queue থেকে খবর আনা ───────────────
   এখানেই "মোবাইল প্যানেল থেকে প্রকাশ → অটো পোস্ট" চেইন সম্পূর্ণ হয়:
   অ্যাডমিন প্যানেলে Publish চাপলে আর্টিকেলটি queue-তে আসে এবং এই স্ক্রিপ্ট
   তার রিয়েল /news/<slug> URL নিয়ে ফেসবুক ও টেলিগ্রামে পোস্ট করে। */
function fetchQueue() {
  return new Promise((resolve) => {
    if (!META_API_BASE) return resolve([]);
    const headers = QUEUE_TOKEN ? { "x-queue-token": QUEUE_TOKEN } : {};
    httpsJson("GET", META_API_BASE.replace(/^https?:\/\//, ""), "/api/queue", null, headers)
      .then((r) => {
        if (r.status !== 200) {
          console.error(`⚠️ [Queue] API ব্যর্থ (${r.status}) — legacy RSS মোডে নামা হচ্ছে।`);
          return resolve(null);   /* null = API unavailable → legacy fallback */
        }
        const items = (r.json && r.json.items) || [];
        console.log(`📥 [Queue] ${items.length}টি নতুন আর্টিকেল পোস্টের অপেক্ষায়।`);
        resolve(items);
      });
  });
}

function confirmQueue(articleId, ok, detail) {
  if (!META_API_BASE || !articleId) return Promise.resolve(false);
  return new Promise((resolve) => {
    httpsJson("POST", META_API_BASE.replace(/^https?:\/\//, ""), "/api/queue/result", {
      id: articleId, ok: ok, detail: String(detail || "").slice(0, 300),
      token: QUEUE_TOKEN
    }).then((r) => resolve(r.status === 200)).catch(() => resolve(false));
  });
}

/* ছবি ডাউনলোড (আপলোড পদ্ধতির জন্য) — শুধু ছবি-টাইপ, আকার-সীমাসহ */
function downloadImage(url, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (BNE-AutoPoster; +https://bangla-news-edition.netlify.app)" }
    }).then(async (res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\//.test(type)) throw new Error("ছবি-টাইপ নয়: " + type);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 || buf.length > maxBytes) throw new Error("আকার সমস্যা: " + buf.length);
      resolve({ buf, mime: type === "image/jpg" ? "image/jpeg" : type });
    }, reject).finally(() => clearTimeout(timer));
  });
}

/* photo আপলোড (সবচেয়ে নির্ভরযোগ্য): ছবির বাইট সরাসরি multipart-এ FB-তে আপলোড — URL-ফেচ নির্ভরতা শূন্য */
function postFacebookPhotoBinary(caption, imageBuf, mime) {
  return new Promise((resolve) => {
    if (!FB_PAGE_TOKEN || !FB_PAGE_ID) { console.log("ℹ️ [Facebook] FB_PAGE_TOKEN/FB_PAGE_ID সেট নেই — স্কিপ।"); return resolve(false); }
    const boundary = "----BNE" + Date.now().toString(36);
    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="news.jpg"\r\nContent-Type: ${mime}\r\n\r\n`));
    parts.push(imageBuf, Buffer.from("\r\n"));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${FB_PAGE_TOKEN}\r\n`));
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const req = https.request({
      hostname: "graph.facebook.com",
      path: `/${GRAPH_VERSION}/${FB_PAGE_ID}/photos`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length }
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        let json = null; try { json = JSON.parse(data); } catch (e) {}
        if (res.statusCode === 200 && json && json.id) { console.log(`✅ [Facebook] ছবি পোস্ট সফল (আপলোড) → post ${json.id}`); resolve(true); }
        else {
          console.error(`❌ [Facebook] ছবি-আপলোড ব্যর্থ (${res.statusCode}): ${data.slice(0, 250)}`);
          if (isTokenError(data)) alertAdminTokenIssue("Facebook", data);
          resolve(false);
        }
      });
    });
    req.on("error", (e) => { console.error("❌ [Facebook] আপলোড নেটওয়ার্ক এরর:", e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

/* ইনস্টাগ্রাম ক্রস-পোস্ট (P4): একই FB পেজ টোকেন — ২ ধাপ: container → publish */
async function postInstagram(caption, imageUrl) {
  if (!IG_USER_ID || !FB_PAGE_TOKEN) { console.log("ℹ️ [Instagram] IG_USER_ID/FB_PAGE_TOKEN সেট নেই — স্কিপ।"); return false; }
  const create = await httpsJson("POST", "graph.facebook.com", `/${GRAPH_VERSION}/${IG_USER_ID}/media`, {
    image_url: imageUrl, caption, access_token: FB_PAGE_TOKEN
  });
  if (create.status !== 200 || !create.json || !create.json.id) {
    console.error(`❌ [Instagram] container ব্যর্থ (${create.status}): ${create.body.slice(0, 300)}`);
    if (isTokenError(create.body)) alertAdminTokenIssue("Instagram", create.body);
    return false;
  }
  const containerId = create.json.id;
  await sleep(4000); /* মিডিয়া প্রসেসিং-এর জন্য বিরতি */
  const pub = await httpsJson("POST", "graph.facebook.com", `/${GRAPH_VERSION}/${IG_USER_ID}/media_publish`, {
    creation_id: containerId, access_token: FB_PAGE_TOKEN
  });
  if (pub.status === 200 && pub.json && pub.json.id) { console.log(`✅ [Instagram] পোস্ট সফল → media ${pub.json.id}`); return true; }
  console.error(`❌ [Instagram] publish ব্যর্থ (${pub.status}): ${pub.body.slice(0, 300)}`);
  if (isTokenError(pub.body)) alertAdminTokenIssue("Instagram", pub.body);
  return false;
}

/* ── ডিডুপ ক্যাশ ── */
const POSTED_FILE = './last_posted.json';
/* ── SMO/P0bugfix: ডিডুপ ফাইলের legacy ফরম্যাট মাইগ্রেশন ──────────────────
   প্রকৃত সমস্যা: ফাইলে পুরনো ফরম্যাট {"title":…,"date":…} ছিল, কিন্তু কোড
   raw.posted (অ্যারে) খুঁজত — তাই ফাংশন সবসময় [] ফিরিয়ে দিত, ডিডুপ নিষ্ক্রিয়
   হয়ে যেত এবং একই ৫টি খবর প্রতি ৩০ মিনিটে আবার পোস্ট হতো (স্প্যাম-ঝুঁকি)।
   এখন পুরনো ফরম্যাট, নতুন ফরম্যাট এবং একক অবজেক্ট — তিনটিই পড়া হয়। */
function loadPosted() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  } catch (e) {
    return []; /* ফাইল নেই বা ভাঙা — নিরাপদে খালি তালিকা */
  }
  if (Array.isArray(raw)) return raw;                                  /* [{link}, …] */
  if (raw && Array.isArray(raw.posted)) return raw.posted;             /* {posted:[…]} */
  if (raw && typeof raw === 'object' && (raw.link || raw.url)) {        /* legacy একক অবজেক্ট */
    const legacy = { link: raw.link || raw.url, title: raw.title || '', date: raw.date || '' };
    console.log("🔧 [Dedupe] পুরনো ফরম্যাট শনাক্ত — মাইগ্রেট করা হলো:", legacy.link || legacy.title);
    return [legacy];
  }
  if (raw && typeof raw === 'object' && raw.title) {
    /* একেবারে পুরনো: শুধু title/date আছে, link নেই — title-কে কী ধরা হয় */
    console.log("🔧 [Dedupe] শুধু-title ফরম্যাট শনাক্ত — মাইগ্রেট:", raw.title);
    return [{ link: `title:${raw.title}`, title: raw.title, date: raw.date || '' }];
  }
  return [];
}
function savePosted(posted) {
  const trimmed = posted.slice(0, 200); /* সর্বোচ্চ ২০০টি লিংক রাখা হয় */
  fs.writeFileSync(POSTED_FILE, JSON.stringify({ posted: trimmed, date: new Date().toISOString() }, null, 2));
}

/* ── মূল রান ── */
async function runAutoPost() {
  console.log("==================================================");
  console.log("🚀 BNE DYNAMIC NEWS POSTER V7 — DUAL DISPATCH (রিয়েল-ইমেজ ইঞ্জিন)");
  console.log(`   টেলিগ্রাম: ${TELEGRAM_BOT_TOKEN ? "✅ চালু" : "⛔ টোকেন নেই (স্কিপ)"}`);
  console.log(`   ফেসবুক: ${FB_PAGE_TOKEN && FB_PAGE_ID ? "✅ চালু (" + FB_POST_MODE + " মোড)" : "⛔ টোকেন/পেজ আইডি নেই (স্কিপ)"}`);
  console.log(`   ইনস্টাগ্রাম: ${IG_USER_ID && FB_PAGE_TOKEN ? "✅ চালু" : "⛔ IG_USER_ID নেই (স্কিপ)"}`);
  console.log(`   প্রতি রানে সর্বোচ্চ: ${MAX_POSTS_PER_RUN}টি`);
  console.log("==================================================");

  try {
    /* ১. সোর্স নির্ধারণ — আগে Oracle publish queue (মোবাইল প্যানেল থেকে প্রকাশিত
       আর্টিকেল), না পেলে legacy RSS ফিড। এতে "প্যানেল থেকে Publish → ফেসবুক ও
       টেলিগ্রামে অটো পোস্ট" চেইনটি সম্পূর্ণ হয় এবং লিংক সর্বদা রিয়েল পাথে যায়। */
    let items = [];
    let fromQueue = false;

    if (POSTER_MODE === "api") {
      const q = await fetchQueue();
      if (q && q.length) {
        fromQueue = true;
        items = q.map((it) => ({
          title: it.title,
          link: it.canonicalUrl || it.sourceUrl || it.slug,
          description: it.summary,
          image: it.image,
          pubDate: it.publishedAt,
          slug: it.slug,
          _queueId: it.id,
        }));
        console.log(`📥 [Queue] ${items.length}টি প্রকাশিত আর্টিকেল পোস্ট কিউতে পাওয়া গেছে।`);
      }
    }

    if (!fromQueue) {
      console.log("📡 [Legacy] RSS ফিড থেকে সংবাদ সংগ্রহ করা হচ্ছে…");
      for (const feedUrl of RSS_FEEDS) {
        const feedItems = await fetchSingleFeed(feedUrl);
        if (feedItems && feedItems.length) items = items.concat(feedItems);
      }
    }

    if (!items.length) {
      console.log("ℹ️ কোনো সোর্স থেকে সংবাদ পাওয়া যায়নি — রান শেষ।");
      return;
    }

    /* ২. নরমালাইজ + ডিডুপ + তারিখ অনুযায়ী সাজানো (নতুন আগে) */
    const seen = new Set();
    const news = items.map(normalizeItem)
      .filter((n) => n && !seen.has(n.link) && (seen.add(n.link), true))
      .sort((a, b) => b.ts - a.ts);

    /* ৩. আগের পোস্ট বাদ দিয়ে "নতুন" খবর বাছাই */
    const posted = loadPosted();
    const postedLinks = new Set(posted.map((p) => p.link));
    let fresh = FORCE_MODE
      ? news
      : news.filter((n) => !postedLinks.has(n.link));

    console.log(`📰 মোট ${news.length}টি সংবাদ পাওয়া গেছে, নতুন ${fresh.length}টি`);
    fresh = fresh.slice(0, MAX_POSTS_PER_RUN);
    if (!fresh.length) {
      console.log("ℹ️ নতুন কোনো খবর নেই (সবই আগে পোস্ট হয়েছে) — রান শেষ।");
      return;
    }

    /* ৪. প্রতিটি নতুন খবর → টেলিগ্রাম + ফেসবুক (প্রিভিউসহ) */
    for (const n of fresh) {
      console.log(`\n📌 পোস্ট হচ্ছে: "${n.title}"`);
      console.log(`🖼️ ছবি: ${n.image || "(নেই — টেক্সট-পোস্ট হবে)"}`);
      const caption = `💥 <b>[ব্রেকিং নিউজ]</b>\n\n📰 <b>${escHtml(n.title)}</b>\n\n${escHtml(n.summary)}...\n\n🔗 <b>বি-এন-ই পোর্টালে পড়তে ক্লিক করুন:</b>\n${n.url}`;
      const fbMessage = `💥 [ব্রেকিং নিউজ] ${n.title}\n\n${n.summary}...\n\nবিস্তারিত পড়ুন: ${n.url}`;

      /* টেলিগ্রাম — ছবিসহ (retry), ব্যর্থ হলে টেক্সট */
      if (TELEGRAM_BOT_TOKEN) {
        const tgOk = n.image
          ? await postWithRetry(() => postTelegramPhoto(caption, n.image), "Telegram ফটো", 2)
          : false;
        if (!tgOk) await postTelegramMessage(caption);
      }

      /* ফেসবুক — ডিফল্ট photo (নিউজের আসল ছবি বড় করে, টেলিগ্রামের মতো):
         ১) ছবি ডাউনলোড → সরাসরি আপলোড (সবচেয়ে নির্ভরযোগ্য)
         ২) URL-পদ্ধতি (FB নিজে ফেচ করবে)
         ৩) link ফলব্যাক (OG প্রিভিউ কার্ড)
         কোনো স্টক ছবি কখনো নয় */
      let fbPosted = false;
      if (FB_PAGE_TOKEN && FB_PAGE_ID) {
        let fbOk = false;
        if (FB_POST_MODE !== "link" && n.image) {
          try {
            const dl = await downloadImage(n.image);
            fbOk = await postWithRetry(() => postFacebookPhotoBinary(fbMessage + "\n\n" + n.url, dl.buf, dl.mime), "Facebook ছবি-আপলোড", 2);
          } catch (e) {
            console.log(`ℹ️ [Facebook] ছবি ডাউনলোড ব্যর্থ (${e.message}) — URL-পদ্ধতিতে যাচ্ছি`);
          }
          if (!fbOk) fbOk = await postWithRetry(() => postFacebookPhoto(fbMessage + "\n\n" + n.url, n.image), "Facebook ছবি-URL", 1);
        }
        if (!fbOk) {
          fbOk = await postWithRetry(() => postFacebookLink(fbMessage, n.url), "Facebook লিংক", 2);
        }
        fbPosted = fbOk;
        /* SMO/P1 — পোস্ট সফল হলে Facebook-এর OG ক্যাশ সাথে সাথে রিফ্রেশ করা হয়,
           নইলে ফেসবুক পুরনো (হোমপেজ) প্রিভিউ ধরে রাখে এবং ক্লিক গণনা হয় না। */
        if (fbOk) await refreshOgCache(portalUrl(n, false));
      }

      /* ইনস্টাগ্রাম — IG_USER_ID সেট থাকলে (একই FB টোকেন) */
      if (IG_USER_ID && n.image) {
        await postWithRetry(() => postInstagram(escHtml(n.title) + "\n\n" + n.url, n.image), "Instagram", 1);
      }

      /* পোস্ট সম্পন্ন → ক্যাশে যোগ */
      postedLinks.add(n.link);
      posted.unshift({ link: n.link, title: n.title, ts: n.ts, url: n.url });

      /* queue মোডে থাকলে সার্ভারকে জানানো হয় — DB-স্তরের ডিডুপ সক্রিয় থাকে */
      if (fromQueue && n._queueId) {
        await confirmQueue(n._queueId, fbPosted || !!TELEGRAM_BOT_TOKEN, fbPosted ? "posted" : "partial");
      }

      /* ছোট বিরতি — রেট-লিমিট এড়াতে */
      await new Promise((r) => setTimeout(r, 1500));
    }

    /* ৫. ক্যাশ সংরক্ষণ */
    savePosted(posted);
    console.log("\n==================================================");
    console.log(`🎉 সম্পন্ন — ${fresh.length}টি সংবাদ টেলিগ্রাম ও/বা ফেসবুকে পোস্ট হয়েছে`);
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Auto-post execution error:", err);
  }
}

runAutoPost();
