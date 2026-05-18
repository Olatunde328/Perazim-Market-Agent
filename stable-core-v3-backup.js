require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

const bot = new Telegraf(process.env.BOT_TOKEN);
const engine = new EventEmitter();

// =====================
// STATE (PORTFOLIO CORE)
// =====================
const state = {
  lastUpdate: {},
  portfolio: {} // userId -> trades
};

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
// AI SIGNAL ENGINE v3
// =====================
function getSignal(change) {

  let score = 50;
  let signal = "WAIT";

  if (change > 6) score += 35;
  if (change > 3) score += 15;
  if (change < -6) score -= 35;
  if (change < -3) score -= 15;

  if (score >= 75) signal = "BUY";
  if (score <= 25) signal = "SELL";

  return {
    signal,
    confidence: Math.max(0, Math.min(100, score)),
    trend: score > 50 ? "BULLISH" : score < 50 ? "BEARISH" : "SIDEWAYS"
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
// PORTFOLIO ENGINE (NEW)
// =====================
engine.on("signal", async (data) => {

  if (data.signal.confidence < 60) return;

  const key = data.coin;

  if (state.lastUpdate[key] &&
      Date.now() - state.lastUpdate[key] < 30000) return;

  state.lastUpdate[key] = Date.now();

  engine.emit("trade", data);
});

// =====================
// TRADE EXECUTION + PORTFOLIO TRACKING
// =====================
engine.on("trade", async (data) => {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];

    if (!list.includes(data.coin.toLowerCase())) continue;

    // INIT PORTFOLIO
    if (!state.portfolio[userId]) {
      state.portfolio[userId] = [];
    }

    // SIMULATED TRADE ENTRY
    const trade = {
      coin: data.coin,
      entry: data.price,
      signal: data.signal.signal,
      confidence: data.signal.confidence,
      time: Date.now()
    };

    state.portfolio[userId].push(trade);

    await bot.telegram.sendMessage(
      userId,
`💼 PORTFOLIO ENTRY (v3)

${data.coin}
Entry: $${data.price}
Signal: ${data.signal.signal}
Confidence: ${data.signal.confidence}%

📊 Trade recorded`
    );
  }
});

// =====================
// PORTFOLIO COMMAND (NEW)
// =====================
bot.command("portfolio", (ctx) => {

  const userId = ctx.from.id;
  const trades = state.portfolio[userId] || [];

  if (!trades.length) {
    return ctx.reply("📭 No trades in portfolio yet");
  }

  let msg = "💼 YOUR PORTFOLIO\n\n";

  for (const t of trades.slice(-10)) {

    msg += `${t.coin}
Entry: $${t.entry}
Signal: ${t.signal}
Confidence: ${t.confidence}%

`;
  }

  ctx.reply(msg);
});

// =====================
// MARKET COMMAND
// =====================
bot.command("market", async (ctx) => {

  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET v3\n\n";

  for (const id of coins) {
    const d = await getPrice(id);
    if (!d) continue;

    msg += `${id.toUpperCase()}: $${d.price} | ${getSignal(d.change).confidence}%\n`;
  }

  ctx.reply(msg);
});

// =====================
// START
// =====================
bot.launch();
console.log("🚀 Teneo Protocol v3 Portfolio Engine Running");
