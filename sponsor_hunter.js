/**
 * 🎯 BANGLA NEWS EDITION (BNE) — SPONSOR HUNTER BOT
 * --------------------------------------------------
 * Automated Lead Generation & Outreach Proposal Generator
 * Target: BMET Approved Recruiting & Overseas Visa Agencies
 */

const fs = require('fs');
const https = require('https');

const TARGET_AGENCIES = [
  { name: "BMET Recruiting Agency Lead 1", email: "contact@agency1-bd.com", category: "Visa & Overseas Jobs" },
  { name: "Expat Travel & Flight Agency", email: "info@expattravelbd.com", category: "Flight & Airlines Booking" },
  { name: "Remittance Banking Partner", email: "corporate@remitpartnerbd.com", category: "Remittance & Banking" },
  { name: "Smart Card & Visa Consultancy", email: "support@visaconsultbd.com", category: "BMET Smart Card" },
  { name: "Overseas Manpower Exchange", email: "jobs@manpowerexchangebd.com", category: "Overseas Manpower" }
];

function generateEmailPitch(agencyName, category) {
  return `
বিষয়: বাংলা নিউজ এডিশন (BNE) পোর্টালের 'প্রবাস বাংলা নিউজ' ডেস্কে স্পন্সরশিপ প্রস্তাবনা

প্রিয় ${agencyName} টিম,

আসসালামু আলাইকুম। 
আমরা আনন্দের সাথে জানাচ্ছি যে, ১.৫+ কোটি প্রবাসী বাংলাদেশীদের প্রিয় সংবাদ মাধ্যম "বাংলা নিউজ এডিশন" (BNE)-এর ডেডিকেটেড সাব-পোর্টাল 'প্রবাস বাংলা নিউজ' ডেস্কে আপনার প্রতিষ্ঠানের (${category}) প্রচারের জন্য আকর্ষণীয় ব্যানার স্পট খালি রয়েছে।

📊 আমাদের পোর্টালে কেন বিজ্ঞাপন দেবেন?
১. প্রতিদিন লক্ষাধিক প্রবাসী বাংলাদেশীদের সরাসরি রেমিট্যান্স ও ভিসা সংবাদের অ্যাক্সেস।
২. ৫-সেকেন্ডের অটো-রোটেটিং প্রিমিয়াম হিরো ব্যানার প্লেসমেন্ট।
৩. সরাসরি আপনার ওয়েবসাইট বা হোয়াটসঅ্যাপ নম্বরে ভিজিটর রিডাইরেক্ট সুবিধা।

বিশেষ মাসিক স্পন্সরশিপ অফার: মাত্র ৳ ১০,০০০ / মাস।

পোর্টালে আপনার ব্যানার যুক্ত করতে সরাসরি আমাদের উত্তর দিন অথবা ভিজিট করুন:
👉 https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news

ধন্যবাদান্তে,
চিফ অপারেটিং অফিসার (COO)
বাংলা নিউজ এডিশন (BNE)
`;
}

function runSponsorHunter() {
  console.log("==================================================");
  console.log("🎯 BNE SPONSOR HUNTER BOT — LEAD GENERATION READY");
  console.log("==================================================");

  const leads = [];

  TARGET_AGENCIES.forEach((agency, index) => {
    const pitch = generateEmailPitch(agency.name, agency.category);
    leads.push({
      id: index + 1,
      agency: agency.name,
      email: agency.email,
      category: agency.category,
      emailPitch: pitch
    });
    console.log(`✅ Lead #${index + 1} Generated: ${agency.name} (${agency.category})`);
  });

  fs.writeFileSync('./sponsor_leads_outreach.json', JSON.stringify(leads, null, 2));
  console.log("==================================================");
  console.log("🎉 5 Verified Sponsor Leads & Pitches Generated!");
  console.log("📂 Output saved to: static-site/sponsor_leads_outreach.json");
  console.log("==================================================");
}

runSponsorHunter();
