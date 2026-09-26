'use strict';
/**
 * BNE — সার্ভার-সাইড বটের সংরক্ষণাগার (GitHub-ভিত্তিক)
 * ════════════════════════════════════════════════════════════════════════
 * কেন GitHub-ই ডেটাবেজ
 * ---------------------------------------------------------------------------
 * Netlify Functions-এ কোনো স্থায়ী ডিস্ক নেই — প্রতিটি অনুরোধ শেষ হলে সব
 * মুছে যায়। তাই বটের "মনে রাখা" দরকার এমন সব কিছু (খসড়া, সেটিং,
 * বিজ্ঞাপনের পরিবর্তন, সংবাদ) GitHub রেপোতেই লেখা হয়।
 *
 * সুবিধা:
 *   • ল্যাপটপ বন্ধ থাকলেও কাজ করে — GitHub সবসময় চালু
 *   • সব পরিবর্তনের পূর্ণ ইতিহাস (কে কখন কী বদলেছে)
 *   • সাইট ও বট একই ভাণ্ডার ব্যবহার করে — দুটো কখনো আলাদা হয় না
 *   • হালনাগাদ করা মাত্র GitHub Actions সাইটে প্রকাশ করে
 *
 * ⚠️ লেখার জন্য টোকেন দরকার (GITHUB_TOKEN env)। পড়ার জন্য লাগে না —
 *    রেপো সর্বজনীন, তাই raw.githubusercontent.com থেকেই পড়া হয়।
 *
 * লেখার সময় সবসময় ফাইলের SHA পাঠানো হয়। কেউ একই সময়ে লিখলে GitHub 409
 * দেয়; তখন নতুন SHA এনে আবার চেষ্টা করা হয় (৩ বার) — কোনো আপডেট হারায় না।
 */

const { fetchJson, RAW, REPO, BRANCH } = require('./_bot-lib');

const API = `https://api.github.com/repos/${REPO}/contents`;
const TOKEN = process.env.GITHUB_TOKEN || process.env.BOT_GITHUB_TOKEN || '';

const BK = {
  state: 'data/bot-state.json',
  editorial: 'data/editorial-news.json',
};

/* ── ফাইলের বর্তমান অবস্থা (SHA + বিষয়বস্তু) ────────────────────────── */
async function readFile(path) {
  /* সর্বজনীন রেপো থেকে সরাসরি পড়া — দ্রুত ও টোকেন-মুক্ত */
  const url = `${RAW}/${path}`;
  const data = await fetchJson(url, 15 * 1000);
  return { content: data, sha: null };
}

