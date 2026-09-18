#!/usr/bin/env node
'use strict';
/**
 * BNE — data/bne-config.json → netlify/functions/_data.json
 * ════════════════════════════════════════════════════════════════════
 * কেন দরকার: Netlify Function নিঃসঙ্গ প্রক্রিয়া — সে ডিপ্লয়ে বান্ডল করা
 * ফাইলই পড়তে পারে। তাই OG ফাংশনকে বান্ডল করা একটা কপি দিতে হয়, নইলে
 * প্রতিটি ক্রলার হিটে নেটওয়ার্ক কল লাগবে (ধীর ও ভঙ্গুর)।
 *
 * ⚠️ হাতে চালাতে হবে না — netlify.toml এর build.command এটিকে
 *    স্বয়ংক্রিয়ভাবে চালায়, তাই কখনো ডেটা বেসামঞ্জস্য হবে না।
 *
 * ব্যবহার:  node tools/sync-function-data.js
 * ════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'bne-config.json');
const OUT = path.join(ROOT, 'netlify', 'functions', '_data.json');
const OG_DIR = path.join(ROOT, 'og');

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`❌ সোর্স কনফিগ নেই: ${SRC}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  } catch (e) {
    console.error(`❌ data/bne-config.json পড়া গেল না: ${e.message}`);
    process.exit(1);
  }

  /* কোন কোন slug-এর জন্য সত্যিকারের ১২০০x৬৩০ OG ছবি আছে — কেবল সেগুলোর
     জন্য width/height ঘোষণা করা হবে। বাকিদের জন্য মাপ ঘোষণা করা হবে না
     (মিথ্যা ঘোষণা = যে বাগটি আমরা ঠিক করছি)। */
  let ogSlugs = [];
  try {
    if (fs.existsSync(OG_DIR)) {
      ogSlugs = fs.readdirSync(OG_DIR)
        .filter((f) => /\.jpe?g$/i.test(f))
        .map((f) => f.replace(/\.jpe?g$/i, ''));
    }
  } catch (e) { /* og ফোল্ডার না থাকলে খালি — সমস্যা নয় */ }

  const articles = (config.editorNews || []).map((a) => ({
    id: a.id,
    slug: a.slug || a.id,
    title: a.title,
    summary: a.summary || '',
    body: a.body || '',
    category: a.category || 'জাতীয়',
    tags: Array.isArray(a.tags) ? a.tags : [],
    image: a.image || '',
    og_image: a.og_image || '',
    author: a.author || 'ডেস্ক',
    published_at: a.publishedAt || a.published_at || config.updatedAt || new Date().toISOString(),
    updated_at: a.updatedAt || config.updatedAt || new Date().toISOString(),
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    version: config.version || 1,
    updatedAt: config.updatedAt || new Date().toISOString(),
    settings: config.settings || {},
    editorNews: articles,
    ogSlugs,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ ${path.relative(ROOT, OUT)} লেখা হলো`);
  console.log(`   সংবাদ: ${articles.length}টি`);
  console.log(`   ১২০০x৬৩০ OG ছবি: ${ogSlugs.length}টি ${ogSlugs.length ? '→ ' + ogSlugs.join(', ') : ''}`);
  if (articles.length && !ogSlugs.length) {
    console.warn('   ⚠️ কোনো OG ছবি নেই — ফাংশন মাপ ঘোষণা করবে না, কিন্তু কাজ করবে।');
  }
}

main();
