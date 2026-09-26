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
const path = require('path');

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
/* SMO/P2 — ডিফল্ট এখন Oracle ঠিকানা, আগে ছিল Netlify।
   কারণ: Netlify-তে /api/queue নামে কোনো ফাংশনই নেই → 404। ফলে পোস্টার
   প্রতি রানে "কিউতে নতুন কিছু নেই" বলে চুপচাপ শেষ হয়ে যেত এবং একটিও খবর
   ফেসবুক/টেলিগ্রামে যেত না। Oracle-এ /api/config সর্বদা উপলব্ধ। */
const META_API_BASE = (process.env.META_API_BASE || "https://bne.147-224-13-31.nip.io").replace(/\/+$/, "");
const QUEUE_TOKEN = process.env.QUEUE_TOKEN || "";
/* ★ নিজস্ব সংবাদ কোথা থেকে আনা হবে ★
   ডিফল্ট এখন "local" — অর্থাৎ রিপোর data/bne-config.json।

   কেন Oracle নয়: ছবি সমৃদ্ধকরণ (tools/enrich-images.js) সিঙ্কের সময় রিপোর
   কনফিগেই ছবি বসায় — Oracle-এর ডেটায় কোনো ছবি নেই। তাই Oracle থেকে পড়লে
   সংবাদের ছবি হাতছাড়া হত এবং পোস্টে জেনেরিক কার্ড ফিরে আসত।

   রিপোর কনফিগই লাইভ সাইটে যাওয়া কনফিগ, তাই এটিই সবচেয়ে নির্ভরযোগ্য উৎস।
   Oracle তখনও ব্যবহার করা যায় — OWN_SOURCE=oracle দিলে। */
const OWN_SOURCE = (process.env.OWN_SOURCE || "local").toLowerCase() === "oracle" ? "oracle" : "local";
/* কত ঘণ্টার পুরনো সংবাদ পর্যন্ত পোস্ট করা হবে — পুরনো আর্কাইভ একসাথে
   পোস্ট হয়ে স্প্যাম হওয়া ঠেকায় (প্রথম চালুতে বিশেষভাবে জরুরি)। */
const MAX_AGE_HOURS = Math.max(1, parseInt(process.env.MAX_AGE_HOURS || "48", 10) || 48);
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
const SITE_BASE = process.env.SITE_BASE || "https://bangla-news-edition-bd.netlify.app";

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
/* ══════════════════════════════════════════════════════════════════════
   ★ হ্যাশট্যাগ — ফেসবুকের অ্যালগরিদম যাতে নিজে থেকে পাঠকদের দেখায় ★
   ──────────────────────────────────────────────────────────────────────
   ব্যবহারকারীর চাওয়া: "প্রত্যেকটা নিউজের ক্ষেত্রে যখন ফেসবুকে পোস্ট হবে তখন
   ওই নিউজের কিছু হ্যাশট্যাগ যোগ করতে হবে... যাতে ফেসবুক অ্যালগরিদম অনুযায়ী
   নিজেই রেফার করে দেখায় পাবলিকদেরকে"।

   কীভাবে বাছা হয় (ফাঁপা তালিকা নয় — খবরের সাথে সম্পর্কিত):
     ১. ব্র্যান্ড ট্যাগ     — #BNE #বাংলানিউজএডিশন
     ২. বিভাগ অনুযায়ী      — খেলার খবরে #খেলা, রাজনীতিতে #রাজনীতি ...
     ৩. শিরোনামে থাকা বিষয়  — "ঢাকা", "নির্বাচন", "ক্রিকেট" ইত্যাদি শব্দ
                              থাকলে সেই বিষয়ে আলাদা ট্যাগ
   মোট ৫টি পর্যন্ত রাখা হয়। Facebook-এর নিজস্ব নির্দেশনা অনুযায়ী অতিরিক্ত
   হ্যাশট্যাগ (১০+) স্প্যাম হিসেবে ধরা হতে পারে — তাই সংখ্যা সীমিত রাখা হয়। */
