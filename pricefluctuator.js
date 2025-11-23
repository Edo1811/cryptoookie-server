const SERVER = "https://cryptoookie-net.onrender.com"; // change this to wwwcryptoookie.net/ or www.cryptoookie.com!!!

// session username must be set by login.js
const username = sessionStorage.getItem("username");
if (!username) {
  window.location.href = "login.html";
}

let playerData = null;

// ---------- constants that must exist before loadPlayer uses them ----------
const DECAY_DURATION = 60; // seconds

// GAME STATE
let fluctIntervalId = null;
let decayIntervalId = null;
let saveIntervalId = null;
let balance = 0;
let cookies = 0;
let wallet = [];
let debts = [];
let price = 100.0;
let priceHistory = [price];
const PRICE_MIN = 10;
const PRICE_MAX = 1000;
let logAnchor = Math.log(price);
let playerLoaded = false;

// DOM refs (we'll initialize inside loadPlayer to ensure DOM is ready)
let priceEl = null;
let balanceEl = null;
let cookiesEl = null;
let canvas = null;
let ctx = null;
let walletBody = null;
let qtySelect = null;
let buyBtn = null;
let sellBtn = null;

// ---------- Helper: get DOM refs (call after DOM ready) ----------
function initDomRefs() {
  priceEl = document.getElementById("price");
  balanceEl = document.getElementById("balance");
  cookiesEl = document.getElementById("cookies");
  canvas = document.getElementById("graph");
  ctx = canvas ? canvas.getContext("2d") : null;
  walletBody = document.getElementById("walletBody");
  qtySelect = document.getElementById("qtySelect");
  buyBtn = document.getElementById("buyBtn");
  sellBtn = document.getElementById("sellBtn");

  // wire qty change if present
  if (qtySelect) qtySelect.addEventListener("change", updateActionState);
}

// ---------- Helper: load player from server ----------
async function loadPlayer() {
  // ensure DOM refs exist
  initDomRefs();

  try {
    const res = await fetch(`${SERVER}/api/player/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("Failed to fetch player");
    const data = await res.json();

    playerData = data || {};
    balance = playerData.balance ?? 500;
    cookies = playerData.cookies ?? 0;
    wallet = Array.isArray(playerData.wallet) ? playerData.wallet : [];
    debts = Array.isArray(playerData.debts) ? playerData.debts : [];

    // normalize wallet entries so decayTime exists
    wallet.forEach((w) => {
      if (w.decayTime === undefined) w.decayTime = DECAY_DURATION;
      if (w.decayed === undefined) w.decayed = false;
    });

    playerLoaded = true;
    renderWallet();
    updateDisplay();
    drawGraph();

    // start loops AFTER data load, but guard against duplicates
    if (fluctIntervalId) clearInterval(fluctIntervalId);
    if (decayIntervalId) clearInterval(decayIntervalId);
    if (saveIntervalId) clearInterval(saveIntervalId);

    fluctIntervalId = setInterval(fluctuatePrice, 1500);
    decayIntervalId = setInterval(tickDecay, 1000);
    saveIntervalId = setInterval(autoSave, 10000);
  } catch (err) {
    console.error("Error loading player data:", err);
    alert("Error loading your data. Try logging in again.");
    sessionStorage.removeItem("username");
    window.location.href = "login.html";
  }
}

// ---------- Auto-save (to backend) ----------
async function autoSave() {
  if (!username || !playerLoaded) return;
  const player = { balance, cookies, wallet, debts };
  try {
    const res = await fetch(`${SERVER}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, player }),
    });
    if (!res.ok) throw new Error("Save failed");
    sessionStorage.setItem("playerData", JSON.stringify(player));
    // console.log("💾 Player data saved");
  } catch (err) {
    console.warn("Auto-save failed:", err);
  }
}

// ---------- Price system ----------
function gaussian() {
  const u1 = Math.random() || 1e-9, u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function updateDisplay() {
  if (!priceEl || !balanceEl || !cookiesEl) return;
  priceEl.textContent = `$${price.toFixed(2)}`;
  balanceEl.textContent = balance.toFixed(2);
  cookiesEl.textContent = cookies.toFixed(4);
  updateActionState();
}

function fluctuatePrice() {
  // allow price to move even if playerLoaded is briefly false (but prefer true)
  // (no return on playerLoaded so market feels alive while loading)
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

// ---------- Buy / Sell ----------
function buyCookie(amount = 1) {
  if (!playerLoaded) return;
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
    autoSave();
  } else {
    alert("Not enough balance");
  }
}

function sellCookie(amount = 1) {
  if (!playerLoaded) return;
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
    autoSave();
  }
}

