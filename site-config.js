/* ══════════════════════════════════════════════════════════════════
   বাংলা নিউজ এডিশন — সাইট কনফিগারেশন (সম্পাদকীয় সংবাদ + বিজ্ঞাপন + অ্যানালিটিক্স)
   এই ফাইলের মান হলো "ডিফল্ট"। admin.html থেকে প্রকাশ করলে রিমোট কনফিগ
   (GitHub Gist / JSONBin) এই ডিফল্টকে ওভাররাইড করে — সাইট রি-ডিপ্লয় লাগে না।
   ═══════════════════════════════════════════════════════════════════ */
window.AZADI_DEFAULT_CONFIG = {
  version: 5,
  updatedAt: new Date().toISOString(),
  settings: {
    siteName: "বাংলা নিউজ এডিশন",
    remoteConfigUrl: "",
    adminPath: "admin.html",
    ga4MeasurementId: "G-XXXXXXXXXX",
    adsensePublisherId: "ca-pub-8292591084993652",
  },
  editorNews: [
    {
      id: "thy-recruitment-2026",
      title: "চীন, লাওস, আলজেরিয়া ও ইরাকে বিশাল নিয়োগ বিজ্ঞপ্তি — THY International AD International Ent.",
      category: "প্রবাস",
      lead: true,
      image: "images/overseas-campaign.webp",
      publishedAt: new Date().toISOString(),
      tags: ["নিয়োগ", "প্রবাস", "চীন", "লাওস", "আলজেরিয়া", "ইরাক", "THY_International"],
      body: `চীন, লাওস, আলজেরিয়া ও ইরাকে আকর্ষনীয় বেতনে কর্মসংস্থানের সুবর্ণ সুযোগ নিয়ে এসেছে সরকারি অনুমোদিত বিশ্বস্ত রিক্রুটিং প্রতিষ্ঠান THY International AD International Ent.।

নিচে দেশভিত্তিক শূন্যপদ ও বিস্তারিত তথ্য দেওয়া হলো:

১. চীন (China) — গার্মেন্টস সুইং ট্রেইনি:
- পদ সংখ্যা: ২০০ জন (পুরুষ/নারী)।
- মেয়াদ: ৪ বছরের ট্রেইনি ভিসা।
- সুবিধা: আন্তর্জাতিক মানের ট্রেনিং ও সার্টিফিকেট প্রদান।
- মাসিক বেতন: ৫০,০০০ টাকা (BDT)।

২. লাওস (Laos) — CHINA HUNAN CONSTRUCTION:
- কাজের ধরণ: কনস্ট্রাকশন মেগা প্রজেক্ট।
- মাসিক বেতন: ৪৫০ ডলার ($450 USD)।
- ডিউটি: ৯ ঘণ্টা। বয়সসীমা: ২০ থেকে ৪৫ বছর।
- সুবিধা: সম্পূর্ণ ফ্রি খাবার ও বাসস্থান।

৩. আলজেরিয়া (Algeria) — কারিগরি ও দক্ষ পদ:
- কার্পেন্টার (২০ জন, বেতন: $৫৫0 USD)
- স্টিলওয়ার্কার (১০ জন, বেতন: $৫৫0 USD)
- ব্রিকলেয়ার (১০ জন, বেতন: $৫৫0 USD)
- ট্রান্সলেটর (১ জন, বেতন: $৮০০ USD)
- শেফ / বাবুর্চি (১ জন, বেতন: $৪৫০ USD)
- শর্তাবলী: সংশ্লিষ্ট কাজে ন্যূনতম ২ বছরের পূর্ব অভিজ্ঞতা থাকতে হবে।

৪. ইরাক (Iraq) — ওয়েল্ডিং ও ব্রিকলেয়ার:
- সাধারণ ওয়েল্ডার: ৫ জন (বেতন: $৫৫০ USD)
- ব্রিকলেয়ার: ৫ জন (বেতন: $৫০০ USD)

যোগাযোগের ঠিকানা ও বিস্তারিত তথ্য:
THY International AD International Ent.
এম এম কমপ্লেক্স, লিফট-৭, পল্লবী মেট্রোস্টেশন, মিরপুর ২/১১, ঢাকা, বাংলাদেশ।
জরুরি হটলাইন: সাগর — +8801791520269`
    }
  ],
  ads: [
    {
      id: "ad_overseas_campaign_hub",
      slot: "probashi_hub",
      type: "image",
      title: "PREMIUM OVERSEAS RECRUITMENT 2026 — THY International & AD International Ent.",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_top",
      slot: "home_top",
      type: "image",
      title: "PREMIUM OVERSEAS RECRUITMENT 2026 — চীন, লাওস, আলজেরিয়া ও ইরাকে নিয়োগ",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_middle",
      slot: "home_middle",
      type: "image",
      title: "THY International AD International Ent. — সরাসরি সরকারি নিবন্ধিত ভিসা ও নিয়োগ",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_int_poster",
      slot: "probashi_hub",
      type: "image",
      title: "AD International Enterprises — ১৫ বছর মেয়াদবর্ধক PU প্রযুক্তি",
      image: "images/ad_int_poster.jpg",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    }
  ]
};