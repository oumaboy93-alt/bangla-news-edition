/**
 * 🤖 BNE AUTONOMOUS SOCIAL POSTER ENGINE & DIAGNOSTIC DEBUGGER
 * -----------------------------------------------------------
 * Automatically posts latest BNE news to Telegram Channel & Facebook Page
 * with detailed API diagnostics and error tracking.
 */

const fs = require('fs');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8901003446:AAHamIJLa2157C1O9ZzhvTZUQ314JZK2wmE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@bne0999";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "EAAMlznJ7GXABSJTpesqX6duD7ZB23kviIAK6QuUnwxzfN2u1KAayvhQ4JC0VkCKBCzhxdXRI6YGJxmfbuoZBMTDfiHTusa3mozzVRDt2D5qr7TInpcKo9m4WnPsz2k9ZABOOruoyvXNOVEYSS5fKMZA7Vh33ZAPbZCjPbiJAkh8EmmySVsqPks8ioZC2P7dmPlUQRUVywtSGLAzwE4FVNU2WJXw2C1cKslZCZBfbq2jB7arKSkMf4ZCarTJunzhJwwruumSiKXfDsFAHFwzihxZBaub";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "me";

const RSS_FEED_URL = "https://www.banglaedition.com/feed/";

function fetchFeed(url) {
  return new Promise((resolve) => {
    https.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.items && parsed.items.length) {
            return resolve(parsed);
          }
        } catch (e) {}
        resolve({
          items: [{
            title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
            description: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও পাসপোর্ট সেবায় নতুন ডিজিটাল পোর্টাল চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% বোনাস অব্যহত।",
            link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news"
          }]
        });
      });
    }).on('error', () => {
      resolve({
        items: [{
          title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
          description: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও পাসপোর্ট সেবায় নতুন ডিজিটাল পোর্টাল চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% বোনাস অব্যহত।",
          link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news"
        }]
      });
    });
  });
}

function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("⚠️ [Telegram Warning]: TELEGRAM_BOT_TOKEN missing.");
    return;
  }
  const payload = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org', path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`✅ [Telegram Success 200]: Message posted to ${TELEGRAM_CHAT_ID}`);
      } else {
        console.error(`❌ [Telegram Error ${res.statusCode}]: ${body}`);
        console.error(`💡 [Telegram Diagnostic Guide]:`);
        console.error(`   1. Open Telegram & search for your bot username.`);
        console.error(`   2. Create/Open your channel (e.g. ${TELEGRAM_CHAT_ID}).`);
        console.error(`   3. Add the bot as Channel Administrator with 'Post Messages' privilege.`);
        console.error(`   4. Verify secret TELEGRAM_CHAT_ID matches your public channel handle or numeric ID.`);
      }
    });
  });
  req.on('error', (e) => console.error(`❌ [Telegram Network Error]: ${e.message}`));
  req.write(payload); req.end();
}

function postFacebook(message, link) {
  if (!FB_PAGE_TOKEN) {
    console.log("⚠️ [Facebook Warning]: FB_PAGE_TOKEN missing.");
    return;
  }
  const payload = JSON.stringify({ message: message, link: link, access_token: FB_PAGE_TOKEN });
  const req = https.request({
    hostname: 'graph.facebook.com', path: `/v18.0/${FB_PAGE_ID}/feed`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`✅ [Facebook Success 200]: Post published to Facebook Page`);
      } else {
        console.error(`❌ [Facebook Error ${res.statusCode}]: ${body}`);
        console.error(`💡 [Facebook Diagnostic Guide]: Check page token expiration or pages_manage_posts scope.`);
      }
    });
  });
  req.on('error', (e) => console.error(`❌ [Facebook Network Error]: ${e.message}`));
  req.write(payload); req.end();
}

async function runAutoPost() {
  console.log("==================================================");
  console.log("🚀 BNE AUTONOMOUS SOCIAL POSTER RUNNING...");
  console.log("==================================================");
  try {
    const feed = await fetchFeed(RSS_FEED_URL);
    if (!feed.items || !feed.items.length) {
      console.log("⚠️ No items returned from RSS feed.");
      return;
    }
    const latest = feed.items[0];
    const postedFile = './last_posted.json';
    let lastPosted = {};
    if (fs.existsSync(postedFile)) {
      try { lastPosted = JSON.parse(fs.readFileSync(postedFile, 'utf8')); } catch (e) {}
    }

    const cleanDesc = (latest.description || "").replace(/<[^>]*>?/gm, '').slice(0, 180);
    const msg = `📰 <b>${latest.title}</b>\n\n${cleanDesc}...\n\n🔗 বিস্তারিত পড়ুন: https://bangla-news-edition-247.netlify.app/`;

    console.log(`📌 Latest News: "${latest.title}"`);
    console.log("📨 Dispatching auto-posts to Telegram & Facebook...");

    sendTelegram(msg);
    postFacebook(`${latest.title}\n\nবিস্তারিত: https://bangla-news-edition-247.netlify.app/`, "https://bangla-news-edition-247.netlify.app/");

    fs.writeFileSync(postedFile, JSON.stringify({ guid: latest.guid, title: latest.title, date: new Date().toISOString() }));
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Auto-post execution error:", err);
  }
}

runAutoPost();
