// Login handler here got removed because it messed up everything else here :( Check login.js for the login logic
const username = sessionStorage.getItem("username");
if (!username) {
  window.location.href = "login.html";
}
const SERVER = "https://cryptoookie-net.onrender.com";

// === GLOBALS ===
let balance = 500.0;
let cookies = 0;
let price = 100.0;
let priceHistory = [price];
let wallet = [];
let debts = [];
const PRICE_MIN = 10;
const PRICE_MAX = 1000;
let logAnchor = Math.log(price); // moving target to avoid sticking to $100

// === INIT PLAYER DATA ON PAGE LOAD ===
window.addEventListener("load", async () => {
  username = sessionStorage.getItem("username");
  if (!username) {
    window.location.href = "login.html";
    return;
  }

  // Load player data from backend (playerdata.json)
  try {
    const res = await fetch(`${SERVER}/api/getPlayer?username=${username}`);
    if (!res.ok) throw new Error("Failed to load player data");
    const data = await res.json();
    playerData = data.player || {};

    balance = playerData.balance || 500;
    cookies = playerData.cookies || 0;
    wallet = playerData.wallet || [];
    debts = playerData.debts || [];

    renderWallet();
    updateDisplay();
    drawGraph();
    setInterval(fluctuatePrice, 1500);
    setInterval(tickDecay, 1000);
    setInterval(autoSave, 10000);
  } catch (err) {
    console.error("❌ Error loading player data:", err);
    alert("Error loading your data. Please log in again.");
    window.location.href = "login.html";
  }
});

