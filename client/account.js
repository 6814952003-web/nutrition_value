const user = JSON.parse(localStorage.getItem("nouri-user") || "null");
if (!user) window.location.replace("login.html");
if (user) {
  const meals = JSON.parse(localStorage.getItem("nouri-today") || "[]");
  document.querySelector("#user-name").textContent = user.name || "Nouri member";
  document.querySelector("#user-email").textContent = user.email || "";
  document.querySelector("#avatar-initial").textContent = (user.name || "N").trim().charAt(0).toUpperCase();
  if (user.avatarData) { const image = document.querySelector("#avatar-image"); image.src = user.avatarData; image.hidden = false; document.querySelector("#avatar-initial").hidden = true; }
  const history = document.querySelector("#history");
  history.innerHTML = meals.length ? `<ul>${meals.map(meal => `<li>${escapeHtml(meal.name || "Meal")} · ${Number(meal.calories) || 0} kcal · Protein ${Number(meal.protein) || 0}g</li>`).join("")}</ul>` : "No meals recorded today.";
  document.querySelector("#security").innerHTML = `<dl><dt>Name</dt><dd>${escapeHtml(user.name || "—")}</dd><dt>Email</dt><dd>${escapeHtml(user.email || "—")}</dd><dt>Joined</dt><dd>${user.signedInAt ? new Date(user.signedInAt).toLocaleDateString() : "—"}</dd></dl>`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
document.querySelectorAll(".menu-trigger[data-panel]").forEach(button => button.addEventListener("click", () => {
  const panel = document.getElementById(button.dataset.panel);
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded)); panel.hidden = expanded;
}));
document.querySelector("#avatar-input").addEventListener("change", event => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_500_000) { alert("Choose PNG, JPG, or WebP, up to 1.5 MB."); event.currentTarget.value = ""; return; }
  const reader = new FileReader();
  reader.onload = () => {
    user.avatarData = reader.result;
    localStorage.setItem("nouri-user", JSON.stringify(user));
    const image = document.querySelector("#avatar-image"); image.src = reader.result; image.hidden = false; document.querySelector("#avatar-initial").hidden = true;
  };
  reader.readAsDataURL(file);
});
document.querySelector("#logout").addEventListener("click", () => { localStorage.removeItem("nouri-user"); window.location.href = "login.html"; });