const BASE_HASHTAGS = ['#BNE', '#বাংলানিউজএডিশন'];

const CAT_HASHTAGS = {
  'জাতীয়': ['#বাংলাদেশ', '#জাতীয়সংবাদ'],
  'আন্তর্জাতিক': ['#আন্তর্জাতিক', '#বিশ্বসংবাদ'],
  'রাজনীতি': ['#রাজনীতি', '#বাংলাদেশরাজনীতি'],
  'খেলা': ['#খেলা', '#খেলাধুলা'],
  'বিনোদন': ['#বিনোদন', '#ঢালিউড'],
  'অর্থনীতি': ['#অর্থনীতি', '#ব্যবসাবাণিজ্য'],
  'প্রযুক্তি': ['#প্রযুক্তি', '#টেকনোলজি'],
  'স্বাস্থ্য': ['#স্বাস্থ্য', '#স্বাস্থ্যপরামর্শ'],
  'প্রবাস': ['#প্রবাসী', '#রেমিট্যান্স'],
  'শিক্ষা': ['#শিক্ষা', '#পরীক্ষা'],
  'ডাক ও যোগাযোগ': ['#যোগাযোগ', '#পরিবহন'],
  'বিজ্ঞাপন': ['#বিজ্ঞাপন'],
};

/* শিরোনামের ভেতর থেকে বিষয়ভিত্তিক ট্যাগ — যাতে খবরটি ঠিক যে বিষয়ে,
   সেই বিষয়ের পাঠকের কাছেই পৌঁছায় */
const TOPIC_HASHTAGS = [
  ['ঢাকা', '#ঢাকা'], ['চট্টগ্রাম', '#চট্টগ্রাম'], ['সিলেট', '#সিলেট'],
  ['খুলনা', '#খুলনা'], ['রাজশাহী', '#রাজশাহী'], ['বরিশাল', '#বরিশাল'],
  ['রংপুর', '#রংপুর'], ['নারায়ণগঞ্জ', '#নারায়ণগঞ্জ'], ['গাজীপুর', '#গাজীপুর'],
  ['নির্বাচন', '#নির্বাচন'], ['আদালত', '#আদালত'], ['পুলিশ', '#পুলিশ'],
  ['সরকার', '#সরকার'], ['বাজেট', '#বাজেট'], ['ব্যাংক', '#ব্যাংক'],
  ['ক্রিকেট', '#ক্রিকেট'], ['ফুটবল', '#ফুটবল'], ['বিশ্বকাপ', '#বিশ্বকাপ'],
  ['শিক্ষা', '#শিক্ষা'], ['হাসপাতাল', '#স্বাস্থ্য'], ['আবহাওয়া', '#আবহাওয়া'],
  ['বন্যা', '#বন্যা'], ['ঘূর্ণিঝড়', '#ঘূর্ণিঝড়'], ['অগ্নিকাণ্ড', '#অগ্নিকাণ্ড'],
  ['দুর্ঘটনা', '#দুর্ঘটনা'], ['প্রবাসী', '#প্রবাসী'], ['ভিসা', '#ভিসা'],
  ['শেয়ারবাজার', '#শেয়ারবাজার'], ['রেমিট্যান্স', '#রেমিট্যান্স'],
];

function buildHashtags(n) {
  const out = [];
  const push = (t) => { if (t && !out.includes(t)) out.push(t); };

  BASE_HASHTAGS.forEach(push);
  (CAT_HASHTAGS[n.category] || []).forEach(push);

  const hay = `${n.title || ''} ${n.summary || ''}`;
  for (const [word, tag] of TOPIC_HASHTAGS) {
    if (out.length >= 5) break;
    if (hay.includes(word)) push(tag);
  }

  /* ক্রম: ব্র্যান্ড → বিভাগ → বিষয়, তারপর সর্বোচ্চ ৫টি */
  return out.slice(0, 5).join(' ');
}

