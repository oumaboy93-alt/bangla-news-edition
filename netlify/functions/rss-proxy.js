/**
 * BNE — RSS Proxy Function (P2 সার্ভার-সাইড ইনজেশন)
 * GET /api/rss-proxy → ৯টি ফিড সার্ভার-সাইড থেকে ফেচ করে নরমালাইজড JSON
 * CDN-ক্যাশ (Netlify-CDN-Cache-Control) — ভিজিটরদের জন্য দ্রুত + CORS-প্রক্সি নির্ভরতা মুক্ত
 */

const { fetchAllFeeds } = require('./_feeds.js');

exports.handler = async () => {
  try {
    const { items, errors } = await fetchAllFeeds();

    if (!items.length) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'rss-proxy', items: [], errors, message: 'কোনো ফিড থেকে সংবাদ পাওয়া যায়নি' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=120',
        'Netlify-CDN-Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ source: 'rss-proxy', fetchedAt: new Date().toISOString(), items, errors })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'rss-proxy', items: [], errors: [{ source: 'internal', error: String(err && err.message || err) }] })
    };
  }
};
