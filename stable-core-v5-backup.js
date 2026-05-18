require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

const bot = new Telegraf(process.env.BOT_TOKEN);
const engine = new EventEmitter();

// =====================
// STATE (ADAPTIVE CORE)
// =====================
const state = {
  lastUpdate: {},
  portfolio: {},
  performance: {}, // adaptive learning memory
};

const watchlists = {};

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
// ADAPTIVE SIGNAL ENGINE v5
// =====================
function getSignal(coin, change) {

  // base score
  let score = 50;

  // adaptive bias from past performance
  const perf = state.performance[coin] || { bias: 0 };

  score += perf.bias;

  // momentum logic
  if (change > 6) score += 30;
  if (change > 3) score += 15;
  if (change < -6) score -= 30;
  if (change < -3) score -= 15;

  let signal = "WAIT";

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

    const signal = getSignal(coin.symbol, data.change);

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
// TRADE ENGINE
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
// PORTFOLIO + ADAPTIVE LEARNING
// =====================
engine.on("trade", async (data) => {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];
    if (!list.includes(data.coin.toLowerCase())) continue;

    if (!state.portfolio[userId]) {
      state.portfolio[userId] = [];
    }

    const trade = {
      coin: data.coin,
      entry: data.price,
      signal: data.signal.signal,
      confidence: data.signal.confidence,
      time: Date.now(),
      closed: false,
      pnl: 0
    };

    state.portfolio[userId].push(trade);

    await bot.telegram.sendMessage(
      userId,
`🧠 TRADE OPEN (v5 AI)

${data.coin}
Entry: $${data.price}
Signal: ${data.signal.signal}
Confidence: ${data.signal.confidence}%`
    );
  }
});

// =====================
// ADAPTIVE LEARNING LOOP
// =====================
setInterval(async () => {

  for (const userId in state.portfolio) {

    const trades = state.portfolio[userId];

    for (const trade of trades) {

      if (trade.closed) continue;

      const data = await getPrice(trade.coin.toLowerCase());
      if (!data) continue;

      let pnl = ((data.price - trade.entry) / trade.entry) * 100;

      if (trade.signal === "SELL") pnl = -pnl;

      trade.pnl = pnl;

      // CLOSE TRADE
      if (pnl >= 5 || pnl <= -3) {

        trade.closed = true;

        // =====================
        // LEARNING UPDATE
        // =====================
        const coin = trade.coin;

        if (!state.performance[coin]) {
          state.performance[coin] = { bias: 0, wins: 0, losses: 0 };
        }

        const perf = state.performance[coin];

        if (pnl > 0) {
          perf.wins += 1;
          perf.bias += 1.5; // reward bias
        } else {
          perf.losses += 1;
          perf.bias -= 1; // punish bias
        }

        save("performance.json", state.performance);

        await bot.telegram.sendMessage(
          userId,
`📊 TRADE CLOSED (v5 AI)

${trade.coin}
PnL: ${pnl.toFixed(2)}%
New Bias: ${perf.bias.toFixed(2)}`
        );
      }
    }
  }

}, 60000);

// =====================
// COMMANDS
// =====================
bot.command("portfolio", (ctx) => {

  const userId = ctx.from.id;
  const trades = state.portfolio[userId] || [];

  let msg = "💼 PORTFOLIO v5\n\n";

  for (const t of trades.slice(-10)) {
    msg += `${t.coin}
PnL: ${t.pnl?.toFixed?.(2) || 0}%
Status: ${t.closed ? "CLOSED" : "OPEN"}

`;
  }

  ctx.reply(msg);
});

bot.command("pnl", (ctx) => {

  const userId = ctx.from.id;
  const trades = state.portfolio[userId] || [];

  let total = 0;

  for (const t of trades) total += t.pnl || 0;

  ctx.reply(
`📊 TOTAL PnL v5

Trades: ${trades.length}
Net: ${total.toFixed(2)}%

AI Mode: ADAPTIVE`
  );
});

bot.launch();
console.log("🚀 Teneo Protocol v5 Adaptive AI Running");