function escHtml(s) {
  return String(s || "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ★ ডিকোড আগে, ট্যাগ বাদ পরে ★
   Oracle-এর সংগ্রহ ইঞ্জিন কিছু সংবাদ দুইবার HTML-এস্কেপ করে রাখে। আগে কেবল
   ট্যাগ সরানো হত, তাই ফেসবুক/টেলিগ্রামের ক্যাপশনে খবরের বদলে
   `&lt;a href=&quot;…` জাতীয় কোড-লেখা চলে যেত — পাঠকের কাছে পোস্ট ভাঙা দেখাত।
   এখন সীমিত (৩) ধাপে এনটিটি ডিকোড করে প্রকৃত লেখা বের করা হয়। */
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d",
  hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", middot: "\u00b7",
};
function decodeOnce(s) {
  return String(s).replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, ent) => {
    if (ent[0] === "#") {
      const cp = (ent[1] === "x" || ent[1] === "X") ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        try { return String.fromCodePoint(cp); } catch (e) { return whole; }
      }
      return whole;
    }
    const key = ent.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : whole;
  });
}
function decodeEntities(s, passes) {
  let out = String(s == null ? "" : s);
  const limit = typeof passes === "number" ? passes : 3;
  for (let i = 0; i < limit; i++) {
    const next = decodeOnce(out);
    if (next === out) break;   /* আর বদলাচ্ছে না — অতিরিক্ত ডিকোড নয় */
    out = next;
  }
  return out;
}
function stripHtml(s) {
  return decodeEntities(s, 3).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
        "User-Agent": "Mozilla/5.0 (compatible; BNE-RSS/1.0; +https://bangla-news-edition-bd.netlify.app)",
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
  /* ★ সমৃদ্ধকরণে বসানো ছবি সবার আগে ★
     tools/enrich-images.js সংবাদের সাথে সামঞ্জস্যপূর্ণ ছবি (মূল সংবাদমাধ্যমের
     আসল ছবি, নাহলে বিভাগ-ভিত্তিক ছবি) data/bne-config.json-এ বসিয়ে দেয়।
     আগে ওই মানটি সম্পূর্ণ উপেক্ষিত হত — extractBestImage কেবল content/
     description HTML-এর ভেতরে ছবি খুঁজত, তাই পোস্টে ছবিই আসত না
     (লগে দেখা গেছে: "ছবি: (নেই — শুধু লেখা যাবে)")। */
  const preset = String(it.image || "").trim();
  if (preset && (/^https?:\/\//i.test(preset) || /^\/?(images?|img)\//i.test(preset))) {
    return preset;
  }

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

/* ★ ছবির ঠিকানা সম্পূর্ণ করা ★
   সংবাদের ছবি দুই ধরনের হতে পারে:
     • বাইরের সংবাদমাধ্যমের সম্পূর্ণ লিংক (https://cdn…/x.jpg)
     • আমাদের নিজের বিভাগ-ভিত্তিক ছবি (images/sports.jpg — আপেক্ষিক পথ)
   টেলিগ্রাম ও ফেসবুককে সম্পূর্ণ URL দিতে হয়, তাই আপেক্ষিক পথকে সাইটের
   ঠিকানার সাথে জুড়ে দেওয়া হয়। */
function resolveImage(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:/i, "https:");
  const base = String(SITE_BASE || "").replace(/\/+$/, "");
  return `${base}/${raw.replace(/^\/+/, "")}`;
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

/* ★ প্রিভিউ কার্ড দিয়ে টেলিগ্রাম পোস্ট ★
   ──────────────────────────────────────────────────────────────────────
   আগে ক্যাপশনে কাঁচা URL লেখা থাকত — যেমন
     https://…/news/%E0%A6%A6%E0%A7%87%E0%A6%A1%E0%A6%BC%E0%A6%BE%E0%A6%87…
   ফলে টেলিগ্রামে লিংকটি শতাংশ-এনকোডেড জিবরিশ হিসেবে দেখা যেত।

   এখন লেখায় কোনো URL থাকেই না; Bot API-র `link_preview_options` দিয়ে ঠিক
   কোন লিংকের প্রিভিউ দেখাতে হবে তা বলা হয়। ফলে —
     • ক্যাপশন পরিষ্কার ও পড়ার মতো,
     • প্রিভিউ কার্ডে সংবাদের নিজস্ব ছবি (og:image) দেখা যায়,
     • আর কার্ডটিতে ক্লিক করলেই সরাসরি নিউজ পোর্টালে যায়।
   `prefer_large_media` দেওয়া হয় যাতে ছবিটি বড় করে দেখায়। */
function postTelegramMessage(text, previewUrl) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN) { console.log("ℹ️ [Telegram] TELEGRAM_BOT_TOKEN সেট নেই — মেসেজ পোস্ট স্কিপ।"); return resolve(false); }
    /* ⚠️ Telegram Bot API-তে `link_preview_options` অবশ্যই JSON-স্ট্রিং হতে হয়।
       নেস্টেড অবজেক্ট পাঠালে রেসপন্স আসে:
         "Bad Request: can't parse link preview options JSON object"
       (ঠিক এটাই প্রথম চালুতে ঘটেছিল) — তাই JSON.stringify করা হয়। */
    const options = previewUrl
      ? { url: previewUrl, prefer_large_media: true, show_above_text: false }
      : { prefer_large_media: true };

    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      link_preview_options: JSON.stringify(options),
    };
    httpsJson("POST", "api.telegram.org", `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload)
      .then((r) => {
        if (r.status === 200) { console.log(`✅ [Telegram] পোস্ট সফল (প্রিভিউ কার্ডসহ) → ${TELEGRAM_CHAT_ID}`); resolve(true); }
        else {
          /* পুরনো Bot API সংস্করণে link_preview_options না থাকলে সরল আকারে আবার */
          console.error(`⚠️ [Telegram] link_preview_options ব্যর্থ (${r.status}): ${r.body.slice(0, 160)}`);
          httpsJson("POST", "api.telegram.org", `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML"
          }).then((r2) => {
            if (r2.status === 200) { console.log(`✅ [Telegram] পোস্ট সফল (সরল আকার) → ${TELEGRAM_CHAT_ID}`); resolve(true); }
            else { console.error(`❌ [Telegram] মেসেজ ব্যর্থ (${r2.status}): ${r2.body.slice(0, 200)}`); resolve(false); }
          });
        }
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

