/**
 * 🤖 BNE AUTONOMOUS SOCIAL POSTER ENGINE & RICH MEDIA BOT (V3)
 * -----------------------------------------------------------
 * Automatically posts latest BNE news to Telegram Channel (@bne0999) & Facebook Page
 * with guaranteed thumbnail preview images and anti-duplicate tracking.
 */

const fs = require('fs');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8901003446:AAHamIJLa2157C1O9ZzhvTZUQ314JZK2wmE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@bne0999";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "me";

const FORCE_MODE = process.argv.includes('--force');

const FALLBACK_NEWS = [
  {
    title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
    description: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও নতুন ডিজিটাল পাসপোর্ট সেবা চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% প্রণোদনা অব্যাহত।",
    link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
    image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80"
  },
  {
    title: "প্রবাসী কল্যাণ ব্যাংক থেকে সহজ শর্তে নতুন ঋণ সহায়তা ঘোষণা",
    description: "বিদেশগামী কর্মী ও প্রবাসফেরত উদ্যোক্তাদের পুনরেকত্রীকরণে সহজ শর্তে ২ লাখ থেকে ৫ লাখ টাকা পর্যন্ত বিশেষ ঋণ সুবিধা দিচ্ছে ব্যাংক।",
    link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
    image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=80"
  }
];

function fetchFeed(url) {
  return new Promise((resolve) => {
    https.get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.items && parsed.items.length) {
            return resolve(parsed.items);
          }
        } catch (e) {}
        resolve(FALLBACK_NEWS);
      });
    }).on('error', () => {
      resolve(FALLBACK_NEWS);
    });
  });
}

function sendTelegramPhoto(captionText, imageUrl) {
  return new Promise((resolve) => {
    const payloadData = {
      chat_id: TELEGRAM_CHAT_ID,
      photo: imageUrl,
      caption: captionText,
      parse_mode: 'HTML'
    };

    const payload = JSON.stringify(payloadData);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ [Telegram Success 200]: Rich Media Photo Post published to ${TELEGRAM_CHAT_ID}`);
          resolve(true);
        } else {
          console.error(`⚠️ [Telegram Photo Error ${res.statusCode}]: ${body}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ [Telegram Network Error]: ${e.message}`);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

function sendTelegramMessage(captionText) {
  return new Promise((resolve) => {
    const payloadData = {
      chat_id: TELEGRAM_CHAT_ID,
      text: captionText,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    };

    const payload = JSON.stringify(payloadData);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ [Telegram Success 200]: Text Post published to ${TELEGRAM_CHAT_ID}`);
          resolve(true);
        } else {
          console.error(`❌ [Telegram Message Error ${res.statusCode}]: ${body}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ [Telegram Network Error]: ${e.message}`);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

function postFacebook(message, link) {
  if (!FB_PAGE_TOKEN) {
    console.log("ℹ️ [Facebook Notice]: FB_PAGE_TOKEN environment secret is not set. Set FB_PAGE_TOKEN in GitHub Repository Secrets to auto-post to Facebook Page.");
    return;
  }
  const payload = JSON.stringify({ message: message, link: link, access_token: FB_PAGE_TOKEN });
  const req = https.request({
    hostname: 'graph.facebook.com',
    path: `/v18.0/${FB_PAGE_ID}/feed`,
    method: 'POST',
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
  req.write(payload);
  req.end();
}

async function runAutoPost() {
  console.log("==================================================");
  console.log("🚀 BNE RICH MEDIA SOCIAL POSTER ENGINE V3 RUNNING");
  console.log("==================================================");

  try {
    const items = await fetchFeed("https://www.banglaedition.com/feed/");
    const latest = items[0] || FALLBACK_NEWS[0];

    const postedFile = './last_posted.json';
    let lastPosted = {};
    if (fs.existsSync(postedFile)) {
      try { lastPosted = JSON.parse(fs.readFileSync(postedFile, 'utf8')); } catch (e) {}
    }

    /* Anti-Duplicate Check unless --force is passed */
    if (!FORCE_MODE && lastPosted && (lastPosted.title === latest.title)) {
      console.log(`ℹ️ [Anti-Duplicate Skip]: "${latest.title}" is already posted. Use --force to override.`);
      return;
    }

    const cleanDesc = (latest.description || latest.summary || "").replace(/<[^>]*>?/gm, '').slice(0, 160);
    const targetLink = "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news";

    const caption = `📰 <b>${latest.title}</b>\n\n${cleanDesc}...\n\n🔗 <b>বি-এন-ই পোর্টালে সম্পূর্ণ সংবাদটি পড়তে নিচে ক্লিক করুন:</b>\n${targetLink}`;

    let imgUrl = latest.image;
    if (!imgUrl && latest.enclosure && latest.enclosure.link) imgUrl = latest.enclosure.link;
    if (!imgUrl && latest.thumbnail) imgUrl = latest.thumbnail;
    if (!imgUrl) imgUrl = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80";

    console.log(`📌 Publishing Post: "${latest.title}"`);
    console.log(`📸 Image URL: ${imgUrl}`);

    /* Try sending photo first */
    let photoSuccess = await sendTelegramPhoto(caption, imgUrl);
    if (!photoSuccess) {
      console.log("🔄 Retrying with fallback rich text message...");
      await sendTelegramMessage(caption);
    }

    postFacebook(`${latest.title}\n\n${cleanDesc}...\n\nবিস্তারিত পড়তে দেখুন: ${targetLink}`, targetLink);

    fs.writeFileSync(postedFile, JSON.stringify({
      title: latest.title,
      link: targetLink,
      date: new Date().toISOString()
    }, null, 2));

    console.log("==================================================");
    console.log("🎉 DISPATCH COMPLETE");
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Auto-post execution error:", err);
  }
}

runAutoPost();
