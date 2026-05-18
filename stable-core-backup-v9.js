require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// TENEO STATE ENGINE
// =====================
const state = {
  portfolio: {},
  bias: {},
  lastUpdate: {},
  equity: {}
};

const watchlists = {};

// =====================
// RESILIENCE LAYER
// =====================
process.on("uncaughtException", (e) => console.log("CRASH:", e.message));
process.on("unhandledRejection", (e) => console.log("PROMISE ERROR:", e?.message));

// retry-safe send
async function safeSend(id, msg) {
  if (!id) return;
  try {
    await bot.telegram.sendMessage(id, msg);
  } catch (e) {
    console.log("SEND FAIL:", e.message);
  }
}

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
// TENEO SIGNAL BRAIN
// =====================
function signalBrain(change) {

  let score = 50;

  if (change > 6) score += 30;
  if (change > 3) score += 15;
  if (change < -6) score -= 30;
  if (change < -3) score -= 15;

  let signal = "WAIT";
  if (score >= 72) signal = "BUY";
  if (score <= 28) signal = "SELL";

  return {
    signal,
    confidence: score,
    volatility: Math.abs(change)
  };
}

// =====================
// STRATEGY BRAIN
// =====================
function strategyBrain(change) {

  if (Math.abs(change) < 2) return "MEAN";
  if (change > 2) return "TREND";
  if (change < -2) return "SCALP";

  return "SWING";
}

// =====================
// RISK ENGINE
// =====================
function riskEngine(confidence, volatility) {

  const base = 100;

  const risk = (confidence / 100) * (1 / (1 + volatility));

  return base * risk;
}

// =====================
// SCANNER LOOP
// =====================
setInterval(async () => {

  const coins = [
    { id: "bitcoin", symbol: "BTC" },
    { id: "ethereum", symbol: "ETH" },
    { id: "solana", symbol: "SOL" }
  ];

  for (const c of coins) {

    const data = await getPrice(c.id);
    if (!data) continue;

    const sig = signalBrain(data.change);
    const strat = strategyBrain(data.change);
    const size = riskEngine(sig.confidence, sig.volatility);

    console.log(
`📡 ${c.symbol}
$${data.price}
Signal: ${sig.signal} (${sig.confidence}%)
Strategy: ${strat}`
    );

    engineRoute({
      coin: c.symbol,
      price: data.price,
      sig,
      strat,
      size
    });
  }

}, 120000);

// =====================
// ENGINE ROUTER
// =====================
function engineRoute(d) {

  if (d.sig.confidence < 60) return;
  if (d.sig.volatility < 1.5) return;

  executeTrade(d);
}

// =====================
// EXECUTION + PORTFOLIO
// =====================
async function executeTrade(d) {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];
    if (!list.includes(d.coin.toLowerCase())) continue;

    if (!state.portfolio[userId]) {
      state.portfolio[userId] = [];
    }

    const trade = {
      coin: d.coin,
      entry: d.price,
      signal: d.sig.signal,
      strategy: d.strat,
      size: d.size,
      pnl: 0,
      closed: false,
      time: Date.now()
    };

    state.portfolio[userId].push(trade);

    await safeSend(userId,
`🧠 TENEO PROTOCOL CORE

${d.coin}
Price: $${d.price}

Signal: ${d.sig.signal}
Strategy: ${d.strat}
Size: $${d.size.toFixed(2)}`
    );
  }
}

// =====================
// PnL ENGINE
// =====================
setInterval(async () => {

  for (const userId in state.portfolio) {

    const trades = state.portfolio[userId];

    for (const t of trades) {

      if (t.closed) continue;

      const data = await getPrice(t.coin.toLowerCase());
      if (!data) continue;

      let pnl = ((data.price - t.entry) / t.entry) * 100;

      if (t.signal === "SELL") pnl = -pnl;

      t.pnl = pnl;

      state.equity[userId] =
        (state.equity[userId] || 0) + pnl;

      if (pnl >= 5 || pnl <= -3) {

        t.closed = true;

        await safeSend(userId,
`📊 TRADE CLOSED

${t.coin}
PnL: ${pnl.toFixed(2)}%
Strategy: ${t.strategy}`
        );
      }
    }
  }

}, 60000);

// =====================
// COMMANDS
// =====================
bot.command("portfolio", (ctx) => {

  const id = ctx.from.id;
  const trades = state.portfolio[id] || [];

  ctx.reply(
`💼 TENEO PORTFOLIO

Trades: ${trades.length}
Active: ${trades.filter(t => !t.closed).length}`
  );
});

bot.command("equity", (ctx) => {

  const id = ctx.from.id;

  ctx.reply(
`📊 EQUITY CURVE

${state.equity[id] || 0}%`
  );
});

// =====================
// START
// =====================
bot.launch();
console.log("🚀 TENEO PROTOCOL CORE (FINAL ARCHITECTURE) ACTIVE");
