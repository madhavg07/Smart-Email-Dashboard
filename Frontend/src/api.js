export const API_URL = "https://smart-email-dashboard.onrender.com/api";

// Manage the token securely in the browser
export function setToken(token) {
  localStorage.setItem("mailpulse_token", token);
}

export function getToken() {
  return localStorage.getItem("mailpulse_token");
}

export function clearToken() {
  localStorage.removeItem("mailpulse_token");
}

// The universal API fetch wrapper
export async function api(path, opts = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    ...opts,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearToken(); // Auto-logout if token expires
      window.location.reload();
    }
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}