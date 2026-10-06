import { expireSession, readAccessToken } from "./session";

export const request = async (path, options = {}) => {
  const { auth = true, headers, ...fetchOptions } = options;
  const token = auth ? readAccessToken() : null;
  const response = await fetch(`/api${path}`, {
    ...fetchOptions,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) expireSession(token);
    const error = new Error(body.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    error.status = response.status;
    throw error;
  }
  return body;
};

export const api = {
  health: () => request("/health", { auth: false }),
  site: () => request("/site", { auth: false }),
  catalog: (options) => request("/catalog", { ...options, auth: false }),
  catalogCredits: (options) => request("/catalog/credits", { ...options, auth: false }),
  saveCatalogItem: (kind, id, revision, item, create = false) => request(`/catalog/${kind}${create ? "" : `/${encodeURIComponent(id)}`}`, {
    method: create ? "POST" : "PATCH", body: JSON.stringify({ revision, [kind === "ingredients" ? "ingredient" : "recipe"]: item }),
  }),
  deleteCatalogItem: (kind, id, revision) => request(`/catalog/${kind}/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ revision }) }),
  saveSite: (data) => request("/site", { method: "PUT", body: JSON.stringify(data) }),
  register: (data) => request("/users/register", { auth: false, method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/users/login", { auth: false, method: "POST", body: JSON.stringify(data) }),
  me: (options) => request("/users/me", options),
  activity: () => request("/users/me/activity"),
  recordSession: (durationSeconds) => request("/users/me/activity", { method: "POST", body: JSON.stringify({ durationSeconds }) }),
  users: () => request("/users"),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateProfile: (avatarData) => request("/users/me/profile", { method: "PATCH", body: JSON.stringify({ avatarData }) }),
  updateMyProfile: (data) => request("/users/me/profile", { method: "PATCH", body: JSON.stringify(data) }),
  publicProfile: (username, options) => request(`/profiles/${encodeURIComponent(username)}`, { ...options, auth: false }),
  publicProfileCard: (username, options) => request(`/profiles/${encodeURIComponent(username)}/card`, { ...options, auth: false }),
  publicPreview: (options) => request("/users/me/public-preview", options),
  posts: (options) => request("/posts", options),
  updatePost: (id, data) => request(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePost: (id) => request(`/posts/${id}`, { method: "DELETE" }),
  deleteComment: (postId, commentId) => request(`/posts/${postId}/comments/${commentId}`, { method: "DELETE" }),
  createPost: (data) => request("/posts", { method: "POST", body: JSON.stringify(data) }),
  likePost: (id) => request(`/posts/${id}/like`, { method: "POST" }),
  commentPost: (id, content) => request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
};
