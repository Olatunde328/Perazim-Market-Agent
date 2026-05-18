require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

const bot = new Telegraf(process.env.BOT_TOKEN);
const engine = new EventEmitter();

const state = { lastUpdate: {} };
const watchlists = {};
const alerts = {};

function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file)); }
  catch { return fallback; }
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

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

function getSignal(change) {
  if (change >= 5) return { signal: "BUY", confidence: 80, trend: "BULLISH" };
  if (change <= -5) return { signal: "SELL", confidence: 80, trend: "BEARISH" };
  return { signal: "WAIT", confidence: 50, trend: "SIDEWAYS" };
}

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

    console.log(`📡 ${coin.symbol}: $${data.price} | ${signal.signal}`);

    engine.emit("signal", {
      coin: coin.symbol,
      price: data.price,
      signal
    });
  }

}, 120000);

engine.on("signal", async (data) => {

  const key = data.coin;

  if (state.lastUpdate[key] && Date.now() - state.lastUpdate[key] < 30000) return;
  state.lastUpdate[key] = Date.now();

  for (const userId in watchlists) {

    const list = watchlists[userId] || [];

    if (list.includes(data.coin.toLowerCase())) {

      await bot.telegram.sendMessage(
        userId,
`🧠 SIGNAL

${data.coin}
Price: $${data.price}
Signal: ${data.signal.signal}
Confidence: ${data.signal.confidence}%`
      );
    }
  }
});

bot.command("market", async (ctx) => {
  const coins = ["bitcoin","ethereum","solana"];
  let msg = "📊 MARKET\n\n";

  for (const id of coins) {
    const d = await getPrice(id);
    if (!d) continue;
    msg += `${id.toUpperCase()}: $${d.price}\n`;
  }

  ctx.reply(msg);
});

bot.command("leaderboard", (ctx) => {
  ctx.reply("🏆 BTC > ETH > SOL");
});

bot.launch();
console.log("🚀 Teneo Protocol RESET v1 Running");
