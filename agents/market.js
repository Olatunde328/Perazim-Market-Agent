const axios = require("axios");

let lastPrice = null;

async function getBTC() {
  const res = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  );
  return res.data.bitcoin.usd;
}

function analyze(current) {
  const prev = lastPrice || current;
  const change = ((current - prev) / prev) * 100;

  let sentiment = "neutral";
  if (change > 2) sentiment = "bullish 📈";
  if (change < -2) sentiment = "bearish 📉";

  lastPrice = current;

  return {
    change: change.toFixed(2),
    sentiment
  };
}

module.exports = { getBTC, analyze };
