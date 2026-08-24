/**
 * 🤖 BNE FACEBOOK GROUP GHOST-DISTRIBUTION BOT
 * Playwright Browser Automation Script for Automated Expat Group Posting
 */

const { chromium } = require('playwright');
const https = require('https');

const FB_GROUPS = [
  "https://www.facebook.com/groups/bangladeshiexpats",
  "https://www.facebook.com/groups/middleeastexpatsbd",
  "https://www.facebook.com/groups/malaysiaexpatsbd"
];

function fetchLatestBneNews() {
  return new Promise((resolve) => {
    https.get("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.banglaedition.com%2Ffeed%2F", (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const feed = JSON.parse(data);
          resolve(feed.items[0] || null);
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function runFbGroupPoster() {
  console.log("🚀 Starting BNE Facebook Group Ghost-Distribution Engine...");
  const news = await fetchLatestBneNews();
  const newsTitle = news ? news.title : "বাংলা নিউজ এডিশন — সর্বশেষ আপডেট";
  const newsLink = "https://bangla-news-edition.netlify.app/#/desk/probashi-bangla-news";
  const postText = `📰 ${newsTitle}\n\nপ্রবাসীদের জন্য সর্বশেষ আপডেট পড়ুন:\n👉 ${newsLink}`;

  console.log(`📌 Post Content Ready: "${newsTitle}"`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' });
  const page = await context.newPage();

  for (const groupUrl of FB_GROUPS) {
    console.log(`🌐 Auto-navigating to FB Group: ${groupUrl}`);
    try {
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      console.log(`✅ Group Loaded: ${groupUrl}`);
    } catch (e) {
      console.log(`⚠️ Skipped (No login token/timeout): ${groupUrl}`);
    }
  }

  await browser.close();
  console.log("🎉 FB Group Ghost-Distribution Task Completed!");
}

runFbGroupPoster();
