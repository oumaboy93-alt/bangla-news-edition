'use strict';
/**
 * BNE অ্যাডমিন বট — টেলিগ্রাম webhook (সার্ভারে, ল্যাপটপ-নিরপেক্ষ)
 * ════════════════════════════════════════════════════════════════════════
 * ★ কেন এটি long polling-এর বদলে webhook ★
 *
 * আগে বট ল্যাপটপে launchd দিয়ে চলত এবং Telegram-এর long polling ব্যবহার করত।
 * ফলে ল্যাপটপ বন্ধ থাকলে বট সম্পূর্ণ অচল — ব্যবহারকারীর আপত্তি ঠিক এখানেই।
 *
 * webhook-এ Telegram নিজেই এই ফাংশনে খবর পাঠায়। ফাংশনটি Netlify-এর সার্ভারে
 * চলে, যা ২৪ ঘণ্টা চালু। তাই:
 *     ল্যাপটপ বন্ধ + এই কথোপকথন বন্ধ → বট তবুও কাজ করবে ✅
 *
 * যা যা এখান থেকে হয়:
 *   • তাৎক্ষণিক উত্তর (Telegram-এ সরাসরি, কোনো ল্যাপটপ লাগে না)
 *   • সংবাদ/বিজ্ঞাপন GitHub-এ লেখা → GitHub Actions সাইটে প্রকাশ করে
 *   • বিজ্ঞাপন বন্ধ/চালু/মুছে ফেলা — সাথে সাথে সংরক্ষিত
 *   • হেডলাইন, ঘণ্টাভিত্তিক খবর, পোস্ট অবস্থা, পরামর্শ — সবই এখানেই হিসাব হয়
 *
 * নিরাপত্তা:
 *   • Telegram-এর পাঠানো গোপন হেডার যাচাই করা হয় (TELEGRAM_WEBHOOK_SECRET)
 *   • কেবল TELEGRAM_ADMIN_IDS-এ থাকা আইডি নির্দেশ দিতে পারে
 *   • টোকেন কখনো লগ বা উত্তরে ছাপা হয় না
 */

