const form = document.querySelector("#register-form");
const password = document.querySelector("#password");
const message = document.querySelector("#form-message");

document.querySelector("#password-toggle").addEventListener("click", event => {
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "แสดง" : "ซ่อน";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.querySelector("#name").value.trim();
  const email = document.querySelector("#email").value.trim();
  if (!name || !email || password.value.length < 6) {
    message.textContent = "กรุณากรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 6 ตัวอักษร";
    message.classList.remove("success");
    return;
  }
  try {
    const data = await window.nouriApi.register({ name, email, password: password.value });
    localStorage.setItem("nouri-user", JSON.stringify({ name: data.name, email: data.email, signedInAt: new Date().toISOString() }));
    message.textContent = "สร้างบัญชีสำเร็จ กำลังพาคุณไปเลือกมื้ออาหาร…";
    message.classList.add("success");
    setTimeout(() => { window.location.href = "account.html"; }, 700);
  } catch (error) {
    message.textContent = error.message;
    message.classList.remove("success");
  }
});
