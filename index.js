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

app.get("/", (req, res) => {
  res.send("🤖 WinGo Custom API is Running 24/7!");
});

async function syncData() {
  try {
    console.log(`⏰ Fetching data...`);
    
    // 🔥 403 Fix: Free Proxy ka use karke API ko bypass karenge
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(API_URL + "?ts=" + Date.now())}`;
    
    const response = await axios.get(proxyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const list = response.data.list || (response.data.data && response.data.data.list);
    if (!list || list.length === 0) return;

    const historyRef = db.ref("wingo_db/history");
    const snapshot = await historyRef.once("value");
    let existingData = snapshot.val() || {};
    let updates = {};
    let newCount = 0;

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

    if (newCount > 0) {
      await historyRef.update(updates);
      console.log(`✅ Added ${newCount} new records (Gap Filled).`);
    } else {
      console.log(`ℹ️ No new records.`);
    }

    // 500 Records Limit
    const allKeys = Object.keys(existingData);
    if (allKeys.length > 500) {
      allKeys.sort((a, b) => b > a ? 1 : -1);
      const keysToRemove = allKeys.slice(500);
      const removeUpdates = {};
      keysToRemove.forEach(key => { removeUpdates[key] = null; });
      await historyRef.update(removeUpdates);
      console.log(`✂️ Trimmed ${keysToRemove.length} old records.`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

setInterval(syncData, 30000);
syncData(); 

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