/* ── লেখা ─────────────────────────────────────────────────────────────── */
async function writeFile(path, content, message) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN সেট করা নেই — লেখা সম্ভব নয়');

  for (let attempt = 1; attempt <= 3; attempt++) {
    /* প্রতিটি চেষ্টায় সর্বশেষ SHA আনা হয় (নইলে 409 সংঘর্ষ) */
    let sha = null;
    try {
      const r = await fetch(`${API}/${path}?ref=${BRANCH}`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'BNE-Bot' },
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) sha = (await r.json()).sha;
    } catch (e) { /* ফাইল না থাকলে sha ছাড়াই তৈরি হবে */ }

    const body = {
      message,
      content: Buffer.from(JSON.stringify(content, null, 2) + '\n', 'utf8').toString('base64'),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const put = await fetch(`${API}/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'BNE-Bot',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (put.ok) return true;
    const txt = await put.text();
    if (put.status === 409 || put.status === 422) continue;     /* আরেকজন আগে লিখেছে — আবার চেষ্টা */
    throw new Error(`GitHub লেখা ব্যর্থ (${put.status}): ${txt.slice(0, 150)}`);
  }
  throw new Error('৩ চেষ্টাতেও লেখা যায়নি (বারবার সংঘর্ষ হচ্ছে)');
}

/* ── বটের অবস্থা (খসড়া, সেটিং) ──────────────────────────────────────── */
/* ⚠️ readFile() রিটার্ন করে { content, sha } মোড়ক — ফাইলের ভেতরের ডেটা নয়।
   আগে getState() মোড়কটাই ফিরিয়ে দিত, ফলে st.chats সবসময় ফাঁকা হতো:
   → খসড়া কখনো মনে থাকত না → প্রিভিউয়ের পর "প্রকাশ করুন" চাপলে
     "প্রকাশ করার মতো খসড়া নেই" আসত, আর অটো-প্রকাশও কখনো চালু হতো না।
   এখন মোড়ক খুলে আসল অবস্থা ফেরানো হচ্ছে। */
async function getState() {
  try {
    const f = await readFile(BK.state) || {};
    const st = f.content || {};
    /* পুরনো কোড মোড়কের গায়ে chats/settings লিখে রেখেছিল — সেগুলো যেন হারিয়ে না যায় */
    if (!st.chats && f.chats) st.chats = f.chats;
    if (!st.settings && f.settings) st.settings = f.settings;
    st.chats = st.chats || {};
    st.settings = st.settings || {};
    return st;
  } catch (e) { return { chats: {}, settings: {} }; }
}

/** আংশিক পরিবর্তন — পড়ে, মিলিয়ে, লিখে */
async function patchState(mutator, message) {
  const st = (await getState()) || {};
  st.chats = st.chats || {};
  st.settings = st.settings || {};
  mutator(st);
  await writeFile(BK.state, st, message || 'chore(bot): অবস্থা হালনাগাদ [skip ci]');
  return st;
}

async function getChat(chatId) {
  const st = await getState();
  return (st.chats && st.chats[String(chatId)]) || {};
}

async function setChat(chatId, patch) {
  return patchState((st) => {
    const k = String(chatId);
    st.chats[k] = Object.assign({}, st.chats[k] || {}, patch);
  }, 'chore(bot): কথোপকথনের অবস্থা [skip ci]');
}

async function getSetting(key, fallback) {
  const st = await getState();
  const v = st.settings ? st.settings[key] : undefined;
  return v === undefined ? fallback : v;
}

async function setSetting(key, value) {
  return patchState((st) => { st.settings[key] = value; }, `chore(bot): সেটিং ${key} [skip ci]`);
}

/* ── সম্পাদকীয় ভাণ্ডার (সংবাদ, বিজ্ঞাপন, override) ───────────────────── */
async function getEditorial() {
  try {
    const f = await readFile(BK.editorial) || {};
    const d = f.content || f;                       /* মোড়ক থাকলে খুলে নেওয়া */
    if (!Array.isArray(d.news) && Array.isArray(f.news)) d.news = f.news;
    if (!Array.isArray(d.ads) && Array.isArray(f.ads)) d.ads = f.ads;
    if (!d.adOverrides && f.adOverrides) d.adOverrides = f.adOverrides;
    d.news = Array.isArray(d.news) ? d.news : [];
    d.ads = Array.isArray(d.ads) ? d.ads : [];
    d.adOverrides = (d.adOverrides && typeof d.adOverrides === 'object') ? d.adOverrides : {};
    return d;
  } catch (e) { return { news: [], ads: [], adOverrides: {} }; }
}

async function saveEditorial(d, message) {
  await writeFile(BK.editorial, d, message || 'chore(bot): সম্পাদকীয় ভাণ্ডার হালনাগাদ');
  return true;
}

/** একটি বিজ্ঞাপনে পরিবর্তন (চাবি = বিজ্ঞাপনের স্থায়ী পরিচয়) */
async function setAdOverride(key, patch, message) {
  const d = await getEditorial();
  d.adOverrides[key] = Object.assign({}, d.adOverrides[key] || {}, patch);
  await saveEditorial(d, message || `chore(bot): বিজ্ঞাপন "${String(key).slice(0, 40)}" হালনাগাদ`);
  return d.adOverrides[key];
}

/* ── GitHub Actions চালু করা (প্রকাশ, সিঙ্ক) ─────────────────────────── */
async function dispatchWorkflow(workflowFile, inputs) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN সেট করা নেই');
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'BNE-Bot',
    },
    body: JSON.stringify({ ref: BRANCH, inputs: inputs || {} }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`ওয়ার্কফ্লো চালু করা যায়নি (${r.status}): ${(await r.text()).slice(0, 120)}`);
  }
  return true;
}

module.exports = {
  TOKEN, BK,
  readFile, writeFile, getState, patchState, getChat, setChat, getSetting, setSetting,
  getEditorial, saveEditorial, setAdOverride, dispatchWorkflow,
};
