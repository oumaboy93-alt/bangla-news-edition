#!/usr/bin/env node
'use strict';
/**
 * BNE — ডিডুপ ক্যাশ (last_posted.json) মেলানো
 * ════════════════════════════════════════════════════════════════════════
 * কেন এই টুল দরকার
 * ---------------------------------------------------------------------------
 * সোশ্যাল পোস্টার প্রতিটি রানে last_posted.json-এ "কোন খবর পোস্ট করা হয়েছে"
 * লিখে রাখে। পরের রানে ওই তালিকা দেখেই ঠিক হয় কোনগুলো নতুন — এটিই
 * ডুপ্লিকেট পোস্ট আটকায়।
 *
 * কিন্তু একই সময়ে একাধিক পোস্টার রান চলতে পারে (GitHub-এর সময়সূচি, কনটেন্ট
 * সিঙ্কের ডাকা রান, হাতে চালানো রান)। তখন git push প্রতিযোগিতায় পড়ে:
 * একজনের পুশ সফল হলে অন্যজনের পুশ ব্যর্থ হয়। আগে সেটি চুপচাপ উপেক্ষা করা হত
 * (`|| true`), ফলে ক্যাশের একটি অংশ হারিয়ে যেত — আর হারানো খবরগুলো পরের
 * রানে "নতুন" বলে ধরা পড়ে আবার পোস্ট হয়ে যেত। অর্থাৎ একই সংবাদ একাধিকবার
 * ফেসবুক পেজ ও টেলিগ্রাম চ্যানেলে চলে যেত।
 *
 * সমাধান: rebase-এ সংঘর্ষ হলে দুই পাশের রেকর্ড একসাথে জুড়ে দেওয়া হয় —
 * লিংক দিয়ে সাফ হয়ে, সময় অনুযায়ী সাজিয়ে। ফলে কোনো পোস্ট-রেকর্ড হারায় না,
 * আর কেউ দুবার পোস্টও হয় না।
 *
 * ব্যবহার (rebase সংঘর্ষের সময়):
 *   node tools/merge-posted-cache.js
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

/** git থেকে কোনো সংস্করণ পড়া — না পেলে null */
function readStage(ref) {
  try {
    const out = execFileSync('git', ['show', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

function mergeList(a, b) {
  const seen = new Set();
  const out = [];
  for (const src of [a, b]) {
    if (!Array.isArray(src)) continue;
    for (const p of src) {
      if (!p || typeof p !== 'object') continue;
      const key = p.link || p.url;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  /* নতুন রেকর্ড আগে — পরের রান সবচেয়ে সাম্প্রতিকটা সহজে দেখতে পায় */
  out.sort((x, y) => (y.ts || 0) - (x.ts || 0));
  return out;
}

function main() {
  /* rebase-এর সময়: :2: = রিমোটের সংস্করণ, :3: = আমাদের সংস্করণ */
  const theirs = readStage(':2:last_posted.json');
  const ours = readStage(':3:last_posted.json');

  if (!ours && !theirs) {
    console.error('⚠️ কোন সংস্করণই পড়া গেল না — কিছুই করা হলো না।');
    process.exit(1);
  }

  const base = ours || theirs || {};
  const merged = Object.assign({}, base);
  merged.posted = mergeList(ours && ours.posted, theirs && theirs.posted);
  merged.date = base.date || (theirs && theirs.date) || new Date().toISOString().slice(0, 10);

  fs.writeFileSync('last_posted.json', JSON.stringify(merged, null, 1) + '\n', 'utf8');
  console.log(`✅ ক্যাশ মেলানো হলো — মোট ${merged.posted.length}টি রেকর্ড ` +
    `(আমাদের ${(ours && ours.posted || []).length} + রিমোটের ${(theirs && theirs.posted || []).length}, ডুপ্লিকেট বাদ)`);
}

main();
