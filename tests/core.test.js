/**
 * BNE — Core Unit Tests (node tests/core.test.js)
 * pure লজিক (core.js) — কোন DOM দরকার হয় না। CI-তে চলে।
 */

const assert = require('assert');
const C = require('../core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

console.log("\n── BNE Core Unit Tests ──\n");

test("bn(): বাংলা সংখ্যা রূপান্তর", () => {
  assert.strictEqual(C.bn(123), "১২৩");
  assert.strictEqual(C.bn("২০২৬"), "২০২৬"); /* ইতিমধ্যে বাংলা অপরিবর্তিত */
  assert.strictEqual(C.bn(0), "০");
});

test("hashId(): স্থিতিশীল + ভিন্ন লিংকে ভিন্ন", () => {
  const a = "https://example.com/x/1", b = "https://example.com/x/2";
  assert.strictEqual(C.hashId(a), C.hashId(a));
  assert.notStrictEqual(C.hashId(a), C.hashId(b));
  assert.ok(/^[a-z0-9]+$/.test(C.hashId(a)));
});

test("splitSentences(): বিরাম-চিহ্ন অনুযায়ী বিভাজন", () => {
  const out = C.splitSentences("ঢাকায় বৃষ্টি হয়েছে। আজ ঠান্ডা! কাল কি আবার? পরে জানা যাবে।");
  assert.ok(out.length >= 4);
  assert.ok(out[0].indexOf("বৃষ্টি") !== -1);
});

test("splitSentences(): বিরাম-চিহ্নহীন টেক্সটও হ্যান্ডেল হয়", () => {
  const out = C.splitSentences("কোনো বিরাম চিহ্ন নেই এমন একটি বাক্য");
  assert.deepStrictEqual(out, ["কোনো বিরাম চিহ্ন নেই এমন একটি বাক্য"]);
});

test("categorize(): ক্রিকেট → খেলা", () => {
  assert.strictEqual(C.categorize("ঢাকায় ক্রিকেট ম্যাচে টাইগারদের জয়"), "খেলা");
});

test("categorize(): সৌদি ভিসা → প্রবাস", () => {
  assert.strictEqual(C.categorize("সৌদি আরবে নতুন ভিসা নিয়ম — প্রবাসীদের জন্য"), "প্রবাস");
});

test("categorize(): ডিফল্ট জাতীয়", () => {
  assert.strictEqual(C.categorize("নদীর পানি বৃদ্ধি পাচ্ছে"), "জাতীয়");
});

test("extractTags(): সর্বোচ্চ ৫টি ট্যাগ", () => {
  const tags = C.extractTags("ক্রিকেট ম্যাচে রেমিট্যান্স প্রণোদনা ও ডেঙ্গু পরিস্থিতি");
  assert.ok(Array.isArray(tags) && tags.length <= 5);
});

test("escapeHtml(): XSS অক্ষর এস্কেপ", () => {
  assert.strictEqual(C.escapeHtml('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");
  assert.strictEqual(C.escapeHtml('a & b "c" \'d\''), "a &amp; b &quot;c&quot; &#39;d&#39;");
});

test("breakingScore(): তাজা+বড় সূত্র > পুরনো+ছোট", () => {
  const now = Date.now();
  const freshBig = { ts: now - 600000, source: "prothomalo" };
  const oldSmall = { ts: now - 7200000, source: "banglatribune" };
  assert.ok(C.breakingScore(freshBig, now) > C.breakingScore(oldSmall, now));
});

test("breakingScore(): সম্পাদকীয় লিড সর্বোচ্চ", () => {
  const now = Date.now();
  const editor = { ts: now - 300000, source: "editor" };
  const big = { ts: now - 300000, source: "prothomalo" };
  assert.ok(C.breakingScore(editor, now) > C.breakingScore(big, now));
});

test("breakingScore(): ১২ ঘণ্টা পরে শূন্যের কাছাকাছি", () => {
  const now = Date.now();
  const old = { ts: now - 720 * 60 * 1000, source: "prothomalo" };
  assert.ok(C.breakingScore(old, now) < 0.2);
});

test("catMeta(): অজানা ক্যাটাগরি → জাতীয় fallback", () => {
  assert.strictEqual(C.catMeta("অজানা বিভাগ").name, "জাতীয়");
  assert.strictEqual(C.catMeta("খেলা").name, "খেলা");
});

test("timeAgo(): বাংলা সময়-অভিব্যক্তি", () => {
  const now = Date.now();
  assert.strictEqual(C.timeAgo(now - 5000, now), "৫ সেকেন্ড আগে");
  assert.strictEqual(C.timeAgo(now - 120000, now), "২ মিনিট আগে");
});

/* ══ দ্বিগুণ-এস্কেপ ডিকোডার ══
   লাইভ সাইটে দেখা গিয়েছিল: Oracle থেকে আসা কিছু সংবাদ দুইবার HTML-এস্কেপ
   থাকায় আর্টিকেল পাতায় খবরের বদলে `&lt;a href=&quot;…` কোড-লেখা দেখাত।
   নিচের টেস্টগুলো সেই বাগ ফিরে আসা আটকায়। */

test("decodeEntities(): দুইবার এস্কেপ করা ট্যাগ ঠিক করে", () => {
  const raw = "<p>&amp;lt;a href=&quot;https://x.com&quot;&amp;gt;খবর&amp;lt;/a&amp;gt;</p>";
  const out = C.decodeEntities(raw, 3);
  assert.ok(out.includes('<a href="https://x.com">খবর</a>'), `পেল: ${out}`);
  assert.ok(!out.includes("&amp;lt;"), "পুরনো এস্কেপ টিকে আছে");
});

test("decodeEntities(): তিনবার এস্কেপও ঠিক করে (সীমা ৩ ধাপ)", () => {
  const raw = "&amp;amp;lt;b&amp;amp;gt;গুরুত্বপূর্ণ&amp;amp;lt;/b&amp;amp;gt;";
  assert.strictEqual(C.decodeEntities(raw, 3), "<b>গুরুত্বপূর্ণ</b>");
});

test("decodeEntities(): স্বাভাবিক এনটিটি ঠিক রাখে, ক্ষতি করে না", () => {
  assert.strictEqual(C.decodeEntities("বাংলাদেশ &amp; ভারত", 3), "বাংলাদেশ & ভারত");
  assert.strictEqual(C.decodeEntities("AT&amp;T", 3), "AT&T");
  assert.strictEqual(C.decodeEntities("&nbsp;নতুন&nbsp;দিন", 3), " নতুন দিন");
  /* অপরিচিত এনটিটি হুবহু অপরিবর্তিত থাকে */
  assert.strictEqual(C.decodeEntities("&unknownent;", 3), "&unknownent;");
});

test("decodeEntities(): এনটিটি না থাকলে স্ট্রিং অপরিবর্তিত", () => {
  const plain = "সাধারণ বাংলা খবর — কোনো ট্যাগ নেই।";
  assert.strictEqual(C.decodeEntities(plain, 3), plain);
});

test("articlePlainText(): ডিকোড + ট্যাগ বাদ → পরিষ্কার লেখা", () => {
  const raw = "<p>&amp;lt;a href=&quot;https://n.com/x&quot;&amp;gt;শিরোনাম&amp;lt;/a&amp;gt;&amp;nbsp;&amp;lt;font color=&quot;#6f6f6f&quot;&amp;gt;Daily Ba";
  const out = C.articlePlainText(raw);
  assert.ok(!/&lt;|&quot;|&amp;lt;/.test(out), `কোড-লেখা টিকে আছে: ${out}`);
  assert.ok(out.includes("শিরোনাম"), `শিরোনাম হারিয়ে গেছে: ${out}`);
  assert.ok(out.includes("Daily Ba"));
});

test("articlePlainText(): script/style বিষয়বস্তু কখনো ফাঁস হয় না", () => {
  const out = C.articlePlainText('<p>খবর</p><script>alert("xss")</script>');
  assert.ok(!out.includes("alert"), `script ফাঁস: ${out}`);
  assert.ok(out.includes("খবর"));
});

console.log(`\nরেজাল্ট: ${passed} পাস, ${failed} ব্যর্থ\n`);
process.exit(failed ? 1 : 0);