// ---------- Graph drawing ---------- - This function lately got replaced, so if there are bugs they are most likely here lol
//                                    >> Hello, jack. It works but its ass imma make it more readable now and have the indicators outside. Btw youre fired
function drawGraph() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;

  const maxPrice = Math.max(...priceHistory);
  const minPrice = Math.min(...priceHistory);
  const medPrice = (maxPrice + minPrice) / 2;
  const range = maxPrice - minPrice || 1;

  // === UPDATE LABEL TEXT ===
const maxLabel = document.getElementById("labelMax");
const medLabel = document.getElementById("labelMed");
const minLabel = document.getElementById("labelMin");

maxLabel.textContent = `$${maxPrice.toFixed(2)}`;
medLabel.textContent = `$${medPrice.toFixed(2)}`;
minLabel.textContent = `$${minPrice.toFixed(2)}`;

// === POSITION LABELS PROPERLY ===
// Graph height is 200px (canvas height)
const graphH = canvas.height;

maxLabel.style.top = "0px";
minLabel.style.top = (graphH - 15) + "px";  // -15px for text height
medLabel.style.top = (graphH / 2 - 7) + "px"; // perfectly centered


  // ---- DRAW GRAPH ----
  ctx.beginPath();
  for (let i = 0; i < priceHistory.length; i++) {
    const x = (i / (priceHistory.length - 1)) * w;
    const y = h - ((priceHistory[i] - minPrice) / range) * h;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "#ff9900";
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- Draw the latest point ---
  const x = w - 2;
  const y = h - ((price - minPrice) / range) * h;

  ctx.fillStyle = "#ff9900";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}



// ---------- Decay & debts ----------
function tickDecay() {
  if (!playerLoaded) return;

  let changed = false;
  wallet.forEach((entry) => {
    if (entry.decayed) return;
    if (entry.decayTime === undefined) entry.decayTime = DECAY_DURATION;
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
      changed = true;
    }
  });

  // remove decayed
  wallet = wallet.filter((e) => !e.decayed);

  if (changed) {
    renderWallet();
    updateDisplay();
    autoSave();
  } else {
    renderWallet();
    updateDisplay();
  }
}

// ---------- Wallet render ----------
function renderWallet() {
  if (!walletBody) return;
  walletBody.innerHTML = "";
  wallet.forEach((entry, index) => {
    const timeDisplay = entry.decayed ? "💀 Decayed" : `${Math.floor(entry.decayTime ?? DECAY_DURATION)}s`;
    const status = entry.decayed ? "💀" : "⏳";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.amount}</td>
      <td>$${(entry.priceAtPurchase ?? price).toFixed(2)}</td>
      <td>$${(entry.total ?? (entry.amount * (entry.priceAtPurchase ?? price))).toFixed(2)}</td>
      <td>${timeDisplay}</td>
      <td>${status}</td>
    `;
    walletBody.appendChild(row);
  });
}

// ---------- Actions UI ----------
function getSelectedAmount() {
  const v = qtySelect ? qtySelect.value : "1";
  if (v === "max") return "max";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 1;
}

function updateActionState() {
  const sel = getSelectedAmount();
  const maxAffordable = Math.floor(balance / price);
  if (buyBtn) buyBtn.textContent = `Buy ${sel === "max" ? "Max" : sel + "×"}`;
  if (sellBtn) sellBtn.textContent = `Sell ${sel === "max" ? "All" : sel + "×"}`;
  const buyDisabled = sel === "max" ? maxAffordable === 0 : balance < price * sel;
  const sellDisabled = sel === "max" ? cookies <= 0 : cookies < sel;
  if (buyBtn) buyBtn.disabled = buyDisabled;
  if (sellBtn) sellBtn.disabled = sellDisabled;
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

// ensure we call loadPlayer once when page fully loads
window.addEventListener("load", () => {
  // only call once
  if (!playerLoaded) loadPlayer();
});