const L = require('./_bot-lib');
const S = require('./_bot-store');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const ADMINS = (process.env.TELEGRAM_ADMIN_IDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const API = `https://api.telegram.org/bot${TOKEN}`;

/* ── Telegram API ─────────────────────────────────────────────────────── */
async function tg(method, payload) {
  if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN নেই'); return { ok: false, error: 'no token' }; }
  try {
    const r = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
    return await r.json();
  } catch (e) {
    console.error(`Telegram ${method} ব্যর্থ:`, e.message);
    return { ok: false, error: e.message };
  }
}
/* ── মেনু-স্প্যাম কমানো ─────────────────────────────────────────────────
   আগে প্রতিটি উত্তরের সাথেই পুরো মেনু ও নির্দেশ আবার যেত — কথোপকথন তাই
   জটিল দেখাত। এখন একই মেনু ১৫ মিনিটে একবারই যায়; বাকি সময় কেবল ফলাফল।
   মেনু আবার চাইলে: /start অথবা "⬅️ মেনু" বোতাম। */
let MENU_SENT_AT = 0;
async function send(chatId, text, kb) {
  if (kb === MENU) {
    if (Date.now() - MENU_SENT_AT < 15 * 60 * 1000) kb = null;
    else MENU_SENT_AT = Date.now();
  }
  return tg('sendMessage', Object.assign(
    { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false },
    kb ? { reply_markup: { inline_keyboard: kb } } : {}
  ));
}

/* ── মেনু ─────────────────────────────────────────────────────────────── */
const MENU = [
  [{ text: '📝 নতুন সংবাদ', callback_data: 'new' }, { text: '📢 নতুন বিজ্ঞাপন', callback_data: 'ad' }],
  [{ text: '📰 হেডলাইন', callback_data: 'headlines' }, { text: '🕐 এই ঘণ্টার খবর', callback_data: 'hourly' }],
  [{ text: '📤 পোস্ট অবস্থা', callback_data: 'posted' }, { text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }],
  [{ text: '📋 আমার সংবাদ', callback_data: 'list' }, { text: '💡 পরামর্শ ও বিশ্লেষণ', callback_data: 'daily' }],
  [{ text: '📊 অবস্থা', callback_data: 'status' }, { text: '❓ সাহায্য', callback_data: 'help' }],
  [{ text: '⚡ অটো-প্রকাশ চালু/বন্ধ', callback_data: 'autotoggle' }],
];

function mainMenuText() {
  return '🏠 <b>বিএনই অ্যাডমিন প্যানেল</b>\n\n' +
    'এখান থেকেই সংবাদ, বিজ্ঞাপনসহ সব কিছু নিয়ন্ত্রণ করতে পারবেন।\n' +
    'কোনো নির্দিষ্ট ফরম্যাট লাগবে না — <b>সোজা বাংলায় লিখে দিন</b>, আমি বুঝে নেব।\n\n' +
    '<i>যেমন: "এই ঘণ্টায় কী খবর এল?", "আমার বিজ্ঞাপনগুলো দেখাও", "রিচ বাড়াতে কী করব?"</i>';
}

function helpText() {
  return '❓ <b>সাহায্য</b>\n\n' +
    '<b>কোনো কমান্ড মুখস্থ করতে হবে না</b> — যা করতে চান, সোজা বাংলায় লিখুন।\n\n' +
    '📝 <b>নতুন সংবাদ</b> — তথ্য লিখুন (চাইলে ছবিসহ), আমি শিরোনাম-সারাংশ বানিয়ে প্রিভিউ দেব\n' +
    '📢 <b>বিজ্ঞাপন</b> — লেখা ও ছবি পাঠালেই সাইটে যুক্ত হবে\n' +
    '✏️ <b>সম্পাদনা</b> — "শিরোনাম আরও শক্ত করো" জাতীয় নির্দেশ\n' +
    '⚡ <b>অটো-প্রকাশ</b> — ছবি+লেখা পাঠালেই সাথে সাথে প্রকাশ\n\n' +
    '<b>— নিজে থেকে জেনে নিন —</b>\n' +
    '📰 "হেডলাইনে এখন কী আছে?"\n' +
    '🕐 "এই ঘণ্টায় কী কী খবর এল?"\n' +
    '📤 "সর্বশেষ কী ফেসবুকে গেল?"\n' +
    '🎯 "আমার বিজ্ঞাপনগুলো দেখাও"\n' +
    '🔧 "২ নম্বর বিজ্ঞাপন বন্ধ করো"\n' +
    '💡 "রিচ বাড়াতে কী করব?"\n' +
    '⚡ "অটো চালু করো" / "অটো বন্ধ করো"\n\n' +
    '<b>প্রকাশ চাপলে যা হয়:</b> সংবাদ সাইটে যুক্ত হয় → হালনাগাদ হয় → ' +
    'ফেসবুক পেজ ও টেলিগ্রাম চ্যানেলে ছবিসহ প্রিভিউ কার্ড পোস্ট হয়।';
}

/* ── হেডলাইন / ঘণ্টা / পোস্ট / বিজ্ঞাপন দৃশ্য ─────────────────────────── */
async function viewHeadlines(chatId, site) {
  const hs = L.currentHeadlines(site, 4);
  if (!hs.length) return send(chatId, '📰 এখন কার্সেলে দেখানোর মতো তাজা খবর নেই।', MENU);
  const txt = ['📰 <b>এখন কার্সেলে যে খবরগুলো ঘুরছে</b>', '', '<i>সাইটে ঠিক এই ক্রমেই দেখানো হচ্ছে</i>', '']
    .concat(hs.map((h, i) => `${i + 1}. <b>${L.esc(h.title)}</b>\n   <i>${L.esc(h.category)} · ${L.ageText(h.ageMin)}</i>`)).join('\n');
  const kb = hs.slice(0, 3).map((h) => ([{ text: `🔗 ${String(h.title).slice(0, 34)}`, url: h.url }]));
  kb.push([{ text: '🔄 আরেকবার', callback_data: 'headlines' }, { text: '⬅️ মেনু', callback_data: 'menu' }]);
  return send(chatId, txt, kb);
}

async function viewHourly(chatId, site) {
  const buckets = L.byHour(site, 5);
  const parts = ['🕐 <b>ঘণ্টাভিত্তিক খবরের হিসাব</b>', ''];
  buckets.forEach((b) => {
    parts.push(`<b>${L.esc(b.label)}</b> — ${L.bn(b.items.length)}টি খবর`);
    b.items.slice(0, 5).forEach((it) => parts.push(`   • ${L.esc(String(it.title).slice(0, 70))}`));
    if (b.items.length > 5) parts.push(`   <i>…আরও ${L.bn(b.items.length - 5)}টি</i>`);
    parts.push('');
  });
  return send(chatId, parts.join('\n'),
    [[{ text: '📰 হেডলাইন', callback_data: 'headlines' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
}

async function viewPosted(chatId) {
  const p = await L.postStatus();
  const line = (lbl, x) => x
    ? `${lbl}\n   <b>${L.esc(String(x.title).slice(0, 70))}</b>\n   <i>${L.ageText(x.ageMin)}${x.channels && x.channels.length ? ' · ' + x.channels.map(L.chLabel).join(' + ') : ''}</i>`
    : `${lbl}\n   <i>তথ্য নেই</i>`;
  const kb = [];
  if (p.lastAny && p.lastAny.url) kb.push([{ text: '🔗 সর্বশেষ পোস্টটি দেখুন', url: p.lastAny.url }]);
  kb.push([{ text: '🔄 হালনাগাদ', callback_data: 'posted' }, { text: '⬅️ মেনু', callback_data: 'menu' }]);
  return send(chatId,
    '📤 <b>সর্বশেষ পোস্টের অবস্থা</b>\n\n' +
    line('📘 <b>ফেসবুক পেজে</b>', p.lastFacebook) + '\n\n' +
    line('✈️ <b>টেলিগ্রাম চ্যানেলে</b>', p.lastTelegram) + '\n\n' +
    `📦 মোট পোস্টের রেকর্ড: <b>${L.bn(p.total)}</b>টি\n` +
    (p.channelsTracked ? '<i>facebook / telegram আলাদা করে দেখানো হচ্ছে।</i>'
      : '<i>⚠️ পুরনো রেকর্ডে চ্যানেল লেখা নেই — নতুন পোস্টে সংরক্ষিত হবে।</i>'), kb);
}

async function viewAds(chatId, site) {
  const ads = L.adList(site);
  if (!ads.length) return send(chatId, '🎯 এখন কোনো বিজ্ঞাপন নেই।', MENU);
  const lines = ['🎯 <b>বর্তমান বিজ্ঞাপনগুলো</b>', ''];
  ads.forEach((a, i) => {
    lines.push(`<b>${L.bn(i + 1)}. ${L.esc(String(a.title).slice(0, 60))}</b>`);
    lines.push(`   📍 ${L.esc(a.slotLabel)}`);
    lines.push(`   ${a.enabled ? '✅ চালু' : '⛔ বন্ধ'}${a.live ? '' : ' · ⚠️ সাইটে ঠিকভাবে বসছে না'}${a.edited ? ' · ✏️ আপনার বদলানো' : ''}`);
    lines.push('');
  });
  lines.push('<i>বন্ধ/চালু বা মুছতে নিচের বোতাম চাপুন — অথবা লিখুন, যেমন "২ নম্বর বিজ্ঞাপন বন্ধ করো"।</i>');
  const kb = ads.slice(0, 6).map((a, i) => ([
    { text: `${a.enabled ? '⛔' : '✅'} ${L.bn(i + 1)}`, callback_data: `adtoggle:${a.index}` },
    { text: `👁️ ${L.bn(i + 1)}`, callback_data: `adview:${a.index}` },
    { text: `🗑️ ${L.bn(i + 1)}`, callback_data: `addel:${a.index}` },
  ]));
  kb.push([{ text: '⬅️ ফিরে যান', callback_data: 'menu' }]);
  return send(chatId, lines.join('\n'), kb);
}

/* ══════════════════════════════════════════════════════════════════════
   ★ বিজ্ঞাপন কোথায় বসবে — স্লট নির্বাচন ★
   ──────────────────────────────────────────────────────────────────────
   ব্যবহারকারীর বানানো বিজ্ঞাপন সাইটে দেখাচ্ছিল না। কারণ লাইভ যাচাইয়ে
   ধরা পড়ল: বিজ্ঞাপনে `slot` ঘরটি ছিলই না, অথচ সাইট কেবল নির্দিষ্ট স্লট
   মিলিয়ে বিজ্ঞাপন বসায় (`a.slot === slot`)। slot ছাড়া বিজ্ঞাপন কোথাও
   বসে না — অর্থাৎ ব্যবহারকারীর পরিশ্রম বৃথা যায়।

   এখন বিজ্ঞাপন বানানোর সময়েই জায়গা বেছে নিতে বলা হয়, এবং `enabled: true`
   ও `type: 'image'` স্পষ্টভাবে লেখা হয় (আগে কিছুই লেখা হত না, ফলে
   ভবিষ্যতে অনুমানের উপর নির্ভর করতে হত)। */
const AD_SLOTS = [
  ['home_top', '🏠 হোমপেজ — উপরে (সবচেয়ে বেশি দেখা যায়)'],
  ['home_middle', '🏠 হোমপেজ — মাঝখানে'],
  ['article_bottom', '📰 সংবাদের পাতায় — নিচে'],
  ['article_sidebar', '📰 সংবাদের পাতায় — পাশে'],
  ['probashi_hub', '🌍 প্রবাসী বিভাগ — প্রধান'],
  ['probashi_top', '🌍 প্রবাসী বিভাগ — উপরে'],
];

async function askAdSlot(chatId, draft) {
  await S.setChat(chatId, { mode: 'await_ad_slot', draft });
  const kb = AD_SLOTS.map(([slot, label]) => ([{ text: label, callback_data: `adslot:${slot}` }]));
  kb.push([{ text: '🗑️ বাতিল', callback_data: 'drop' }]);
  return send(chatId,
    '🎯 <b>বিজ্ঞাপনটি কোথায় দেখাবে?</b>\n\n' +
    `📝 <b>${L.esc(String(draft.title).slice(0, 60))}</b>\n` +
    `${draft.imageRel ? '🖼️ ছবি যুক্ত হয়েছে ✅' : '🖼️ ছবি নেই'}\n\n` +
    '<i>নিচের যেকোনো একটি বেছে নিন।</i>', kb);
}

/* বিজ্ঞাপন সংরক্ষণ — স্লট বেছে নেওয়ার পর */
async function saveNewAd(chatId, slot, chat) {
  const d = chat.draft;
  if (!d) return send(chatId, '⚠️ বিজ্ঞাপনের তথ্য পাওয়া যায়নি — আবার শুরু করুন।', MENU);
  try {
    const ed = await S.getEditorial();
    ed.ads = Array.isArray(ed.ads) ? ed.ads : [];
    const entry = {
      id: `ad-${Date.now()}`,
      title: d.title,
      body: d.body || d.summary || d.title,
      image: d.imageRel || '',
      link: d.link || '',
      slot,
      enabled: true,             /* স্পষ্টভাবে চালু — নইলে সাইটে বসার অনিশ্চয়তা থাকে */
      type: 'image',
      editorial: true,
      createdAt: new Date().toISOString(),
    };
    ed.ads.unshift(entry);
    await S.saveEditorial(ed, `feat(bot): নতুন বিজ্ঞাপন "${String(d.title).slice(0, 45)}"`);

    let dispatched = false;
    try { await S.dispatchWorkflow('deploy.yml'); dispatched = true; } catch (e) { /* পরের ক্রনে হবে */ }

    await S.setChat(chatId, { mode: null, draft: null });
    const label = (AD_SLOTS.find((x) => x[0] === slot) || [slot, slot])[1];
    return send(chatId,
      '✅ <b>বিজ্ঞাপন যুক্ত হলো!</b>\n\n' +
      `📝 <b>${L.esc(String(d.title).slice(0, 60))}</b>\n` +
      `📍 ${L.esc(label)}\n` +
      `${entry.image ? '🖼️ ছবিসহ\n' : ''}` +
      '📊 অবস্থা: ✅ চালু\n\n' +
      (dispatched ? '🔄 সাইটে বসতে ২–৫ মিনিট লাগবে।' : '🔄 স্বয়ংক্রিয়ভাবে হালনাগাদ শুরু হয়েছে।'),
      [[{ text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
  } catch (e) {
    return send(chatId, `⚠️ বিজ্ঞাপন সংরক্ষণ করা যায়নি: ${L.esc(e.message)}`, MENU);
  }
}

async function viewAdDetail(chatId, site, idx) {
  const a = L.adList(site)[idx];
  if (!a) return send(chatId, '⚠️ ওই নম্বরের বিজ্ঞাপন পাওয়া যায়নি।', MENU);
  const body = `🎯 <b>বিজ্ঞাপন ${L.bn(idx + 1)}</b>\n\n` +
    `📝 <b>${L.esc(a.title)}</b>\n📍 স্লট: ${L.esc(a.slotLabel)}\n📦 ধরন: ${L.esc(a.type)}\n` +
    `🔗 লিংক: ${L.esc(a.link || '—')}\n🖼️ ছবি: ${L.esc(a.image || '—')}\n` +
    `📊 অবস্থা: ${a.enabled ? '✅ চালু' : '⛔ বন্ধ'}${a.live ? '' : ' · ⚠️ সাইটে ঠিকভাবে বসছে না'}`;
  const kb = [
    [{ text: a.enabled ? '⛔ বন্ধ করুন' : '✅ চালু করুন', callback_data: `adtoggle:${idx}` }],
    [{ text: '✏️ লিংক বদলান', callback_data: `adfield:${idx}:link` },
     { text: '✏️ শিরোনাম বদলান', callback_data: `adfield:${idx}:title` }],
    [{ text: '🗑️ মুছে ফেলুন', callback_data: `addel:${idx}` }],
    [{ text: '⬅️ তালিকায় ফিরে যান', callback_data: 'ads' }],
  ];
  if (a.image) {
    const url = /^https?:\/\//i.test(a.image) ? a.image : `${L.SITE_ORIGIN}/${String(a.image).replace(/^\/+/, '')}`;
    const r = await tg('sendPhoto', { chat_id: chatId, photo: url, caption: body, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
    if (r && r.ok) return r;
  }
  return send(chatId, body, kb);
}

function renderDaily(r) {
  const parts = ['💡 <b>বিশ্লেষণ ও করণীয়</b>', '', '📊 <b>গত ২৪ ঘণ্টার চিত্র</b>',
    `   • সাইটে মোট খবর: <b>${L.bn(r.totals.articles)}</b>টি`,
    `   • নতুন এসেছে: <b>${L.bn(r.totals.last24h)}</b>টি (আগের ২৪ ঘণ্টায় ${L.bn(r.totals.prev24h)}টি)`,
    `   • ছবিসহ খবর: <b>${L.bn(r.totals.withImage)}</b>টি`];
  if (r.busiestHours.length) parts.push(`   • খবর এসেছে সবচেয়ে বেশি: ${r.busiestHours.join(', ')}`);
  parts.push('', `🎯 বিজ্ঞাপন: মোট ${L.bn(r.ads.total)}টি · বন্ধ ${L.bn(r.ads.off)}টি · সমস্যাযুক্ত ${L.bn(r.ads.broken)}টি`, '');

  if (r.recommendations.length) {
    parts.push('🧭 <b>যা করলে ভালো হবে</b>');
    r.recommendations.forEach((x, i) => {
      const badge = x.impact === 'উচ্চ' ? '🔴' : x.impact === 'মাঝারি' ? '🟡' : '🔵';
      parts.push(`${badge} ${L.bn(i + 1)}. ${L.esc(x.text)}`);
    });
    parts.push('', '<i>যেটি সরাসরি করা যায়, তার নিচে বোতাম আছে।</i>');
  } else {
    parts.push('✅ এখন কোনো বড় সমস্যা চোখে পড়ছে না — সব ঠিক চলছে।');
  }
  return parts.join('\n');
}

const REC_ACTIONS = {
  ads_off: { label: 'বন্ধ বিজ্ঞাপনগুলো চালু করো', run: 'enable_ads' },
  ads_broken: { label: 'সমস্যাযুক্ত বিজ্ঞাপন দেখা', run: 'show_broken' },
  no_posts: { label: 'এখনই একটি খবর প্রকাশ করো', run: 'hint_publish' },
};

function dailyKeyboard(r) {
  const kb = [];
  r.recommendations.slice(0, 4).forEach((x) => {
    if (!REC_ACTIONS[x.id]) return;
    kb.push([{ text: `✅ ${REC_ACTIONS[x.id].label}`, callback_data: `approve:${x.id}` }]);
  });
  kb.push([{ text: '🔄 আবার বিশ্লেষণ', callback_data: 'daily' }, { text: '⬅️ মেনু', callback_data: 'menu' }]);
  return kb;
}

async function viewDaily(chatId, site) {
  const r = await L.dailyReport();
  await S.setChat(chatId, { recs: r.recommendations, mode: null }).catch(() => {});
  return send(chatId, renderDaily(r), dailyKeyboard(r));
}

/* ── সংবাদ কম্পোজ (সার্ভারে — ব্রেন ছাড়া, দ্রুত) ──────────────────────── */
const CAT_RULES = [
  ['খেলা', ['ক্রিকেট', 'ফুটবল', 'ম্যাচ', 'খেলোয়াড়', 'গোল', 'টুর্নামেন্ট', 'বিশ্বকাপ', 'টি-টোয়েন্টি']],
  ['আন্তর্জাতিক', ['ভারত', 'পাকিস্তান', 'আমেরিকা', 'চীন', 'জাতিসংঘ', 'ইসরায়েল', 'ফিলিস্তিন', 'ইউক্রেন', 'যুক্তরাষ্ট্র']],
  ['অর্থনীতি', ['টাকা', 'ডলার', 'ব্যাংক', 'বাজেট', 'রপ্তানি', 'আমদানি', 'বিনিয়োগ', 'দাম', 'মূল্য', 'শেয়ার']],
  ['প্রযুক্তি', ['মোবাইল', 'ইন্টারনেট', 'স্মার্টফোন', 'এআই', 'সফটওয়্যার', 'অ্যাপ', 'কম্পিউটার']],
  ['স্বাস্থ্য', ['স্বাস্থ্য', 'হাসপাতাল', 'ডাক্তার', 'রোগ', 'ঔষধ', 'টিকা', 'ভাইরাস']],
  ['বিনোদন', ['সিনেমা', 'নাটক', 'শিল্পী', 'গান', 'অভিনেতা', 'চলচ্চিত্র', 'ঢালিউড']],
  ['প্রবাস', ['প্রবাসী', 'বিদেশে', 'ভিসা', 'রেমিট্যান্স', 'অভিবাসী', 'মধ্যপ্রাচ্য']],
  ['রাজনীতি', ['নির্বাচন', 'দল', 'নেতা', 'মন্ত্রী', 'সংসদ', 'রাজনৈতিক', 'আওয়ামী', 'বিএনপি']],
  ['জাতীয়', ['সরকার', 'জেলা', 'উপজেলা', 'প্রশাসন', 'আইন', 'আদালত', 'পুলিশ', 'সড়ক']],
];
function guessCategory(text) {
  const t = String(text || '');
  for (const [cat, kws] of CAT_RULES) if (kws.some((k) => t.includes(k))) return cat;
  return 'জাতীয়';
}

/** ইনপুট থেকে শিরোনাম-সারাংশ বানানো (ব্রেন ছাড়া) */
function composeFromText(rawText) {
  const text = String(rawText || '').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = lines[0] || '';
  let body = lines.slice(1).join(' ').trim();

  /* প্রথম লাইনই যদি লম্বা হয়, প্রথম বাক্যটিকে শিরোনাম ধরা হয় */
  if (title.length > 110) {
    const parts = title.split(/(?<=[।.!?])\s+/);
    title = parts[0];
    body = parts.slice(1).join(' ') + ' ' + body;
  }
  title = title.replace(/\s+/g, ' ').slice(0, 110);
  body = body.replace(/\s+/g, ' ').trim();

  /* সারাংশ: প্রথম দুই বাক্য, নইলে প্রথম ২২০ অক্ষর */
  let summary = body;
  if (summary) {
    const sents = summary.split(/(?<=[।.!?])\s+/);
    summary = sents.slice(0, 2).join(' ');
    if (summary.length > 240) summary = summary.slice(0, 240).trim() + '…';
  }

  return {
    title,
    summary: summary || title,
    body: body || title,
    category: guessCategory(text),
  };
}

function slugify(title) {
  return String(title || '')
    .normalize('NFC')
    .trim()
    .replace(/[\s/\\?#%&]+/g, '-')
    .replace(/[।,;:'"()\[\]{}!]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `news-${Date.now()}`;
}

/* ── প্রকাশ ───────────────────────────────────────────────────────────── */
async function publishDraft(chatId, chat) {
  const d = chat.draft;
  if (!d) return send(chatId, '📝 প্রকাশ করার মতো খসড়া নেই। আগে সংবাদের তথ্য পাঠান।', MENU);

  await send(chatId, '⏳ <b>প্রকাশ করা হচ্ছে…</b>\n<i>সাইটে যোগ করে চ্যানেল ও পেজে পোস্ট করা হবে।</i>');

  try {
    const ed = await S.getEditorial();
    const slug = slugify(d.title);
    /* একই শিরোনামে দুবার যোগ হয়ে যাওয়া ঠেকাতে slug মিলিয়ে দেখা হয় */
    const exists = ed.news.some((n) => n.slug === slug);
    if (exists) return send(chatId, '⚠️ এই শিরোনামেই একটি সংবাদ আগেই প্রকাশিত হয়েছে। শিরোনাম একটু বদলে আবার চেষ্টা করুন।', MENU);

    const entry = {
      id: `bot-${Date.now()}`,
      slug,
      title: d.title,
      summary: d.summary,
      body: `<p>${String(d.body).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, ' ')}</p>`,
      category: d.category || 'জাতীয়',
      publishedAt: new Date().toISOString(),
      tags: ['BNE ডেস্ক'],
      editorial: true,
      lead: false,
    };
    if (d.imageRel) entry.image = d.imageRel;

    ed.news.unshift(entry);
    await S.saveEditorial(ed, `feat(bot): নতুন সংবাদ "${d.title.slice(0, 50)}"`);

    /* GitHub Actions সাইট প্রকাশ করে ও সোশ্যালে পোস্ট করে */
    let dispatched = false;
    try { await S.dispatchWorkflow('deploy.yml'); dispatched = true; } catch (e) { /* পরের ক্রনেই হবে */ }

    await S.setChat(chatId, { mode: null, draft: null });

    return send(chatId,
      '✅ <b>প্রকাশিত!</b>\n\n' +
      `📰 <b>${L.esc(d.title)}</b>\n` +
      `🗂️ বিভাগ: ${L.esc(entry.category)}${entry.image ? ' · 🖼️ ছবিসহ' : ''}\n\n` +
      (dispatched
        ? '🔄 সাইট হালনাগাদ ও সোশ্যালে পোস্ট হতে ২–৫ মিনিট লাগবে।'
        : 'ℹ️ হালনাগাদ স্বয়ংক্রিয়ভাবে শুরু হয়েছে — ২–৫ মিনিট লাগবে।') + '\n\n' +
      `🔗 ${L.SITE_ORIGIN}/news/${encodeURIComponent(slug)}`,
      [[{ text: '📋 আমার সংবাদ', callback_data: 'list' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
  } catch (e) {
    return send(chatId, `⚠️ প্রকাশ করতে সমস্যা হলো: ${L.esc(e.message)}\n\nআবার চেষ্টা করুন বা "সাহায্য" লিখুন।`, MENU);
  }
}

async function showDraft(chatId, chat) {
  const d = chat.draft;
  const kb = [
    [{ text: '✅ প্রকাশ করুন', callback_data: 'publish' }, { text: '🗑️ বাতিল', callback_data: 'drop' }],
    [{ text: '🖼️ ছবি যোগ/বদল', callback_data: 'newimage' }],
  ];
  const body = '📋 <b>খসড়া প্রস্তুত</b>\n\n' +
    `📰 <b>${L.esc(d.title)}</b>\n\n${L.esc(d.summary)}\n\n` +
    `🗂️ বিভাগ: ${L.esc(d.category)}\n` +
    `${d.imageRel ? '🖼️ ছবি: ✅ যুক্ত হয়েছে' : '🖼️ ছবি: নেই (চাইলে পাঠান)'}\n\n` +
    '<i>ভালো লাগলে "✅ প্রকাশ করুন" চাপুন। বদলাতে চাইলে লিখে পাঠান — যেমন "শিরোনাম আরও শক্ত করো"।</i>';
  if (d.imageRel) {
    const url = `${L.SITE_ORIGIN}/${String(d.imageRel).replace(/^\/+/, '')}`;
    const r = await tg('sendPhoto', { chat_id: chatId, photo: url, caption: body, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
    if (r && r.ok) return r;
  }
  return send(chatId, body, kb);
}

/* ══════════════════════════════════════════════════════════════════════
   মূল পরিচালক
   ══════════════════════════════════════════════════════════════════════ */
async function handleAction(chatId, action, site) {
  const base = String(action || '').split(':')[0];

  switch (base) {
    case 'menu':
      return send(chatId, mainMenuText(), MENU);

    case 'help':
      return send(chatId, helpText(), MENU);

    case 'headlines': {
      const s = site || await L.loadSite();
      return viewHeadlines(chatId, s);
    }
    case 'hourly': {
      const s = site || await L.loadSite();
      return viewHourly(chatId, s);
    }
    case 'posted':
      return viewPosted(chatId);
    case 'ads': {
      const s = site || await L.loadSite();
      return viewAds(chatId, s);
    }
    case 'adview': {
      const s = site || await L.loadSite();
      return viewAdDetail(chatId, s, parseInt(action.split(':')[1], 10));
    }
    case 'daily':
      return viewDaily(chatId, site);

    case 'adslot': {
      const slot = action.split(':')[1];
      const chat = await S.getChat(chatId);
      return saveNewAd(chatId, slot, chat);
    }

    case 'adtoggle': {
      const s = site || await L.loadSite();
      const a = L.adList(s)[parseInt(action.split(':')[1], 10)];
      if (!a) return send(chatId, '⚠️ ওই নম্বরের বিজ্ঞাপন পাওয়া যায়নি।', MENU);
      await S.setAdOverride(a.key, { enabled: !a.enabled });
      return send(chatId,
        `${a.enabled ? '⛔' : '✅'} <b>${L.esc(String(a.title).slice(0, 50))}</b> — এখন <b>${a.enabled ? 'বন্ধ' : 'চালু'}</b> করা হলো।\n\n` +
        '<i>পরের হালনাগাদে সাইটে বসে যাবে।</i>',
        [[{ text: '🎯 তালিকায় ফিরে যান', callback_data: 'ads' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
    }

    case 'addel': {
      const s = site || await L.loadSite();
      const a = L.adList(s)[parseInt(action.split(':')[1], 10)];
      if (!a) return send(chatId, '⚠️ ওই নম্বরের বিজ্ঞাপন পাওয়া যায়নি।', MENU);
      await S.setAdOverride(a.key, { _deleted: true });
      return send(chatId,
        `🗑️ <b>${L.esc(String(a.title).slice(0, 50))}</b> — তালিকা থেকে বাদ দেওয়া হলো।\n\n` +
        '<i>পরের হালনাগাদে সাইট থেকেও সরে যাবে।</i>',
        [[{ text: '🎯 তালিকায় ফিরে যান', callback_data: 'ads' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
    }

    case 'adfield': {
      const [, idxStr, field] = action.split(':');
      const s = site || await L.loadSite();
      const a = L.adList(s)[parseInt(idxStr, 10)];
      if (!a) return send(chatId, '⚠️ ওই নম্বরের বিজ্ঞাপন পাওয়া যায়নি।', MENU);
      await S.setChat(chatId, { mode: 'await_ad_field', adKey: a.key, adField: field });
      const label = field === 'link' ? 'নতুন লিংক' : field === 'title' ? 'নতুন শিরোনাম' : 'নতুন ছবি';
      return send(chatId, `✏️ <b>${L.esc(String(a.title).slice(0, 50))}</b>\n\n${label} পাঠান।`,
        [[{ text: '⬅️ বাতিল', callback_data: `adview:${idxStr}` }]]);
    }

    case 'autotoggle': {
      const want = String(action).split(':')[1];
      const cur = await S.getSetting('autoPublish', false);
      const now = want === 'on' ? true : want === 'off' ? false : !cur;
      if (now !== cur) await S.setSetting('autoPublish', now);
      return send(chatId,
        now
          ? '⚡ <b>অটো-প্রকাশ চালু।</b>\n\nএখন থেকে ছবি + বিস্তারিত পাঠালেই সরাসরি প্রকাশ হয়ে যাবে — আলাদা অনুমোদন লাগবে না।\n\n<i>⚠️ তাই পাঠানোর আগে বানান ও ছবি একবার দেখে নিন।</i>'
          : '🐢 <b>অটো-প্রকাশ বন্ধ।</b>\n\nএখন আগের মতোই আমি খসড়া বানিয়ে প্রিভিউ দেখাব।',
        MENU);
    }

    case 'new':
      await S.setChat(chatId, { mode: 'await_details', kind: 'news' });
      return send(chatId,
        '📝 <b>নতুন সংবাদ</b>\n\nসংবাদের তথ্য লিখে পাঠান — যেমন ঘটনা, স্থান, সময়, কারা জড়িত।\n' +
        '<i>খুব ভাঙা বাংলায় লিখলেও চলবে, আমি গুছিয়ে লিখে দেব।</i>\n\n' +
        'চাইলে <b>একই মেসেজে ছবিও</b> সংযুক্ত করতে পারেন — তাহলে ছবিসহ প্রিভিউ তৈরি হবে।',
        [[{ text: '⬅️ ফিরে যান', callback_data: 'menu' }]]);

    case 'ad':
      await S.setChat(chatId, { mode: 'await_ad', kind: 'ad' });
      return send(chatId,
        '📢 <b>নতুন বিজ্ঞাপন</b>\n\nবিজ্ঞাপনের লেখা পাঠান (এবং চাইলে ছবি)।',
        [[{ text: '⬅️ ফিরে যান', callback_data: 'menu' }]]);

    case 'publish': {
      const chat = await S.getChat(chatId);
      return publishDraft(chatId, chat);
    }

    case 'drop':
      await S.setChat(chatId, { mode: null, draft: null });
      return send(chatId, '🗑️ খসড়া বাতিল করা হয়েছে।', MENU);

    case 'newimage':
      await S.setChat(chatId, { mode: 'await_image' });
      return send(chatId, '🖼️ খবরের জন্য ছবিটি পাঠান।');

    case 'list': {
      const ed = await S.getEditorial();
      const mine = (ed.news || []).filter((n) => n.editorial).slice(0, 10);
      if (!mine.length) return send(chatId, '📋 এখনো বট দিয়ে কোনো সংবাদ প্রকাশ করা হয়নি।', MENU);
      const lines = mine.map((n, i) =>
        `${L.bn(i + 1)}. <b>${L.esc(String(n.title).slice(0, 60))}</b>\n   <i>${L.esc(n.category || '')} · ${L.ageText(Math.round((Date.now() - Date.parse(n.publishedAt || 0)) / 60000))}</i>\n   ${L.SITE_ORIGIN}/news/${encodeURIComponent(n.slug)}`);
      return send(chatId, '📋 <b>আপনার প্রকাশিত সংবাদ</b>\n\n' + lines.join('\n\n'),
        [[{ text: '⬅️ মেনু', callback_data: 'menu' }]]);
    }

    case 'status': {
      const s = site || await L.loadSite();
      const auto = await S.getSetting('autoPublish', false);
      const ps = await L.postStatus();
      return send(chatId,
        '📊 <b>অবস্থা</b>\n\n' +
        `📰 সাইটে খবর: <b>${L.bn(s.news.length)}</b>টি\n` +
        `✍️ আপনার প্রকাশিত: <b>${L.bn((await S.getEditorial()).news.filter((n) => n.editorial).length)}</b>টি\n` +
        `🎯 বিজ্ঞাপন: <b>${L.bn(s.ads.length)}</b>টি (বন্ধ ${L.bn(s.ads.filter((a) => a.enabled === false).length)}টি)\n` +
        `📤 সর্বশেষ পোস্ট: ${ps.lastAny ? L.ageText(ps.lastAny.ageMin) : 'তথ্য নেই'}\n` +
        `⚡ অটো-প্রকাশ: ${auto ? '✅ চালু' : '⭕ বন্ধ'}\n\n` +
        `<i>সব কিছু Netlify-এর সার্ভারে চলছে — আপনার ল্যাপটপ বন্ধ থাকলেও কাজ করবে।</i>`,
        MENU);
    }

    case 'syncnow': {
      try {
        await S.dispatchWorkflow('sync-content.yml');
        return send(chatId, '⚡ <b>হালনাগাদ শুরু হয়েছে।</b>\n\n<i>১–৩ মিনিটে সাইটে বসে যাবে।</i>', MENU);
      } catch (e) {
        return send(chatId, `⚠️ হালনাগাদ চালু করা যায়নি: ${L.esc(e.message)}`, MENU);
      }
    }

    case 'approve': {
      const recId = action.split(':')[1];
      const act = REC_ACTIONS[recId];
      if (!act) return send(chatId, '🙏 এই পরামর্শটি নিজে থেকে করার মতো নয় — এখানে আপনার সিদ্ধান্ত প্রয়োজন।', MENU);
      if (act.run === 'enable_ads') {
        const s2 = site || await L.loadSite();
        const off = L.adList(s2).filter((a) => !a.enabled);
        if (!off.length) return send(chatId, '✅ বন্ধ অবস্থায় কোনো বিজ্ঞাপন নেই।', MENU);
        for (const a of off) await S.setAdOverride(a.key, { enabled: true });
        return send(chatId, `✅ <b>${L.bn(off.length)}টি বিজ্ঞাপন চালু করা হলো।</b>\n\n` +
          off.map((a) => `• ${L.esc(String(a.title).slice(0, 45))}`).join('\n') +
          '\n\n<i>পরের হালনাগাদে সাইটে বসবে।</i>',
          [[{ text: '⚡ এখনই হালনাগাদ', callback_data: 'syncnow' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
      }
      if (act.run === 'show_broken') {
        const s2 = site || await L.loadSite();
        const bad = L.adList(s2).filter((a) => a.enabled && !a.live);
        return send(chatId, '⚠️ <b>সাইটে ঠিকভাবে না বসা বিজ্ঞাপন</b>\n\n' +
          (bad.length ? bad.map((a) => `• ${L.esc(String(a.title).slice(0, 45))}`).join('\n') : '✅ কোনোটি নেই।'),
          [[{ text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
      }
      if (act.run === 'hint_publish') {
        return send(chatId, '📝 নতুন সংবাদ পাঠাতে "📝 নতুন সংবাদ" চাপুন, তারপর তথ্য (ও চাইলে ছবি) পাঠান।',
          [[{ text: '📝 নতুন সংবাদ', callback_data: 'new' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
      }
      return send(chatId, '✅ হয়েছে।', MENU);
    }

    default:
      return send(chatId, 'বুঝতে পারিনি। 🙂 নিচের বোতাম থেকে বেছে নিন, অথবা সোজা বাংলায় লিখুন — যেমন "এই ঘণ্টায় কী খবর এল"।', MENU);
  }
}

/* ── মেসেজ পরিচালনা ──────────────────────────────────────────────────── */
async function handleMessage(msg, site) {
  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || '';
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const chat = await S.getChat(chatId);
  const mode = chat.mode || null;

  /* ছবি সংরক্ষণ — Telegram-এর ফাইল সরাসরি রেপোতে রাখা যায় না, তাই
     আমাদের সাইটে অ্যাডমিনের পাঠানো ছবি ব্যবহার করার পথ: ছবিটি Telegram
     থেকেই দেখানো হয় এবং প্রিভিউতে file_id-এর বদলে আমাদের হোস্ট করা URL লাগে।
     সহজ ও নির্ভরযোগ্য সমাধান: Telegram file link ব্যবহার (নিচে)। */
  let imageInfo = null;
  if (hasPhoto) {
    const best = msg.photo[msg.photo.length - 1];
    imageInfo = { fileId: best.file_id, width: best.width, height: best.height };
  }

  /* মোড: বিজ্ঞাপনের ঘর বদলানো */
  if (mode === 'await_ad_field') {
    let value = String(text || '').trim();
    if (!value && imageInfo) value = await telegramFileUrl(imageInfo.fileId).catch(() => '');
    if (!value) return send(chatId, 'মান লিখে বা ছবি পাঠিয়ে দিন।');
    await S.setAdOverride(chat.adKey, { [chat.adField]: value });
    await S.setChat(chatId, { mode: null, adKey: null, adField: null });
    return send(chatId, '✅ <b>বিজ্ঞাপন হালনাগাদ হলো।</b>\n\n<i>পরের হালনাগাদে সাইটে বসবে।</i>',
      [[{ text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
  }

  /* মোড: খবরের ছবি */
  if (mode === 'await_image') {
    if (!imageInfo) return send(chatId, '🖼️ অনুগ্রহ করে ছবি হিসেবে পাঠান।');
    const url = await telegramFileUrl(imageInfo.fileId).catch(() => '');
    if (!url) return send(chatId, '⚠️ ছবিটি আনা যায়নি — আবার চেষ্টা করুন।');
    const draft = Object.assign({}, chat.draft || {}, { imageRel: url });
    await S.setChat(chatId, { mode: null, draft });
    return showDraft(chatId, { draft });
  }

  /* মোড: নতুন সংবাদ / বিজ্ঞাপন */
  if (mode === 'await_details' || mode === 'await_ad') {
    if (!text && !imageInfo) return send(chatId, 'সংবাদের তথ্য লিখে পাঠান, চাইলে ছবিসহ।');
    const kind = chat.kind || 'news';
    let imageRel = '';
    if (imageInfo) imageRel = await telegramFileUrl(imageInfo.fileId).catch(() => '');
    /* আগে শুধু ছবি পাঠানো হলে সেটি এখানে কাজে লাগানো হয় — আবার পাঠাতে হয় না */
    else if (chat.pendingImage) imageRel = await telegramFileUrl(chat.pendingImage).catch(() => '');

    const composed = composeFromText(text);
    const draft = {
      title: composed.title, summary: composed.summary, body: composed.body,
      category: kind === 'ad' ? 'বিজ্ঞাপন' : composed.category, kind, imageRel,
    };

    /* বিজ্ঞাপন হলে আগে জায়গা (স্লট) জিজ্ঞাসা করা হয় — নইলে সাইটে বসবে না */
    if (kind === 'ad') return askAdSlot(chatId, draft);

    await S.setChat(chatId, { mode: null, draft, pendingImage: null });
    if (imageRel && (await S.getSetting('autoPublish', false)) === true) {
      return publishDraft(chatId, { draft });
    }
    return showDraft(chatId, { draft });
  }

  /* সম্পাদনার নির্দেশ (খসড়া থাকা অবস্থায়) */
  if (chat.draft && text && !text.startsWith('/')) {
    const t = L.normalize(text);
    if (t.startsWith('শিরোনাম') || t.includes('শিরোনাম')) {
      const nt = String(text).replace(/^.*?শিরোনাম[^:：]*[:：]?\s*/, '').replace(/^শিরোনাম\s*(আরও\s*)?\w*\s*/, '').trim();
      if (nt && nt !== text) {
        const draft = Object.assign({}, chat.draft, { title: nt.slice(0, 110) });
        await S.setChat(chatId, { draft });
        return showDraft(chatId, { draft });
      }
    }
    if (t.includes('বিভাগ') || t.includes('ক্যাটাগরি')) {
      const m = String(text).match(/(বিভাগ|ক্যাটাগরি)\s*[:：]?\s*(\S+)/);
      if (m) {
        const draft = Object.assign({}, chat.draft, { category: m[2] });
        await S.setChat(chatId, { draft });
        return showDraft(chatId, { draft });
      }
    }
  }

  if (text.startsWith('/')) {
    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    const map = { '/start': 'menu', '/help': 'help', '/new': 'new', '/ad': 'ad', '/list': 'list',
      '/status': 'status', '/headlines': 'headlines', '/hourly': 'hourly', '/posted': 'posted',
      '/ads': 'ads', '/daily': 'daily', '/auto': 'autotoggle', '/sync': 'syncnow' };
    if (map[cmd]) return handleAction(chatId, map[cmd], site);
    return send(chatId, 'এই কমান্ডটি চিনি না। "❓ সাহায্য" চাপুন।', MENU);
  }

  if (text || imageInfo) {
    const parsed = L.parseIntent(text || '');
    const s = site || await L.loadSite();
    const wordCount = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    let intent = parsed.intent;
    /* ★ সহজ করার মূল সংশোধন ★
       আগের নিয়ম ছিল — ছবি ছাড়া লম্বা লেখা এলে সেটিকে "প্রশ্ন" ধরে নেওয়া
       হতো, ফলে সংবাদ হিসেবে খসড়া হতো না। ব্যবহারকারী তখন বুঝতেই পারতেন না
       কেন কিছু হচ্ছে না। এখন: লম্বা লেখা যদি স্পষ্ট প্রশ্ন না হয়, তবে সেটি
       সংবাদ হিসেবেই ধরা হয় — ছবি থাকুক বা না থাকুক। */
    if (wordCount > 15 && !L.STRONG.includes(intent)) {
      const looksQuestion = /[?？]/.test(String(text || ''))
        || /(কী|কি\b|কেন|কেমন|কত|কোথায়|কখন|কীভাবে|কিভাবে|করব|উচিত|হবে কি|বলুন)/.test(String(text || ''));
      intent = (imageInfo || !looksQuestion) ? 'news_text' : 'chat';
    }
    if (imageInfo && !L.STRONG.includes(intent) && intent !== 'chat') intent = 'news_text';

    switch (intent) {
      case 'headlines': case 'hourly': case 'posted': case 'ads':
      case 'daily': case 'status': case 'list': case 'help':
        return handleAction(chatId, intent, s);

      case 'ad_view': case 'ad_edit':
        return handleAction(chatId, `adview:${(parsed.number || 1) - 1}`, s);
      case 'ad_on': case 'ad_off': {
        const list = L.adList(s);
        const target = parsed.number ? list[parsed.number - 1] : (list.length === 1 ? list[0] : null);
        if (!target) return send(chatId, '🎯 কোন বিজ্ঞাপনটি বদলাব? নম্বরটি বলুন — যেমন "২ নম্বর বিজ্ঞাপন বন্ধ করো"।',
          [[{ text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }]]);
        return handleAction(chatId, `adtoggle:${target.index}`, s);
      }
      case 'ad_delete': {
        const list = L.adList(s);
        const target = parsed.number ? list[parsed.number - 1] : null;
        if (!target) return send(chatId, '🎯 কোন বিজ্ঞাপনটি মুছব? নম্বরটি বলুন।',
          [[{ text: '🎯 বিজ্ঞাপন তালিকা', callback_data: 'ads' }]]);
        return handleAction(chatId, `addel:${target.index}`, s);
      }
      case 'auto_on': return handleAction(chatId, 'autotoggle:on', s);
      case 'auto_off': return handleAction(chatId, 'autotoggle:off', s);
      case 'auto_status': {
        const auto = await S.getSetting('autoPublish', false);
        return send(chatId, `⚡ অটো-প্রকাশ এখন <b>${auto ? 'চালু' : 'বন্ধ'}</b>।`,
          [[{ text: '⚡ বদলান', callback_data: 'autotoggle' }, { text: '⬅️ মেনু', callback_data: 'menu' }]]);
      }
      case 'cancel':
        await S.setChat(chatId, { mode: null, draft: null });
        return send(chatId, '🗑️ বাতিল করা হলো।', MENU);
      case 'publish':
        return handleAction(chatId, 'publish', s);
      case 'new_news': return handleAction(chatId, 'new', s);
      case 'new_ad': return handleAction(chatId, 'ad', s);
      case 'approve': {
        const recs = (chat.recs || []).filter((x) => REC_ACTIONS[x.id]);
        if (!recs.length) {
          return send(chatId, '🙂 কী করতে চান বুঝতে পারিনি। "💡 পরামর্শ" চেপে দেখুন, অথবা লিখুন — যেমন "অটো চালু করো"।', MENU);
        }
        return handleAction(chatId, `approve:${recs[0].id}`, s);
      }
      case 'deny':
        return send(chatId, '👍 ঠিক আছে, এখন কিছু বদলাচ্ছি না।', MENU);
      case 'greeting':
        return send(chatId, 'ওয়া আলাইকুমুস সালাম 🙂\n\nআমি আপনার নিউজ পোর্টালের সহকারী। সোজা বাংলায় বলুন — যেমন:\n' +
          '• "এই ঘণ্টায় কী খবর এল?"\n• "আমার বিজ্ঞাপনগুলো দেখাও"\n• "সর্বশেষ কী ফেসবুকে গেল?"\n• "রিচ বাড়াতে কী করব?"\n\n' +
          '<i>নতুন সংবাদ দিতে চাইলে শুধু তথ্য লিখে (চাইলে ছবিসহ) পাঠিয়ে দিন।</i>', MENU);
      case 'chat':
        return send(chatId,
          '🧠 <b>গভীর আলোচনার অংশটি এখন সার্ভারে সীমিত।</b>\n\n' +
          'ওই অংশটি চলে আপনার মেশিনে থাকা ব্রেন দিয়ে (GPU ছাড়া, তাই ধীর)। ' +
          'সার্ভারে তা চালু করতে একটি ক্লাউড AI কী দরকার — তখন ২৪ ঘণ্টা, দ্রুত, ল্যাপটপ ছাড়াই কাজ করবে।\n\n' +
          '<i>আপাতত ছোট প্রশ্নের উত্তর নিচের বোতামগুলোতে পাবেন।</i>',
          [[{ text: '💡 পরামর্শ ও বিশ্লেষণ', callback_data: 'daily' }, { text: '📰 হেডলাইন', callback_data: 'headlines' }],
           [{ text: '⬅️ মেনু', callback_data: 'menu' }]]);
      case 'news_text':
      default: {
        const kind = 'news';
        let imageRel = '';
        if (imageInfo) imageRel = await telegramFileUrl(imageInfo.fileId).catch(() => '');

        /* বটের নিজের বার্তা কপি করে পাঠানো হলে সেটাকে খবর ভাবা উচিত নয় —
           আগে এভাবেই "দেখা কেমন হবে" জাতীয় ভুয়া শিরোনাম তৈরি হয়েছিল */
        if (text && (/খসড়া প্রস্তুত|প্রকাশ করার মতো খসড়া|এখন কার্সেলে যে খবরগুলো/.test(text)
            || /^(📋|📊|📰|📤|🎯|📦|🏠)/.test(String(text).trim()))) {
          return send(chatId, '🙂 এটি বটের নিজের বার্তা মনে হচ্ছে — এটা খবর হিসেবে নেওয়া যাবে না।\n\n' +
            'সংবাদের তথ্য সোজা বাংলায় লিখে পাঠান — ঘটনা, স্থান, কারা জড়িত।');
        }

        /* ছবি এসেছে কিন্তু কোনো লেখা নেই → ভুয়া শিরোনামে খসড়া নয়;
           সোজা লেখাটা চেয়ে নেওয়া হয় (আগে "ছবির সাথে পাঠানো সংবাদ" বসে যেত) */
        if (!text && imageInfo) {
          await S.setChat(chatId, { mode: 'await_details', kind: 'news', pendingImage: imageInfo.fileId });
          return send(chatId, '📷 ছবি পেয়েছি ✅\n\nএখন <b>সংবাদের লেখাটা</b> পাঠান — পাঠালেই প্রিভিউ আসবে, তারপর এক চাপে প্রকাশ।');
        }
        if (!text) {
          return send(chatId, '✍️ সংবাদের তথ্য লিখে পাঠান — ঘটনা, স্থান, কারা জড়িত।\n' +
            'চাইলে একই মেসেজে ছবিও দিন।');
        }

        const composed = composeFromText(text);
        const draft = { title: composed.title, summary: composed.summary, body: composed.body, category: composed.category, kind, imageRel };
        await S.setChat(chatId, { mode: null, draft, pendingImage: null });
        if (imageRel && (await S.getSetting('autoPublish', false)) === true) {
          return publishDraft(chatId, { draft });
        }
        return showDraft(chatId, { draft });
      }
    }
  }

  return send(chatId, mainMenuText(), MENU);
}

/** Telegram-এর ছবির লিংক বের করা (রেপোতে ফাইল রাখার দরকার নেই) */
async function telegramFileUrl(fileId) {
  const r = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  if (!j.ok) throw new Error('file path পাওয়া যায়নি');
  return `https://api.telegram.org/file/bot${TOKEN}/${j.result.file_path}`;
}

/* ══════════════════════════════════════════════════════════════════════
   Netlify Function — এন্ট্রি পয়েন্ট
   ══════════════════════════════════════════════════════════════════════ */
exports.handler = async (event) => {
  /* Telegram যে গোপন হেডার পাঠায় — নইলে যে কেউ বট সেজে নির্দেশ দিতে পারত */
  if (SECRET) {
    const got = (event.headers || {})['x-telegram-bot-api-secret-token']
      || (event.headers || {})['X-Telegram-Bot-Api-Secret-Token'];
    if (got !== SECRET) {
      console.warn('⛔ ভুল বা অনুপস্থিত secret token — অনুরোধ ফিরিয়ে দেওয়া হলো');
      return { statusCode: 401, body: 'unauthorized' };
    }
  }

  let update;
  try { update = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: 'bad json' }; }

  try {
    const msg = update.message || update.edited_message;
    const cb = update.callback_query;

    if (cb) {
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      const fromId = String((cb.from || {}).id || '');
      await tg('answerCallbackQuery', { callback_query_id: cb.id });

      if (ADMINS.length && !ADMINS.includes(fromId)) {
        await send(chatId, '⛔ এই বট কেবল অ্যাডমিনের জন্য।');
        return { statusCode: 200, body: 'ok' };
      }
      /* পুনরাবৃত্তি আটকাতে বোতামের ডেটা একবারই কাজ করে */
      try {
        const site = await L.loadSite();
        await handleAction(chatId, cb.data, site);
      } catch (e) {
        console.error('callback ব্যর্থ:', e.message);
        await send(chatId, `⚠️ কাজটি করতে সমস্যা হলো: ${L.esc(e.message)}`, MENU);
      }
      return { statusCode: 200, body: 'ok' };
    }

    if (msg) {
      const chatId = msg.chat.id;
      const fromId = String((msg.from || {}).id || '');

      if (ADMINS.length && !ADMINS.includes(fromId)) {
        await send(chatId, '⛔ এই বট কেবল অ্যাডমিনের জন্য।\n<i>আপনার আইডি: ' + L.esc(fromId) + '</i>');
        return { statusCode: 200, body: 'ok' };
      }
      try {
        const site = await L.loadSite();
        await handleMessage(msg, site);
      } catch (e) {
        console.error('message ব্যর্থ:', e.message);
        await send(chatId, `⚠️ সমস্যা হলো: ${L.esc(e.message)}\n\nআবার চেষ্টা করুন বা "সাহায্য" লিখুন।`, MENU);
      }
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('webhook ত্রুটি:', e);
    return { statusCode: 200, body: 'ok' };   /* Telegram-কে সবসময় 200 দিতে হয় */
  }
};
