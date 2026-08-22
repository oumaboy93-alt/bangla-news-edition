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

🇨🇳 ১. চীন (China) — গার্মেন্টস সুইং ট্রেইনি (বিশেষ অফার):
- পদ সংখ্যা: ২০০ জন (পুরুষ/নারী)।
- ভিসার ধরন: ৪ বছরের ট্রেইনি ভিসা (আন্তর্জাতিক মানের কাজের মূল্যায়ন)।
- বিশেষ সুযোগ: ২ বছর পর আন্তর্জাতিক মানের কাজের অভিজ্ঞতার প্রাতিষ্ঠানিক সার্টিফিকেট প্রদান করা হবে, যা ভবিষ্যতে ইউরোপ বা যেকোনো দেশে পেশাদার মূল্যায়ন হিসেবে গণ্য হবে।
- ট্রেইনি অবস্থায় সর্বনিম্ন মাসিক বেতন: ৫০,০০০ টাকা (BDT)।

🇱🇦 ২. লাওস (Laos) — CHINA HUNAN CONSTRUCTION:
- কোম্পানির নাম: CHINA HUNAN CONSTRUCTION।
- কাজের ধরণ: কনস্ট্রাকশন মেগা প্রজেক্ট।
- মাসিক বেতন: ৪৫০ ডলার ($450 USD)।
- ডিউটি সময়: ৯ ঘণ্টা (ওভারটাইম সুবিধা)।
- বয়সসীমা: ২০ থেকে ৪৫ বছর।
- সুবিধা: সম্পূর্ণ ফ্রি খাবার ও বাসস্থান কোম্পানি বহন করিবে (লাওসের শ্রম আইন অনুযায়ী সুবিধা)।

🇩🇿 ৩. আলজেরিয়া (Algeria) — কারিগরি ও দক্ষ পদ (২ বছরের অভিজ্ঞতা আবশ্যক):
- কার্পেন্টার: ২০ জন (মাসিক বেতন: $৫৫0 USD)
- স্টিলওয়ার্কার: ১০ জন (মাসিক বেতন: $৫৫0 USD)
- ব্রিকলেয়ার: ১০ জন (মাসিক বেতন: $৫৫0 USD)
- ট্রান্সলেটর: ১ জন (মাসিক বেতন: $৮০০ USD)
- শেফ / বাবুর্চি: ১ জন (মাসিক বেতন: $৪৫০ USD)

🇮🇶 ৪. ইরাক (Iraq) — ওয়েল্ডিং ও রাজমিস্ত্রি:
- সাধারণ ওয়েল্ডার: ৫ জন (মাসিক বেতন: $৫৫০ USD)
- ব্রিকলেয়ার / রাজমিস্ত্রি: ৫ জন (মাসিক বেতন: $৫০০ USD)

📍 কোম্পানির অফিসের ঠিকানা ও সরাসরি ক্লায়েন্ট তথ্য সংযোগ:
THY International AD International Ent.
এম এম কমপ্লেক্স, লিফট-৭ (পল্লবী মেট্রোস্টেশন সংলগ্ন), মিরপুর ২/১১, ঢাকা, বাংলাদেশ।
জরুরি কল / হটলাইন: সাগর — +8801791520269`
    }
  ],
  ads: [
    {
      id: "ad_overseas_campaign_hub",
      slot: "probashi_hub",
      type: "image",
      title: "URGENT OVERSEAS RECRUITMENT NOTICE 2026 — THY International AD International Ent.",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_poster_hub",
      slot: "probashi_hub",
      type: "image",
      title: "URGENT RECRUITMENT NOTICE 2026 — China, Laos, Algeria, Iraq Infographic Poster",
      image: "images/overseas-campaign-poster.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_top",
      slot: "home_top",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — চীন, লাওস, আলজেরিয়া ও ইরাক (THY International)",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_middle",
      slot: "home_middle",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — THY International AD International Ent.",
      image: "images/overseas-campaign.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_overseas_campaign_poster_middle",
      slot: "home_middle",
      type: "image",
      title: "জরুরী নিয়োগ বিজ্ঞপ্তি ২০২৬ — চীন, লাওস, আলজেরিয়া ও ইরাক ইনফোগ্রাফিক পোস্টার",
      image: "images/overseas-campaign-poster.webp",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    },
    {
      id: "ad_int_poster",
      slot: "probashi_top",
      type: "image",
      title: "AD International Enterprises — ১৫ বছর মেয়াদবর্ধক PU প্রযুক্তি ও মরিচা প্রতিরোধ সমাধান",
      image: "images/ad_int_poster.jpg",
      link: "#/news/thy-recruitment-2026",
      enabled: true
    }
  ]
};