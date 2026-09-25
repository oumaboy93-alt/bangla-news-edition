'use strict';
/**
 * BNE — সময়সূচি চালক (Netlify Scheduled Function)
 * ════════════════════════════════════════════════════════════════════════
 * ★ সমস্যা যা এটি সমাধান করে ★
 * GitHub Actions-এর নিজের সময়সূচি (cron) কার্যকর নয় — GitHub নিষ্ক্রিয়
 * রিপোতে সময়সূচি "throttled" করে দেয়। পরিমাপে দেখা গেছে: প্রতি ৫ মিনিটের
 * সময়সূচি লেখা থাকলেও আসলে ২–৩.৫ ঘণ্টায় একবার চলত। ফলে নতুন সংবাদ
 * সাইটে পৌঁছাতে ঘণ্টার পর ঘণ্টা লাগত।
 *
 * আর ল্যাপটপের launchd চালকটির সমস্যা — ল্যাপটপ বন্ধ থাকলে সে-ও থেমে যায়।
 *
 * এই ফাংশনটি Netlify-এর সার্ভারে চলে, যা ২৪ ঘণ্টা চালু। এটি GitHub-এর
 * `workflow_dispatch` ব্যবহার করে, যা throttled হয় না — সাথে সাথে চলে।
 *
 * ভারসাম্য (রিসোর্স নষ্ট না করে):
 *   • কনটেন্ট সিঙ্ক   → প্রতি ১৫ মিনিট
 *   • সোশ্যাল পোস্টার → প্রতি ৩০ মিনিট (অতিরিক্ত পোস্ট ঠেকাতে)
 *   • দৈনিক রিপোর্ট   → প্রতিদিন সকাল ৯টা (ঢাকা সময়)
 *
 * ⚠️ কেন শুধু `utcMin % 30` দিয়ে ঠিক করা হয়নি:
 *    Netlify কখনো কয়েক সেকেন্ড/মিনিট দেরিতে ফাংশন চালায়, তখন শর্ত ফসকে যেত
 *    এবং একবারও পোস্ট হত না। তাই শেষ চালানোর সময় মনে রাখা হয় ("শেষবার
 *    থেকে ২৫ মিনিট পার হয়েছে?") — দেরি হলেও কাজটি হয়।
 */

const S = require('./_bot-store');
const L = require('./_bot-lib');

const DAILY_HOUR_DHAKA = Number(process.env.BOT_DAILY_HOUR || '9');

/** ঢাকার সময় (UTC+6) — Netlify UTC-তে চলে, তাই যোগ করা হয় */
function dhakaNow() { return new Date(Date.now() + 6 * 3600 * 1000); }

function fmt(d) { return d.toISOString().slice(0, 16).replace('T', ' '); }

async function dispatch(workflow) {
  try {
    await S.dispatchWorkflow(workflow);
    console.log(`✅ ${workflow} চালু করা হলো`);
    return true;
  } catch (e) {
    console.error(`⚠️ ${workflow} চালু করা যায়নি:`, e.message);
    return false;
  }
}

exports.handler = async () => {
  const out = { at: new Date().toISOString(), dhaka: fmt(dhakaNow()), actions: [] };

  if (!S.TOKEN) {
    console.error('❌ GITHUB_TOKEN নেই — কিছুই চালু করা যাবে না');
    return { statusCode: 500, body: JSON.stringify({ error: 'GITHUB_TOKEN missing' }) };
  }

  let st = {};
  try { st = (await S.getState()) || {}; } catch (e) { st = {}; }
  st.settings = st.settings || {};
  const now = Date.now();

  /* ── ১) কনটেন্ট সিঙ্ক ─────────────────────────────────────────────── */
  const lastSync = st.settings.lastSyncAt || 0;
  if (now - lastSync >= 12 * 60 * 1000) {          /* দেরি হলেও বাদ যাবে না */
    if (await dispatch('sync-content.yml')) {
      st.settings.lastSyncAt = now;
      out.actions.push('sync');
    }
  } else {
    out.actions.push('sync-skipped');
  }

  /* ── ২) সোশ্যাল পোস্টার (প্রতি ৩০ মিনিট) ─────────────────────────── */
  const lastPost = st.settings.lastPosterAt || 0;
  if (now - lastPost >= 25 * 60 * 1000) {
    if (await dispatch('social-auto-post.yml')) {
      st.settings.lastPosterAt = now;
      out.actions.push('poster');
    }
  }

  /* ── ৩) দৈনিক রিপোর্ট (ঢাকার সকাল ৯টা) ──────────────────────────── */
  const dh = dhakaNow();
  const today = `${dh.getUTCFullYear()}-${dh.getUTCMonth() + 1}-${dh.getUTCDate()}`;
  if (dh.getUTCHours() === DAILY_HOUR_DHAKA && st.settings.lastDailyReportDate !== today) {
    st.settings.lastDailyReportDate = today;       /* আগেই লিখে রাখা — দুইবার না যাওয়ার জন্য */
    out.actions.push('daily-flag');
    try {
      await sendDailyReport();
      out.actions.push('daily-sent');
    } catch (e) {
      console.error('দৈনিক রিপোর্ট ব্যর্থ:', e.message);
    }
  }

  try { await S.writeFile('data/bot-state.json', st, 'chore(bot): সময়সূচির অবস্থা [skip ci]'); }
  catch (e) { console.error('অবস্থা লেখা যায়নি:', e.message); }

  console.log('tick:', JSON.stringify(out));
  return { statusCode: 200, body: JSON.stringify(out) };
};

/* ── দৈনিক রিপোর্ট পাঠানো ─────────────────────────────────────────────── */
const REC_ACTIONS = {
  ads_off: { label: 'বন্ধ বিজ্ঞাপনগুলো চালু করো' },
  ads_broken: { label: 'সমস্যাযুক্ত বিজ্ঞাপন দেখা' },
  no_posts: { label: 'এখনই একটি খবর প্রকাশ করো' },
};

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
  } else {
    parts.push('✅ এখন কোনো বড় সমস্যা চোখে পড়ছে না — সব ঠিক চলছে।');
  }
  return parts.join('\n');
}

async function sendDailyReport() {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const admins = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!TOKEN || !admins.length) throw new Error('টেলিগ্রাম সেটিং নেই');

  const r = await L.dailyReport();
  const kb = [];
  r.recommendations.slice(0, 4).forEach((x) => {
    if (REC_ACTIONS[x.id]) kb.push([{ text: `✅ ${REC_ACTIONS[x.id].label}`, callback_data: `approve:${x.id}` }]);
  });
  kb.push([{ text: '🔄 আবার বিশ্লেষণ', callback_data: 'daily' }, { text: '🏠 মেনু', callback_data: 'menu' }]);

  for (const admin of admins) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: admin,
        text: '🌅 <b>শুভ সকাল!</b>\n\nআজকের হিসাব ও করণীয় নিচে দিলাম — একটা চোখ বুলিয়ে নিন।\n\n' + renderDaily(r),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: kb },
      }),
      signal: AbortSignal.timeout(12000),
    });
  }
}
