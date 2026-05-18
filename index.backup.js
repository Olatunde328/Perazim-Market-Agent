require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const OpenAI = require("openai");

// =====================
// BOT SETUP
// =====================

const bot = new Telegraf(process.env.BOT_TOKEN);

const priceHistory = {
  btc: [],
  eth: [],
  sol: []
};

const alerts = {};
const watchlists = {};
const memory = {};
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================
// ERROR HANDLER
// =====================

bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

// =====================
// AI MARKET INSIGHT
// =====================

async function aiMarketInsight(name, price, change) {

  if (change > 5) {
    return `${name} is showing explosive bullish momentum.`;
  }

  if (change > 2) {
    return `${name} market sentiment is currently bullish.`;
  }

  if (change < -5) {
    return `${name} is under strong bearish pressure.`;
  }

  if (change < -2) {
    return `${name} sentiment is currently bearish.`;
  }

  return `${name} market is relatively neutral right now.`;
}

// =====================
// ANALYZE ASSET
// =====================

async function analyzeAsset(name, url, ctx) {
  try {
    const res = await axios.get(url);

    const price = res.data?.market_data?.current_price?.usd;

    const change =
      res.data?.market_data?.price_change_percentage_24h || 0;

    if (!price) {
      return ctx.reply("❌ Market data unavailable");
    }

    const trend =
      change > 2
        ? "Bullish 📈"
        : change < -2
        ? "Bearish 📉"
        : "Neutral ⚖️";

    const insight = await aiMarketInsight(name, price, change);

    return ctx.reply(
`📊 ${name} MARKET UPDATE

💰 Price: $${price}
📈 24h Change: ${change.toFixed(2)}%
📊 Trend: ${trend}

🤖 AI Insight:
${insight}`
    );
  } catch (err) {
    console.error(err);
    return ctx.reply("⚠️ Failed to fetch market data");
  }
}

// =====================
// START
// =====================

bot.start((ctx) => {
  ctx.reply(
`🚀 Teneo AI Agent Online

Commands:
/price btc
/price eth
/price sol
/market
/ping
/chatid`
  );
});

// =====================
// PING
// =====================

bot.command("ping", (ctx) => {
  ctx.reply("🏓 Pong!");
});

// =====================
// CHAT ID
// =====================

bot.command("chatid", (ctx) => {
  ctx.reply(`🆔 Chat ID: ${ctx.chat.id}`);
});

// =====================
// PRICE COMMAND
// =====================

bot.command("price", async (ctx) => {
  const args = ctx.message.text.split(" ");

  const asset = args[1]?.toLowerCase();

  if (!asset) {
    return ctx.reply("❌ Usage: /price btc | eth | sol");
  }

  if (asset === "btc") {
    return analyzeAsset(
      "BTC",
      "https://api.coingecko.com/api/v3/coins/bitcoin",
      ctx
    );
  }

  if (asset === "eth") {
    return analyzeAsset(
      "ETH",
      "https://api.coingecko.com/api/v3/coins/ethereum",
      ctx
    );
  }

  if (asset === "sol") {
    return analyzeAsset(
      "SOL",
      "https://api.coingecko.com/api/v3/coins/solana",
      ctx
    );
  }

  return ctx.reply("❌ Use btc, eth, or sol");
});

// =====================
// MARKET COMMAND
// =====================

bot.command("market", async (ctx) => {
  return analyzeAsset(
    "BTC",
    "https://api.coingecko.com/api/v3/coins/bitcoin",
    ctx
  );
});
bot.command("watch", (ctx) => {

  const args = ctx.message.text.split(" ");

  const coin = args[1]?.toLowerCase();

  if (!coin) {
    return ctx.reply("❌ Usage: /watch btc");
  }

  const userId = ctx.from.id;

  if (!watchlists[userId]) {
    watchlists[userId] = [];
  }

  if (!watchlists[userId].includes(coin)) {
    watchlists[userId].push(coin);
  }

  ctx.reply(`👀 Added ${coin.toUpperCase()} to your watchlist`);
});

bot.command("watchlist", (ctx) => {

  const userId = ctx.from.id;

  const list = watchlists[userId] || [];

  if (!list.length) {
    return ctx.reply("📭 Watchlist empty");
  }

  ctx.reply(
`👀 Your Watchlist

${list.map(c => `• ${c.toUpperCase()}`).join("\n")}`
  );
});
bot.command("remember", (ctx) => {

  const text = ctx.message.text.replace("/remember", "").trim();

  if (!text) {
    return ctx.reply("❌ Usage: /remember something");
  }

  const userId = ctx.from.id;

  memory[userId] = text;

  ctx.reply("🧠 Memory saved");
});

