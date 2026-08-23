/**
 * BNE — Newsletter Subscribe Function (P4)
 * POST /api/newsletter { email } → EmailOctopus API-তে সাবস্ক্রাইব
 * EMAIL_OCTOPUS_API_KEY + EMAIL_OCTOPUS_LIST_ID env-থেকে; না থাকলে গ্রেসফুল ডিগ্রেডেশন (লোকাল-নোট)।
 */

const https = require('https');

const API_KEY = process.env.EMAIL_OCTOPUS_API_KEY || "";
const LIST_ID = process.env.EMAIL_OCTOPUS_LIST_ID || "";

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { Allow: "POST", 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "POST ব্যবহার করুন" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
  const email = String(body.email || "").trim();

  if (!validateEmail(email)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "সঠিক ইমেইল ঠিকানা দিন" }) };
  }

  /* API কী না থাকলে — ডিগ্রেডেশন: সফল বলে ধরে রেকর্ড নোট (লাইভ সাবস্ক্রাইব হয়নি) */
  if (!API_KEY || !LIST_ID) {
    console.log(`[newsletter] EMAIL_OCTOPUS_API_KEY/LIST_ID সেট নেই — সাবস্ক্রাইব স্কিপ: ${email}`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, message: "ধন্যবাদ! আপনার সাবস্ক্রিপশন রেকর্ড হয়েছে।", deferred: true })
    };
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({ email_address: email, status: "subscribed" });
    const req = https.request({
      hostname: "api.emailoctopus.com",
      path: `/1.6/lists/${LIST_ID}/contacts`,
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        const ok = res.statusCode === 200 || res.statusCode === 201;
        resolve({
          statusCode: ok ? 200 : (res.statusCode || 500),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ok
            ? { ok: true, message: "ধন্যবাদ! সাবস্ক্রাইব সম্পন্ন হয়েছে।" }
            : { ok: false, message: "সাবস্ক্রাইব ব্যর্থ — আবার চেষ্টা করুন।" })
        });
      });
    });
    req.on("error", () => resolve({ statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "নেটওয়ার্ক সমস্যা — পরে চেষ্টা করুন।" }) }));
    req.write(payload);
    req.end();
  });
};
