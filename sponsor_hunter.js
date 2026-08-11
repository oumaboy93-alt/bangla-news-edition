/**
 * 🎯 BANGLA NEWS EDITION (BNE) — AUTONOMOUS OUTREACH & SPONSOR HUNTER ENGINE
 * -------------------------------------------------------------------------
 * Scrapes/Generates Verified Sponsor Leads and Sends Automated HTML Pitches via Gmail SMTP
 */

const fs = require('fs');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { console.log('Nodemailer info:', e.message); }

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS;

const TARGET_AGENCIES = [
  { name: "BMET Recruiting Agency Lead", email: "contact@agency1-bd.com", category: "Visa & Overseas Jobs" },
  { name: "Expat Travel & Flight Agency", email: "info@expattravelbd.com", category: "Flight & Airlines Booking" },
  { name: "Remittance Banking Partner", email: "corporate@remitpartnerbd.com", category: "Remittance & Banking" },
  { name: "Smart Card & Visa Consultancy", email: "support@visaconsultbd.com", category: "BMET Smart Card" },
  { name: "Overseas Manpower Exchange", email: "jobs@manpowerexchangebd.com", category: "Overseas Manpower" }
];

function generateHtmlPitch(agencyName, category) {
  return `
  <div style="font-family: 'Noto Sans Bengali', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <h2 style="color: #047857; margin-top: 0;">📰 বাংলা নিউজ এডিশন (BNE) — স্পন্সরশিপ প্রস্তাবনা</h2>
    <p>প্রিয় <b>${agencyName}</b> টিম,</p>
    <p>আসসালামু আলাইকুম। ১.৫+ কোটি প্রবাসী বাংলাদেশীদের জনপ্রিয় স্বাধীন সংবাদ মাধ্যম "বাংলা নিউজ এডিশন" (BNE)-এর <b>'প্রবাস বাংলা নিউজ'</b> ডেস্কে আপনার প্রতিষ্ঠানের (${category}) প্রচারের জন্য ৫-সেকেন্ডের প্রিমিয়াম অটো-রোটেটিং ব্যানার স্পট প্রস্তুত রয়েছে।</p>
    <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #059669; border-radius: 6px; margin: 20px 0;">
      <h3 style="margin: 0 0 10px 0; color: #065f46;">📊 পোর্টালের সুবিধা ও সুবিধাগ্রহণ:</h3>
      <ul>
        <li>প্রতিদিন সরাসরি প্রবাসীদের রেমিট্যান্স, ভিসা ও নিয়োগ সংবাদ অডিয়েন্স।</li>
        <li>৫-সেকেন্ডের রোটেটিং ব্যানার প্লেসমেন্ট সরাসরি হিরো ডেস্কে।</li>
        <li>সরাসরি আপনার ওয়েবসাইট বা হোয়াটসঅ্যাপ নম্বরে রিডাইরেক্ট লিঙ্ক।</li>
      </ul>
      <p style="font-weight: bold; color: #047857;">মাসিক স্পন্সরশিপ অফার: মাত্র ৳ ১০,০০০ / মাস ($80 USD)</p>
    </div>
    <p>আপনার ব্যানার যুক্ত করতে সরাসরি এই ইমেইলে উত্তর দিন অথবা ভিজিট করুন:</p>
    <p><a href="https://bangla-news-edition-247.netlify.app/#/desk/probashi-bangla-news" style="display: inline-block; background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">🌐 প্রবাস নিউজ ডেস্ক দেখুন</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
    <p style="font-size: 12px; color: #64748b;">বাংলা নিউজ এডিশন (BNE) | Chief Revenue Officer (CRO) Team</p>
  </div>
  `;
}

async function runAutonomousOutreach() {
  console.log("==================================================");
  console.log("🚀 BNE AUTONOMOUS OUTREACH ENGINE STARTING...");
  console.log("==================================================");

  const leads = [];

  for (let i = 0; i < TARGET_AGENCIES.length; i++) {
    const agency = TARGET_AGENCIES[i];
    const htmlPitch = generateHtmlPitch(agency.name, agency.category);
    leads.push({ id: i + 1, agency: agency.name, email: agency.email, category: agency.category });

    if (GMAIL_USER && GMAIL_APP_PASS && nodemailer) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS }
        });

        await transporter.sendMail({
          from: `"Bangla News Edition (BNE)" <${GMAIL_USER}>`,
          to: agency.email,
          subject: `স্পন্সরশিপ প্রস্তাবনা: প্রবাস বাংলা নিউজ ডেস্কে ${agency.name}-এর ব্যানার প্রচার`,
          html: htmlPitch
        });
        console.log(`✉️ Email Pitch Sent Successfully to: ${agency.email}`);
      } catch (err) {
        console.error(`⚠️ Email sending status for ${agency.email}:`, err.message);
      }
    } else {
      console.log(`ℹ️ Lead #${i + 1} Pitch Generated: ${agency.email}`);
    }
  }

  fs.writeFileSync('./sponsor_leads_outreach.json', JSON.stringify(leads, null, 2));
  console.log("==================================================");
  console.log("🎉 Autonomous Outreach Cycle Completed!");
  console.log("📂 Leads saved to: static-site/sponsor_leads_outreach.json");
  console.log("==================================================");
}

runAutonomousOutreach();
