/* ═══════════════════════════════════════════════════════════════════
   বাংলা নিউজ এডিশন — সাইট কনফিগারেশন (সম্পাদকীয় সংবাদ + বিজ্ঞাপন)
   এই ফাইলের মান হলো "ডিফল্ট"। admin.html থেকে প্রকাশ করলে রিমোট কনফিগ
   (GitHub Gist / JSONBin) এই ডিফল্টকে ওভাররাইড করে — সাইট রি-ডিপ্লয় লাগে না।
   ═══════════════════════════════════════════════════════════════════ */
window.AZADI_DEFAULT_CONFIG = {
  version: 3,
  updatedAt: "2026-08-12T20:20:00.000Z",
  settings: {
    siteName: "বাংলা নিউজ এডিশন",
    remoteConfigUrl: "",
    adminPath: "admin.html"
  },
  editorNews: [],
  ads: [
    {
      id: "ad_int_poster",
      slot: "probashi_hub",
      type: "image",
      title: "AD International Enterprises — ১৫ বছর মেয়াদবর্ধক PU প্রযুক্তি, মরিচা প্রতিরোধ ও ২০% তাপ প্রতিরোধক প্রাইমার",
      image: "images/ad_int_poster.jpg",
      link: "#/desk/probashi-bangla-news",
      enabled: true
    },
    {
      id: "ad_imp_exp_logo",
      slot: "probashi_hub",
      type: "image",
      title: "AD Imp. & Exp. — সফল বাণিজ্যের বিশ্বস্ত বন্ধন",
      image: "images/ad_imp_exp_logo.jpg",
      link: "#/desk/probashi-bangla-news",
      enabled: true
    },
    {
      id: "ad_int_ceo",
      slot: "home_top",
      type: "image",
      title: "AD International — আধুনিক প্রযুক্তির সেবা যাবে ঘরে ঘরে",
      image: "images/ad_int_ceo.jpg",
      link: "#/desk/probashi-bangla-news",
      enabled: true
    },
    {
      id: "ad_int_founders",
      slot: "home_middle",
      type: "image",
      title: "AD International — আমাদের প্রতিষ্ঠাতা টিম ও আন্তর্জাতিক বাণিজ্য সেবা",
      image: "images/ad_int_founders.jpg",
      link: "#/desk/probashi-bangla-news",
      enabled: true
    }
  ]
};