// === AUTO-SAVE TO BACKEND ===
async function autoSave() {
  if (!username) return;
  const player = { balance, cookies, wallet, debts };
  try {
    await fetch(`${SERVER}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, player }),
    });
    console.log("💾 Player data saved");
    sessionStorage.setItem("playerData", JSON.stringify(player));
  } catch (err) {
    console.warn("⚠️ Auto-save failed:", err);
  }
}

// === PRICE FLUCTUATION ===
function gaussian() {
  const u1 = Math.random() || 1e-9,
    u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const priceEl = document.getElementById("price");
const balanceEl = document.getElementById("balance");
const cookiesEl = document.getElementById("cookies");
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const walletBody = document.getElementById("walletBody");
const qtySelect = document.getElementById("qtySelect");
const buyBtn = document.getElementById("buyBtn");
const sellBtn = document.getElementById("sellBtn");

function updateDisplay() {
  if (!priceEl || !balanceEl || !cookiesEl) return;
  priceEl.textContent = `$${price.toFixed(2)}`;
  balanceEl.textContent = balance.toFixed(2);
  cookiesEl.textContent = cookies.toFixed(4);
  updateActionState();
}

function fluctuatePrice() {
  const logMin = Math.log(PRICE_MIN);
  const logMax = Math.log(PRICE_MAX);
  const logRange = logMax - logMin;

  let logP = Math.log(price);
  const pos = (logP - logMin) / logRange;

  const SIGMA = 0.262;
  const K = 0.06;
  const ALPHA = 0.02;
  const SIGMA_A = 0.01;

  logAnchor = (1 - ALPHA) * logAnchor + ALPHA * logP + gaussian() * SIGMA_A;
  const margin = 0.06 * logRange;
  if (logAnchor < logMin + margin) logAnchor = logMin + margin;
  if (logAnchor > logMax - margin) logAnchor = logMax - margin;

  let wallPush = 0;
  if (pos < 0.15) wallPush = 0.04 * (0.15 - pos);
  else if (pos > 0.85) wallPush = -0.04 * (pos - 0.85);

  logP += K * (logAnchor - logP) + wallPush + gaussian() * SIGMA;
  if (logP < logMin) logP = logMin + (logMin - logP) * 0.33;
  if (logP > logMax) logP = logMax - (logP - logMax) * 0.33;

  price = Math.exp(logP);
  priceHistory.push(price);
  if (priceHistory.length > 60) priceHistory.shift();
  updateDisplay();
  drawGraph();
}

// === BUY / SELL ===
function buyCookie(amount = 1) {
  if (amount <= 0) return;
  const cost = price * amount;
  if (balance >= cost) {
    balance -= cost;
    cookies += amount;
    wallet.push({
      amount,
      priceAtPurchase: price,
      total: cost,
      decayTime: DECAY_DURATION,
      decayed: false,
    });
    renderWallet();
    updateDisplay();
  }
}

function sellCookie(amount = 1) {
  if (amount <= 0) return;
  if (cookies >= amount) {
    let toSell = amount;
    let i = 0;
    while (toSell > 0 && i < wallet.length) {
      const entry = wallet[i];
      if (entry.amount <= toSell) {
        balance += entry.amount * price;
        toSell -= entry.amount;
        wallet.splice(i, 1);
      } else {
        balance += toSell * price;
        entry.amount -= toSell;
        entry.total = entry.amount * entry.priceAtPurchase;
        toSell = 0;
        i++;
      }
    }
    cookies -= amount;
    if (cookies < 0) cookies = 0;
    renderWallet();
    updateDisplay();
  }
}

// === GRAPH DRAWING ===
function drawGraph() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const maxPrice = Math.max(...priceHistory);
  const minPrice = Math.min(...priceHistory);
  const range = maxPrice - minPrice || 1;

  ctx.beginPath();
  for (let i = 0; i < priceHistory.length; i++) {
    const x = (i / (priceHistory.length - 1)) * canvas.width;
    const y =
      canvas.height - ((priceHistory[i] - minPrice) / range) * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#ff9900";
  ctx.lineWidth = 2;
  ctx.stroke();

  const lastX = canvas.width;
  const lastY = canvas.height - ((price - minPrice) / range) * canvas.height;
  ctx.fillStyle = "#cc6600";
  ctx.beginPath();
  ctx.arc(lastX - 2, lastY, 4, 0, 2 * Math.PI);
  ctx.fill();
}

// === DECAY + DEBTS ===
const DECAY_DURATION = 60;

function tickDecay() {
  wallet.forEach((entry, i) => {
    if (entry.decayed) return;
    entry.decayTime -= 1;
    if (entry.decayTime <= 0) {
      entry.decayed = true;
      entry.decayTime = 0;
      debts.push({
        type: "$COOKIE",
        amount: entry.amount,
        currentValue: price,
        accruedDebt: 0,
        sold: false,
      });
      cookies -= entry.amount;
      wallet.splice(i, 1);
      if (cookies < 0) cookies = 0;
    }
  });
  renderWallet();
}

function renderWallet() {
  walletBody.innerHTML = "";
  wallet.forEach((entry, index) => {
    const timeDisplay = entry.decayed
      ? "💀 Decayed"
      : `${Math.floor(entry.decayTime)}s`;
    const status = entry.decayed ? "💀" : "⏳";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.amount}</td>
      <td>$${entry.priceAtPurchase.toFixed(2)}</td>
      <td>$${entry.total.toFixed(2)}</td>
      <td>${timeDisplay}</td>
      <td>${status}</td>
    `;
    walletBody.appendChild(row);
  });
}

// === ACTION HELPERS ===
function getSelectedAmount() {
  const v = qtySelect.value;
  if (v === "max") return "max";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 1;
}

function updateActionState() {
  const sel = getSelectedAmount();
  const maxAffordable = Math.floor(balance / price);

  buyBtn.textContent = `Buy ${sel === "max" ? "Max" : sel + "×"}`;
  sellBtn.textContent = `Sell ${sel === "max" ? "All" : sel + "×"}`;

  const buyDisabled =
    sel === "max" ? maxAffordable === 0 : balance < price * sel;
  const sellDisabled = sel === "max" ? cookies <= 0 : cookies < sel;

  buyBtn.disabled = buyDisabled;
  sellBtn.disabled = sellDisabled;
}

function buySelected() {
  const sel = getSelectedAmount();
  if (sel === "max") {
    const maxAffordable = Math.floor(balance / price);
    if (maxAffordable > 0) buyCookie(maxAffordable);
    return;
  }
  buyCookie(sel);
}

function sellSelected() {
  const sel = getSelectedAmount();
  if (sel === "max") {
    sellCookie(cookies);
    return;
  }
  const amt = Math.min(sel, cookies);
  if (amt > 0) sellCookie(amt);
}

qtySelect.addEventListener("change", updateActionState);
