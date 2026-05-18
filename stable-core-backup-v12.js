require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// INSTITUTIONAL STATE
// =====================
const fund = {
  capital: 1000,
  exposure: {},
  pnl: {},
  dailyDrawdown: 0,
  tradesToday: 0,
  mode: "PAPER"
};

// =====================
// INSTITUTIONAL LIMITS
// =====================
const limits = {
  maxExposurePerAsset: 0.25, // 25%
  maxDailyLoss: 0.05,        // 5%
  maxTradesPerDay: 15
};

// =====================
// MARKET DATA LAYER
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
// INSTITUTIONAL SIGNAL ENGINE
// =====================
function analyze(change) {

  let trend = "NEUTRAL";
  let strength = 50;

  if (change > 5) {
    trend = "BULLISH";
    strength += 30;
  }

  if (change > 2) strength += 10;

  if (change < -5) {
    trend = "BEARISH";
    strength -= 30;
  }

  if (change < -2) strength -= 10;

  return {
    trend,
    strength,
    volatility: Math.abs(change)
  };
}

// =====================
// PORTFOLIO ALLOCATOR (INSTITUTIONAL)
// =====================
function allocate(asset, signal) {

  const weight = signal.strength / 100;

  const allocation = fund.capital * weight * limits.maxExposurePerAsset;

  return allocation;
}

// =====================
// RISK ENGINE (HEDGE FUND STYLE)
// =====================
function riskCheck(allocation) {

  if (fund.tradesToday >= limits.maxTradesPerDay) {
    return { ok: false, reason: "Daily trade limit reached" };
  }

  if (fund.dailyDrawdown >= limits.maxDailyLoss) {
    return { ok: false, reason: "Max drawdown hit" };
  }

  if (allocation <= 5) {
    return { ok: false, reason: "Allocation too small" };
  }

  return { ok: true };
}

// =====================
// EXECUTION ENGINE (PAPER DEFAULT)
// =====================
async function execute(asset, price, signal) {

  const allocation = allocate(asset, signal);
  const risk = riskCheck(allocation);

  if (!risk.ok) {
    console.log("🛑 BLOCKED:", risk.reason);
    return;
  }

  const positionSize = allocation / price;

  fund.tradesToday++;

  console.log(
`🏦 EXECUTION
Asset: ${asset}
Trend: ${signal.trend}
Allocation: $${allocation.toFixed(2)}
Size: ${positionSize.toFixed(4)}`
  );

  return {
    asset,
    allocation,
    positionSize,
    mode: fund.mode
  };
}

// =====================
// SCANNER LOOP (INSTITUTIONAL)
// =====================
setInterval(async () => {

  const assets = [
    { id: "bitcoin", symbol: "BTC" },
    { id: "ethereum", symbol: "ETH" },
    { id: "solana", symbol: "SOL" }
  ];

  for (const a of assets) {

    const data = await getPrice(a.id);
    if (!data) continue;

    const signal = analyze(data.change);

    console.log(
`📊 ${a.symbol}
Price: $${data.price}
Trend: ${signal.trend}
Strength: ${signal.strength}`
    );

    await execute(a.symbol, data.price, signal);
  }

}, 120000);

// =====================
// TELEGRAM CONTROL PANEL
// =====================

bot.command("status", (ctx) => {

  ctx.reply(
`🏦 TENEO INSTITUTIONAL CORE

Capital: $${fund.capital}
Mode: ${fund.mode}
Trades Today: ${fund.tradesToday}/${limits.maxTradesPerDay}
Max Exposure: ${(limits.maxExposurePerAsset * 100)}%`
  );
});

// MODE SWITCH
bot.command("paper", (ctx) => {
  fund.mode = "PAPER";
  ctx.reply("🧪 PAPER MODE ENABLED");
});

bot.command("live", (ctx) => {
  fund.mode = "LIVE";
  ctx.reply("⚠️ LIVE MODE ENABLED");
});

// RESET DAY (SIMULATION)
bot.command("reset", (ctx) => {
  fund.tradesToday = 0;
  fund.dailyDrawdown = 0;
  ctx.reply("🔄 DAILY RESET COMPLETE");
});

// =====================
// START
// =====================
bot.launch();
console.log("🏦 TENEO INSTITUTIONAL AI CORE v12 ACTIVE");