bot.command("memory", (ctx) => {

  const userId = ctx.from.id;

  const mem = memory[userId];

  if (!mem) {
    return ctx.reply("🧠 No memory stored");
  }

  ctx.reply(`🧠 Memory:\n${mem}`);
});
bot.command("setalert", (ctx) => {

  const args = ctx.message.text.split(" ");

  const coin = args[1]?.toLowerCase();
  const target = Number(args[2]);

  if (!coin || !target) {
    return ctx.reply("❌ Usage: /setalert btc 100000");
  }

  const userId = ctx.from.id;

  if (!alerts[userId]) {
    alerts[userId] = [];
  }

  alerts[userId].push({
    coin,
    target,
  });

  ctx.reply(
`🚨 Alert set

Coin: ${coin.toUpperCase()}
Target: $${target}`
  );
});

bot.command("alerts", (ctx) => {

  const userId = ctx.from.id;

  const userAlerts = alerts[userId] || [];

  if (!userAlerts.length) {
    return ctx.reply("📭 No active alerts");
  }

  ctx.reply(
`🚨 Your Alerts

${userAlerts.map(
a => `• ${a.coin.toUpperCase()} → $${a.target}`
).join("\n")}`
  );
});
// =====================
// LAUNCH
// =====================

const lastPrices = {};
const cooldowns = {};

setInterval(async () => {

  try {

    const coins = [
      { id: "bitcoin", symbol: "btc" },
      { id: "ethereum", symbol: "eth" },
      { id: "solana", symbol: "sol" }
    ];

    for (const coin of coins) {

      const res = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coin.id}`
      );

      const price =
        res.data?.market_data?.current_price?.usd;

      const change24h =
        res.data?.market_data?.price_change_percentage_24h || 0;

      if (!price) continue;

      console.log(`📡 ${coin.symbol.toUpperCase()} Scan: $${price}`);

      // =========================
      // AI SIGNAL ENGINE
      // =========================

      let signal = "HOLD";
      let confidence = 50;

      if (change24h > 5) {
        signal = "BUY";
        confidence = 82;
      }

      if (change24h < -5) {
        signal = "SELL";
        confidence = 80;
      }

      // =========================
      // VOLATILITY DETECTION
      // =========================

      const previousPrice = lastPrices[coin.symbol];

      if (previousPrice) {

        const movement =
          ((price - previousPrice) / previousPrice) * 100;

        if (Math.abs(movement) >= 3) {

          const key = `${coin.symbol}_volatility`;

          const now = Date.now();

          if (
            !cooldowns[key] ||
            now - cooldowns[key] > 30 * 60 * 1000
          ) {

            cooldowns[key] = now;

            for (const userId in watchlists) {

              const list = watchlists[userId] || [];

              if (list.includes(coin.symbol)) {

                await bot.telegram.sendMessage(
                  userId,
`🔥 VOLATILITY ALERT

${coin.symbol.toUpperCase()}
Move: ${movement.toFixed(2)}%

Signal: ${signal}
Confidence: ${confidence}%`
                );
              }
            }
          }
        }
      }

      lastPrices[coin.symbol] = price;

      // =========================
      // ALERT SYSTEM
      // =========================

      for (const userId in alerts) {

        const userAlerts = alerts[userId] || [];

        for (const alert of userAlerts) {

          if (alert.coin === coin.symbol) {

            if (price >= alert.target) {

              await bot.telegram.sendMessage(
                userId,
`🚨 ALERT TRIGGERED

${coin.symbol.toUpperCase()} hit $${price}

Signal: ${signal}
Confidence: ${confidence}%`
              );

              alerts[userId] = userAlerts.filter(
                a => a !== alert
              );
            }
          }
        }
      }

      // =========================
      // WATCHLIST UPDATES
      // =========================

      for (const userId in watchlists) {

        const list = watchlists[userId] || [];

        if (list.includes(coin.symbol)) {

          const key = `${userId}_${coin.symbol}`;

          const now = Date.now();

          if (
            !cooldowns[key] ||
            now - cooldowns[key] > 60 * 60 * 1000
          ) {

            cooldowns[key] = now;

            await bot.telegram.sendMessage(
              userId,
`👀 WATCHLIST UPDATE

${coin.symbol.toUpperCase()}
💰 Price: $${price}
📊 24h: ${change24h.toFixed(2)}%

📡 Signal: ${signal}
🎯 Confidence: ${confidence}%`
            );
          }
        }
      }
    }

  } catch (err) {

    console.error("SCAN ENGINE ERROR:", err);
  }

}, 60000);
bot.launch();

console.log("✅ Teneo AI Agent Running");
