require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// STRATEGY MEMORY CORE
// =====================
const memory = {
  strategyBias: {
    SCALP: 0,
    SWING: 0,
    TREND: 0,
    MEAN: 0
  }
};

const watchlists = {};

// =====================
// PRICE ENGINE
// =====================
async function getPrice(id) {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );

    return {
      price: res.data[id]?.usd,
      change: res.data[id]?.usd_24h_change || 0
    };
  } catch {
    return null;
  }
}

// =====================
// STRATEGY SELECTOR v8
// =====================
function selectStrategy(change, volatility) {

  let strategies = {
    SCALP: 0,
    SWING: 0,
    TREND: 0,
    MEAN: 0
  };

  // volatility scoring
  if (volatility > 5) {
    strategies.SCALP += 40;
    strategies.TREND += 20;
  }

  if (volatility > 2 && volatility <= 5) {
    strategies.SWING += 40;
    strategies.TREND += 30;
  }

  if (volatility <= 2) {
    strategies.MEAN += 50;
  }

  // directional bias
  if (change > 3) {
    strategies.TREND += 30;
    strategies.SWING += 10;
  }

  if (change < -3) {
    strategies.SCALP += 25;
    strategies.TREND += 20;
  }

  // apply memory bias (learning)
  for (const key in strategies) {
    strategies[key] += memory.strategyBias[key];
  }

  let best = "SCALP";
  let max = -Infinity;

  for (const key in strategies) {
    if (strategies[key] > max) {
      max = strategies[key];
      best = key;
    }
  }

  return {
    strategy: best,
    scores: strategies
  };
}

// =====================
// SIGNAL ENGINE v8
// =====================
function getSignal(change) {

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
// SCANNER ENGINE
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
    const strategy = selectStrategy(data.change, Math.abs(data.change));

    console.log(
`📡 ${coin.symbol}
Price: $${data.price}
Signal: ${signal.signal} (${signal.confidence}%)
Strategy: ${strategy.strategy}`
    );

    engineRoute({
      coin: coin.symbol,
      price: data.price,
      signal,
      strategy
    });
  }

}, 120000);

// =====================
// ENGINE ROUTER
// =====================
function engineRoute(data) {

  if (data.signal.confidence < 60) return;

  // filter weak volatility setups
  if (data.signal.volatility < 1.5) return;

  executeTrade(data);
}

// =====================
// EXECUTION LAYER
// =====================
function executeTrade(data) {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];
    if (!list.includes(data.coin.toLowerCase())) continue;

    console.log(
`⚙️ EXECUTE ${data.coin}
Strategy: ${data.strategy.strategy}`
    );

    // update strategy memory (light learning)
    memory.strategyBias[data.strategy.strategy] += 0.2;

    bot.telegram.sendMessage(
      userId,
`🧠 STRATEGY ENGINE v8

${data.coin}
Price: $${data.price}

Signal: ${data.signal.signal}
Confidence: ${data.signal.confidence}%

Strategy: ${data.strategy.strategy}

Bias Updated: ${data.strategy.strategy} +0.2`
    );
  }
}

// =====================
// COMMANDS
// =====================
bot.command("strategy", (ctx) => {

  ctx.reply(
`🧠 STRATEGY BIAS v8

SCALP: ${memory.strategyBias.SCALP.toFixed(2)}
SWING: ${memory.strategyBias.SWING.toFixed(2)}
TREND: ${memory.strategyBias.TREND.toFixed(2)}
MEAN: ${memory.strategyBias.MEAN.toFixed(2)}`
  );
});

bot.command("market", async (ctx) => {

  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET v8\n\n";

  for (const id of coins) {
    const d = await getPrice(id);
    if (!d) continue;

    msg += `${id.toUpperCase()}: $${d.price} | ${d.change.toFixed(2)}%\n`;
  }

  ctx.reply(msg);
});

// =====================
// START
// =====================
bot.launch();
console.log("🚀 Protocol v8 Strategy Engine ACTIVE");
