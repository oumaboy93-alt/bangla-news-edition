/* ═══════════════════════════════════════════════════════════════════
   বাংলা নিউজ এডিশন — সাইট কনফিগারেশন (সম্পাদকীয় সংবাদ + বিজ্ঞাপন)
   এই ফাইলের মান হলো "ডিফল্ট"। admin.html থেকে প্রকাশ করলে রিমোট কনফিগ
   (GitHub Gist / JSONBin) এই ডিফল্টকে ওভাররাইড করে — সাইট রি-ডিপ্লয় লাগে না।
   ═══════════════════════════════════════════════════════════════════ */
window.AZADI_DEFAULT_CONFIG = {
  version: 1,
  updatedAt: "2026-08-12T01:12:00.000Z",
  settings: {
    siteName: "বাংলা নিউজ এডিশন",
    remoteConfigUrl: "",
    adminPath: "admin.html"
  },
  editorNews: [],
  ads: [
    {
      id: "ad_probashi_bkash",
      slot: "probashi_hub",
      type: "image",
      title: "বিকাশ রেমিট্যান্স বোনাস — বৈধ পথে রেমিট্যান্স পাঠিয়ে ক্যাশব্যাক পান",
      image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=900&auto=format&fit=crop&q=80",
      link: "https://www.bkash.com/remittance",
      enabled: true
    },
    {
      id: "ad_probashi_visa",
      slot: "probashi_hub",
      type: "image",
      title: "ইউরোপ ও মধ্যপ্রাচ্য প্রবাসগমন ভিসা প্রসেসিং সহায়তা — অনুমোদিত এজেন্সি",
      image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=900&auto=format&fit=crop&q=80",
      link: "https://bmet.gov.bd",
      enabled: true
    },
    {
      id: "ad_probashi_airline",
      slot: "probashi_hub",
      type: "image",
      title: "প্রবাসী ডিসকাউন্ট বিমান টিকেট বুকিং — বাংলাদেশ বিমান ও এমিরেটস",
      image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&auto=format&fit=crop&q=80",
      link: "https://www.biman-airlines.com",
      enabled: true
    }
  ]
};
