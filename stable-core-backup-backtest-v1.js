/**
 * TENEO BACKTESTING ENGINE v1
 * PURE QUANT SIMULATION CORE
 */

const fs = require("fs");

// =====================
// BACKTEST CONFIG
// =====================
const config = {
  initialCapital: 1000,
  fee: 0.001,
  assets: ["BTC", "ETH", "SOL"]
};

// =====================
// SIMULATED MARKET DATA (REPLACEABLE LATER)
// =====================
function generateMarketData() {

  const series = [];

  for (let i = 0; i < 200; i++) {

    series.push({
      BTC: 70000 + Math.sin(i / 10) * 2000 + Math.random() * 500,
      ETH: 2200 + Math.cos(i / 12) * 120 + Math.random() * 30,
      SOL: 90 + Math.sin(i / 8) * 8 + Math.random() * 3
    });
  }

  return series;
}

// =====================
// STRATEGY ENGINE (YOUR CORE LOGIC)
// =====================
function signal(price, prev) {

  const change = ((price - prev) / prev) * 100;

  let action = "HOLD";
  let strength = 50;

  if (change > 2) {
    action = "BUY";
    strength += 30;
  }

  if (change < -2) {
    action = "SELL";
    strength += 30;
  }

  return { action, strength, change };
}

// =====================
// BACKTEST ENGINE
// =====================
function runBacktest() {

  const market = generateMarketData();

  let capital = config.initialCapital;
  let position = 0;

  let wins = 0;
  let losses = 0;

  let prevBTC = market[0].BTC;

  for (let i = 1; i < market.length; i++) {

    const price = market[i].BTC;
    const s = signal(price, prevBTC);

    prevBTC = price;

    // ENTRY LOGIC
    if (s.action === "BUY" && position === 0) {
      position = capital / price;
      capital = 0;
    }

    // EXIT LOGIC
    else if (s.action === "SELL" && position > 0) {

      const exitValue = position * price * (1 - config.fee);
      const entryValue = position * prevBTC;

      capital = exitValue;
      position = 0;

      if (exitValue > entryValue) wins++;
      else losses++;
    }
  }

  const finalValue = capital + (position * market[market.length - 1].BTC);

  console.log("\n📊 BACKTEST RESULTS");
  console.log("----------------------");
  console.log("Initial:", config.initialCapital);
  console.log("Final:", finalValue.toFixed(2));
  console.log("PnL:", (finalValue - config.initialCapital).toFixed(2));
  console.log("Win Rate:", (wins / (wins + losses || 1) * 100).toFixed(2) + "%");
  console.log("Trades:", wins + losses);
}

// =====================
// RUN BACKTEST
// =====================
runBacktest();

