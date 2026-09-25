#!/usr/bin/env node
'use strict';
/**
 * BNE — সাইটের ঠিকানা (origin) এক জায়গা থেকে সব ফাইলে বসানো
 * ════════════════════════════════════════════════════════════════════════
 * কেন এই টুল দরকার — বাস্তবে যা ঘটেছিল
 * ---------------------------------------------------------------------------
 * সাইটের একাধিক ফাইলে ডোমেইনটি সরাসরি লেখা ছিল (index.html-এর canonical ও
 * og:url, app.js-এর SITE_ORIGIN, gn-feed.xml, টুলগুলোর ডিফল্ট ঠিকানা)।
 * হোস্ট বদলালে সেগুলো পুরনো (এখন অচল) ঠিকানার দিকেই দেখাতে থাকে —
 * ফলে শেয়ার করা লিংকের প্রিভিউ কার্ড ভাঙে, canonical ভুল হয় এবং
 * গুগল/ফেসবুক ভুল URL সূচিবদ্ধ করে।
 *
 * ২০২৬-০৯-২৫-এ ঠিক এটাই হয়েছিল: পুরনো Netlify অ্যাকাউন্টের ডিপ্লয় আটকে
 * যাওয়ায় সাইট নতুন ঠিকানায় সরাতে হয়, কিন্তু ফাইলে ফাইল ধরে ডোমেইন বদলানো
 * ভুল-prone ও পুনরাবৃত্তিমূলক ছিল।
 *
 * এখন: ঠিকানা এক জায়গায় (SITE_BASE env বা নিচের ডিফল্ট) — বাকিটা এই
 * স্ক্রিপ্ট ডিপ্লয়ের ঠিক আগে বসিয়ে দেয়। ইডেম্পোটেন্ট: দুইবার চালালেও ক্ষতি নেই।
 *
 * ব্যবহার:
 *   SITE_BASE=https://example.com node tools/set-site-origin.js
 *   node tools/set-site-origin.js --origin=https://example.com
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* এখানেই একমাত্র সত্য — বদলাতে হলে হয় SITE_BASE env, নয় তো এই ডিফল্ট */
const DEFAULT_ORIGIN = 'https://bangla-news-edition-bd.netlify.app';

/* যেসব ঠিকানা "পুরনো" হিসেবে ধরা হবে এবং প্রতিস্থাপিত হবে */
const KNOWN_ORIGINS = [
  'https://bangla-news-edition.netlify.app',
  'https://bangla-news-edition-bd.netlify.app',
  'https://bne-news-edition-test.netlify.app',
];

/* যে ফাইলগুলো প্রকাশিত (deploy হবে) এবং ঠিকানা ধারণ করে */
/* দ্রষ্টব্য: data/bne-config.json ইচ্ছাকৃতভাবে বাদ — সেটি প্রতিটি সিঙ্কে
   Oracle থেকে নতুন করে লেখা হয়, তাই এখানে বদলালে প্রতি সিঙ্কেই ঝগড়া করত। */
const TARGETS = [
  'index.html',
  'gn-feed.xml',
  'app.js',
  'auto_social_poster.js',
  'sponsor_hunter.js',
  'netlify/functions/article-og.js',
  'netlify/functions/sitemap.js',
  'netlify/functions/_feeds.js',
];

function resolveOrigin() {
  const arg = process.argv.find((a) => a.startsWith('--origin='));
  const raw = (arg ? arg.slice('--origin='.length) : '') || process.env.SITE_BASE || DEFAULT_ORIGIN;
  const cleaned = String(raw).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(cleaned)) {
    console.error(`❌ অবৈধ origin: "${raw}" — https://... আকারে হতে হবে।`);
    process.exit(1);
  }
  return cleaned;
}

function main() {
  const origin = resolveOrigin();
  const others = KNOWN_ORIGINS.filter((o) => o !== origin);

  let touchedFiles = 0;
  let totalReplacements = 0;

  for (const rel of TARGETS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;

    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    let hits = 0;

    for (const old of others) {
      const parts = after.split(old);
      if (parts.length > 1) {
        hits += parts.length - 1;
        after = parts.join(origin);
      }
    }

    if (after !== before) {
      fs.writeFileSync(file, after);
      touchedFiles++;
      totalReplacements += hits;
      console.log(`  ✏️  ${rel} — ${hits}টি ঠিকানা হালনাগাদ`);
    }
  }

  console.log(`✅ সাইট-ঠিকানা নির্ধারিত: ${origin}`);
  if (totalReplacements) {
    console.log(`   ${touchedFiles}টি ফাইলে মোট ${totalReplacements}টি পুরনো ঠিকানা বদলানো হলো।`);
  } else {
    console.log('   কোনো পুরনো ঠিকানা পাওয়া যায়নি — সব আগেই ঠিক আছে।');
  }
}

main();
