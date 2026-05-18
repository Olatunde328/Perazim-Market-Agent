require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

const bot = new Telegraf(process.env.BOT_TOKEN);
const engine = new EventEmitter();

// =====================
// STATE
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
// SIGNAL ENGINE
// =====================
function getSignal(change) {

  let score = 50;

  if (change > 6) score += 35;
  if (change > 3) score += 15;
  if (change < -6) score -= 35;
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
// PnL TRADE ENTRY (v4 CORE)
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
// PORTFOLIO + PnL ENGINE
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
      tp: data.price * 1.05,
      sl: data.price * 0.97,
      closed: false,
      pnl: 0
    };

    state.portfolio[userId].push(trade);

    await bot.telegram.sendMessage(
      userId,
`💼 TRADE OPENED (v4 PnL)

${data.coin}
Entry: $${data.price}
TP: $${trade.tp.toFixed(2)}
SL: $${trade.sl.toFixed(2)}
Signal: ${data.signal.signal}`
    );
  }
});

// =====================
// PnL MONITOR (AUTO EXIT SIM)
// =====================
setInterval(() => {

  for (const userId in state.portfolio) {

    const trades = state.portfolio[userId];

    for (const trade of trades) {

      if (trade.closed) continue;

      getPrice(trade.coin.toLowerCase())
        .then(data => {

          if (!data) return;

          const price = data.price;

          let pnl = ((price - trade.entry) / trade.entry) * 100;

          if (trade.signal === "SELL") {
            pnl = -pnl;
          }

          trade.pnl = pnl;

          // TAKE PROFIT
          if (price >= trade.tp || pnl >= 5) {

            trade.closed = true;

            bot.telegram.sendMessage(
              userId,
`💰 TAKE PROFIT HIT (v4)

${trade.coin}
PnL: +${pnl.toFixed(2)}%
Exit: $${price}`
            );
          }

          // STOP LOSS
          if (price <= trade.sl || pnl <= -3) {

            trade.closed = true;

            bot.telegram.sendMessage(
              userId,
`🛑 STOP LOSS HIT (v4)

${trade.coin}
PnL: ${pnl.toFixed(2)}%
Exit: $${price}`
            );
          }
        });
    }
  }

}, 60000);

// =====================
// COMMANDS
// =====================
bot.command("portfolio", (ctx) => {

  const userId = ctx.from.id;
  const trades = state.portfolio[userId] || [];

  if (!trades.length) {
    return ctx.reply("📭 No trades yet");
  }

  let msg = "💼 PORTFOLIO v4\n\n";

  for (const t of trades.slice(-10)) {

    msg += `${t.coin}
Entry: $${t.entry}
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

  for (const t of trades) {
    total += t.pnl || 0;
  }

  ctx.reply(
`📊 TOTAL PnL (SIMULATED)

Trades: ${trades.length}
Net PnL: ${total.toFixed(2)}%`
  );
});

bot.command("market", async (ctx) => {

  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET v4\n\n";

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
console.log("🚀 Teneo Protocol v4 PnL Engine Running");
