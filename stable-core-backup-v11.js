require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// EXCHANGE AI STATE
// =====================
const state = {
  positions: {},
  dailyTrades: 0,
  maxDailyTrades: 10,
  mode: "PAPER" // change to LIVE later
};

// =====================
// RISK ENGINE (CRITICAL)
// =====================
function riskCheck(userId, size) {

  if (state.dailyTrades >= state.maxDailyTrades) {
    return { ok: false, reason: "Daily trade limit reached" };
  }

  if (size > 200) {
    return { ok: false, reason: "Position too large" };
  }

  return { ok: true };
}

// =====================
// EXCHANGE CONNECTOR (BINANCE STYLE MOCK)
// =====================
async function placeOrder(symbol, side, amount) {

  // ⚠️ SAFE MODE FIRST
  if (state.mode === "PAPER") {
    return {
      success: true,
      mode: "PAPER",
      symbol,
      side,
      amount,
      price: Math.random() * 1000
    };
  }

  // LIVE MODE (placeholder for Binance API)
  try {
    const res = await axios.post(
      "https://api.binance.com/api/v3/order",
      {
        symbol,
        side,
        type: "MARKET",
        quantity: amount
      },
      {
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_KEY
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
// AI DECISION ENGINE
// =====================
function decisionEngine(change) {

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
// POSITION SIZING ENGINE
// =====================
function positionSize(confidence, price) {

  const baseRisk = 100;

  const multiplier = confidence / 100;

  return baseRisk * multiplier;
}

// =====================
// MAIN SCANNER LOOP
// =====================
setInterval(async () => {

  const coins = [
    { id: "bitcoin", symbol: "BTCUSDT" },
    { id: "ethereum", symbol: "ETHUSDT" },
    { id: "solana", symbol: "SOLUSDT" }
  ];

  for (const c of coins) {

    const data = await getPrice(c.id);
    if (!data) continue;

    const decision = decisionEngine(data.change);
    const size = positionSize(decision.confidence, data.price);

    console.log(
`📡 ${c.symbol}
Price: $${data.price}
Action: ${decision.action}
Confidence: ${decision.confidence}%`
    );

    if (decision.action === "HOLD") continue;

    const risk = riskCheck(c.symbol, size);
    if (!risk.ok) {
      console.log("🛑 RISK BLOCKED:", risk.reason);
      continue;
    }

    const order = await placeOrder(
      c.symbol,
      decision.action,
      size / data.price
    );

    state.dailyTrades++;

    console.log("📦 ORDER RESULT:", order);
  }

}, 120000);

// =====================
// TELEGRAM COMMANDS
// =====================

// MODE SWITCH
bot.command("mode", (ctx) => {
  ctx.reply(`⚙️ MODE: ${state.mode}`);
});

// ENABLE LIVE TRADING (PROTECTED)
bot.command("live", (ctx) => {

  if (!process.env.BINANCE_KEY) {
    return ctx.reply("❌ Binance API key missing");
  }

  state.mode = "LIVE";
  ctx.reply("⚠️ LIVE TRADING ENABLED");
});

// BACK TO SAFE MODE
bot.command("paper", (ctx) => {
  state.mode = "PAPER";
  ctx.reply("🧪 PAPER MODE ENABLED");
});

// STATUS
bot.command("status", (ctx) => {

  ctx.reply(
`📊 TENEO EXCHANGE AI

Mode: ${state.mode}
Daily Trades: ${state.dailyTrades}/${state.maxDailyTrades}`
  );
});

// =====================
// START
// =====================
bot.launch();
console.log("🚀 TENEO EXCHANGE AI BRAIN v11 ACTIVE (PAPER MODE)");
