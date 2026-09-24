const request = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return body;
};

window.nouriApi = {
  health: () => request("/health"),
  register: user => request("/users/register", { method: "POST", body: JSON.stringify(user) }),
  login: credentials => request("/users/login", { method: "POST", body: JSON.stringify(credentials) }),
  posts: () => request("/posts"),
  createPost: post => request("/posts", { method: "POST", body: JSON.stringify(post) }),
  likePost: id => request(`/posts/${id}/like`, { method: "POST" }),
};
