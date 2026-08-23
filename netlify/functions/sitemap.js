/**
 * BNE — Dynamic Sitemap Function (P1 SEO)
 * GET /api/sitemap.xml → লাইভ আর্টিকেল URL (রিয়েল-পাথ /news/<id>) সহ sitemap
 * স্ট্যাটিক sitemap.xml-এর পরিপূরক; ১ ঘণ্টা CDN-ক্যাশ
 */

const { fetchAllFeeds, hashId } = require('./_feeds.js');

const SITE = process.env.SITE_URL || "https://bangla-news-edition-247.netlify.app";

function escXml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[c]));
}

exports.handler = async () => {
  try {
    const { items, errors } = await fetchAllFeeds();
    const now = new Date().toISOString();

    const staticUrls = [
      { loc: SITE + "/", freq: "hourly", pri: "1.0" },
      { loc: SITE + "/about-us.html", freq: "monthly", pri: "0.6" },
      { loc: SITE + "/privacy-policy.html", freq: "yearly", pri: "0.3" },
      { loc: SITE + "/contact-us.html", freq: "yearly", pri: "0.5" },
      { loc: SITE + "/desk/probashi-bangla-news", freq: "hourly", pri: "0.9" },
      { loc: SITE + "/gn-feed.xml", freq: "daily", pri: "0.4" }
    ];

    const articleUrls = items.slice(0, 200).map((it) => ({
      loc: SITE + "/news/" + hashId(it.link),
      lastmod: new Date(it.ts).toISOString(),
      freq: "hourly",
      pri: "0.8"
    }));

    const urls = staticUrls.concat(articleUrls);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => '  <url>\n' +
        '    <loc>' + escXml(u.loc) + '</loc>\n' +
        (u.lastmod ? '    <lastmod>' + u.lastmod + '</lastmod>\n' : '') +
        '    <changefreq>' + u.freq + '</changefreq>\n' +
        '    <priority>' + u.pri + '</priority>\n' +
        '  </url>').join('\n') +
      '\n</urlset>\n';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Netlify-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600'
      },
      body: xml
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: "sitemap generation error: " + String(err && err.message || err)
    };
  }
};
