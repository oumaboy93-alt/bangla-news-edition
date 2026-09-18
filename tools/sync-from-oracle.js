#!/usr/bin/env node
'use strict';
/**
 * BNE — Oracle → রেপো কনটেন্ট সিঙ্ক
 * ════════════════════════════════════════════════════════════════════
 * কেন দরকার: সাইটের সব পৃষ্ঠা GitHub-এর data/bne-config.json থেকে
 * ডেটা পড়ে (settings.remoteConfigUrl)। অ্যাডমিন প্যানেল বা স্বয়ংক্রিয়
 * সংগ্রহ যত সংবাদই তৈরি করুক — সেগুলো কেবল Oracle ডেটাবেজে থাকে।
 * সিঙ্ক না হলে লাইভ সাইটে সেই সংবাদ পৌঁছায় না এবং ফেসবুকের প্রিভিউ
 * কার্ডে "সংবাদ পাওয়া যায়নি" দেখায় (ঠিক এই কারণেই হয়েছিল)।
 *
 * এই স্ক্রিপ্ট Oracle-এর পাবলিক /api/config থেকে কনটেন্ট এনে স্থানীয়
 * কনফিগে মেলায়, তারপর Netlify বিল্ড স্বয়ংক্রিয়ভাবে OG ফাংশনের ডেটাও
 * হালনাগাদ করে।
 *
 * ⚠️ স্থানীয় settings (remoteConfigUrl, siteName, adminPath) কখনো
 *    মুছে ফেলা হয় না — কেবল editorNews ও ads প্রতিস্থাপিত হয়।
 *    নইলে সাইট নিজেই নিজের কনফিগ খুঁজে পেত না।
 *
 * ব্যবহার:  node tools/sync-from-oracle.js
 * (netlify.toml-এর build.command এটিকে স্বয়ংক্রিয়ভাবে চালায় না —
 *  বরং .github/workflows/sync-content.yml নির্দিষ্ট সময়ে চালায়)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'bne-config.json');
const ORACLE = (process.env.ORACLE_ORIGIN || 'https://bne.147-224-13-31.nip.io').replace(/\/+$/, '');

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ স্থানীয় কনফিগ নেই: ${FILE}`);
    process.exit(1);
  }
  const local = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  let remote;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${ORACLE}/api/config`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    remote = await res.json();
  } catch (e) {
    // নেটওয়ার্ক ব্যর্থ হলে স্থানীয় কনফিগ অটুট রাখা হয় — সাইট কখনো ভাঙে না
    console.error(`⚠️ Oracle থেকে আনা যায়নি (${e.message}) — স্থানীয় কনফিগ অপরিবর্তিত রাখা হলো।`);
    process.exit(0);
  }

  const remoteNews = Array.isArray(remote.editorNews) ? remote.editorNews : [];
  const remoteAds = Array.isArray(remote.ads) ? remote.ads : [];

  /* কেবল কনটেন্ট বদলেছে কি না — নইলে অকারণ কমিট হবে না */
  const sameNews = JSON.stringify(local.editorNews || []) === JSON.stringify(remoteNews);
  const sameAds = JSON.stringify(local.ads || []) === JSON.stringify(remoteAds);
  if (sameNews && sameAds) {
    console.log(`✅ পরিবর্তন নেই — ${remoteNews.length}টি সংবাদ ইতিমধ্যে সমন্বিত।`);
    process.exit(0);
  }

  /* স্থানীয় settings রক্ষা করে কনটেন্ট প্রতিস্থাপন */
  const settings = { ...(local.settings || {}) };
  const rs = remote.settings || {};
  if (rs.siteName) settings.siteName = rs.siteName;
  if (rs.adsense_publisher_id) settings.adsensePublisherId = rs.adsense_publisher_id;
  if (rs.ga4_measurement_id) settings.ga4MeasurementId = rs.ga4_measurement_id;

  const merged = {
    version: (Number(local.version) || 0) + 1,
    updatedAt: new Date().toISOString(),
    syncedFrom: ORACLE,
    settings,
    editorNews: remoteNews,
    ads: remoteAds,
  };

  fs.writeFileSync(FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`✅ সিঙ্ক সম্পন্ন — সংবাদ ${(local.editorNews || []).length} → ${remoteNews.length}` +
    ` | বিজ্ঞাপন ${(local.ads || []).length} → ${remoteAds.length}`);
  for (const a of remoteNews.slice(0, 8)) {
    console.log(`   • [${a.category || '—'}] ${String(a.title || '').slice(0, 52)}`);
  }
}

main().catch((e) => { console.error('❌ সিঙ্ক ব্যর্থ:', e.message); process.exit(1); });
