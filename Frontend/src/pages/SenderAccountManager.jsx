import React, { useState, useEffect } from "react";

const API_BASE = "https://smart-email-dashboard.onrender.com";

const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
};

export default function SenderAccountManager({ showToast, setGlobalLoading }) {
  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [provider, setProvider] = useState("SMTP (Gmail/Outlook)");
  const [dailyLimit, setDailyLimit] = useState(400);
  const [accounts, setAccounts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem("mailpulse_token");
      const response = await fetch(`${API_BASE}/api/senders`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const token = localStorage.getItem("mailpulse_token");
      const decoded = decodeJWT(token);
      const realUserId = decoded && decoded.sub ? String(decoded.sub) : "unknown";

      const response = await fetch(`${API_BASE}/api/senders/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: realUserId,
          email_address: emailAddress,
          password_or_api_key: appPassword,
          provider: provider,
          daily_limit: parseInt(dailyLimit),
        }),
      });

      if (response.ok) {
        setEmailAddress("");
        setAppPassword("");
        setDailyLimit(400);
        setIsModalOpen(false);
        if (showToast) showToast("Sender account added successfully!");
        fetchAccounts();
      } else {
        const err = await response.json();
        if (showToast) showToast(err.detail || "Failed to add account", "error");
      }
    } catch (error) {
      if (showToast) showToast("Network error occurred", "error");
    } finally {
      if (setGlobalLoading) setGlobalLoading(false);
    }
  };

  const toggleSenderStatus = async (sender) => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const token = localStorage.getItem("mailpulse_token");
      const response = await fetch(`${API_BASE}/api/senders/${sender.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !sender.is_active })
      });

      if (response.ok) {
        if (showToast) showToast(`Account marked as ${!sender.is_active ? 'Active' : 'Inactive'}`);
        fetchAccounts(); 
      } else {
        if (showToast) showToast("Failed to update status", "error");
      }
    } catch (error) {
      if (showToast) showToast("Network error occurred", "error");
    } finally {
      if (setGlobalLoading) setGlobalLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Sender Accounts</h1>
          <p style={{ color: "#9ca3af", marginTop: 4, fontSize: 14 }}>Manage rotating email identities to bypass sending limits.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
        >
          + Add Sender
        </button>
      </div>

      {isModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20, boxSizing: "border-box" }}>
          <div style={{ background: "#1f2937", padding: 24, borderRadius: 12, width: "100%", maxWidth: 500, border: "1px solid #374151", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f9fafb", fontSize: 20, fontWeight: "bold" }}>Add New Sender</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <input
                type="email"
                placeholder="Email Address"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }}
                required
              />
              <input
                type="password"
                placeholder="App Password / API Key"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }}
                required
              />
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }}
              >
                <option>SMTP (Gmail/Outlook)</option>
                <option>SendGrid</option>
                <option>AWS SES</option>
              </select>
              <input
                type="number"
                placeholder="Daily Limit (e.g. 400)"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }}
                required
              />
              <button
                type="submit"
                style={{ width: "100%", background: "#10b981", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold", marginTop: 10 }}
              >
                Save Account
              </button>
            </form>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", background: "#111827", borderRadius: 12, border: "1px solid #1f2937", color: "#9ca3af" }}>
          No sender accounts added yet. Click "+ Add Sender" to begin.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {accounts.map((sender, index) => (
            <div key={index} style={{ background: "#111827", borderRadius: 12, padding: "18px 24px", border: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, opacity: sender.is_active ? 1 : 0.5, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <span style={{ fontWeight: 600, color: "#f9fafb", fontSize: 16 }}>{sender.email_address}</span>
                <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                  <span style={{ background: "#374151", padding: "2px 8px", borderRadius: 4, marginRight: 8 }}>{sender.provider}</span>
                  Daily Limit: {sender.daily_limit}
                </div>
              </div>
              <button 
                onClick={() => toggleSenderStatus(sender)}
                style={{ 
                    padding: "6px 12px", 
                    borderRadius: 6, 
                    cursor: "pointer", 
                    fontWeight: "bold",
                    border: "none",
                    background: sender.is_active ? "#065f46" : "#7f1d1d",
                    color: sender.is_active ? "#34d399" : "#fca5a5" 
                }}
            >
                {sender.is_active ? "🟢 Active" : "🔴 Inactive"}
            </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}