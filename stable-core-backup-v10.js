require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// REINFORCEMENT CORE MEMORY
// =====================
const brain = {
  reward: 0,
  loss: 0,
  strategyWeight: {
    SCALP: 1,
    SWING: 1,
    TREND: 1,
    MEAN: 1
  }
};

const portfolio = {};
const watchlists = {};

// =====================
// GLOBAL SAFETY
// =====================
process.on("uncaughtException", (e) => console.log("CRASH:", e.message));
process.on("unhandledRejection", (e) => console.log("PROMISE ERROR:", e?.message));

// =====================
// SAFE TELEGRAM SEND
// =====================
async function safeSend(id, msg) {
  if (!id) return;
  try {
    await bot.telegram.sendMessage(id, msg);
  } catch (e) {
    console.log("SEND FAIL:", e.message);
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
// SIGNAL ENGINE
// =====================
function signalEngine(change) {

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
// STRATEGY SELECTION (REINFORCED)
// =====================
function pickStrategy(change) {

  let scores = { ...brain.strategyWeight };

  if (change > 3) {
    scores.TREND += 2;
    scores.SWING += 1;
  }

  if (change < -3) {
    scores.SCALP += 2;
  }

  if (Math.abs(change) < 2) {
    scores.MEAN += 2;
  }

  let best = "SCALP";
  let max = -Infinity;

  for (const k in scores) {
    if (scores[k] > max) {
      max = scores[k];
      best = k;
    }
  }

  return best;
}

// =====================
// REWARD SYSTEM (CORE LEARNING)
// =====================
function updateBrain(pnl, strategy) {

  if (pnl > 0) {
    brain.reward += pnl;
    brain.strategyWeight[strategy] += 0.3;
  } else {
    brain.loss += Math.abs(pnl);
    brain.strategyWeight[strategy] -= 0.2;

    if (brain.strategyWeight[strategy] < 0.5) {
      brain.strategyWeight[strategy] = 0.5;
    }
  }
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

    const d = await getPrice(c.id);
    if (!d) continue;

    const sig = signalEngine(d.change);
    const strat = pickStrategy(d.change);

    console.log(
`📡 ${c.symbol}
$${d.price}
Signal: ${sig.signal}
Strategy: ${strat}`
    );

    execute({
      coin: c.symbol,
      price: d.price,
      sig,
      strat
    });
  }

}, 120000);

// =====================
// EXECUTION ENGINE
// =====================
function execute(d) {

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];
    if (!list.includes(d.coin.toLowerCase())) continue;

    const pnl = (Math.random() * 2 - 1) * 5; // simulated PnL

    updateBrain(pnl, d.strat);

    portfolio[userId] = portfolio[userId] || [];

    portfolio[userId].push({
      coin: d.coin,
      price: d.price,
      pnl,
      strategy: d.strat
    });

    safeSend(userId,
`🧠 TENEO AI REINFORCEMENT

${d.coin}
Price: $${d.price}

Signal: ${d.sig.signal}
Strategy: ${d.strat}
PnL: ${pnl.toFixed(2)}%

Brain Reward: ${brain.reward.toFixed(2)}
Brain Loss: ${brain.loss.toFixed(2)}`
    );
  }
}

// =====================
// TELEGRAM COMMANDS (FULL SET)
// =====================

// START
bot.command("start", (ctx) => {
  ctx.reply("🚀 TENEO AI Reinforcement Engine ACTIVE");
});

// PORTFOLIO
bot.command("portfolio", (ctx) => {

  const id = ctx.from.id;
  const p = portfolio[id] || [];

  ctx.reply(
`📊 PORTFOLIO
Trades: ${p.length}`
  );
});

// BRAIN STATUS
bot.command("brain", (ctx) => {

  ctx.reply(
`🧠 BRAIN STATUS

Reward: ${brain.reward.toFixed(2)}
Loss: ${brain.loss.toFixed(2)}

SCALP: ${brain.strategyWeight.SCALP.toFixed(2)}
SWING: ${brain.strategyWeight.SWING.toFixed(2)}
TREND: ${brain.strategyWeight.TREND.toFixed(2)}
MEAN: ${brain.strategyWeight.MEAN.toFixed(2)}`
  );
});

// MARKET
bot.command("market", async (ctx) => {

  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET\n\n";

  for (const id of coins) {
    const d = await getPrice(id);
    if (!d) continue;

    msg += `${id.toUpperCase()}: $${d.price} | ${d.change.toFixed(2)}%\n`;
  }

  ctx.reply(msg);
});

// ASK COMMAND (AI STYLE QUERY INTERFACE)
bot.command("ask", (ctx) => {

  const q = ctx.message.text.replace("/ask", "").trim();

  if (!q) {
    return ctx.reply("Usage: /ask should I buy BTC?");
  }

  let response = "I am a trading engine. Ask about BTC, ETH, SOL trends.";

  if (q.toLowerCase().includes("btc")) {
    response = "BTC responds strongly to TREND strategy in current system.";
  }

  if (q.toLowerCase().includes("eth")) {
    response = "ETH is currently volatility-sensitive, SWING strategy preferred.";
  }

  ctx.reply(`🤖 TENEO AI\n\n${response}`);
});

// =====================
// START
// =====================
bot.launch();
console.log("🚀 TENEO AI REINFORCEMENT SYSTEM ACTIVE");
