import React, { useState } from 'react';

function AuthPage({ onLogin, showToast }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Use your actual backend URL here if deployed (e.g., https://smart-email-dashboard.onrender.com)
  const API_BASE = "http://localhost:8000/api"; 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // LOGIN: FastAPI expects form-urlencoded data for OAuth2
        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);

        const res = await fetch(`${API_BASE}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        });

        if (!res.ok) throw new Error("Invalid email or password");
        const data = await res.json();
        onLogin(data.access_token);
        
      } else {
        // REGISTER: Our custom endpoint expects standard JSON
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Registration failed");
        }
        
        const data = await res.json();
        onLogin(data.access_token);
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0d1117" }}>
      <div style={{ background: "#111827", padding: "40px", borderRadius: "12px", border: "1px solid #1f2937", width: "100%", maxWidth: "400px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
        <h2 style={{ color: "#f9fafb", textAlign: "center", marginBottom: "30px", fontSize: "24px" }}>
          {isLogin ? "Welcome Back" : "Create Account"}
        </h2>
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ display: "block", color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>Email</label>
            <input 
              type="email" 
              required
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#fff" }} 
            />
          </div>
          <div>
            <label style={{ display: "block", color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>Password</label>
            <input 
              type="password" 
              required
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#fff" }} 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "12px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "16px", marginTop: "10px" }}
          >
            {loading ? "Processing..." : (isLogin ? "Login" : "Sign Up")}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px", color: "#9ca3af", fontSize: "14px" }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span 
            onClick={() => setIsLogin(!isLogin)} 
            style={{ color: "#60a5fa", cursor: "pointer", fontWeight: "bold" }}
          >
            {isLogin ? "Register here" : "Login here"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;