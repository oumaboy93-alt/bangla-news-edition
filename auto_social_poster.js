/**
 * 🤖 BNE DYNAMIC HEADLINE SOCIAL POSTER ENGINE V4
 * -----------------------------------------------------------
 * Dynamically fetches the LATEST TOP BREAKING HEADLINE news,
 * extracts its exact title, summary, thumbnail preview image,
 * and creates a direct deep-link to that exact news story on the BNE Portal.
 * Posts automatically to Telegram (@bne0999) & Facebook Page.
 */

const fs = require('fs');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8901003446:AAHamIJLa2157C1O9ZzhvTZUQ314JZK2wmE";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "@bne0999";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "me";

const FORCE_MODE = process.argv.includes('--force');

const RSS_FEEDS = [
  "https://www.banglaedition.com/feed/",
  "https://www.prothomalo.com/feed"
];

function fetchSingleFeed(url) {
  return new Promise((resolve) => {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.items && parsed.items.length) {
            return resolve(parsed.items);
          }
        } catch (e) {}
        resolve([]);
      });
    }).on('error', () => resolve([]));
  });
}

function extractImageFromContent(htmlContent) {
  if (!htmlContent) return null;
  const match = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
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
          console.error(`⚠️ [Telegram Photo Warning ${res.statusCode}]: ${body}`);
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
          console.log(`✅ [Telegram Message Success 200]: Text Post published to ${TELEGRAM_CHAT_ID}`);
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
    console.log("ℹ️ [Facebook Notice]: FB_PAGE_TOKEN environment secret is not set. Add FB_PAGE_TOKEN in GitHub Secrets to auto-post to Facebook Page.");
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
        console.log(`✅ [Facebook Success 200]: Headline Post published to Facebook Page`);
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
  console.log("🚀 BNE DYNAMIC BREAKING HEADLINE POSTER V4 RUNNING");
  console.log("==================================================");

  try {
    let items = [];
    for (const feedUrl of RSS_FEEDS) {
      const feedItems = await fetchSingleFeed(feedUrl);
      if (feedItems && feedItems.length) {
        items = items.concat(feedItems);
      }
    }

    /* Fallback Headline if feeds fail */
    if (!items.length) {
      items = [{
        title: "বিএমইটি নিবন্ধিত প্রবাসীদের জন্য বিশেষ স্মার্ট কার্ড সার্ভিস ও রেমিট্যান্স গাইড",
        description: "প্রবাসী বাংলাদেশীদের সুবিধার্থে বিএমইটি ও নতুন ডিজিটাল পাসপোর্ট সেবা চালু হয়েছে। বৈধ ব্যাংকিং চ্যানেলে রেমিট্যান্স প্রেরণে ২.৫% প্রণোদনা অব্যাহত।",
        link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
        thumbnail: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80"
      }];
    }

    const latest = items[0];
    const headlineTitle = latest.title;

    const postedFile = './last_posted.json';
    let lastPosted = {};
    if (fs.existsSync(postedFile)) {
      try { lastPosted = JSON.parse(fs.readFileSync(postedFile, 'utf8')); } catch (e) {}
    }

    /* Anti-Duplicate Check unless --force is passed */
    if (!FORCE_MODE && lastPosted && lastPosted.title === headlineTitle) {
      console.log(`ℹ️ [Anti-Duplicate Skip]: Top Headline "${headlineTitle}" is already posted to Telegram.`);
      return;
    }

    const cleanSummary = (latest.description || latest.content || "").replace(/<[^>]*>?/gm, '').slice(0, 165);
    const slugId = encodeURIComponent(headlineTitle);
    const targetNewsLink = `https://bangla-news-edition-247.netlify.app/#/news/${slugId}`;

    const caption = `💥 <b>[ব্রেকিং নিউজ হেডলাইন]</b>\n\n📰 <b>${headlineTitle}</b>\n\n${cleanSummary}...\n\n🔗 <b>বি-এন-ই পোর্টালে সরাসরি সংবাদটি পড়তে ক্লিক করুন:</b>\n${targetNewsLink}`;

    let imgUrl = latest.thumbnail;
    if (!imgUrl && latest.enclosure && latest.enclosure.link) imgUrl = latest.enclosure.link;
    if (!imgUrl) imgUrl = extractImageFromContent(latest.content || latest.description);
    if (!imgUrl) imgUrl = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80";

    console.log(`📌 Dynamic Top Headline: "${headlineTitle}"`);
    console.log(`📸 Extracted Photo URL: ${imgUrl}`);
    console.log(`🔗 Target Portal URL: ${targetNewsLink}`);

    /* Dispatch to Telegram */
    let photoSuccess = await sendTelegramPhoto(caption, imgUrl);
    if (!photoSuccess) {
      console.log("🔄 Retrying photo dispatch with fallback rich text...");
      await sendTelegramMessage(caption);
    }

    /* Dispatch to Facebook */
    postFacebook(`💥 [ব্রেকিং নিউজ] ${headlineTitle}\n\n${cleanSummary}...\n\nবিস্তারিত বি-এন-ই পোর্টালে পড়ুন: ${targetNewsLink}`, targetNewsLink);

    fs.writeFileSync(postedFile, JSON.stringify({
      title: headlineTitle,
      link: targetNewsLink,
      date: new Date().toISOString()
    }, null, 2));

    console.log("==================================================");
    console.log("🎉 BREAKING HEADLINE DISPATCH COMPLETE");
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Headline Auto-post execution error:", err);
  }
}

runAutoPost();
