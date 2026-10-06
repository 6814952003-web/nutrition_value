const request = async (path, options = {}) => {
  const token = localStorage.getItem("nouri-token");
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    error.status = response.status;
    throw error;
  }
  return body;
};

export const api = {
  health: () => request("/health"),
  site: () => request("/site"),
  saveSite: (data) => request("/site", { method: "PUT", body: JSON.stringify(data) }),
  register: (data) => request("/users/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/users/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => request("/users/me"),
  activity: () => request("/users/me/activity"),
  recordSession: (durationSeconds) => request("/users/me/activity", { method: "POST", body: JSON.stringify({ durationSeconds }) }),
  users: () => request("/users"),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateProfile: (avatarData) => request("/users/me/profile", { method: "PATCH", body: JSON.stringify({ avatarData }) }),
  posts: () => request("/posts"),
  updatePost: (id, data) => request(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePost: (id) => request(`/posts/${id}`, { method: "DELETE" }),
  deleteComment: (postId, commentId) => request(`/posts/${postId}/comments/${commentId}`, { method: "DELETE" }),
  createPost: (data) => request("/posts", { method: "POST", body: JSON.stringify(data) }),
  likePost: (id) => request(`/posts/${id}/like`, { method: "POST" }),
  commentPost: (id, content) => request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
};