/* ── SMO/P2: নিজস্ব প্রকাশিত সংবাদ (কিউ API না থাকলে) ────────────────────
   বাস্তব সমস্যা যা এটি সমাধান করে:
     Oracle সার্ভারে /api/queue নামে কোনো রুট নেই (লাইভ যাচাই: HTTP 404)।
     তাই আগের ডিফল্ট "api" মোডে পোস্টার প্রতি রানে কিছুই পোস্ট করত না —
     ফেসবুক পেজ ও টেলিগ্রাম চ্যানেল কয়েকদিন ধরে নীরব ছিল।

   এখন: কিউ না পেলে নিজের প্রকাশিত সংবাদ থেকে বেছে নেওয়া হয় —
     (ক) Oracle /api/config  অথবা  (খ) রিপোর data/bne-config.json
   বাহ্যিক সংবাদমাধ্যমের RSS-এ নামা হয় না, তাই ব্র্যান্ড ও কপিরাইট নিরাপদ।

   MAX_AGE_HOURS: পুরনো আর্কাইভ একবারে পোস্ট হয়ে স্প্যাম হওয়া আটকায়। */
function fetchOwnArticles() {
  const LOCAL = path.join(__dirname, 'data', 'bne-config.json');

  const readLocal = () => {
    try { return JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch (e) { return null; }
  };

  const mapConfig = (cfg) => {
    const list = Array.isArray(cfg && cfg.editorNews) ? cfg.editorNews : [];
    const base = String(SITE_BASE || '').replace(/\/+$/, '');
    const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
    return list
      .filter((a) => a && (a.slug || a.id) && a.title)
      .map((a) => {
        const published = a.publishedAt || a.published_at || cfg.updatedAt || '';
        return {
          title: a.title,
          /* নিজের রিয়েল পাথ — ডিডুপ ও লিংক-যাচাই এই URL-ই ব্যবহার করে */
          link: `${base}/news/${encodeURIComponent(a.slug || a.id)}`,
          description: a.summary || '',
          image: a.image || a.og_image || '',
          pubDate: published,
          slug: a.slug || a.id,
          category: a.category || '',
          _ts: published && !isNaN(Date.parse(published)) ? Date.parse(published) : 0,
        };
      })
      .filter((a) => a._ts >= cutoff); /* কেবল টাটকা সংবাদ */
  };

  return new Promise((resolve) => {
    const fallbackLocal = (reason) => {
      const cfg = readLocal();
      if (!cfg) { console.error(`⚠️ [Own] স্থানীয় কনফিগও পড়া গেল না (${reason})।`); return resolve([]); }
      const mapped = mapConfig(cfg);
      console.log(`📥 [Own] রিপোর স্থানীয় কনফিগ থেকে ${mapped.length}টি টাটকা সংবাদ (${reason})।`);
      resolve(mapped);
    };

    if (OWN_SOURCE === 'local') return fallbackLocal('OWN_SOURCE=local');

    const host = String(META_API_BASE).replace(/^https?:\/\//, '');
    httpsJson('GET', host, '/api/config', null, QUEUE_TOKEN ? { 'x-queue-token': QUEUE_TOKEN } : {})
      .then((r) => {
        if (r.status === 200 && r.json && Array.isArray(r.json.editorNews)) {
          const mapped = mapConfig(r.json);
          console.log(`📥 [Own] Oracle /api/config থেকে ${r.json.editorNews.length}টি সংবাদ পাওয়া গেছে — ${mapped.length}টি টাটকা।`);
          return resolve(mapped);
        }
        fallbackLocal(`HTTP ${r.status}`);
      })
      .catch((e) => fallbackLocal(e.message));
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
      headers: { "User-Agent": "Mozilla/5.0 (BNE-AutoPoster; +https://bangla-news-edition-bd.netlify.app)" }
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
    let fromOwn = false;

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

      /* কিউ অনুপলব্ধ/খালি হলে নিজের প্রকাশিত সংবাদ থেকেই পোস্ট করা হয়
         (আগে এখানেই থেমে যেত — কিছুই পোস্ট হত না)। */
      if (!fromQueue) {
        const own = await fetchOwnArticles();
        if (own.length) {
          fromOwn = true;
          items = own;
        }
      }
    }

    /* ★ নিরাপদ-ব্যর্থতা (fail closed) ★
       আগে কিউ খালি বা অনুপলব্ধ হলেই চুপচাপ ৯টি বাহ্যিক RSS ফিডে নেমে যেত এবং
       অন্য সংবাদমাধ্যমের শিরোনাম আপনার নিজের পেজে/চ্যানেলে পোস্ট করত।
       পরিণতি: (১) নিজের ব্র্যান্ডের বদলে অন্যের খবর, (২) কপিরাইট/সম্পাদকীয় ঝুঁকি,
       (৩) লিংক ছাড়া টেক্সট পোস্টে রিচের ক্ষতি।
       এখন বাহ্যিক RSS কেবল POSTER_MODE=legacy স্পষ্টভাবে দিলে চলবে; ডিফল্ট
       "api" মোডে কিউ ফাঁকা থাকলে কিছুই পোস্ট হবে না। */
    if (!fromQueue && !fromOwn && POSTER_MODE === "legacy") {
      console.log("📡 [Legacy] RSS ফিড থেকে সংবাদ সংগ্রহ করা হচ্ছে… (POSTER_MODE=legacy)");
      for (const feedUrl of RSS_FEEDS) {
        const feedItems = await fetchSingleFeed(feedUrl);
        if (feedItems && feedItems.length) items = items.concat(feedItems);
      }
    } else if (!fromQueue && !fromOwn) {
      console.log("");
      console.log("ℹ️ নিজস্ব প্রকাশিত কোনো টাটকা সংবাদ নেই — কিছু পোস্ট করা হলো না।");
      console.log("   (বাহ্যিক সংবাদমাধ্যমের RSS পোস্ট করতে হলে POSTER_MODE=legacy দিন।)");
      return;
    }

    if (!items.length) {
      console.log("ℹ️ কোনো সোর্স থেকে সংবাদ পাওয়া যায়নি — রান শেষ।");
      return;
    }

    /* ★ লিংক সত্যিই কাজ করছে কি না যাচাই ★
       কেন: সংবাদ সাইটে সিঙ্ক হতে কিছুটা সময় লাগে (GitHub Actions সিঙ্ক
       প্রতি ৫ মিনিটে)। সিঙ্কের আগেই পোস্ট করলে ফেসবুক 'সংবাদ পাওয়া যায়নি'
       ক্যাশ করে ফেলে এবং কার্ডটি চিরকাল ভাঙা দেখায় (বাস্তবে ঘটেছিল)।
       এখন পোস্ট করার আগে প্রতিটি লিংকের HTTP অবস্থা দেখা হয়; যেগুলো ২০০
       দেয় না সেগুলো বাদ পড়ে এবং পরের রানে আবার বিবেচিত হয়। */
    const reachable = [];
    for (const it of items) {
      const url = it.link || it.canonicalUrl || it.url;
      if (!url) continue;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BNE-LinkCheck/1.0)' } });
        clearTimeout(t);
        if (r.status === 200) reachable.push(it);
        else console.log(`   ⏳ লিংক এখনো প্রস্তুত নয় (HTTP ${r.status}) — পরের রানে আবার দেখা হবে: ${String(it.title || '').slice(0, 46)}`);
      } catch (e) {
        console.log(`   ⏳ লিংক যাচাই ব্যর্থ (${e.name === 'AbortError' ? 'timeout' : e.message}) — পরের রানে আবার: ${String(it.title || '').slice(0, 46)}`);
      }
    }
    items = reachable;
    if (!items.length) {
      console.log("ℹ️ সব লিংক এখনো প্রস্তুত নয় — এই রানে কিছু পোস্ট করা হলো না (ডুপ্লিকেট কিছু যায়নি)।");
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

    /* ★ একই ঘটনা দুই সোর্সে — একবারই পোস্ট হবে ★
       আগে কেবল হুবহু লিঙ্ক মিললেই ডুপ্লিকেট ধরা হত। তাই একই ঘটনা দুই সংবাদমাধ্যমে
       আসলে দুইবার পোস্ট যেত — যেমন "ডেঙ্গুতে 25 দিনে 114 মৃত্যু" আর
       "সেপ্টেম্বরের 25 দিনে ডেঙ্গুতে 114 মৃত্যু"। এখন শিরোনামের শব্দ-মিল দেখে
       কাছাকাছি খবর বাদ দেওয়া হয়। */
    const titleWords = (s) => String(s || '')
      .replace(/[^\u0980-\u09FF\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const tooClose = (a, b) => {
      const A = new Set(titleWords(a));
      const B = new Set(titleWords(b));
      if (!A.size || !B.size) return false;
      let hit = 0;
      for (const w of A) if (B.has(w)) hit++;
      return hit / Math.min(A.size, B.size) >= 0.6;
    };
    if (!FORCE_MODE) {
      const recentTitles = posted.slice(0, 160).map((p) => p.title || '').filter(Boolean);
      const kept = [];
      fresh = fresh.filter((n) => {
        if (recentTitles.some((t) => tooClose(t, n.title))) return false;   /* আগে পোস্ট হয়েছে */
        if (kept.some((t) => tooClose(t, n.title))) return false;           /* এই রানেই আগে নেওয়া হয়েছে */
        kept.push(n.title);
        return true;
      });
    }

    console.log(`📰 মোট ${news.length}টি সংবাদ পাওয়া গেছে, নতুন ${fresh.length}টি`);
    fresh = fresh.slice(0, MAX_POSTS_PER_RUN);
    if (!fresh.length) {
      console.log("ℹ️ নতুন কোনো খবর নেই (সবই আগে পোস্ট হয়েছে) — রান শেষ।");
      return;
    }

    /* ৪. প্রতিটি নতুন খবর → টেলিগ্রাম + ফেসবুক (প্রিভিউসহ) */
    /* ★ ব্রেকিং লেবেল এখন শর্তসাপেক্ষ ★
       আগে 25টি পোস্টের 24টিতেই "[BREAKING]" লেখা থাকত —
       সব খবর ব্রেকিং হলে কোনোটাই ব্রেকিং থাকে না। এখন কেবল
       সাম্প্রতিক (২ ঘন্টার ভিতরে) ও গুরুত্বপূর্ণ ঘটনায় এটি বসে। */
    const isBreaking = (n) => {
      const mins = (Date.now() - Number(n.ts || 0)) / 60000;
      if (!(mins >= 0 && mins <= 120)) return false;
      return /নিহত|মৃত্যু|মৃত|লাশ|দুর্ঘটনা|অগ্নিকাণ্ড|বিস্ফোরণ|ভূমিকম্প|হামলা|গুলি|নিখোঁজ|ভেঙ্গে|জরুরি|মাসক|বন্ধ ঘোষনা|বাতিল/.test(String(n.title || ''));
    };

    let postedCount = 0;
    for (const n of fresh) {
      console.log(`\n📌 পোস্ট হচ্ছে: "${n.title}"`);
      console.log(`🖼️ ছবি: ${n.image || "(নেই — শুধু লেখা যাবে)"}`);

      /* ★ ক্যাপশনে কোনো কাঁচা URL থাকে না ★
         আগে ক্যাপশনের শেষে raw URL বসানো হত, ফলে টেলিগ্রামে
         `…/news/%E0%A6%A6%E0%A7%87%E0%A6%A1…` জাতীয় শতাংশ-এনকোডেড জিবরিশ
         দেখা যেত। এখন লিংকটি প্রিভিউ কার্ড হিসেবেই যায় — কার্ডটিই ক্লিকযোগ্য,
         আর কার্ডের ছবিটি আসে আমাদের og:image থেকে (অর্থাৎ সংবাদের নিজস্ব ছবি)। */
      /* ★ প্রতিটি খবরের জন্য তার নিজস্ব হ্যাশট্যাগ ★
         ব্র্যান্ড + বিভাগ + শিরোনামে থাকা বিষয় — সর্বোচ্চ ৫টি। */
      const tags = buildHashtags(n);

      const caption =
        (isBreaking(n) ? `💥 <b>[ব্রেকিং নিউজ]</b>\n\n` : '') +
        `📰 <b>${escHtml(n.title)}</b>\n\n` +
        `${escHtml(n.summary)}...\n\n` +
        `🔗 <b>বিস্তারিত পড়তে নিচের কার্ডে ক্লিক করুন</b>` +
        (tags ? `\n\n${escHtml(tags)}` : '');

      /* ফেসবুকের বার্তা — লিংকটি `link` প্যারামিটারেই যায়, তাই লেখায়
         আলাদা করে URL দেখানোর দরকার নেই (নইলে কাঁচা লিংক দেখা যায়)। */
      /* ফেসবুকের বার্তা — লিংকটি `link` প্যারামিটারেই যায়, তাই লেখায়
         আলাদা করে URL দেখানোর দরকার নেই। শেষে হ্যাশট্যাগ যোগ করা হয় যাতে
         Facebook-এর অ্যালগরিদম খবরটি সম্পর্কিত পাঠকদের কাছে পৌঁছে দেয়। */
      const fbMessage = `${isBreaking(n) ? '💥 [ব্রেকিং নিউজ] ' : ''}${n.title}\n\n${n.summary}...` +
        (tags ? `\n\n${tags}` : '');

      /* টেলিগ্রাম — প্রিভিউ কার্ডে ক্লিক করলেই সরাসরি পোর্টালে যায়।
         কার্ডের ছবি = og:image = সংবাদের নিজস্ব/বিভাগীয় ছবি। */
      let tgPosted = false;
      if (TELEGRAM_BOT_TOKEN) {
        tgPosted = await postWithRetry(() => postTelegramMessage(caption, n.url), "Telegram পোস্ট", 2);
      }

      /* ফেসবুক — ডিফল্ট photo (নিউজের আসল ছবি বড় করে, টেলিগ্রামের মতো):
         ১) ছবি ডাউনলোড → সরাসরি আপলোড (সবচেয়ে নির্ভরযোগ্য)
         ২) URL-পদ্ধতি (FB নিজে ফেচ করবে)
         ৩) link ফলব্যাক (OG প্রিভিউ কার্ড)
         কোনো স্টক ছবি কখনো নয় */
      let fbPosted = false;
      if (FB_PAGE_TOKEN && FB_PAGE_ID) {
        let fbOk = false;
        const imgAbs = resolveImage(n.image);
        if (FB_POST_MODE !== "link" && imgAbs) {
          try {
            const dl = await downloadImage(imgAbs);
            fbOk = await postWithRetry(() => postFacebookPhotoBinary(fbMessage + "\n\n" + n.url, dl.buf, dl.mime), "Facebook ছবি-আপলোড", 2);
          } catch (e) {
            console.log(`ℹ️ [Facebook] ছবি ডাউনলোড ব্যর্থ (${e.message}) — URL-পদ্ধতিতে যাচ্ছি`);
          }
          if (!fbOk) fbOk = await postWithRetry(() => postFacebookPhoto(fbMessage + "\n\n" + n.url, imgAbs), "Facebook ছবি-URL", 1);
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
        await postWithRetry(() => postInstagram(escHtml(n.title) + "\n\n" + n.url, resolveImage(n.image)), "Instagram", 1);
      }

      /* ★ ক্যাশে যোগ কেবল সত্যিই পোস্ট হলে ★
         আগের বাগ: কোথাও পোস্ট ব্যর্থ হলেও লিংক ক্যাশে যোগ হয়ে যেত, ফলে
         সেই খবর আর কখনো পোস্ট হত না (চিরতরে হারিয়ে যেত)। এখন ব্যর্থ পোস্ট
         ডিডুপ ক্যাশে ঢুকবে না এবং পরের রানে আবার চেষ্টা হবে। */
      if (tgPosted || fbPosted) {
        postedCount++;
        postedLinks.add(n.link);
        /* ★ কোন কোন চ্যানেলে গেল তা লেখা থাকে ★
           অ্যাডমিন বট "সর্বশেষ কোন খবর ফেসবুকে গেল, কোনটি চ্যানেলে গেল"
           দেখাতে পারে — তার জন্য দরকার। আগে শুধু লিংক/শিরোনাম থাকত, কোন
           চ্যানেলে পোস্ট হলো তা কোথাও লেখা থাকত না। */
        const wentTo = [];
        if (tgPosted) wentTo.push('telegram');
        if (fbPosted) wentTo.push('facebook');
        posted.unshift({ link: n.link, title: n.title, ts: n.ts, url: n.url, channels: wentTo });
      } else {
        console.log("⚠️ কোনো চ্যানেলে পোস্ট হয়নি — পরের রানে আবার চেষ্টা হবে (ক্যাশে যোগ করা হলো না)।");
      }

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
    console.log(`🎉 সম্পন্ন — ${fresh.length}টি বিবেচিত, ${postedCount}টি টেলিগ্রাম ও/বা ফেসবুকে পোস্ট হয়েছে`);
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Auto-post execution error:", err);
  }
}

runAutoPost();
