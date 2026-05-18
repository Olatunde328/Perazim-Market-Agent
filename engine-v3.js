require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// STORAGE
// =====================

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const alerts = loadJSON("alerts.json", {});
const watchlists = loadJSON("watchlists.json", {});
const memories = loadJSON("memory.json", {});
const lastPrices = loadJSON("prices.json", {});
const cooldowns = loadJSON("cooldowns.json", {});
const signalBoard = {};

// =====================
// BASIC COMMANDS
// =====================

bot.start((ctx) => {
  ctx.reply("🚀 Teneo AI Agent V3 Active");
});

bot.command("ping", (ctx) => {
  ctx.reply("🏓 Pong");
});

// =====================
// PRICE COMMAND
// =====================

bot.command("price", async (ctx) => {

  try {

    const args = ctx.message.text.split(" ");
    const asset = args[1]?.toLowerCase();

    const map = {
      btc: "bitcoin",
      eth: "ethereum",
      sol: "solana"
    };

    if (!map[asset]) {
      return ctx.reply("❌ Use /price btc | eth | sol");
    }

      `https://api.coingecko.com/api/v3/coins/${coin.id}`
);
let res;

try {

  res = await axios.get(
    `https://api.coingecko.com/api/v3/coins/${coin.id}`,
    {
      timeout: 10000
    }
  );

} catch (apiErr) {

  console.log(`⚠️ ${coin.symbol.toUpperCase()} API timeout`);

  continue;
}
    const data = res.data.market_data;

    ctx.reply(
`📊 ${asset.toUpperCase()} PRICE

💰 Price: $${data.current_price.usd}
📈 24h: ${data.price_change_percentage_24h.toFixed(2)}%`
    );

  } catch (err) {
    console.error(err);
    ctx.reply("❌ Failed to fetch price");
  }
});

// =====================
// WATCHLIST
// =====================

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

  saveJSON("watchlists.json", watchlists);

  ctx.reply(`👀 Added ${coin.toUpperCase()} to watchlist`);
});

bot.command("watchlist", (ctx) => {

  const userId = ctx.from.id;

  const list = watchlists[userId] || [];

  if (!list.length) {
    return ctx.reply("📭 Watchlist empty");
  }

  ctx.reply(
`👀 Watchlist

${list.map(c => "• " + c.toUpperCase()).join("\n")}`
  );
});

// =====================
// ALERTS
// =====================

bot.command("setalert", (ctx) => {

  const args = ctx.message.text.split(" ");

  const coin = args[1]?.toLowerCase();
  const target = Number(args[2]);

  if (!coin || !target) {
    return ctx.reply("❌ Usage: /setalert btc 120000");
  }

  const userId = ctx.from.id;

  if (!alerts[userId]) {
    alerts[userId] = [];
  }

  alerts[userId].push({
    coin,
    target
  });

  saveJSON("alerts.json", alerts);

  ctx.reply(
`🚨 Alert Set

${coin.toUpperCase()} → $${target}`
  );
});

bot.command("alerts", (ctx) => {

  const userId = ctx.from.id;

  const userAlerts = alerts[userId] || [];

  if (!userAlerts.length) {
    return ctx.reply("📭 No active alerts");
  }

  ctx.reply(
`🚨 Active Alerts

${userAlerts.map(
a => `• ${a.coin.toUpperCase()} → $${a.target}`
).join("\n")}`
  );
});

// =====================
// MEMORY
// =====================

bot.command("remember", (ctx) => {

  const text = ctx.message.text.replace("/remember", "").trim();

  if (!text) {
    return ctx.reply("❌ Usage: /remember text");
  }

  const userId = ctx.from.id;

  if (!memories[userId]) {
    memories[userId] = [];
  }

  memories[userId].push(text);

  saveJSON("memory.json", memories);

  ctx.reply("🧠 Memory saved");
});

bot.command("memory", (ctx) => {

  const userId = ctx.from.id;

  const mem = memories[userId] || [];

  if (!mem.length) {
    return ctx.reply("📭 No memory stored");
  }

  ctx.reply(
`🧠 Memory

${mem.join("\n")}`
  );
});

// =====================
// LEADERBOARD
// =====================

bot.command("leaderboard", (ctx) => {

  const data = Object.entries(signalBoard);

  if (!data.length) {
    return ctx.reply("📭 No signals yet");
  }

  const ranked = data
    .sort((a, b) => b[1].confidence - a[1].confidence)
    .map(
      ([coin, info]) =>
`${coin.toUpperCase()}
Signal: ${info.signal}
Confidence: ${info.confidence}%`
    )
    .join("\n\n");

  ctx.reply(`🏆 SIGNAL LEADERBOARD\n\n${ranked}`);
});

// =====================
// SCAN ENGINE
// =====================

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

      console.log(`📡 ${coin.symbol.toUpperCase()} Scan: $${price}`);

      let signal = "HOLD";
      let confidence = 50;
      let trend = "Neutral";

      if (change24h > 7) {
        signal = "STRONG BUY";
        confidence = 90;
        trend = "Bullish";
      }
      else if (change24h > 3) {
        signal = "BUY";
        confidence = 75;
        trend = "Bullish";
      }
      else if (change24h < -7) {
        signal = "STRONG SELL";
        confidence = 90;
        trend = "Bearish";
      }
      else if (change24h < -3) {
        signal = "SELL";
        confidence = 75;
        trend = "Bearish";
      }

      signalBoard[coin.symbol] = {
        signal,
        confidence,
        trend
      };

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

      saveJSON("prices.json", lastPrices);
      saveJSON("cooldowns.json", cooldowns);

      // ALERTS

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

              saveJSON("alerts.json", alerts);
            }
          }
        }
      }
    }

  } catch (err) {
    console.error("SCAN ENGINE ERROR:", err);
  }

}, 60000);

// =====================
// LAUNCH
// =====================

bot.launch();

console.log("✅ Teneo AI Agent V3 Running");
