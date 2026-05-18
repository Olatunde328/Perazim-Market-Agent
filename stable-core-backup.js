/**
 * TENEO INSTITUTIONAL BACKTEST ENGINE v2
 * REAL MARKET DATA + QUANT METRICS
 */

const axios = require("axios");

// =====================
// CONFIG
// =====================
const config = {
  capital: 1000,
  fee: 0.001,
  symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  limit: 200
};

// =====================
// FETCH HISTORICAL DATA (BINANCE)
// =====================
async function getCandles(symbol) {

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${config.limit}`;

  const res = await axios.get(url);

  return res.data.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4])
  }));
}

// =====================
// STRATEGY ENGINE (INSTITUTIONAL VERSION)
// =====================
function signal(current, prev) {

  const change = ((current - prev) / prev) * 100;

  let action = "HOLD";
  let strength = 50;

  if (change > 1.5) {
    action = "BUY";
    strength += 25;
  }

  if (change < -1.5) {
    action = "SELL";
    strength += 25;
  }

  return { action, strength, change };
}

// =====================
// BACKTEST CORE
// =====================
function backtest(symbol, candles) {

  let capital = config.capital;
  let position = 0;

  let entryPrice = 0;

  let wins = 0;
  let losses = 0;

  let peak = capital;
  let maxDrawdown = 0;

  for (let i = 1; i < candles.length; i++) {

    const prev = candles[i - 1].close;
    const curr = candles[i].close;

    const sig = signal(curr, prev);

    // ENTRY
    if (sig.action === "BUY" && position === 0) {
      position = capital / curr;
      entryPrice = curr;
      capital = 0;
    }

    // EXIT
    else if (sig.action === "SELL" && position > 0) {

      capital = position * curr * (1 - config.fee);
      position = 0;

      if (curr > entryPrice) wins++;
      else losses++;
    }

    const equity = capital + (position * curr);

    if (equity > peak) peak = equity;

    const drawdown = ((peak - equity) / peak) * 100;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const finalEquity = capital + (position * candles[candles.length - 1].close);

  const trades = wins + losses;

  const winRate = trades ? (wins / trades) * 100 : 0;

  const pnl = finalEquity - config.capital;

  const returnPct = (pnl / config.capital) * 100;

  const sharpeProxy = trades ? (returnPct / (maxDrawdown || 1)) : 0;

  console.log(`\n📊 INSTITUTIONAL BACKTEST: ${symbol}`);
  console.log("-----------------------------------");
  console.log("Initial Capital:", config.capital);
  console.log("Final Equity:", finalEquity.toFixed(2));
  console.log("PnL:", pnl.toFixed(2));
  console.log("Return %:", returnPct.toFixed(2) + "%");
  console.log("Win Rate:", winRate.toFixed(2) + "%");
  console.log("Max Drawdown:", maxDrawdown.toFixed(2) + "%");
  console.log("Sharpe Proxy:", sharpeProxy.toFixed(2));
  console.log("Trades:", trades);
}

// =====================
// RUN ALL BACKTESTS
// =====================
async function run() {

  for (const s of config.symbols) {

    try {
      const candles = await getCandles(s);
      backtest(s, candles);
    } catch (e) {
      console.log("ERROR:", s, e.message);
    }
  }
}

run();

