const form = document.querySelector("#login-form");
const message = document.querySelector("#form-message");
const password = document.querySelector("#password");

document.querySelector("#password-toggle").addEventListener("click", event => {
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "แสดง" : "ซ่อน";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.querySelector("#name").value.trim();
  if (!name || password.value.length < 6) {
    message.textContent = "กรุณากรอกชื่อที่ใช้สมัครและรหัสผ่านอย่างน้อย 6 ตัวอักษร";
    message.classList.remove("success");
    return;
  }
  try {
    const data = await window.nouriApi.login({ name, password: password.value });
    localStorage.setItem("nouri-user", JSON.stringify({ name: data.name, email: data.email, signedInAt: new Date().toISOString() }));
    message.textContent = "เข้าสู่ระบบสำเร็จ กำลังพาคุณกลับไปหน้าเมนู…";
    message.classList.add("success");
    setTimeout(() => { window.location.href = "account.html"; }, 700);
  } catch (error) {
    message.textContent = "ชื่อที่ใช้สมัครหรือรหัสผ่านไม่ถูกต้อง";
    message.classList.remove("success");
  }
});

document.querySelector("#forgot-password").addEventListener("click", event => { event.preventDefault(); message.textContent = "ระบบรีเซ็ตรหัสผ่านจะเพิ่มในขั้นตอนถัดไป"; });
document.querySelector("#register-link").addEventListener("click", event => { event.preventDefault(); window.location.href = "register.html"; });
