require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// HEDGE FUND STATE
// =====================
const fund = {
  mode: "PAPER",
  equity: 1000,
  exposure: {},
  positions: {},
  pnl: 0,
  trades: 0
};

// =====================
// LIMITS (RISK DESK RULES)
// =====================
const limits = {
  maxRiskPerTrade: 0.03,   // 3%
  maxExposure: 0.25,       // 25%
  maxDailyTrades: 20
};

// =====================
// STRATEGY DESK (IDEAS ONLY)
// =====================
function strategyDesk(change) {

  let bias = "NEUTRAL";
  let confidence = 50;

  if (change > 5) {
    bias = "BULLISH";
    confidence += 35;
  }

  if (change > 2) confidence += 10;

  if (change < -5) {
    bias = "BEARISH";
    confidence -= 35;
  }

  if (change < -2) confidence -= 10;

  return { bias, confidence };
}

// =====================
// RISK DESK (FINAL AUTHORITY)
// =====================
function riskDesk(signal) {

  if (fund.trades >= limits.maxDailyTrades) {
    return { ok: false, reason: "Daily trade limit hit" };
  }

  if (signal.confidence < 65) {
    return { ok: false, reason: "Low confidence trade" };
  }

  return { ok: true };
}

// =====================
// POSITION SIZING (INSTITUTIONAL)
// =====================
function positionSizer(confidence) {

  const riskCapital = fund.equity * limits.maxRiskPerTrade;

  return riskCapital * (confidence / 100);
}

// =====================
// EXECUTION DESK
// =====================
async function execute(symbol, price, signal) {

  const approved = riskDesk(signal);
  if (!approved.ok) {
    console.log("🛑 REJECTED:", approved.reason);
    return;
  }

  const sizeUSD = positionSizer(signal.confidence);
  const qty = sizeUSD / price;

  fund.trades++;

  const order = await placeOrder(symbol, signal.bias, qty);

  console.log(
`⚙️ EXECUTION DESK
${symbol}
Bias: ${signal.bias}
Confidence: ${signal.confidence}
Size: $${sizeUSD.toFixed(2)}`
  );

  return order;
}

// =====================
// EXCHANGE LAYER
// =====================
async function placeOrder(symbol, side, qty) {

  if (fund.mode === "PAPER") {
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

    const signal = strategyDesk(data.change);

    console.log(
`📊 STRATEGY DESK
${a.symbol}
Bias: ${signal.bias}
Confidence: ${signal.confidence}`
    );

    await execute(a.symbol, data.price, signal);
  }

}, 120000);

// =====================
// TELEGRAM CONTROL ROOM
// =====================

bot.command("status", (ctx) => {
  ctx.reply(
`🏦 TENEO HEDGE FUND v14

Mode: ${fund.mode}
Equity: $${fund.equity}
Trades: ${fund.trades}/${limits.maxDailyTrades}
Risk/Trade: ${(limits.maxRiskPerTrade * 100)}%`
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
  ctx.reply("🔄 DAILY RESET COMPLETE");
});

// =====================
// START
// =====================
bot.launch();
console.log("🏦 TENEO HEDGE FUND EXECUTION ENGINE v14 ACTIVE");
