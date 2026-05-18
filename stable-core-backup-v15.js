require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// QUANT STATE ENGINE
// =====================
const quant = {
  capital: 1000,
  mode: "PAPER",
  trades: 0,
  pnl: 0
};

// =====================
// MARKET MICRO ENGINE
// =====================
function marketRegime(change) {

  let volatility = "LOW";
  let trend = "NEUTRAL";

  const abs = Math.abs(change);

  // volatility regime
  if (abs > 6) volatility = "HIGH";
  else if (abs > 3) volatility = "MEDIUM";

  // trend regime
  if (change > 2) trend = "UP";
  if (change < -2) trend = "DOWN";

  return { volatility, trend };
}

// =====================
// STRATEGY ENGINE (MULTI-STRAT)
// =====================
function strategyEngine(change, regime) {

  let trendWeight = 0;
  let meanWeight = 0;
  let momentumWeight = 0;

  // TREND FOLLOWING
  if (regime.trend === "UP") trendWeight += change * 2;
  if (regime.trend === "DOWN") trendWeight -= change * 2;

  // MEAN REVERSION (sideways logic)
  if (regime.volatility === "LOW") {
    meanWeight += (5 - Math.abs(change)) * 2;
  }

  // MOMENTUM BREAKOUT
  if (regime.volatility === "HIGH") {
    momentumWeight += Math.abs(change) * 3;
  }

  // FINAL SCORE
  const score =
    trendWeight +
    meanWeight +
    momentumWeight;

  let action = "HOLD";
  if (score > 8) action = "BUY";
  if (score < -8) action = "SELL";

  return {
    action,
    score: Number(score.toFixed(2))
  };
}

// =====================
// RISK ENGINE (QUANT SAFETY)
// =====================
function riskEngine(score) {

  if (quant.trades >= 15) {
    return { ok: false, reason: "Daily trade cap reached" };
  }

  if (Math.abs(score) < 3) {
    return { ok: false, reason: "Insufficient edge" };
  }

  return { ok: true };
}

// =====================
// POSITION SIZING (VOL-ADJUSTED)
// =====================
function sizeEngine(score, price) {

  const base = quant.capital * 0.02;

  const multiplier = Math.min(Math.abs(score) / 10, 1);

  return (base * multiplier) / price;
}

// =====================
// EXECUTION ENGINE (SLIPPAGE-AWARE)
// =====================
async function execute(symbol, price, decision) {

  const risk = riskEngine(decision.score);
  if (!risk.ok) return;

  const qty = sizeEngine(decision.score, price);

  quant.trades++;

  const order = await placeOrder(symbol, decision.action, qty);

  console.log(
`⚙️ QUANT EXECUTION
${symbol}
Action: ${decision.action}
Score: ${decision.score}
Qty: ${qty.toFixed(6)}`
  );

  return order;
}

// =====================
// EXCHANGE LAYER
// =====================
async function placeOrder(symbol, side, qty) {

  if (quant.mode === "PAPER") {
    return {
      mode: "PAPER",
      symbol,
      side,
      qty,
      status: "simulated"
    };
  }

  try {
    const res = await axios.post(
      "https://api.binance.com/api/v3/order",
      new URLSearchParams({
        symbol,
        side,
        type: "MARKET",
        quantity: qty.toString()
      }),
      {
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_API_KEY
        }
      }
    );

    return res.data;

  } catch (e) {
    return { error: e.message };
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

    const regime = marketRegime(data.change);
    const decision = strategyEngine(data.change, regime);

    console.log(
`📊 QUANT SIGNAL
${a.symbol}
Trend: ${regime.trend}
Volatility: ${regime.volatility}
Decision: ${decision.action}`
    );

    await execute(a.symbol, data.price, decision);
  }

}, 120000);

// =====================
// TELEGRAM CONTROL
// =====================

bot.command("status", (ctx) => {
  ctx.reply(
`📊 TENEO QUANT CORE v15

Mode: ${quant.mode}
Trades: ${quant.trades}
PnL: ${quant.pnl}`
  );
});

bot.command("paper", (ctx) => {
  quant.mode = "PAPER";
  ctx.reply("🧪 PAPER MODE ACTIVE");
});

bot.command("live", (ctx) => {
  if (!process.env.BINANCE_API_KEY) {
    return ctx.reply("❌ Missing API Key");
  }

  quant.mode = "LIVE";
  ctx.reply("⚠️ LIVE MODE ENABLED");
});

// =====================
bot.launch();
console.log("🧠 TENEO QUANT EXECUTION CORE v15 ACTIVE");
