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
const FB_POST_MODE = (process.env.FB_POST_MODE || "link").toLowerCase() === "photo" ? "photo" : "link";
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

const SITE_BASE = "https://bangla-news-edition-247.netlify.app";

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

function httpsJson(method, hostname, path, formParams) {
  return new Promise((resolve) => {
    const body = new URLSearchParams(formParams).toString();
    const req = https.request({
      hostname,
      path,
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
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
function fetchSingleFeed(url) {
  return new Promise((resolve) => {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.items && parsed.items.length) return resolve(parsed.items);
        } catch (e) {}
        resolve([]);
      });
    }).on('error', () => resolve([]));
  });
}

function extractImageFromContent(htmlContent) {
  if (!htmlContent) return null;
  const m = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/* rss2json আইটেম → অভিন্ন নিউজ অবজেক্ট */
function normalizeItem(it) {
  const title = stripHtml(it.title || "");
  const link = String(it.link || it.guid || "").trim();
  if (!title || link.indexOf("http") !== 0) return null;
  const summary = stripHtml(it.description || it.content || "").slice(0, 165);
  let image = it.thumbnail || (it.enclosure && it.enclosure.link) || null;
  if (!image || !/^https?:/.test(image)) image = extractImageFromContent(it.content || it.description);
  const ts = it.pubDate && !isNaN(Date.parse(it.pubDate)) ? Date.parse(it.pubDate) : Date.now();
  const id = hashId(link);
  return { title, link, summary, image, ts, id, url: `${SITE_BASE}/#/news/${id}` };
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

/* photo মোড: ছবি + ক্যাপশন পোস্ট (টেলিগ্রামের মতো ভিজ্যুয়াল) */
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
function loadPosted() {
  try {
    const raw = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
    if (raw && Array.isArray(raw.posted)) return raw.posted;
  } catch (e) {}
  return [];
}
function savePosted(posted) {
  const trimmed = posted.slice(0, 200); /* সর্বোচ্চ ২০০টি লিংক রাখা হয় */
  fs.writeFileSync(POSTED_FILE, JSON.stringify({ posted: trimmed, date: new Date().toISOString() }, null, 2));
}

/* ── মূল রান ── */
async function runAutoPost() {
  console.log("==================================================");
  console.log("🚀 BNE DYNAMIC NEWS POSTER V6 — DUAL DISPATCH");
  console.log(`   টেলিগ্রাম: ${TELEGRAM_BOT_TOKEN ? "✅ চালু" : "⛔ টোকেন নেই (স্কিপ)"}`);
  console.log(`   ফেসবুক: ${FB_PAGE_TOKEN && FB_PAGE_ID ? "✅ চালু (" + FB_POST_MODE + " মোড)" : "⛔ টোকেন/পেজ আইডি নেই (স্কিপ)"}`);
  console.log(`   ইনস্টাগ্রাম: ${IG_USER_ID && FB_PAGE_TOKEN ? "✅ চালু" : "⛔ IG_USER_ID নেই (স্কিপ)"}`);
  console.log(`   প্রতি রানে সর্বোচ্চ: ${MAX_POSTS_PER_RUN}টি`);
  console.log("==================================================");

  try {
    /* ১. সব ফিড থেকে সংবাদ সংগ্রহ */
    let items = [];
    for (const feedUrl of RSS_FEEDS) {
      const feedItems = await fetchSingleFeed(feedUrl);
      if (feedItems && feedItems.length) items = items.concat(feedItems);
    }

    if (!items.length) {
      console.log("ℹ️ কোনো ফিড থেকে সংবাদ পাওয়া যায়নি — রান শেষ।");
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
      const caption = `💥 <b>[ব্রেকিং নিউজ]</b>\n\n📰 <b>${escHtml(n.title)}</b>\n\n${escHtml(n.summary)}...\n\n🔗 <b>বি-এন-ই পোর্টালে পড়তে ক্লিক করুন:</b>\n${n.url}`;
      const fbMessage = `💥 [ব্রেকিং নিউজ] ${n.title}\n\n${n.summary}...\n\nবিস্তারিত পড়ুন: ${n.url}`;

      /* টেলিগ্রাম — ছবিসহ (retry), ব্যর্থ হলে টেক্সট */
      if (TELEGRAM_BOT_TOKEN) {
        const tgOk = n.image
          ? await postWithRetry(() => postTelegramPhoto(caption, n.image), "Telegram ফটো", 2)
          : false;
        if (!tgOk) await postTelegramMessage(caption);
      }

      /* ফেসবুক — link (OG প্রিভিউ কার্ড) বা photo (ছবি+ক্যাপশন), retry সহ */
      if (FB_PAGE_TOKEN && FB_PAGE_ID) {
        if (FB_POST_MODE === "photo" && n.image) {
          await postWithRetry(() => postFacebookPhoto(fbMessage + "\n\n" + n.url, n.image), "Facebook ছবি", 2);
        } else {
          await postWithRetry(() => postFacebookLink(fbMessage, n.url), "Facebook লিংক", 2);
        }
      }

      /* ইনস্টাগ্রাম — IG_USER_ID সেট থাকলে (একই FB টোকেন) */
      if (IG_USER_ID && n.image) {
        await postWithRetry(() => postInstagram(escHtml(n.title) + "\n\n" + n.url, n.image), "Instagram", 1);
      }

      /* পোস্ট সম্পন্ন → ক্যাশে যোগ */
      postedLinks.add(n.link);
      posted.unshift({ link: n.link, title: n.title, ts: n.ts, url: n.url });
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
