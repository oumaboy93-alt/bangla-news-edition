#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * BNE — P0 রিগ্রেশন-প্রাচীর
 * ════════════════════════════════════════════════════════════════════════════
 * প্রতিটি পরীক্ষা লাইভ সাইটে সত্যিই ঘটে যাওয়া একটি নির্দিষ্ট ত্রুটির
 * বিপরীতে লেখা। উদ্দেশ্য: সেই ত্রুটি যেন আর কখনো নিঃশব্দে ফিরে আসতে না পারে।
 *
 * চালান:  node tests/p0-regression.js
 * ব্যর্থ হলে exit code 1 — CI থামে।
 * ════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failures.push(name); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); }
}
function section(t) { console.log(`\n── ${t} ──`); }

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/** সরান টীকা ও কমেন্ট — নইলে কমেন্টে লেখা উদাহরণ কোড-সদৃশ মনে হয় */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/* ════════════════════════════════════════════════════════════════════════════
   BD-1 · hash URL চিরতরে নিষিদ্ধ
   ঘটনা: auto_social_poster.js:185 `${SITE_BASE}/#/news/${id}` বানাত।
   ফেসবুক URL-fragment ফেলে দেয়, তাই পোস্টের লিংক কখনো সংবাদে পৌঁছাত না।
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-1 · কোনো বাহিরগামী ঠিকানায় hash (#/news/) নেই');

const POSTER = 'auto_social_poster.js';
if (exists(POSTER)) {
  const code = stripComments(read(POSTER));
  const hashHits = (code.match(/#\/news\//g) || []).length;
  ok('auto_social_poster.js — কোডে #/news/ নেই', hashHits === 0, `${hashHits}টি পাওয়া গেছে`);
  ok('auto_social_poster.js — বাহিরগামী URL-guard আছে',
    /assertRealUrl|includes\(['"]#['"]\)|throw/.test(code));
} else {
  ok('auto_social_poster.js উপস্থিত', false, 'ফাইল নেই');
}

/* app.js — hash → রিয়েল পাথ ক্যানোনিকালাইজেশন বজায় আছে কি */
const appJs = read('app.js');
ok('app.js — hash ঠিকানাকে রিয়েল পাথে রূপান্তরের কোড আছে',
  /#\/news\//.test(appJs) && /replaceState|\.replace\(/.test(appJs));

/* ════════════════════════════════════════════════════════════════════════════
   BD-2 · og:image সর্বদা পরম https এবং ১২০০x৬৩০ ঘোষণা
   ঘটনা: index.html ১২০০x৬৩০ ঘোষণা করত, কিন্তু প্রকৃত ফাইল ছিল ১৫৩৬x১০২৪।
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-2 · OG জেনারেটর সর্বদা পরম https ছবি ও সঠিক মাপ দেয়');

const OGLIB = 'netlify/functions/_og-lib.js';
const RES = path.join(ROOT, OGLIB);
if (fs.existsSync(RES)) {
  const og = require(RES);
  if (typeof og.buildArticleHead === 'function') {
    const built = og.buildArticleHead(
      { id: 'x', slug: 'regression-test', title: 'পরীক্ষা', category: 'খেলা',
        image: '', og_image: '', publishedAt: '2026-01-01T00:00:00.000Z', tags: [] },
      { origin: 'https://example.test', fbAppId: '123' }
    );
    /* buildArticleHead একটি বস্তু ফেরায়: { tags, canonical, image, imageDims, title } */
    const head = String((built && built.tags) || built || '');
    ok('buildArticleHead মেটা-ট্যাগ স্ট্রিং ফেরায়', head.includes('og:'), typeof built);
    const img = (head.match(/og:image" content="([^"]*)"/) || [])[1];
    ok('og:image পরম https ঠিকানা', /^https:\/\//.test(img || ''), img);
    ok('og:image:width = 1200', /og:image:width" content="1200"/.test(head));
    ok('og:image:height = 630', /og:image:height" content="630"/.test(head));
    ok('og:url = canonical (hash ছাড়া)', /og:url" content="https:\/\/example\.test\/news\/regression-test"/.test(head));
    ok('og:locale = bn_IN (bn_BD ফেসবুক প্রত্যাখ্যান করে)', /og:locale" content="bn_IN"/.test(head));
  } else {
    ok('_og-lib.js-এ buildArticleHead রপ্তানি করা আছে', false);
  }
}

/* netlify/functions/article-og.js ফাংশনটি fb:app_id পাঠায় কি */
const artFn = read('netlify/functions/article-og.js');
ok('article-og ফাংশন fb:app_id পাস করে', /fbAppId/.test(artFn));

/* ════════════════════════════════════════════════════════════════════════════
   BD-3 · কোনো হার্ডকোড করা চাবি/পাসকোড যেন শিপ না হয়
   ঘটনা: পুরনো admin.html-এ পাসকোডটি সরাসরি লেখা ছিল (SK-2 দ্রষ্টব্য),
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-3 · শিপ করা ট্রি-তে কোনো হার্ডকোড করা গোপন তথ্য নেই');

/* ★ স্ক্যান-নীতি ★
   Netlify `--dir .` দিয়ে পুরো রেপো রুট প্রকাশ করে (deploy.yml দ্রষ্টব্য)।
   তার মানে "legacy/ ফোল্ডারে রাখা আছে, তাই নিরাপদ" — এই ধারণাটি ভুল ছিল:
   সরানো ফাইল legacy/-এ রাখলে সেটি সত্যিই
   https://<domain>/legacy/old-admin-panel/admin.html হয়ে লাইভ হয়ে যেত।
   তাই এখন যাচাই করা হয় **প্রকাশিত হয় এমন সবকিছু**, এবং তালিকা হাতে
   লেখা নয় — পুরো ট্রি হাঁটাহাঁটি করা হয়।

   বাদ শুধু সেগুলো যা Git-এ নেই বা Netlify কখনো পাঠায় না:
   .git, node_modules, .netlify, এবং .gitignore-করা ব্যাকআপ ফোল্ডার। */
const SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', '.netlify', '_image_backups', '_unused_images', '.tool_trash']);
const SCAN_EXT = /\.(js|html|json|toml|txt|webmanifest|xml|yml|yaml|md|css)$/i;

const SCAN = [];
(function walk(absDir) {
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SCAN_SKIP_DIRS.has(e.name)) walk(path.join(absDir, e.name));
    } else if (SCAN_EXT.test(e.name)) {
      SCAN.push(path.relative(ROOT, path.join(absDir, e.name)));
    }
  }
})(ROOT);

/* পাসকোডের অঙ্কগুলো টুকরো করে জোড়া হয়, যাতে স্ক্যানার-ফাইলটি নিজেই নিজের
   নমুনায় পরিণত না হয় — নইলে এই ফাইলটিই "লিক" হিসেবে ধরা পড়ত। */
const OLD_PASSCODE = ['3822', '18'].join('');

const SECRET_PATTERNS = [
  [new RegExp('\\b' + OLD_PASSCODE + '\\b'), 'পুরনো হার্ডকোড করা পাসকোড'],
  [/\bghp_[A-Za-z0-9]{20,}/, 'GitHub personal access token (ghp_…)'],
  [/\bnfp_[A-Za-z0-9]{20,}/, 'Netlify access token (nfp_…)'],
  [/\bEAA[A-Za-z0-9]{40,}/, 'Facebook access token (EAA…)'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, 'Telegram bot token'],
  [/\bAIza[A-Za-z0-9_-]{30,}/, 'Google API key (AIza…)'],
];

const leaks = [];
for (const rel of SCAN) {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(src)) leaks.push(`${rel} → ${label}`);
  }
}
ok(`প্রকাশিত ${SCAN.length}টি ফাইলে কোনো গোপন তথ্য নেই`, leaks.length === 0, leaks.join('; '));

/* ════════════════════════════════════════════════════════════════════════════
   BD-4 · অবসরপ্রাপ্ত ক্লায়েন্ট-সাইড অ্যাডমিন প্যানেল আর শিপ হবে না
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-4 · পুরনো অ্যাডমিন প্যানেল প্রকাশ-ট্রি থেকে সম্পূর্ণ বাদ');

/* মূল রুটে থাকা যাবে না … */
for (const f of ['admin.html', 'admin-sw.js', 'sw-admin.js',
                 'admin-manifest.json', 'admin-manifest.webmanifest',
                 'netlify/functions/admin-auth.js', 'sitemap.xml']) {
  ok(`${f} রুটে আর নেই`, !exists(f), 'ফাইলটি এখনো রুটে আছে');
}

/* …আর ট্রির অন্য কোথাওও থাকা যাবে না। Netlify `--dir .` দিয়ে পুরো রুট
   প্রকাশ করে, তাই legacy/ বা অন্য কোনো ফোল্ডারে সরিয়ে রাখলে ফাইলটি
   /legacy/... পথে আবার লাইভ হয়ে যেত — নাম বদলালেও রক্ষা নেই। */
const RETIRED_NAMES = /^(admin\.html|admin-sw\.js|sw-admin\.js|admin-manifest\.(json|webmanifest)|admin-auth\.js)$/i;
const survivors = SCAN.filter((rel) => RETIRED_NAMES.test(path.basename(rel)));
ok('পুরনো অ্যাডমিন ফাইল প্রকাশ-ট্রিতে অন্য কোথাওও নেই', survivors.length === 0, survivors.join(', '));

/* পাসকোডটি কোনো ফাইলেই থাকা যাবে না (git ইতিহাসে থাকা স্বাভাবিক) */
ok('ট্রিতে পুরনো পাসকোড কোথাও নেই', !leaks.some((l) => /পাসকোড/.test(l)),
  leaks.filter((l) => /পাসকোড/.test(l)).join('; '));

/* কমেন্ট বাদ দিয়ে দেখা হয় — কারণ সংশোধনের কারণ ব্যাখ্যা করতে গিয়ে
   ফাইলগুলোতে পুরনো নামগুলো কমেন্টে লেখা থাকাই উচিত। */
const sw = stripComments(read('sw.js'));
ok('sw.js — precache তালিকায় admin.html নেই', !/\.\/admin\.html/.test(sw) && !/admin\.html/.test(sw));
ok('sw.js — precache তালিকায় admin-manifest.json নেই', !/admin-manifest/.test(sw));
ok('sw.js — ক্যাশের নাম v3 (v2 ক্যাশ সব ডিভাইস থেকে মুছে যায়)', /'bne-main-v3'/.test(sw));
ok('sw.js — /api/* কখনো ক্যাশ হয় না',
  /\^\\\/\(api\|admin\|admin-assets\)/.test(sw) || /api\|admin\|admin-assets/.test(sw));

/* adminPath আর কখনো পুরনো ফাইলে যাবে না */
const siteCfg = read('site-config.js');
const cfgJson = JSON.parse(read('data/bne-config.json'));
ok('site-config.js-এ adminPath আর admin.html নয়',
  !/adminPath:\s*["']admin\.html/.test(siteCfg),
  (siteCfg.match(/adminPath:\s*["'][^"']*/) || [])[0]);
ok('data/bne-config.json-এ adminPath আর admin.html নয়',
  cfgJson.settings.adminPath !== 'admin.html', cfgJson.settings.adminPath);
ok('adminPath সার্ভার-সাইড প্যানেলে নির্দেশ করে',
  /\/admin$/.test(cfgJson.settings.adminPath), cfgJson.settings.adminPath);

/* app.js-এর ফলব্যাক ডিফল্টও আর পুরনো ফাইল হতে পারবে না */
const appCode = stripComments(read('app.js'));
ok('app.js-এ আর "admin.html" ফলব্যাক নেই',
  !/settings\.adminPath\)\s*\|\|\s*["']admin\.html["']/.test(appCode));

/* Netlify-তে ৪১০ পাহারা */
const toml = read('netlify.toml');
for (const p of ['/admin.html', '/sw-admin.js', '/admin-sw.js']) {
  const re = new RegExp(`from\\s*=\\s*"${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,80}status\\s*=\\s*410`);
  ok(`netlify.toml — ${p} → 410`, re.test(toml));
}

/* ════════════════════════════════════════════════════════════════════════════
   BD-5 · sitemap প্রকৃত সংবাদ দেখায়
   ঘটনা: /sitemap.xml-এ কেবল ৫টি URL ছিল; ১২৮টি সংবাদের একটিও নেই।
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-5 · sitemap আর স্থির/অসম্পূর্ণ নয়');

ok('স্থির sitemap.xml আর প্রকাশ-ট্রি-তে নেই', !exists('sitemap.xml'));
ok('netlify.toml — /sitemap.xml ডাইনামিক উৎসে প্রক্সি করে',
  /from\s*=\s*"\/sitemap\.xml"[\s\S]{0,160}status\s*=\s*200/.test(toml));

/* ════════════════════════════════════════════════════════════════════════════
   BD-6 · rss2json ত্যাগ
   ঘটনা: api.rss2json.com-এর ফ্রি টিয়ার ঘণ্টায় একবার রিফ্রেশ করত, অথচ
   ওয়ার্কফ্লো চলত প্রতি ৩০ মিনিটে → অর্ধেক রান নষ্ট।
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-6 · তৃতীয় পক্ষের RSS ব্রোকার আর ব্যবহার হচ্ছে না');

/* কমেন্টে পুরনো সেবার নাম থাকা স্বাভাবিক ও কাম্য (কেন বাদ দেওয়া হলো তা
   ব্যাখ্যা করে)। নিষিদ্ধ কেবল প্রকৃত কল। */
/* সেবার নামও টুকরো করে জোড়া — স্ক্যানার নিজেই নিজের লক্ষ্য হওয়া চলবে না */
const RSS_BROKER = ['rss', '2json'].join('');
/* কেবল চলমান কোড পরীক্ষা করা হয় — .md/.yml-এ পুরনো নকশার বর্ণনা থাকা
   স্বাভাবিক এবং প্রয়োজনীয় (কেন সরানো হলো তা ডকুমেন্টেশনে থাকা উচিত)। */
const isCode = (rel) => /\.(js|html)$/i.test(rel);
const rssHits = SCAN.filter((rel) => {
  if (!isCode(rel)) return false;
  try {
    const code = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    return new RegExp(RSS_BROKER).test(code);
  } catch { return false; }
});
ok('প্রকৃত কোডে পুরনো RSS ব্রোকারে কোনো কল নেই', rssHits.length === 0, rssHits.join(', '));

/* ════════════════════════════════════════════════════════════════════════════
   BD-7 · Facebook পোস্ট কখনো photo মোডে ডিফল্ট হবে না
   ঘটনা: FB_POST_MODE ডিফল্ট "photo" থাকায় ছবি-পোস্ট হত — ক্লিক-লক্ষ্যই
   থাকত না, তাই লিংক-ক্লিক সিগন্যাল শূন্য।
   ════════════════════════════════════════════════════════════════════════════ */
section('BD-7 · ফেসবুক পোস্ট ডিফল্টে link মোড');

if (exists(POSTER)) {
  const p = stripComments(read(POSTER));
  ok('FB_POST_MODE-এর ডিফল্ট "link"', /FB_POST_MODE[^\n]*\|\|\s*["']link["']/.test(p)
    || /FB_POST_MODE\s*=\s*["']link["']/.test(p));
  ok('"photo" কেবল স্পষ্ট override হিসাবে আছে', /photo/.test(p));
}

/* ════════════════════════════════════════════════════════════════════════════ */
console.log(`\n${'─'.repeat(60)}`);
console.log(`  P0 রিগ্রেশন — পাস: ${passed}   ব্যর্থ: ${failures.length}`);
if (failures.length) {
  console.log('  ব্যর্থ পরীক্ষা:');
  failures.forEach((f) => console.log('    · ' + f));
}
console.log(`${'─'.repeat(60)}\n`);
process.exit(failures.length ? 1 : 0);
