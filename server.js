// =====================================================
// Smart Home Server (Node.js + Express) - ปั๊มน้ำ 1 วงจร
// - หน้าเว็บอยู่ในโฟลเดอร์ public/
// - ESP32 มาถามที่ /api/esp ทุก 1 วินาที ได้คำตอบ "1" = เปิดปั๊ม, "0" = ปิด
// - มีตั้งเวลาปิดเองอัตโนมัติ กันปั๊มลืมปิด/ปั๊มเดินตัวเปล่า
// =====================================================
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let pumpOn = false;
let offAt = 0;                       // เวลาที่จะปิดเอง (0 = ไม่ตั้งเวลา)
let onSince = 0;                     // เริ่มเปิดเมื่อไหร่
let lastSeen = 0;                    // ESP32 ติดต่อมาล่าสุด
const MAX_RUN_MIN = 60;              // เปิดค้างนานสุด 60 นาที แล้วปิดเอง (กันลืม)
const log = [];

function thaiTime() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().substr(11, 8);
}
function addLog(msg) {
  log.unshift({ t: thaiTime(), msg });
  if (log.length > 20) log.pop();
}

function setPump(on, minutes, who) {
  pumpOn = !!on;
  if (pumpOn) {
    onSince = Date.now();
    const m = Math.min(minutes || MAX_RUN_MIN, MAX_RUN_MIN);
    offAt = Date.now() + m * 60000;
    addLog(`💧 ${who}: เปิดปั๊ม (ปิดเองใน ${m} นาที)`);
  } else {
    offAt = 0;
    addLog(`⏹ ${who}: ปิดปั๊ม`);
  }
}

// เช็คตั้งเวลาทุกวินาที
setInterval(() => {
  if (pumpOn && offAt && Date.now() >= offAt) setPump(false, 0, "ตั้งเวลา");
}, 1000);

function stateJSON() {
  return {
    pumpOn,
    secondsLeft: pumpOn && offAt ? Math.max(0, Math.round((offAt - Date.now()) / 1000)) : 0,
    runSeconds: pumpOn ? Math.round((Date.now() - onSince) / 1000) : 0,
    esp32: Date.now() - lastSeen < 15000,
    log,
  };
}

// ---------- API สำหรับหน้าเว็บ ----------
app.get("/api/state", (req, res) => res.json(stateJSON()));

app.post("/api/pump", (req, res) => {
  setPump(req.body.on, Number(req.body.minutes) || 0, "ผู้ใช้");
  res.json(stateJSON());
});

// ---------- API สำหรับ ESP32 ----------
app.all("/api/esp", (req, res) => {
  lastSeen = Date.now();
  res.type("text/plain").send(pumpOn ? "1" : "0");
});

// ใช้กับ cron-job.org ปลุกเซิร์ฟเวอร์ไม่ให้หลับ
app.get("/ping", (req, res) => res.send("ok"));

addLog("🚀 เซิร์ฟเวอร์เริ่มทำงาน");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
