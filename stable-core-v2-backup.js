require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

const bot = new Telegraf(process.env.BOT_TOKEN);
const engine = new EventEmitter();

const state = { lastUpdate: {} };
const watchlists = {};
const alerts = {};

// =====================
// STORAGE
// =====================
function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file)); }
  catch { return fallback; }
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =====================
// PRICE ENGINE
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

  } catch (err) {
    console.log("⚠️ API timeout:", id);
    return null;
  }
}

// =====================
// AI SIGNAL ENGINE v2
// =====================
function getSignal(change) {

  let score = 50;
  let signal = "WAIT";
  let trend = "SIDEWAYS";

  // momentum scoring
  if (change > 8) score += 40;
  else if (change > 5) score += 25;
  else if (change > 2) score += 10;

  if (change < -8) score -= 40;
  else if (change < -5) score -= 25;
  else if (change < -2) score -= 10;

  // direction mapping
  if (score >= 75) {
    signal = "BUY";
    trend = "BULLISH";
  } else if (score <= 25) {
    signal = "SELL";
    trend = "BEARISH";
  }

  return {
    signal,
    confidence: Math.max(0, Math.min(100, score)),
    trend
  };
}

// =====================
// SCANNER
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
`📡 ${coin.symbol}: $${data.price}
→ ${signal.signal} (${signal.confidence}%)
→ ${signal.trend}`
    );

    engine.emit("signal", {
      coin: coin.symbol,
      price: data.price,
      signal
    });
  }

}, 120000);

// =====================
// RISK LAYER
// =====================
engine.on("signal", async (data) => {

  if (data.signal.confidence < 60) return;

  const key = data.coin;

  if (state.lastUpdate[key] && Date.now() - state.lastUpdate[key] < 30000) return;
  state.lastUpdate[key] = Date.now();

  engine.emit("trade", data);
});

// =====================
// ACTION LAYER
// =====================
engine.on("trade", async (data) => {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];

    if (list.includes(data.coin.toLowerCase())) {

      await bot.telegram.sendMessage(
        userId,
`🧠 AI SIGNAL v2

${data.coin}
Price: $${data.price}

Signal: ${data.signal.signal}
Confidence: ${data.signal.confidence}/100
Trend: ${data.signal.trend}`
      );
    }
  }
});

// =====================
// COMMANDS
// =====================
bot.command("market", async (ctx) => {

  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET v2\n\n";

  for (const id of coins) {
    const d = await getPrice(id);
    if (!d) continue;
    msg += `${id.toUpperCase()}: $${d.price} | ${getSignal(d.change).confidence}%\n`;
  }

  ctx.reply(msg);
});

bot.command("leaderboard", (ctx) => {
  ctx.reply("🏆 AI SCORE RANKING\nBTC > ETH > SOL (v2 Engine)");
});

bot.launch();
console.log("🚀 Teneo Protocol v2 AI Brain Running");
