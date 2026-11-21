const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");

// Firebase Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://start-7868c-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

// Cron-job is route ko ping karega taaki server so na jaye
app.get("/", (req, res) => {
  res.send("🤖 WinGo Custom API is Running 24/7!");
});

// 🔥 DATA FETCH & BACKFILL LOGIC 🔥
async function syncData() {
  try {
    console.log(`⏰ [${new Date().toLocaleTimeString()}] Fetching data...`);
    
    // 403 Error Fix: Full browser headers to bypass WAF/Cloudflare
    const response = await axios.get(API_URL + "?ts=" + Date.now(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://draw.ar-lottery01.com",
        "Referer": "https://draw.ar-lottery01.com/",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });

    const list = response.data.list || (response.data.data && response.data.data.list);

    if (!list || list.length === 0) return;

    const historyRef = db.ref("wingo_db/history");
    const snapshot = await historyRef.once("value");
    let existingData = snapshot.val() || {};
    let updates = {};
    let newCount = 0;

    // 1. Naya data aur missing (backfill) data dhundna
    for (const item of list) {
      const period = item.issueNumber || item.period || item.drawNo;
      const number = parseInt(item.number ?? item.winNumber ?? item.result);

      if (!period || isNaN(number) || number < 0 || number > 9) continue;

      if (!existingData[period]) {
        updates[period] = {
          period: period,
          number: number,
          bigSmall: number >= 5 ? "B" : "S",
          color: item.color || "green",
          ts: Date.now()
        };
        existingData[period] = true; 
        newCount++;
      }
    }

    // 2. Naya data Firebase me save karna
    if (newCount > 0) {
      await historyRef.update(updates);
      console.log(`✅ Added ${newCount} new records (Gap Filled).`);
    } else {
      console.log(`ℹ️ No new records.`);
    }

    // 3. 🔥 500 RECORDS KI LIMIT 🔥
    const allKeys = Object.keys(existingData);
    if (allKeys.length > 500) {
      allKeys.sort((a, b) => b > a ? 1 : -1);
      const keysToRemove = allKeys.slice(500);
      const removeUpdates = {};
      
      keysToRemove.forEach(key => { removeUpdates[key] = null; });
      
      await historyRef.update(removeUpdates);
      console.log(`✂️ Trimmed ${keysToRemove.length} old records. Total is now 500.`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    // Agar phir bhi 403 aaye toh error print hoga
  }
}

// Har 30 second me sync karo
setInterval(syncData, 30000);
syncData(); 

// Server start karo
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
