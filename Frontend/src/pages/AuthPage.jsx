import React, { useState } from 'react';

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login'); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState(""); 

  const API_BASE = "https://smart-email-dashboard.onrender.com/api";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (mode === 'login') {
        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);

        const res = await fetch(`${API_BASE}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        });

        if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.detail || "Incorrect email or password.");
        }
        const data = await res.json();
        onLogin(data.access_token);
      } 
      
      else if (mode === 'register') {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Failed to create account.");
        }
        
        setSuccessMsg("Account created! Please check your email for the verification code.");
        setMode('verify-email');
      }

      else if (mode === 'verify-email') {
        const res = await fetch(`${API_BASE}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Invalid or expired verification code.");
        }
        
        const data = await res.json();
        onLogin(data.access_token);
      }

      else if (mode === 'forgot') {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error("Failed to request OTP.");
        
        setSuccessMsg("If that email exists, an OTP has been sent. Check your inbox.");
        setMode('reset');
      }

      else if (mode === 'reset') {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp, new_password: password }),
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "Invalid or expired OTP.");
        }
        
        setSuccessMsg("Password reset successfully! Please log in.");
        setMode('login');
        setPassword("");
      }

    } catch (err) {
      setErrorMsg(err.message); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0d1117", padding: "20px" }}>
      <div style={{ background: "#111827", padding: "40px", borderRadius: "12px", border: "1px solid #1f2937", width: "100%", maxWidth: "400px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)", boxSizing: "border-box" }}>
        
        <h2 style={{ color: "#f9fafb", textAlign: "center", marginBottom: "30px", fontSize: "24px" }}>
          {mode === 'login' && "Welcome Back"}
          {mode === 'register' && "Create Account"}
          {mode === 'verify-email' && "Verify Email"}
          {mode === 'forgot' && "Reset Password"}
          {mode === 'reset' && "Enter OTP"}
        </h2>

        {errorMsg && (
          <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px", border: "1px solid #ef4444" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ background: "#064e3b", color: "#6ee7b7", padding: "12px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px", border: "1px solid #10b981", textAlign: "center" }}>
            ✅ {successMsg}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          <div>
            <label style={{ display: "block", color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={mode === 'reset' || mode === 'verify-email'} style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#fff" }} />
          </div>

          {(mode === 'reset' || mode === 'verify-email') && (
            <div>
              <label style={{ display: "block", color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>6-Digit OTP</label>
              <input type="text" required value={otp} onChange={e => setOtp(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#fff", letterSpacing: "2px" }} />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <label style={{ display: "block", color: "#9ca3af", marginBottom: "8px", fontSize: "14px" }}>
                {mode === 'reset' ? "New Password" : "Password"}
              </label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#fff" }} />
            </div>
          )}
          
          {mode === 'login' && (
            <div style={{ textAlign: "right", marginTop: "-10px" }}>
              <span onClick={() => {setMode('forgot'); setErrorMsg(""); setSuccessMsg("");}} style={{ color: "#9ca3af", fontSize: "12px", cursor: "pointer" }}>Forgot Password?</span>
            </div>
          )}

          <button type="submit" disabled={loading} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "12px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "16px", marginTop: "10px" }}>
            {loading ? "Processing..." : mode === 'login' ? "Login" : mode === 'register' ? "Sign Up" : mode === 'verify-email' ? "Verify" : mode === 'forgot' ? "Send OTP" : "Reset Password"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px", color: "#9ca3af", fontSize: "14px" }}>
          {(mode === 'login' || mode === 'forgot' || mode === 'reset' || mode === 'verify-email') ? "Don't have an account? " : "Already have an account? "}
          <span 
            onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setErrorMsg(""); setSuccessMsg(""); }} 
            style={{ color: "#60a5fa", cursor: "pointer", fontWeight: "bold" }}
          >
            {(mode === 'login' || mode === 'forgot' || mode === 'reset' || mode === 'verify-email') ? "Register here" : "Login here"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;