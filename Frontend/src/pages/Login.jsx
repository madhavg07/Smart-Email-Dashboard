import React, { useState } from 'react';
import { API_URL, setToken } from '../api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
      const res = await fetch(`${API_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!res.ok) throw new Error("Invalid credentials");
      
      const data = await res.json();
      setToken(data.access_token); // Save token safely
      onLoginSuccess(); // Tell App.jsx we are in!
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0f1a", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: "#111827", padding: 40, borderRadius: 16, border: "1px solid #1f2937", width: 350, boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
        <h2 style={{ color: "#f9fafb", marginTop: 0, textAlign: "center" }}>✉️ MailPulse Admin</h2>
        <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Enter your credentials to access the dashboard.</p>
        
        {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 16, textAlign: "center" }}>{error}</div>}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input 
            placeholder="Username" 
            value={username} 
            onChange={e => setUsername(e.target.value)}
            style={{ padding: 12, borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#fff", outline: "none" }}
            required 
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)}
            style={{ padding: 12, borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#fff", outline: "none" }}
            required 
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ background: "#1d4ed8", color: "#fff", border: "none", padding: 12, borderRadius: 8, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Authenticating..." : "Secure Login"}
          </button>
        </form>
      </div>
    </div>
  );
}