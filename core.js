/**
 * BNE — Core Pure Logic (DOM-free)
 * app.js-এর সাথে লোড হয় (index.html-এ app.js-এর আগে) এবং node-এ টেস্টযোগ্য (tests/core.test.js)।
 * অর্ডার: core.js → app.js
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BNE_CORE = factory();
})(typeof self !== "undefined" ? self : this, function () {

  var CATEGORIES = [
    { name: "জাতীয়", badge: "", img: "images/national.jpg" },
    { name: "রাজনীতি", badge: "b-red", img: "images/politics.jpg" },
    { name: "সারাদেশ", badge: "b-teal", img: "images/national.jpg" },
    { name: "অর্থনীতি", badge: "b-amber", img: "images/economy.jpg" },
    { name: "আন্তর্জাতিক", badge: "b-sky", img: "images/international.jpg" },
    { name: "খেলা", badge: "b-indigo", img: "images/sports.jpg" },
    { name: "বিনোদন", badge: "b-fuchsia", img: "images/entertainment.jpg" },
    { name: "শিক্ষা", badge: "b-cyan", img: "images/technology.jpg" },
    { name: "চাকরি", badge: "b-amber", img: "images/economy.jpg" },
    { name: "প্রবাস", badge: "b-sky", img: "images/international.jpg" },
    { name: "ধর্ম", badge: "b-teal", img: "images/national.jpg" },
    { name: "স্বাস্থ্য", badge: "b-teal", img: "images/health.jpg" },
    { name: "প্রযুক্তি", badge: "b-cyan", img: "images/technology.jpg" }
  ];

  var CATEGORY_KEYWORDS = [
    { category: "খেলা", keywords: ["ক্রিকেট", "ফুটবল", "খেলা", "টাইগার", "ম্যাচ", "সিরিজ", "টুর্নামেন্ট", "অলিম্পিক", "বিপিএল", "উইকেট", "গোল"] },
    { category: "আন্তর্জাতিক", keywords: ["যুক্তরাষ্ট্র", "ভারত", "চীন", "রাশিয়া", "ইউক্রেন", "গাজা", "ইসরায়েল", "ফিলিস্তিন", "জাতিসংঘ", "আন্তর্জাতিক", "বিশ্ব", "পাকিস্তান", "ইরান", "যুক্তরাজ্য", "মিয়ানমার"] },
    { category: "অর্থনীতি", keywords: ["অর্থনীতি", "রপ্তানি", "রেমিট্যান্স", "ব্যাংক", "শেয়ারবাজার", "মূল্যস্ফীতি", "বাজেট", "ডলার", "বিনিয়োগ", "রিজার্ভ", "পুঁজিবাজার", "টাকা"] },
    { category: "রাজনীতি", keywords: ["নির্বাচন", "রাজনীতি", "বিএনপি", "আওয়ামী", "জামায়াত", "সংসদ", "মন্ত্রণালয়", "উপদেষ্টা", "সরকার", "ভোট", "মনোনয়ন"] },
    { category: "প্রযুক্তি", keywords: ["প্রযুক্তি", "ইন্টারনেট", "স্মার্টফোন", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "সাইবার", "অ্যাপ", "গুগল", "ফেসবুক", "সফটওয়্যার", "স্টার্টআপ"] },
    { category: "বিনোদন", keywords: ["সিনেমা", "নাটক", "চলচ্চিত্র", "অভিনেতা", "অভিনেত্রী", "গান", "শিল্পী", "বিনোদন", "ওটিটি", "তারকা", "কনসার্ট"] },
    { category: "স্বাস্থ্য", keywords: ["স্বাস্থ্য", "হাসপাতাল", "ডেঙ্গু", "চিকিৎসা", "রোগ", "টিকা", "ভাইরাস", "ওষুধ", "ডাক্তার", "করোনা"] },
    { category: "সারাদেশ", keywords: ["জেলা", "থানা", "উপজেলা", "উপপ্রতিনিধি", "প্রতিনিধি", "গ্রাম", "মেডিসিন", "দুর্ঘটনা", "সারাদেশ"] },
    { category: "শিক্ষা", keywords: ["শিক্ষা", "বিশ্ববিদ্যালয়", "পরীক্ষা", "এসএসসি", "এইচএসসি", "ছাত্র", "শিক্ষার্থী", "শিক্ষক", "কলেজ", "স্কুল", "বুয়েট", "ঢাবি"] },
    { category: "চাকরি", keywords: ["চাকরি", "নিয়োগ", "বিসিএস", "নিয়োগ", "চাকরীর", "আবেদন", "পদ", "বেতন"] },
    { category: "প্রবাস", keywords: ["প্রবাস", "প্রবাসী", "রেমিট্যান্স", "মালয়েশিয়া", "সৌদি", "দুবাই", "কাতার", "ওমান", "মধ্যপ্রাচ্য"] },
    { category: "ধর্ম", keywords: ["ধর্ম", "ইসলাম", "হজ", "ওমরাহ", "নামাজ", "রোজা", "মসজিদ", "মক্কা", "মদিনা", "কুরআন", "হাদিস"] }
  ];

  var BN = { 0: "০", 1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬", 7: "৭", 8: "৮", 9: "৯" };

  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return BN[d]; }); }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* বাক্য বিভাজন — lookbehind ছাড়া (পুরনো Safari/WebKit-এ SyntaxError এড়াতে) */
  function splitSentences(plain) {
    if (!plain) return [];
    var parts = [], re = /([^।!?]+[।!?]+)\s*/g, m, last = 0;
    while ((m = re.exec(plain)) && parts.length < 80) {
      var s = m[1].trim();
      if (s.length > 1) parts.push(s);
      last = re.lastIndex;
    }
    var rest = plain.slice(last).trim();
    if (rest.length > 1) parts.push(rest);
    return parts;
  }

  function hashId(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(36);
  }

  function categorize(text) {
    var best = "জাতীয়", score = 0;
    CATEGORY_KEYWORDS.forEach(function (grp) {
      var s = 0;
      grp.keywords.forEach(function (kw) { if (text.indexOf(kw) !== -1) s++; });
      if (s > score) { score = s; best = grp.category; }
    });
    return best;
  }

  function extractTags(text) {
    var tags = [];
    CATEGORY_KEYWORDS.forEach(function (grp) {
      grp.keywords.forEach(function (kw) {
        if (tags.length < 5 && text.indexOf(kw) !== -1 && tags.indexOf(kw) === -1) tags.push(kw);
      });
    });
    return tags;
  }

  function catMeta(name) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].name === name) return CATEGORIES[i];
    return CATEGORIES[0];
  }

  function timeAgo(ts, now) {
    var s = Math.max(1, Math.floor(((now || Date.now()) - ts) / 1000));
    if (s < 60) return bn(s) + " সেকেন্ড আগে";
    var m = Math.floor(s / 60);
    if (m < 60) return bn(m) + " মিনিট আগে";
    var h = Math.floor(m / 60);
    if (h < 24) return bn(h) + " ঘণ্টা আগে";
    var d = Math.floor(h / 24);
    if (d < 30) return bn(d) + " দিন আগে";
    return new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ts));
  }

  /* P6: ব্রেকিং-স্কোর — recency × reach × velocity (ব্যাখ্যাযোগ্য) */
  var SOURCE_WEIGHTS = {
    banglaedition: 3, prothomalo: 3, jugantor: 2, ittefaq: 2, bdnews24: 2,
    somoynews: 2, banglatribune: 1, bdjournal: 1, dailybangladesh: 1, editor: 5
  };
  function breakingScore(a, now) {
    if (!a || !a.ts) return 0;
    var ageMin = ((now || Date.now()) - a.ts) / 60000;
    var recency = Math.max(0, 1 - ageMin / 720);
    var reach = SOURCE_WEIGHTS[a.source] || 1;
    var velocity = ageMin < 30 ? 1.4 : ageMin < 90 ? 1.2 : ageMin < 180 ? 1.05 : 1;
    return Math.round(recency * reach * velocity * 100) / 100;
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYWORDS: CATEGORY_KEYWORDS,
    bn: bn,
    escapeHtml: escapeHtml,
    splitSentences: splitSentences,
    hashId: hashId,
    categorize: categorize,
    extractTags: extractTags,
    catMeta: catMeta,
    timeAgo: timeAgo,
    SOURCE_WEIGHTS: SOURCE_WEIGHTS,
    breakingScore: breakingScore
  };
});
