import express from "express";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(express.static(".")); // serves index.html and others

const DATA_FILE = "playerdata.json";

function loadData() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing credentials" });

  const data = loadData();

  if (!data[username]) {
    data[username] = {
      password,
      balance: 500,
      cookies: 0,
      wallet: [],
      debts: [],
    };
    saveData(data);
    console.log(`🆕 Registered new player: ${username}`);
  } else if (data[username].password !== password) {
    return res.status(403).json({ error: "Wrong password" });
  }

  res.json({ ok: true, player: data[username] });
});

app.post("/api/save", (req, res) => {
  const { username, player } = req.body;
  const data = loadData();
  if (!data[username]) return res.status(404).json({ error: "User not found" });

  data[username] = { ...data[username], ...player, password: data[username].password };
  saveData(data);
  res.json({ ok: true });
});

app.get("/api/player/:username", (req, res) => {
  const data = loadData();
  const user = data[req.params.username];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
