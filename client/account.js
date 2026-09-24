const user = JSON.parse(localStorage.getItem("nouri-user") || "null");
if (!user) window.location.replace("login.html");

if (user) {
  const meals = JSON.parse(localStorage.getItem("nouri-today") || "[]");
  const protein = meals.reduce((total, meal) => total + (meal.protein || 0), 0);
  const calories = meals.reduce((total, meal) => total + (meal.calories || 0), 0);
  document.querySelector("#user-name").textContent = user.name || "ผู้ใช้ Nouri";
  document.querySelector("#user-email").textContent = user.email || "";
  document.querySelector("#avatar").textContent = (user.name || "N").trim().charAt(0).toUpperCase();
  document.querySelector("#meal-total").textContent = meals.length;
  document.querySelector("#protein-total").textContent = `${protein}g`;
  document.querySelector("#calorie-total").textContent = calories;
}

document.querySelector("#logout").addEventListener("click", () => {
  localStorage.removeItem("nouri-user");
  window.location.href = "login.html";
});
