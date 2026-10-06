export const TOKEN_KEY = "nouri-token";
export const SESSION_EXPIRED_EVENT = "nouri-session-expired";

export const readAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const saveAccessToken = token => localStorage.setItem(TOKEN_KEY, token);

export function clearAccessToken(expectedToken) {
  if (expectedToken !== undefined && readAccessToken() !== expectedToken) return false;
  localStorage.removeItem(TOKEN_KEY);
  return true;
}

export function expireSession(token) {
  // An old request must never sign out a session created after it started.
  if (!token || !clearAccessToken(token)) return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
