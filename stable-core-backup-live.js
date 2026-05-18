require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// FUND STATE
// =====================
const fund = {
  capital: 1000,
  mode: "PAPER",
  trades: 0,
  exposure: {
    BTC: 0,
    ETH: 0,
    SOL: 0
  }
};

// =====================
// CORRELATION MATRIX (SIMPLIFIED)
// =====================
const correlation = {
  BTC: { ETH: 0.85, SOL: 0.75 },
  ETH: { BTC: 0.85, SOL: 0.80 },
  SOL: { BTC: 0.75, ETH: 0.80 }
};

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
// SIGNAL ENGINE
// =====================
function signalEngine(change) {

  let score = 50;

  if (change > 5) score += 30;
  if (change > 2) score += 10;
  if (change < -5) score -= 30;

  let action = "HOLD";
  if (score > 75) action = "BUY";
  if (score < 25) action = "SELL";

  return { score, action };
}

// =====================
// PORTFOLIO ALLOCATION ENGINE
// =====================
function allocatePortfolio(signals) {

  const assets = Object.keys(signals);

  let allocations = {};

  let totalScore = 0;

  for (const a of assets) {
    totalScore += signals[a].score;
  }

  for (const a of assets) {

    let weight = signals[a].score / totalScore;

    // reduce weight if highly correlated exposure exists
    for (const b of assets) {
      if (a !== b) {
        weight -= correlation[a][b] * 0.1;
      }
    }

    weight = Math.max(weight, 0.05);

    allocations[a] = weight * fund.capital;
  }

  return allocations;
}

// =====================
// RISK ENGINE
// =====================
function riskCheck(allocation) {

  const totalExposure = Object.values(allocation)
    .reduce((a, b) => a + b, 0);

  if (totalExposure > fund.capital * 1.2) {
    return { ok: false, reason: "Overexposure detected" };
  }

  return { ok: true };
}

// =====================
// EXECUTION ENGINE
// =====================
async function executePortfolio(prices, signals) {

  const allocation = allocatePortfolio(signals);

  const risk = riskCheck(allocation);
  if (!risk.ok) {
    console.log("🛑 PORTFOLIO BLOCKED:", risk.reason);
    return;
  }

  for (const asset in allocation) {

    const usd = allocation[asset];
    const price = prices[asset].price;

    const qty = usd / price;

    fund.trades++;

    const order = await placeOrder(asset, signals[asset].action, qty);

    console.log(
`🏦 PORTFOLIO TRADE
Asset: ${asset}
Allocation: $${usd.toFixed(2)}
Qty: ${qty.toFixed(6)}
Action: ${signals[asset].action}`
    );
  }
}

// =====================
// EXCHANGE LAYER
// =====================
async function placeOrder(symbol, side, qty) {

  if (fund.mode === "PAPER") {
    return { mode: "PAPER", symbol, side, qty };
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
// SCANNER LOOP
// =====================
setInterval(async () => {

  const assets = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana"
  };

  let prices = {};
  let signals = {};

  for (const key in assets) {

    const data = await getPrice(assets[key]);
    if (!data) continue;

    prices[key] = data;
    signals[key] = signalEngine(data.change);
  }

  await executePortfolio(prices, signals);

}, 120000);

// =====================
// TELEGRAM CONTROL PANEL
// =====================

bot.command("status", (ctx) => {
  ctx.reply(
`🏦 TENEO QUANT FUND v16

Mode: ${fund.mode}
Trades: ${fund.trades}`
  );
});

bot.command("paper", (ctx) => {
  fund.mode = "PAPER";
  ctx.reply("🧪 PAPER MODE ACTIVE");
});

bot.command("live", (ctx) => {

  if (!process.env.BINANCE_API_KEY) {
    return ctx.reply("❌ Missing Binance API Key");
  }

  fund.mode = "LIVE";
  ctx.reply("⚠️ LIVE TRADING ENABLED");
});

bot.command("reset", (ctx) => {
  fund.trades = 0;
  ctx.reply("🔄 FUND RESET DONE");
});

// =====================
bot.launch();
console.log("🏦 TENEO QUANT FUND ENGINE v16 ACTIVE");
