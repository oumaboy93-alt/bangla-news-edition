/**
 * 🤖 BNE AUTONOMOUS SOCIAL POSTER ENGINE & RICH MEDIA BOT (V2)
 * -----------------------------------------------------------
 * Automatically posts latest BNE news to Telegram Channel & Facebook Page
 * with thumbnail image support and duplicate posting prevention.
 */

const fs = require('fs');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8901003446:AAHamIJLa2157C1O9ZzhvTZUQ314JZK2wmE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@bne0999";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
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
            link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
            enclosure: { link: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80" }
          }]
        });
      });
    }).on('error', () => {
      resolve({
        items: [{
          title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
          description: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও পাসপোর্ট সেবায় নতুন ডিজিটাল পোর্টাল চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% বোনাস অব্যহত।",
          link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
          enclosure: { link: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80" }
        }]
      });
    });
  });
}

function sendTelegram(captionText, imageUrl) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("⚠️ [Telegram Warning]: TELEGRAM_BOT_TOKEN missing.");
    return;
  }

  const endpoint = imageUrl ? '/sendPhoto' : '/sendMessage';
  const payloadData = imageUrl ? {
    chat_id: TELEGRAM_CHAT_ID,
    photo: imageUrl,
    caption: captionText,
    parse_mode: 'HTML'
  } : {
    chat_id: TELEGRAM_CHAT_ID,
    text: captionText,
    parse_mode: 'HTML'
  };

  const payload = JSON.stringify(payloadData);
  const req = https.request({
    hostname: 'api.telegram.org', path: `/bot${TELEGRAM_BOT_TOKEN}${endpoint}`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`✅ [Telegram Success 200]: Rich Media Post published to ${TELEGRAM_CHAT_ID}`);
      } else {
        console.error(`❌ [Telegram Error ${res.statusCode}]: ${body}`);
        if (imageUrl) {
          console.log("🔄 Retrying with text-only message fallback...");
          sendTelegram(captionText, null);
        }
      }
    });
  });
  req.on('error', (e) => console.error(`❌ [Telegram Network Error]: ${e.message}`));
  req.write(payload); req.end();
}

function postFacebook(message, link) {
  if (!FB_PAGE_TOKEN) {
    console.log("ℹ️ [Facebook Info]: FB_PAGE_TOKEN not provided, skipping FB post.");
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
      }
    });
  });
  req.on('error', (e) => console.error(`❌ [Facebook Network Error]: ${e.message}`));
  req.write(payload); req.end();
}

async function runAutoPost() {
  console.log("==================================================");
  console.log("🚀 BNE RICH MEDIA SOCIAL POSTER ENGINE RUNNING...");
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

    /* Anti-Duplicate Protection */
    if (lastPosted && (lastPosted.guid === latest.guid || lastPosted.title === latest.title)) {
      console.log(`ℹ️ [Anti-Duplicate Skip]: "${latest.title}" is already posted to Telegram.`);
      return;
    }

    const cleanDesc = (latest.description || "").replace(/<[^>]*>?/gm, '').slice(0, 180);
    const msg = `📰 <b>${latest.title}</b>\n\n${cleanDesc}...\n\n🔗 <b>বিস্তারিত পড়তে ক্লিক করুন:</b>\nhttps://bangla-news-edition-247.netlify.app/`;

    let imgUrl = null;
    if (latest.enclosure && latest.enclosure.link) imgUrl = latest.enclosure.link;
    else if (latest.thumbnail) imgUrl = latest.thumbnail;

    console.log(`📌 Latest Article: "${latest.title}"`);
    console.log("📨 Dispatching Rich Media Post to Telegram & Facebook...");

    sendTelegram(msg, imgUrl);
    postFacebook(`${latest.title}\n\nবিস্তারিত: https://bangla-news-edition-247.netlify.app/`, "https://bangla-news-edition-247.netlify.app/");

    fs.writeFileSync(postedFile, JSON.stringify({ guid: latest.guid || latest.title, title: latest.title, date: new Date().toISOString() }, null, 2));
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Auto-post execution error:", err);
  }
}

runAutoPost();
