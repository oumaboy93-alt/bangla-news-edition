/**
 * BNE — Admin Auth Function (P5 সার্ভার-সাইড অথ)
 * POST /api/admin-auth { password } → সঠিক হলে HttpOnly SameSite কুকি (BNE_SESSION)
 * GET  /api/admin-auth → সেশন বৈধ কিনা
 * DELETE /api/admin-auth → লগআউট (কুকি মুছে)
 *
 * env: ADMIN_PASS (পাসওয়ার্ড) · ADMIN_SESSION_SECRET (ঐচ্ছিক, কুকি-স্বাক্ষর)
 * নিরাপত্তা: timingSafeEqual + HMAC-স্বাক্ষরিত ৭ দিনের সেশন
 */

const crypto = require('crypto');

const ADMIN_PASS = process.env.ADMIN_PASS || "";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || (ADMIN_PASS ? crypto.createHash('sha256').update(ADMIN_PASS).digest('hex') : "bne-dev-secret");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "BNE_SESSION";

function sha256hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function safeEqual(a, b) {
  const ha = sha256hex(a), hb = sha256hex(b);
  const bufA = Buffer.from(ha), bufB = Buffer.from(hb);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return data + "." + sig;
}

function verifyToken(token) {
  try {
    const [data, sig] = String(token || "").split(".");
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

function cookieHeader(token, maxAgeMs, secure) {
  const parts = [
    COOKIE_NAME + "=" + token,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + Math.floor(maxAgeMs / 1000)
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

exports.handler = async (event) => {
  const cookies = parseCookies(event.headers && event.headers.cookie);
  const method = event.httpMethod || "GET";

  /* GET: সেশন যাচাই */
  if (method === "GET") {
    const ok = !!verifyToken(cookies[COOKIE_NAME]);
    return { statusCode: ok ? 200 : 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok }) };
  }

  /* DELETE: লগআউট */
  if (method === "DELETE") {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" },
      body: JSON.stringify({ ok: true })
    };
  }

  /* POST: পাসওয়ার্ড যাচাই */
  if (method === "POST") {
    if (!ADMIN_PASS) {
      return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "ADMIN_PASS env সেট করা হয়নি" }) };
    }
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
    const pass = String(body.password || "");

    if (!safeEqual(pass, ADMIN_PASS)) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "ভুল পাসওয়ার্ড" }) };
    }

    const token = signToken({ sub: "admin", exp: Date.now() + SESSION_TTL_MS });
    const secure = String(event.headers && event.headers['x-forwarded-proto'] || "").indexOf('https') === 0;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader(token, SESSION_TTL_MS, secure)
      },
      body: JSON.stringify({ ok: true })
    };
  }

  return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, message: "GET/POST/DELETE ব্যবহার করুন" }) };
};
