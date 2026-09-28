/* ============ EASY IMAGE REPLACEMENT ============
   Paste any image URL (https://...) between the quotes.
   Leave "" to use the built-in fire/skull fallback. */
const IMAGES = {
  dragon: "",    // login page background: a realistic dragon
  skeleton: ""   // dashboard: a skeleton / undead character, first-person view
};
/* ================================================ */

const $ = (id) => document.getElementById(id);
const loginView = $("login-view"), dashView = $("dash-view");
let pollTimer = null;

/* ---- images ---- */
function applyImage(el, url) {
  if (!url) return;
  const probe = new Image();
  probe.onload = () => el.style.setProperty("--img", `url("${url}")`);
  probe.src = url;
}
applyImage($("dragon-bg"), IMAGES.dragon);
if (IMAGES.skeleton) {
  const img = $("skeleton-img");
  img.onload = () => { img.hidden = false; $("skeleton-fallback").hidden = true; };
  img.src = IMAGES.skeleton;
  applyImage($("skeleton-bg"), IMAGES.skeleton); // soft blurred backdrop
}

/* ---- views ---- */
function showDashboard(username) {
  loginView.hidden = true;
  dashView.hidden = false;
  $("who").textContent = username ? "— " + username : "";
  history.replaceState(null, "", "#dashboard");
  loadUsers();
  clearInterval(pollTimer);
  pollTimer = setInterval(loadUsers, 10000);
}
function showLogin() {
  clearInterval(pollTimer);
  dashView.hidden = true;
  loginView.hidden = false;
  history.replaceState(null, "", location.pathname);
  $("password").value = "";
}

/* ---- login ---- */
const form = $("login-form"), errorBox = $("error"), btn = $("login-btn");
function showError(msg) {
  errorBox.hidden = true;
  void errorBox.offsetWidth; // restart shake animation
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  btn.disabled = true;
  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("username").value, password: $("password").value })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) showDashboard(data.username);
    else showError(data.error || "Login failed. Try again.");
  } catch {
    showError("Can't reach the server. Check your connection and try again.");
  } finally {
    btn.disabled = false;
  }
});

$("logout-btn").addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" }).catch(() => {});
  showLogin();
});

/* ---- user list ---- */
async function loadUsers() {
  const list = $("user-list");
  try {
    const res = await fetch("/users");
    if (res.status === 401) return showLogin();
    const { users } = await res.json();
    list.replaceChildren();
    if (!users.length) {
      list.innerHTML = '<li class="empty">No logins yet.</li>';
      return;
    }
    for (const u of users) {
      const li = document.createElement("li");
      const time = new Date(u.login_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const online = u.status === "Online";
      li.innerHTML = `<span class="dot ${online ? "online" : ""}"></span>
        <span class="u-name"></span><span class="u-status">${u.status}</span><span class="u-time">${time}</span>`;
      li.querySelector(".u-name").textContent = u.username; // textContent: no HTML injection
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="empty">Could not load the list.</li>';
  }
}

/* ---- first-person parallax ---- */
const stage = $("stage");
window.addEventListener("pointermove", (e) => {
  if (dashView.hidden) return;
  const x = (e.clientX / innerWidth - .5) * 2, y = (e.clientY / innerHeight - .5) * 2;
  stage.style.transform = `rotateY(${x * 4}deg) rotateX(${-y * 3}deg) scale(1.03)`;
});

/* ---- embers ---- */
const canvas = $("embers"), ctx = canvas.getContext("2d");
let sparks = [];
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resize); resize();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function spawn() {
  return { x: Math.random() * canvas.width, y: canvas.height + 10, r: Math.random() * 2 + .6,
           vy: Math.random() * 1.2 + .4, vx: (Math.random() - .5) * .6, life: 1, d: Math.random() * .004 + .002 };
}
function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (sparks.length < 70 && Math.random() < .5) sparks.push(spawn());
  sparks = sparks.filter((s) => s.life > 0 && s.y > -10);
  for (const s of sparks) {
    s.x += s.vx + Math.sin(s.y / 40) * .3; s.y -= s.vy; s.life -= s.d;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283);
    ctx.fillStyle = `rgba(255,${120 + s.life * 90 | 0},40,${s.life})`;
    ctx.shadowColor = "#ff5a1a"; ctx.shadowBlur = 10; ctx.fill();
  }
  requestAnimationFrame(tick);
}
if (!reduce) tick();

/* ---- resume existing session ---- */
fetch("/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) showDashboard(d.username); }).catch(() => {});
