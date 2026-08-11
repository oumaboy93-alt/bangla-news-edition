const fs = require('fs');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

const RSS_FEED_URL = "https://www.banglaedition.com/feed/";

function fetchFeed(url) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials missing. Skipping.");
    return Promise.resolve();
  }
  const payload = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    console.log(`Telegram API Status: ${res.statusCode}`);
  });
  req.write(payload);
  req.end();
}

function postFacebook(message, link) {
  if (!FB_PAGE_TOKEN || !FB_PAGE_ID) {
    console.log("Facebook credentials missing. Skipping.");
    return Promise.resolve();
  }
  const payload = JSON.stringify({
    message: message,
    link: link,
    access_token: FB_PAGE_TOKEN
  });
  const req = https.request({
    hostname: 'graph.facebook.com',
    path: `/v18.0/${FB_PAGE_ID}/feed`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    console.log(`Facebook Graph API Status: ${res.statusCode}`);
  });
  req.write(payload);
  req.end();
}

async function runAutoPost() {
  try {
    const feed = await fetchFeed(RSS_FEED_URL);
    if (!feed.items || !feed.items.length) return;

    const latest = feed.items[0];
    const postedFile = './last_posted.json';
    let lastPosted = {};
    if (fs.existsSync(postedFile)) {
      lastPosted = JSON.parse(fs.readFileSync(postedFile, 'utf8'));
    }

    if (lastPosted.guid === latest.guid) {
      console.log("No new article to post.");
      return;
    }

    const msg = `📰 <b>${latest.title}</b>\n\n${latest.description.replace(/<[^>]*>?/gm, '').slice(0, 180)}...\n\n🔗 বিস্তারিত পড়ুন: https://bangla-news-edition-247.netlify.app/`;

    console.log("Posting new article to social media...");
    sendTelegram(msg);
    postFacebook(latest.title, "https://bangla-news-edition-247.netlify.app/");

    fs.writeFileSync(postedFile, JSON.stringify({ guid: latest.guid, title: latest.title, date: new Date().toISOString() }));
    console.log("Auto-post completed successfully!");
  } catch (err) {
    console.error("Auto-post error:", err);
  }
}

runAutoPost();
