const request = async (path, options = {}) => {
  const token = localStorage.getItem("nouri-token");
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
  return body;
};

export const api = {
  health: () => request("/health"),
  register: (data) => request("/users/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/users/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => request("/users/me"),
  activity: () => request("/users/me/activity"),
  recordSession: (durationSeconds) => request("/users/me/activity", { method: "POST", body: JSON.stringify({ durationSeconds }) }),
  users: () => request("/users"),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateProfile: (avatarData) => request("/users/me/profile", { method: "PATCH", body: JSON.stringify({ avatarData }) }),
  posts: () => request("/posts"),
  createPost: (data) => request("/posts", { method: "POST", body: JSON.stringify(data) }),
  likePost: (id) => request(`/posts/${id}/like`, { method: "POST" }),
  commentPost: (id, content) => request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
};
