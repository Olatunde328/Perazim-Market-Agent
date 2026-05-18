require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { Telegraf } = require("telegraf");

// =====================
// EXPRESS HEALTH SERVER
// =====================
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
  res.send("🧠 TENEO Production Core Active");
});

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

app.listen(PORT, () => {
  log(`🌐 Health server running on ${PORT}`);
});

// =====================
// TELEGRAM BOT
// =====================
const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// LOGGING SYSTEM
// =====================
function log(...msg) {
  console.log(
    `[${new Date().toISOString()}]`,
    ...msg
  );
}

// =====================
// SAFE API FETCH
// =====================
async function safeFetch(url, retries = 3) {

  for (let i = 0; i < retries; i++) {

    try {

      const res = await axios.get(url, {
        timeout: 10000
      });

      return res.data;

    } catch (err) {

      log(`⚠️ API FAIL (${i + 1}/${retries})`);

      if (i === retries - 1) {
        throw err;
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// =====================
// MARKET FETCHER
// =====================
async function getPrice(id) {

  try {

    const data = await safeFetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );

    return {
      price: data[id]?.usd,
      change: data[id]?.usd_24h_change || 0
    };

  } catch (err) {

    log(`❌ PRICE FETCH FAILED: ${id}`);

    return null;
  }
}

// =====================
// SIGNAL ENGINE
// =====================
function signal(change) {

  let action = "WAIT";
  let confidence = 50;

  if (change > 5) {
    action = "BUY";
    confidence = 85;
  }

  else if (change > 2) {
    action = "WEAK BUY";
    confidence = 65;
  }

  else if (change < -5) {
    action = "SELL";
    confidence = 85;
  }

  else if (change < -2) {
    action = "WEAK SELL";
    confidence = 65;
  }

  return { action, confidence };
}

// =====================
// MAIN ENGINE LOOP
// =====================
async function scanner() {

  const assets = [
    { id: "bitcoin", symbol: "BTC" },
    { id: "ethereum", symbol: "ETH" },
    { id: "solana", symbol: "SOL" }
  ];

  for (const a of assets) {

    try {

      const data = await getPrice(a.id);

      if (!data) continue;

      const sig = signal(data.change);

      log(
`📡 ${a.symbol}
$${data.price}
→ ${sig.action} (${sig.confidence}%)`
      );

    } catch (err) {

      log(`❌ SCANNER FAILURE: ${a.symbol}`);
    }
  }
}

// =====================
// SAFE INTERVAL LOOP
// =====================
setInterval(async () => {

  try {

    await scanner();

  } catch (err) {

    log("🔥 LOOP FAILURE:", err.message);
  }

}, 120000);

// =====================
// TELEGRAM COMMANDS
// =====================
bot.command("status", async (ctx) => {

  await ctx.reply(
`🧠 TENEO PRODUCTION CORE

Status: ONLINE
Uptime: ${Math.floor(process.uptime())} sec
Mode: Railway Production`
  );
});

bot.command("ping", async (ctx) => {
  await ctx.reply("🏓 pong");
});

bot.command("health", async (ctx) => {
  await ctx.reply("✅ system healthy");
});

// =====================
// BOT LAUNCH
// =====================
bot.launch()
  .then(() => {
    log("🚀 Telegram Bot Online");
  })
  .catch(err => {
    log("❌ BOT LAUNCH FAILED:", err.message);
  });

// =====================
// GLOBAL ERROR HANDLERS
// =====================
process.on("unhandledRejection", err => {
  log("🔥 UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  log("🔥 UNCAUGHT EXCEPTION:", err);
});

// =====================
// GRACEFUL SHUTDOWN
// =====================
process.once("SIGINT", () => {
  log("🛑 SIGINT RECEIVED");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  log("🛑 SIGTERM RECEIVED");
  bot.stop("SIGTERM");
});

log("🛡️ TENEO RAILWAY HARDENED CORE ACTIVE");

