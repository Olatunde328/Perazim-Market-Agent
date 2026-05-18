require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.command("id", (ctx) => {
  ctx.reply("Your ID is: " + ctx.from.id);
});
// =====================
// RESILIENCE CORE STATE
// =====================
const queue = [];          // message retry queue
let isBotAlive = true;

// =====================
// GLOBAL ERROR SAFETY
// =====================
process.on("uncaughtException", (err) => {
  console.log("⚠️ CRASH CAUGHT:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.log("⚠️ PROMISE ERROR:", err?.message || err);
});

// =====================
// SAFE SEND LAYER (RESILIENCE CORE)
// =====================
async function safeSend(userId, message, retry = 0) {
  try {
    await bot.telegram.sendMessage(userId, message);
  } catch (err) {

    console.log("⚠️ SEND FAILED:", err.message);

    // retry queue (max 3 attempts)
    if (retry < 3) {
      queue.push({ userId, message, retry: retry + 1 });
    }
  }
}

// =====================
// RETRY ENGINE (AUTO RECOVERY)
// =====================
setInterval(async () => {

  if (queue.length === 0) return;

  const job = queue.shift();

  try {
    await bot.telegram.sendMessage(job.userId, job.message);
  } catch (err) {
    console.log("♻️ RETRY FAILED:", err.message);

    if (job.retry < 3) {
      queue.push({ ...job, retry: job.retry + 1 });
    }
  }

}, 5000);

// =====================
// CONNECTION HEALTH LOOP
// =====================
setInterval(async () => {

  try {
    await bot.telegram.getMe();

    if (!isBotAlive) {
      console.log("🔄 BOT RECOVERED");
      isBotAlive = true;
    }

  } catch (err) {

    isBotAlive = false;

    console.log("⚠️ TELEGRAM DOWN DETECTED:", err.message);
  }

}, 30000);

// =====================
// PRICE ENGINE (SAFE)
// =====================
async function getPrice(id) {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
      { timeout: 15000 }
    );

    return {
      price: res.data[id]?.usd,
      change: res.data[id]?.usd_24h_change || 0
    };

  } catch {
    return null;
  }
}

// =====================
// SIMPLE SIGNAL ENGINE (KEEP YOUR CORE SAFE)
// =====================
function getSignal(change) {

  let score = 50;

  if (change > 6) score += 30;
  if (change > 3) score += 15;
  if (change < -6) score -= 30;
  if (change < -3) score -= 15;

  let signal = "WAIT";
  if (score >= 72) signal = "BUY";
  if (score <= 28) signal = "SELL";

  return {
    signal,
    confidence: score,
    trend: score > 50 ? "BULLISH" : "BEARISH"
  };
}

// =====================
// SCANNER LOOP (RESILIENT)
// =====================
setInterval(async () => {

  const coins = [
    { id: "bitcoin", symbol: "BTC" },
    { id: "ethereum", symbol: "ETH" },
    { id: "solana", symbol: "SOL" }
  ];

  for (const coin of coins) {

    const data = await getPrice(coin.id);
    if (!data) continue;

    const signal = getSignal(data.change);

    console.log(
`📡 ${coin.symbol}
$${data.price}
→ ${signal.signal} (${signal.confidence}%)`
    );

    // SAFE MESSAGE SEND (NO CRASH)
    await safeSend(
      process.env.ADMIN_ID,
`📡 SIGNAL UPDATE

${coin.symbol}: $${data.price}
Signal: ${signal.signal}
Confidence: ${signal.confidence}%`
    );
  }

}, 120000);

// =====================
// BOT START
// =====================
bot.launch()
  .then(() => console.log("🛡️ Teneo v7.1 Resilience Layer ACTIVE"))
  .catch(err => console.log("BOT LAUNCH ERROR:", err.message));
