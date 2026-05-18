require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// PRODUCTION STATE
// =====================
const engine = {
  mode: "PAPER", // NEVER AUTO-LIVE
  positions: {},
  tradesToday: 0,
  maxTrades: 20
};

// =====================
// RISK CONTROLS (PRODUCTION GRADE)
// =====================
const risk = {
  maxOrderUSD: 200,
  minConfidence: 65
};

// =====================
// EXCHANGE CONNECTOR (BINANCE)
// =====================
async function placeOrder(symbol, side, quantity) {

  // 🧪 PAPER MODE FIRST
  if (engine.mode === "PAPER") {
    return {
      mode: "PAPER",
      symbol,
      side,
      quantity,
      status: "simulated"
    };
  }

  // 🔥 LIVE MODE (REAL EXCHANGE)
  try {
    const res = await axios.post(
      "https://api.binance.com/api/v3/order",
      new URLSearchParams({
        symbol,
        side,
        type: "MARKET",
        quantity: quantity.toString()
      }),
      {
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_API_KEY
        }
      }
    );

    return res.data;

  } catch (err) {
    return { error: err.message };
  }
}

// =====================
// MARKET DATA
// =====================
async function getPrice(id) {
  try {
    const r = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );

    return {
      price: r.data[id]?.usd,
      change: r.data[id]?.usd_24h_change || 0
    };
  } catch {
    return null;
  }
}

// =====================
// AI SIGNAL ENGINE
// =====================
function analyze(change) {

  let confidence = 50;

  if (change > 5) confidence += 30;
  if (change > 2) confidence += 15;
  if (change < -5) confidence -= 30;

  let action = "HOLD";

  if (confidence >= 75) action = "BUY";
  if (confidence <= 25) action = "SELL";

  return {
    action,
    confidence,
    volatility: Math.abs(change)
  };
}

// =====================
// RISK ENGINE (PRODUCTION SAFETY)
// =====================
function riskCheck(confidence, usdSize) {

  if (engine.tradesToday >= engine.maxTrades) {
    return { ok: false, reason: "Daily trade limit reached" };
  }

  if (confidence < risk.minConfidence) {
    return { ok: false, reason: "Confidence too low" };
  }

  if (usdSize > risk.maxOrderUSD) {
    return { ok: false, reason: "Order too large" };
  }

  return { ok: true };
}

// =====================
// EXECUTION ENGINE
// =====================
async function execute(symbol, price, signal) {

  const usdSize = (signal.confidence / 100) * risk.maxOrderUSD;
  const qty = usdSize / price;

  const check = riskCheck(signal.confidence, usdSize);
  if (!check.ok) {
    console.log("🛑 BLOCKED:", check.reason);
    return;
  }

  const order = await placeOrder(symbol, signal.action, qty);

  engine.tradesToday++;

  console.log(
`⚙️ EXECUTION
Symbol: ${symbol}
Action: ${signal.action}
Confidence: ${signal.confidence}
Size: $${usdSize.toFixed(2)}
Mode: ${engine.mode}`
  );

  return order;
}

// =====================
// SCANNER LOOP
// =====================
setInterval(async () => {

  const assets = [
    { id: "bitcoin", symbol: "BTCUSDT" },
    { id: "ethereum", symbol: "ETHUSDT" },
    { id: "solana", symbol: "SOLUSDT" }
  ];

  for (const a of assets) {

    const data = await getPrice(a.id);
    if (!data) continue;

    const signal = analyze(data.change);

    console.log(
`📡 ${a.symbol}
Price: $${data.price}
Signal: ${signal.action}
Confidence: ${signal.confidence}`
    );

    await execute(a.symbol, data.price, signal);
  }

}, 120000);

// =====================
// TELEGRAM CONTROL PANEL
// =====================

bot.command("status", (ctx) => {
  ctx.reply(
`🏦 TENEO PRODUCTION CORE

Mode: ${engine.mode}
Trades Today: ${engine.tradesToday}/${engine.maxTrades}
Max Order: $${risk.maxOrderUSD}`
  );
});

// SAFE MODE
bot.command("paper", (ctx) => {
  engine.mode = "PAPER";
  ctx.reply("🧪 PAPER MODE ENABLED");
});

// LIVE MODE (PROTECTED)
bot.command("live", (ctx) => {

  if (!process.env.BINANCE_API_KEY) {
    return ctx.reply("❌ Missing BINANCE_API_KEY");
  }

  engine.mode = "LIVE";
  ctx.reply("⚠️ LIVE TRADING ENABLED");
});

// RESET DAILY
bot.command("reset", (ctx) => {
  engine.tradesToday = 0;
  ctx.reply("🔄 DAILY RESET DONE");
});

// =====================
// START
// =====================
bot.launch();
console.log("🏦 TENEO PRODUCTION EXCHANGE CORE v13 ACTIVE (PAPER MODE)");
