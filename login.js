// login.js
const SERVER = "https://cryptoookie-net.onrender.com"; // no leading space!

async function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  if (!user || !pass) return alert("Enter both username and password!");

  const res = await fetch(`${SERVER}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error || "Login failed");

  sessionStorage.setItem("username", user);
  sessionStorage.setItem("playerData", JSON.stringify(data.player));

  setTimeout(() => {
    window.location.href = "exchange.html";
  }, 200);
}

// if already logged in, go straight to exchange
if (sessionStorage.getItem("username")) {
  window.location.href = "exchange.html";
}
