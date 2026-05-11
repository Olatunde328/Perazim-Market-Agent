require("dotenv").config();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const OpenAI = require("openai");

// =====================
// BOT INIT
// =====================
const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// OPENAI
// =====================
let ai = null;

if (process.env.OPENAI_KEY) {
    ai = new OpenAI({
        apiKey: process.env.OPENAI_KEY
    });

    console.log("🤖 OpenAI enabled");
} else {
    console.log("⚠️ OpenAI disabled (fallback mode)");
}

// =====================
// FILES
// =====================
const ALERT_FILE = "alerts.json";
const MEMORY_FILE = "memory.json";

// =====================
// LOAD/SAVE HELPERS
// =====================
function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        return JSON.parse(fs.readFileSync(file));
    } catch {
        return fallback;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =====================
// DATA
// =====================
let alerts = loadJSON(ALERT_FILE, []);
let memory = loadJSON(MEMORY_FILE, {});

let triggeredAlerts = {};
let chatId = null;

// =====================
// MEMORY HELPERS
// =====================
function addMemory(userId, role, content) {

    if (!memory[userId]) {
        memory[userId] = [];
    }

    memory[userId].push({ role, content });

    if (memory[userId].length > 20) {
        memory[userId] = memory[userId].slice(-20);
    }

    saveJSON(MEMORY_FILE, memory);
}

function getMemory(userId) {
    return memory[userId] || [];
}

function getUserProfile(mem) {

    let name = null;

    mem.forEach(m => {

        const text = m.content.toLowerCase();

        if (text.includes("my name is")) {
            name = m.content.split("is")[1]?.trim();
        }
    });

    return { name };
}

// =====================
// START
// =====================
bot.start((ctx) => {

    chatId = ctx.chat.id;

    ctx.reply("🚀 Stable Production AI Agent Online");
});

// =====================
// PING
// =====================
bot.command("ping", (ctx) => {
    ctx.reply("🏓 Pong");
});

// =====================
// CHAT ID
// =====================
bot.command("chatid", (ctx) => {

    chatId = ctx.chat.id;

    ctx.reply(`🆔 Chat ID: ${chatId}`);
});

// =====================
// BTC PRICE
// =====================
bot.command("price", async (ctx) => {

    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
        );

        ctx.reply(`💰 BTC Price: $${res.data.bitcoin.usd}`);

    } catch (e) {

        console.log("PRICE ERROR:", e.message);

        ctx.reply("❌ Failed to fetch BTC price");
    }
});

// =====================
// COINS
// =====================
bot.command("coins", async (ctx) => {

    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd"
        );

        ctx.reply(
            `📊 Market Prices\n\nBTC: $${res.data.bitcoin.usd}\nETH: $${res.data.ethereum.usd}\nSOL: $${res.data.solana.usd}`
        );

    } catch (e) {

        console.log("COINS ERROR:", e.message);

        ctx.reply("❌ Failed to fetch market prices");
    }
});

// =====================
// SET ALERT
// =====================
bot.command("setalert", (ctx) => {

    const price = Number(ctx.message.text.split(" ")[1]);

    if (!price) {
        return ctx.reply("Use: /setalert 50000");
    }

    alerts.push(price);

    saveJSON(ALERT_FILE, alerts);

    ctx.reply(`🚨 Alert set at $${price}`);
});

// =====================
// ALERTS
// =====================
bot.command("alerts", (ctx) => {

    if (!alerts.length) {
        return ctx.reply("🚫 No alerts set");
    }

    ctx.reply(
        "🚨 Active Alerts:\n\n" +
        alerts.map(a => `$${a}`).join("\n")
    );
});

// =====================
// MARKET ANALYSIS
// =====================
bot.command("market", async (ctx) => {

    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/coins/bitcoin"
        );

        const price = res.data?.market_data?.current_price?.usd;
        const change24h = res.data?.market_data?.price_change_percentage_24h;

        if (!price) {
            return ctx.reply("❌ Market data unavailable");
        }

        // Fallback mode if OpenAI unavailable
        if (!ai) {

            let trend = "Neutral";

            if (change24h > 2) trend = "Bullish 📈";
            if (change24h < -2) trend = "Bearish 📉";

            return ctx.reply(
                `📊 BTC Market\n\nPrice: $${price}\n24h: ${change24h}%\nTrend: ${trend}`
            );
        }

        const prompt = `
Bitcoin market data:
- Price: $${price}
- 24h change: ${change24h}%

Explain:
1. Market direction
2. Possible reason
3. Short outlook
Keep response under 5 lines.
        `;

        const response = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a crypto market analyst. Be concise and practical."
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        ctx.reply(
            `📊 Market Insight\n\n${response.choices[0].message.content}`
        );

    } catch (e) {

        console.log("MARKET ERROR:", e.message);

        ctx.reply("❌ Market analysis failed");
    }
});

// =====================
// LONG TERM MEMORY AI
// =====================
bot.hears(/\/ask (.+)/, async (ctx) => {

    const userId = ctx.from.id;
    const prompt = ctx.match[1];

    addMemory(userId, "user", prompt);

    const mem = getMemory(userId);
    const profile = getUserProfile(mem);

    // Fallback replies
    const fallback = () => {

        if (prompt.toLowerCase().includes("bitcoin")) {
            return "Bitcoin is a decentralized digital currency.";
        }

        if (prompt.toLowerCase().includes("my name") && profile.name) {
            return `Your name is ${profile.name}`;
        }

        return "AI unavailable right now.";
    };

    if (!ai) {

        const reply = fallback();

        addMemory(userId, "assistant", reply);

        return ctx.reply(reply);
    }

    try {

        const response = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a memory AI assistant. User name: ${profile.name || "unknown"}`
                },
                ...mem.slice(-10),
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        const reply = response.choices[0].message.content;

        addMemory(userId, "assistant", reply);

        ctx.reply(reply);

    } catch (e) {

        console.log("AI ERROR:", e.message);

        const reply = fallback();

        addMemory(userId, "assistant", reply);

        ctx.reply(reply);
    }
});

// =====================
// BTC ALERT MONITOR
// =====================
setInterval(async () => {

    if (!alerts.length) return;
    if (!chatId) return;

    try {

        const res = await axios.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
        );

        const btc = res.data.bitcoin.usd;

        for (const price of alerts) {

            if (btc >= price && !triggeredAlerts[price]) {

                triggeredAlerts[price] = true;

                await bot.telegram.sendMessage(
                    chatId,
                    `🚨 BTC ALERT\n\nTarget: $${price}\nCurrent BTC: $${btc}`
                );
            }

            if (btc < price) {
                triggeredAlerts[price] = false;
            }
        }

    } catch (e) {

        console.log("MONITOR ERROR:", e.message);
    }

}, 60000);

// =====================
// GLOBAL ERROR HANDLER
// =====================
process.on("uncaughtException", (err) => {
    console.log("UNCAUGHT ERROR:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("UNHANDLED PROMISE:", err);
});

// =====================
// START BOT
// =====================
bot.launch({
    dropPendingUpdates: true
});

console.log("🚀 Stable Production AI Agent Running...");
