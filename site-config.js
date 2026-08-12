/* ═══════════════════════════════════════════════════════════════════
   বাংলা নিউজ এডিশন — সাইট কনফিগারেশন (সম্পাদকীয় সংবাদ + বিজ্ঞাপন)
   এই ফাইলের মান হলো "ডিফল্ট"। admin.html থেকে প্রকাশ করলে রিমোট কনফিগ
   (GitHub Gist / JSONBin) এই ডিফল্টকে ওভাররাইড করে — সাইট রি-ডিপ্লয় লাগে না।
   ═══════════════════════════════════════════════════════════════════ */
window.AZADI_DEFAULT_CONFIG = {
  version: 2,
  updatedAt: "2026-08-12T20:13:00.000Z",
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
      link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
      enabled: true
    },
    {
      id: "ad_imp_exp_logo",
      slot: "probashi_hub",
      type: "image",
      title: "AD Imp. & Exp. — সফল বাণিজ্যের বিশ্বস্ত বন্ধন",
      image: "images/ad_imp_exp_logo.jpg",
      link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
      enabled: true
    },
    {
      id: "ad_int_ceo",
      slot: "probashi_hub",
      type: "image",
      title: "AD International — আধুনিক প্রযুক্তির সেবা যাবে ঘরে ঘরে",
      image: "images/ad_int_ceo.jpg",
      link: "https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news",
      enabled: true
    }
  ]
};
