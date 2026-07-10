import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

import { api, API_URL, getToken, setToken, clearToken } from './api';
import AuthPage from './pages/AuthPage';
import SenderAccountManager from './pages/SenderAccountManager';
import { useApiCache } from './pages/useApiCache';

import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const fmt = (n, d = 1) => (n ?? 0).toFixed(d);
const pct = (n) => `${fmt(n)}%`;

const globalStyles = `
  body { margin: 0; padding: 0; overflow: hidden; background: #0a0f1a; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #fff; }
  .app-container { display: flex; height: 100vh; width: 100vw; overflow: hidden; }
  .sidebar { width: 250px; background: #0d1117; flex-shrink: 0; height: 100vh; overflow-y: auto; transition: transform 0.3s ease; border-right: 1px solid #1f2937; display: flex; flex-direction: column; padding: 24px 12px; z-index: 1000; box-sizing: border-box; }
  .main-content { flex: 1; height: 100vh; overflow-y: auto; padding: 28px; position: relative; box-sizing: border-box; }
  .hamburger { display: none; background: #1f2937; border: 1px solid #374151; color: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 18px; position: fixed; top: 15px; left: 15px; z-index: 1001; }
  .spinner { width: 50px; height: 50px; border: 4px solid rgba(59, 130, 246, 0.2); border-left-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  @media (max-width: 768px) {
    .sidebar { position: fixed; transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main-content { padding-top: 70px; padding-left: 15px; padding-right: 15px; }
    .hamburger { display: block; }
    .stats-grid { grid-template-columns: 1fr !important; }
    .charts-grid { grid-template-columns: 1fr !important; }
  }
`;

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#111827", border: `1px solid ${accent}33`, borderRadius: 12, padding: "20px 24px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#f9fafb", fontSize: 32, fontWeight: 700, fontFamily: "'Space Grotesk', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ModalOverlay({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div style={{ background: "#111827", padding: 24, borderRadius: 12, border: "1px solid #3b82f6", width: "100%", maxWidth: 650, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid #1f2937", paddingBottom: 12 }}>
          <h3 style={{ margin: 0, color: "#60a5fa", fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 20, fontWeight: "bold" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, paddingRight: 8 }}>{children}</div>
      </div>
    </div>
  );
}

function GlobalLoader({ active }) {
  if (!active) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(10, 15, 26, 0.8)", backdropFilter: "blur(6px)", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div className="spinner"></div>
      <h3 style={{ color: "#f9fafb", marginTop: 20, letterSpacing: "1px" }}>Processing Request...</h3>
      <p style={{ color: "#9ca3af", fontSize: 13 }}>Please do not close this window.</p>
    </div>
  );
}

function SettingsPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // 1. Instant Fallback: Read ID directly from the local JWT Token
    let fallbackId = "Unknown";
    try {
      const token = localStorage.getItem("mailpulse_token");
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        fallbackId = payload.sub || payload.id || "Unknown";
      }
    } catch(e) {}

    // 2. Fetch full details from the new backend route
    // Note: If your auth routes use a different prefix, adjust '/auth/me' accordingly
    api('/auth/me')
      .then(res => {
        setUser(res.data || res);
      })
      .catch((err) => {
        console.error("Profile fetch failed:", err);
        // Fallback so the screen isn't empty if the backend isn't ready
        setUser({ 
            id: fallbackId, 
            email: "Please add the /auth/me backend route", 
            created_at: new Date() 
        });
      });
  }, []);

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", marginBottom: 20 }}>Account Settings</h1>
      <div style={{ background: "#111827", padding: 24, borderRadius: 12, border: "1px solid #1f2937" }}>
        <h3 style={{ marginTop: 0, color: "#9ca3af", marginBottom: 20 }}>Profile Details</h3>
        {user ? (
          <div style={{ display: "grid", gap: 15, color: "#d1d5db", fontSize: 15 }}>
            <div style={{ display: "flex", borderBottom: "1px solid #1f2937", paddingBottom: 10 }}>
                <strong style={{ color: "#9ca3af", width: "140px" }}>Account ID:</strong> 
                <span style={{ color: "#f9fafb", fontFamily: "monospace" }}>{user.id}</span>
            </div>
            <div style={{ display: "flex", borderBottom: "1px solid #1f2937", paddingBottom: 10 }}>
                <strong style={{ color: "#9ca3af", width: "140px" }}>Email Address:</strong> 
                <span style={{ color: "#f9fafb" }}>{user.email}</span>
            </div>
            <div style={{ display: "flex" }}>
                <strong style={{ color: "#9ca3af", width: "140px" }}>Member Since:</strong> 
                <span style={{ color: "#f9fafb" }}>{new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: "#9ca3af" }}>Loading profile data...</div>
        )}
      </div>
    </div>
  );
}

function DashboardPage({ overview, timeline, pieData, pct }) {
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: "#f9fafb" }}>Overview</h1>
      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Sent" value={(overview?.total_emails_sent || 0).toLocaleString()} sub="all time" accent="#60a5fa" />
        <StatCard label="Avg Open Rate" value={pct(overview?.avg_open_rate || 0)} sub={`${(overview?.unique_opens || 0).toLocaleString()} opens`} accent="#22c55e" />
        <StatCard label="Avg Click Rate" value={pct(overview?.avg_click_rate || 0)} sub={`${(overview?.unique_clicks || 0).toLocaleString()} clicks`} accent="#a78bfa" />
        <StatCard label="Suppressed" value={overview?.suppressed_recipients || 0} sub="auto-filtered" accent="#f87171" />
      </div>
      <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#111827", borderRadius: 12, padding: 20, border: "1px solid #1f2937" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#d1d5db", marginBottom: 16 }}>Engagement Over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d?.slice(5) || d} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af", paddingTop: "10px" }} />
              {/* GRAPH FIX: BOTH OPENS AND CLICKS ADDED */}
              <Line type="monotone" dataKey="opens" name="Opens" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: "#111827", borderRadius: 12, padding: 20, border: "1px solid #1f2937" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#d1d5db", marginBottom: 8 }}>Engagement Score Breakdown</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function GroupsPage({ groups, onRefresh, showToast, setGlobalLoading }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [viewGroup, setViewGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);

  // Fetch specific members when clicking "View List"
  const loadGroupMembers = async (g) => {
    setViewGroup(g);
    try {
      const res = await api(`/recipients/?group_id=${g.id}&limit=500`);
      setGroupMembers(res.data || res);
    } catch (e) {
      console.error(e);
      setGroupMembers([]);
    }
  };

  const addGroup = async () => {
    if (!name) return showToast("Group name required", "error");
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api("/groups/", { method: "POST", body: JSON.stringify({ name, description: desc }) });
      showToast("Group created successfully");
      setName(""); setDesc("");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const deleteGroup = async (id) => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api(`/groups/${id}`, { method: "DELETE" });
      showToast("Group deleted");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Recipient Groups</h1>

      {viewGroup && (
        <ModalOverlay title={`Members of "${viewGroup.name}"`} onClose={() => setViewGroup(null)}>
          {groupMembers.length === 0 ? (
            <div style={{ color: "#9ca3af", textAlign: "center", padding: 20 }}>No recipients loaded or group is empty.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#d1d5db" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #374151", color: "#9ca3af" }}>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>Role</th>
                </tr>
              </thead>
              <tbody>
                {groupMembers.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #1f2937" }}>
                    <td style={{ padding: "10px 0", color: "#f9fafb" }}>{r.name || "—"}</td>
                    <td style={{ padding: "10px 0" }}>{r.email}</td>
                    <td style={{ padding: "10px 0" }}>{r.role || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ModalOverlay>
      )}

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: 20, margin: "20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 12 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Group Name" style={{ padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff", outline: "none" }} />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff", outline: "none" }} />
          <button onClick={addGroup} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>Create Group</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {groups.map(g => (
          <div key={g.id} style={{ background: "#111827", padding: 16, borderRadius: 8, border: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: "bold", color: "#60a5fa" }}>{g.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{g.description}</div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button onClick={() => loadGroupMembers(g)} style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>👥 View List</button>
              <button onClick={() => deleteGroup(g.id)} style={{ background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 13 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipientsPage({ groups, showToast, setGlobalLoading }) {
  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const limit = 100;

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("default");
  // RESTORED: Filter state is back!
  const [filter, setFilter] = useState("all"); 
  const [isSearching, setIsSearching] = useState(false);

  const [newRecipient, setNewRecipient] = useState({ email: "", name: "", role: "", industry: "", company: "", newGroupName: "" });
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [uploadGroupId, setUploadGroupId] = useState("");
  const fileInputRef = useRef(null);

  const fetchRecipients = useCallback(async () => {
    setIsSearching(true);
    try {
      let url = `/recipients/?skip=${skip}&limit=${limit}&sort_by=${sortBy}&filter_by=${filter}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      
      const res = await api(url);
      setData(res.data || []);
      setTotalCount(res.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  }, [skip, limit, sortBy, searchTerm, filter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecipients();
    }, 400); 
    return () => clearTimeout(timer);
  }, [fetchRecipients]);

  useEffect(() => {
    setSkip(0); 
  }, [searchTerm, sortBy, filter]);

  const toggleSuppress = async (id, suppress) => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api(`/recipients/${id}/suppress?suppress=${suppress}`, { method: "PATCH" });
      fetchRecipients();
    } catch { }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const updateNewRecipient = (key, value) => setNewRecipient(curr => ({ ...curr, [key]: value }));
  const handleToggleGroup = (id) => setSelectedGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const initiateGroupSelection = () => {
    if (!newRecipient.email) return showToast("Please enter an email address first", "error");
    setShowGroupModal(true);
  };

  const addRecipient = async () => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api("/recipients/", {
        method: "POST",
        body: JSON.stringify({ ...newRecipient, group_ids: selectedGroups, new_group_name: newRecipient.newGroupName || null })
      });
      showToast("Recipient added successfully", "success");
      setNewRecipient({ email: "", name: "", role: "", industry: "", company: "", newGroupName: "" });
      setSelectedGroups([]);
      setShowGroupModal(false);
      fetchRecipients();
    } catch (e) { 
      showToast(e.message, "error"); 
    }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (uploadGroupId) formData.append("group_id", uploadGroupId);

      const authToken = localStorage.getItem("mailpulse_token");
      const response = await fetch(`${API_URL.replace(/\/api\/?$/, "")}/api/recipients/upload-csv`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unauthorized or Server Error");
      }

      const resData = await response.json();
      showToast(resData.message || "CSV Uploaded", "success");
      fetchRecipients();
    } catch (e) {
      showToast(e.message || "Failed to upload CSV", "error");
    } finally {
      if (setGlobalLoading) setGlobalLoading(false);
      event.target.value = null;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>
          Recipients <span style={{ fontSize: 16, color: "#6b7280", fontWeight: 500 }}>({totalCount} Total)</span>
        </h1>
        
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select value={uploadGroupId} onChange={(e) => setUploadGroupId(e.target.value)} style={{ padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#f9fafb", fontSize: 13, outline: "none" }}>
            <option value="">No Group (Default)</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current.click()} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Upload CSV
          </button>
        </div>
      </div>

      {showGroupModal && (
        <ModalOverlay title="Assign Recipient to Groups" onClose={() => setShowGroupModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12, fontWeight: "bold" }}>Select Existing Groups</div>
              <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid #374151", padding: 12, borderRadius: 8, background: "#0d1117" }}>
                {groups.length === 0 && <span style={{ color: "#6b7280", fontSize: 12 }}>No groups exist yet.</span>}
                {groups.map(g => (
                  <label key={g.id} style={{ display: "block", marginBottom: 8, color: "#d1d5db", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => handleToggleGroup(g.id)} style={{ marginRight: 8, accentColor: "#3b82f6" }} /> {g.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12, fontWeight: "bold" }}>Or Create New Group</div>
              <input value={newRecipient.newGroupName} onChange={e => updateNewRecipient("newGroupName", e.target.value)} placeholder="Type new group name..." style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#f9fafb", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <button onClick={addRecipient} style={{ width: "100%", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Confirm & Add Recipient
          </button>
        </ModalOverlay>
      )}

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: 20, margin: "20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          {["email", "name", "role", "industry", "company"].map(key => (
            <input key={key} value={newRecipient[key]} onChange={e => updateNewRecipient(key, e.target.value)} placeholder={key.charAt(0).toUpperCase() + key.slice(1)} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          ))}
        </div>
        <button onClick={initiateGroupSelection} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Choose Groups & Save ➔</button>
      </div>

      {/* RESTORED: Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "hot", "active", "suppressed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500, background: filter === f ? "#1d4ed8" : "#111827", color: filter === f ? "#fff" : "#9ca3af", border: filter === f ? "1px solid #3b82f6" : "1px solid #1f2937" }}>
            {f === "hot" ? "🔥 Hot" : f === "active" ? "🟢 Active" : f === "suppressed" ? "🔴 Suppressed" : "All Recipients"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 15, marginBottom: 20, flexWrap: "wrap" }}>
        <input type="text" placeholder={isSearching ? "Searching 33k+ database..." : "🔍 Search entire database..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: "10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", flex: 1, minWidth: "200px", opacity: isSearching ? 0.7 : 1 }} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }}>
            <option value="default">Default Sort (Newest)</option>
            <option value="opens">🔥 Most Opens Globally</option>
            <option value="clicks">🖱️ Most Clicks Globally</option>
        </select>
      </div>

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: "600px" }}>
          <thead>
            <tr style={{ background: "#0d1117", color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
              {["Recipient", "Groups", "Engagement", "Stats", "Action"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 16px" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const rGroups = (r.metadata_?.group_ids || []).map(id => groups.find(g => g.id === id)?.name).filter(Boolean);
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #0f172a", opacity: r.is_suppressed ? 0.5 : 1 }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500, color: "#e5e7eb" }}>{r.name || r.email}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{r.email}</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#9ca3af", maxWidth: 150 }}>{rGroups.length > 0 ? rGroups.join(", ") : "—"}</td>
                  <td style={{ padding: "12px 16px", color: r.seriousness_score >= 0.75 ? "#4ade80" : "#9ca3af" }}>
                    {r.seriousness_score >= 0.75 ? "Hot" : "Standard"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                    <div style={{ color: "#4ade80" }}>{r.total_opens || 0} Opens</div>
                    <div style={{ color: "#a78bfa" }}>{r.total_clicks || 0} Clicks</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button onClick={() => toggleSuppress(r.id, !r.is_suppressed)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: r.is_suppressed ? "#14532d" : "#7f1d1d", color: r.is_suppressed ? "#86efac" : "#fca5a5", border: "none" }}>
                      {r.is_suppressed ? "Restore" : "Suppress"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#0d1117", borderTop: "1px solid #1f2937" }}>
          <div style={{ color: "#9ca3af", fontSize: 13 }}>
            Showing {skip + 1} to {Math.min(skip + limit, totalCount)} of {totalCount}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              onClick={() => setSkip(Math.max(0, skip - limit))} 
              disabled={skip === 0}
              style={{ padding: "8px 16px", borderRadius: 8, background: skip === 0 ? "#1f2937" : "#374151", color: skip === 0 ? "#6b7280" : "#f9fafb", border: "none", cursor: skip === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}
            >
              ← Previous
            </button>
            <button 
              onClick={() => setSkip(skip + limit)} 
              disabled={(skip + limit) >= totalCount}
              style={{ padding: "8px 16px", borderRadius: 8, background: (skip + limit) >= totalCount ? "#1f2937" : "#3b82f6", color: (skip + limit) >= totalCount ? "#6b7280" : "#fff", border: "none", cursor: (skip + limit) >= totalCount ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnifiedAIFlowPage({ showToast, onRefresh, setGlobalLoading }) {
  const [campaignName, setCampaignName] = useState("");
  const [baseForm, setBaseForm] = useState({ subject: "", body: "", name: "", role: "", company: "", industry: "" });
  const [personalized, setPersonalized] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [hoveredVariant, setHoveredVariant] = useState(null);
  const [spamScore, setSpamScore] = useState(null);
  const [aiScore, setAiScore] = useState(null);
  const [isScoring, setIsScoring] = useState(false);

  const analyzeSubjectLine = async (text) => {
    if (!text) { setAiScore(null); return; }
    setIsScoring(true);
    try {
      const ROOT_URL = API_URL.replace(/\/api\/?$/, "");
      const response = await fetch(`${ROOT_URL}/analyze-subject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const res = await response.json();
      setAiScore({ score: res.score, is_optimal: (res.score ?? 0) >= 7, feedback: res.feedback });
    } catch (e) {
      console.error("Failed to score subject line:", e);
      setAiScore(null);
    } finally {
      setIsScoring(false);
    }
  };

  const runPersonalization = async () => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const res = await api("/ai/personalize", { method: "POST", body: JSON.stringify({ subject: baseForm.subject, body: baseForm.body, recipient_name: baseForm.name, recipient_role: baseForm.role, recipient_industry: baseForm.industry, recipient_company: baseForm.company }) });
      setPersonalized(res);
      showToast("Personalization generated!");
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const runABVariants = async () => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const targetSubj = personalized ? personalized.subject : baseForm.subject;
      const targetBody = personalized ? personalized.body : baseForm.body;
      const res = await api("/ai/ab-variants", { method: "POST", body: JSON.stringify({ subject: targetSubj, body: targetBody, num_variants: 3 }) });
      setVariants(res.variants);
      showToast("Variants generated!");
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const runSpamCheck = async (variant) => {
    setSelectedVariant(variant);
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const res = await api("/ai/spam-check", { method: "POST", body: JSON.stringify({ subject: variant.subject, body: variant.body }) });
      setSpamScore(res);
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const saveToDrafts = async (includeABTest = false) => {
    if (!campaignName) return showToast("Please provide a Campaign Name at the top first", "error");
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const payload = {
        name: campaignName,
        subject: personalized ? personalized.subject : baseForm.subject,
        body_html: personalized ? personalized.body : baseForm.body,
        is_ab_test: includeABTest && selectedVariant !== null,
        subject_b: (includeABTest && selectedVariant) ? selectedVariant.subject : null,
        body_html_b: (includeABTest && selectedVariant) ? selectedVariant.body : null
      };

      await api("/campaigns/", { method: "POST", body: JSON.stringify(payload) });
      showToast("Saved to Drafts successfully!");
      onRefresh();
      
      setBaseForm({ subject: "", body: "", name: "", role: "", company: "", industry: "" });
      setPersonalized(null);
      setVariants([]);
      setSelectedVariant(null);
      setSpamScore(null);
      setCampaignName("");
      setAiScore(null); 
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const sectionStyle = (isActive) => ({
    background: "#111827", borderRadius: 12, padding: 24,
    border: isActive ? "1px solid #3b82f6" : "1px solid #1f2937",
    opacity: isActive ? 1 : 0.4,
    pointerEvents: isActive ? "auto" : "none",
    transition: "all 0.3s",
    marginBottom: 16
  });

  const inputStyle = { width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb", marginBottom: 12, boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Unified AI Composer</h1>
      <input style={{ ...inputStyle, fontSize: 16, fontWeight: 'bold', borderColor: "#3b82f6", marginBottom: 20 }} placeholder="Name this Campaign (e.g., Q3 Outreach) - Required to Save" value={campaignName} onChange={e => setCampaignName(e.target.value)} />

      <div style={sectionStyle(true)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>1. Base Context</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <input style={inputStyle} placeholder="Target Persona Name" value={baseForm.name} onChange={e => setBaseForm({ ...baseForm, name: e.target.value })} />
          <input style={inputStyle} placeholder="Role (e.g., CEO)" value={baseForm.role} onChange={e => setBaseForm({ ...baseForm, role: e.target.value })} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af", marginLeft: 2 }}>Base Subject</label>
            {isScoring ? <span style={{ fontSize: 12, color: "#60a5fa" }}>Analyzing... 🧠</span> : aiScore ? (
              <span style={{ fontSize: 11, fontWeight: "bold", padding: "2px 8px", borderRadius: 12, background: aiScore.is_optimal ? "#166534" : "#991b1b", color: "#fff" }}>
                {aiScore.is_optimal ? "🔥 Great Subject" : "⚠️ Low Engagement"} ({aiScore.score}/10)
              </span>
            ) : null}
          </div>
          <input style={{ ...inputStyle, marginBottom: 0, border: aiScore ? (aiScore.is_optimal ? "1px solid #22c55e" : "1px solid #ef4444") : "1px solid #1f2937" }} placeholder="Enter an engaging subject line..." value={baseForm.subject} onChange={e => setBaseForm({ ...baseForm, subject: e.target.value })} onBlur={() => analyzeSubjectLine(baseForm.subject)} />
          {aiScore && !aiScore.is_optimal && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, marginLeft: 2 }}>Try adding a sense of urgency, a question, or an actionable hook to increase open rates.</div>}
        </div>
        <textarea style={{ ...inputStyle, minHeight: 100 }} placeholder="Paste raw text here..." value={baseForm.body} onChange={e => setBaseForm({ ...baseForm, body: e.target.value })} />
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={runPersonalization} disabled={!baseForm.subject || !baseForm.body} style={{ background: "#1d4ed8", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Personalize Context</button>
        </div>
      </div>

      <div style={sectionStyle(personalized !== null)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>2. AI Personalized Output</h3>
        <div style={{ color: "#d1d5db", fontSize: 14, marginBottom: 8 }}><strong>Subject:</strong> {personalized?.subject}</div>
        <div style={{ background: "#ffffff", color: "#000", padding: 15, borderRadius: 8, border: "1px solid #d1d5db" }} dangerouslySetInnerHTML={{ __html: personalized?.body }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          <button onClick={() => saveToDrafts(false)} style={{ background: "#10b981", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>💾 Save to Drafts (Skip A/B)</button>
          <button onClick={runABVariants} style={{ background: "#374151", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Generate A/B Test Variants ➔</button>
        </div>
      </div>

      <div style={sectionStyle(variants.length > 0)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>3. Select a Variant to Analyze & Review Formats</h3>
        <p style={{ fontSize: 12, color: "#9ca3af" }}>Click a variant below to see the HTML formatted output and run a spam check.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {variants.map((v, i) => (
            <div key={i} onMouseEnter={() => setHoveredVariant(i)} onMouseLeave={() => setHoveredVariant(null)} onClick={() => runSpamCheck(v)} style={{ background: selectedVariant === v ? "#1e3a8a" : hoveredVariant === i ? "#1f2937" : "#0d1117", padding: 16, borderRadius: 8, border: selectedVariant === v ? "1px solid #60a5fa" : "1px solid #374151", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: "bold" }}>{v.angle}</div>
              <div style={{ color: "#f9fafb", fontWeight: 600 }}>{v.subject}</div>
              <div style={{ color: "#6b7280", fontSize: 12, marginBottom: selectedVariant === v ? 12 : 0 }}>{v.rationale}</div>
              {selectedVariant === v && (
                <div style={{ borderTop: "1px solid #3b82f6", paddingTop: 12, marginTop: 8 }}>
                   <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 4, textTransform: "uppercase" }}>Formatting Preview:</div>
                   <div style={{ background: "#ffffff", color: "#000", padding: 12, borderRadius: 6, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: v.body }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={sectionStyle(spamScore !== null)}>
        <h3 style={{ marginTop: 0, color: "#22c55e" }}>4. Final Review & Save</h3>
        <div style={{ fontSize: 18, color: spamScore?.score > 5 ? "#f87171" : "#4ade80", marginBottom: 12 }}>Spam Score: {spamScore?.score}/10</div>
        {spamScore?.issues?.length > 0 && (
          <ul style={{ color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
             {spamScore.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
          </ul>
        )}
        <button onClick={() => saveToDrafts(true)} style={{ background: "#22c55e", color: "#fff", padding: "12px 24px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold", width: "100%" }}>💾 Save Complete A/B Test Campaign</button>
      </div>
    </div>
  );
}

function CampaignsPage({ campaigns, groups, recipients, onRefresh: parentRefresh, showToast, setGlobalLoading }) {
  const [reportData, setReportData] = useState(null);
  const [reportCampaignId, setReportCampaignId] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const reportPollRef = useRef(null);
  const [sendModal, setSendModal] = useState(null);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [campaignRevisions, setCampaignRevisions] = useState([]);
  const [openRevId, setOpenRevId] = useState(null);
  const [newCampModal, setNewCampModal] = useState(false);
  
  const [newCampName, setNewCampName] = useState("");
  const [newCampSubject, setNewCampSubject] = useState("");
  const [newCampBody, setNewCampBody] = useState("");
  
  const [isABTest, setIsABTest] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const [bodyHtmlB, setBodyHtmlB] = useState("");

  const [selRecs, setSelRecs] = useState([]);
  const [selGroups, setSelGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const pollRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");

  const [sendSenderName, setSendSenderName] = useState("");
  const [useAIPersonalization, setUseAIPersonalization] = useState(false);
  const [reportSearch, setReportSearch] = useState("");

  const fetchCampaigns = useCallback(async () => {
      const response = await api('/campaigns/'); 
      return response.data || response;
  }, []);

  const { data: fetchedCampaigns, isLoading, isRefreshing, refresh } = useApiCache('campaigns', fetchCampaigns);

  const onRefresh = () => {
      refresh();
      if (parentRefresh) parentRefresh();
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Not sent yet";
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  // --- NEW: PAUSE / RESUME / CANCEL LOGIC ---
  const handleStatusChange = async (campaignId, action) => {
    if (action === 'cancel' && !window.confirm("Are you sure you want to permanently cancel this campaign? The remaining queue will be dropped.")) return;
    
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api(`/campaigns/${campaignId}/${action}`, { method: "PATCH" });
      showToast(`Campaign ${action}ed successfully!`);
      onRefresh(); // Refresh the list to show the new status and buttons
    } catch (e) {
      showToast(e.message || `Failed to ${action} campaign`, "error");
    } finally {
      if (setGlobalLoading) setGlobalLoading(false);
    }
  };

  const loadReport = async (id, { silent = false } = {}) => {
    if (!silent) setReportLoading(true);
    try {
      const res = await api(`/campaigns/${id}/report?_t=${Date.now()}`);
      setReportData(res.logs || []);
    } catch (e) {
      if (!silent) showToast("Failed to load report", "error");
    } finally {
      if (!silent) setReportLoading(false);
    }
  };

  const stopReportPolling = () => {
    if (reportPollRef.current) {
      clearInterval(reportPollRef.current);
      reportPollRef.current = null;
    }
  };

  useEffect(() => stopReportPolling, []);

  useEffect(() => {
    if (!viewCampaign) { setCampaignRevisions([]); setOpenRevId(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/campaigns/${viewCampaign.id}/revisions?_t=${Date.now()}`);
        if (!cancelled) setCampaignRevisions(res.revisions || []);
      } catch {
        if (!cancelled) setCampaignRevisions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [viewCampaign]);

  const viewReport = async (id) => {
    setReportCampaignId(id);
    await loadReport(id);
    stopReportPolling();
    reportPollRef.current = setInterval(() => loadReport(id, { silent: true }), 15000);
  };

  const closeReport = () => {
    stopReportPolling();
    setReportData(null);
    setReportCampaignId(null);
  };

  const deleteCampaign = async (id) => {
    if (!window.confirm("Are you sure you want to delete this campaign?")) return;
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api(`/campaigns/${id}`, { method: "DELETE" });
      showToast("Campaign deleted successfully");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  if (isLoading) return <div style={{ color: "#fff", padding: "20px" }}>Loading Campaigns...</div>;
  
  const currentCampaigns = fetchedCampaigns || campaigns || [];
  const sortedCampaigns = [...currentCampaigns].sort((a, b) => new Date(b.sent_at || b.created_at || 0) - new Date(a.sent_at || a.created_at || 0));

  const fetchProgress = async (campaignId) => {
    try {
      const s = await api(`/campaigns/${campaignId}/queue-status`);
      setSendProgress(s);
      if (s.total === 0 || (s.pending + s.sending) === 0) {
        stopPolling();
        setSending(false);
        onRefresh();
      }
    } catch (e) { }
  };

  const closeSendModal = () => {
    stopPolling();
    setSendModal(null);
    setSendProgress(null);
    setSending(false);
    setSendSenderName("");
    setUseAIPersonalization(false);
    setSelRecs([]);
    setSelGroups([]);
  };

  const executeSend = async () => {
    if (sending) return;
    setSending(true);
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const res = await api(`/campaigns/${sendModal}/send`, {
        method: "POST",
        body: JSON.stringify({ recipient_ids: selRecs, group_ids: selGroups, personalize: useAIPersonalization, sender_name: sendSenderName })
      });
      showToast(`Queued ${res.queued ?? 0} recipient(s) for sending`);
      setSendProgress({
        total: (res.queued ?? 0) + (res.already_queued ?? 0),
        pending: res.queued ?? 0,
        sending: 0, sent: 0, failed: 0, skipped: 0,
        percent_complete: 0,
      });
      if (setGlobalLoading) setGlobalLoading(false);
      fetchProgress(sendModal);
      pollRef.current = setInterval(() => fetchProgress(sendModal), 2000);
    } catch (e) {
      showToast(e.message, "error");
      setSending(false);
      if (setGlobalLoading) setGlobalLoading(false);
    }
  };

  const createCampaign = async () => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      const payload = { 
        name: newCampName, subject: newCampSubject, body_html: newCampBody,
        is_ab_test: isABTest, subject_b: isABTest ? subjectB : null, body_html_b: isABTest ? bodyHtmlB : null
      };
      await api("/campaigns/", { method: "POST", body: JSON.stringify(payload) });
      showToast("Campaign created successfully");
      setNewCampModal(false);
      setNewCampName(""); setNewCampSubject(""); setNewCampBody("");
      setIsABTest(false); setSubjectB(""); setBodyHtmlB("");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  const saveEditedCampaign = async () => {
    if (setGlobalLoading) setGlobalLoading(true);
    try {
      await api(`/campaigns/${viewCampaign.id}`, {
        method: "PUT", body: JSON.stringify({ body_html: editedContent })
      });
      showToast("Content updated successfully");
      setIsEditing(false);
      setViewCampaign({ ...viewCampaign, body_html: editedContent });
      onRefresh();
    } catch (e) { showToast(e.message, "error"); } 
    finally { if (setGlobalLoading) setGlobalLoading(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb" }}>Campaigns</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={refresh} disabled={isRefreshing} style={{ background: isRefreshing ? "#1f2937" : "#374151", color: isRefreshing ? "#9ca3af" : "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: isRefreshing ? "wait" : "pointer", fontWeight: "bold", transition: "all 0.2s" }}>
              {isRefreshing ? "↻ Refreshing..." : "⟳ Refresh"}
          </button>
          <button onClick={() => setNewCampModal(true)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            + New Campaign
          </button>
        </div>
      </div>

      {/* ... (Keep your existing Modals exactly the same: newCampModal, viewCampaign, reportData, sendModal) ... */}
      
      {/* ADDING MODALS HERE FOR COMPLETENESS SO COPY-PASTE WORKS */}
      {newCampModal && (
        <ModalOverlay title="Create New Campaign" onClose={() => setNewCampModal(false)}>
          <input placeholder="Campaign Name (e.g. Q3 Newsletter)" value={newCampName} onChange={e => setNewCampName(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 15, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }} />
          <div style={{ background: "#1f2937", padding: 15, borderRadius: 8, marginBottom: 15 }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#9ca3af" }}>Variant A (Standard)</h4>
            <input placeholder="Subject Line" value={newCampSubject} onChange={e => setNewCampSubject(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }} />
            <div style={{ background: "#fff", color: "#000", borderRadius: 8, overflow: "hidden" }}>
              <ReactQuill theme="snow" value={newCampBody} onChange={setNewCampBody} style={{ minHeight: 120 }} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#d1d5db", marginBottom: 15, cursor: "pointer" }}>
            <input type="checkbox" checked={isABTest} onChange={(e) => setIsABTest(e.target.checked)} style={{ accentColor: "#3b82f6", width: 18, height: 18 }} />
            Enable A/B Testing
          </label>
          {isABTest && (
            <div style={{ background: "#1f2937", padding: 15, borderRadius: 8, marginBottom: 15, borderLeft: "4px solid #3b82f6" }}>
              <h4 style={{ margin: "0 0 10px 0", color: "#60a5fa" }}>Variant B (Test Group)</h4>
              <input placeholder="Variant B Subject Line" value={subjectB} onChange={e => setSubjectB(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }} />
              <div style={{ background: "#fff", color: "#000", borderRadius: 8, overflow: "hidden" }}>
                <ReactQuill theme="snow" value={bodyHtmlB} onChange={setBodyHtmlB} style={{ minHeight: 120 }} />
              </div>
            </div>
          )}
          <button onClick={createCampaign} style={{ width: "100%", background: "#10b981", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>Save Campaign</button>
        </ModalOverlay>
      )}

      {viewCampaign && (
        <ModalOverlay title="Campaign Details" onClose={() => setViewCampaign(null)}>
          <div style={{ color: "#d1d5db", fontSize: 14 }}>
            <div style={{ marginBottom: 12 }}><span style={{ color: "#9ca3af", fontWeight: "bold" }}>Campaign Name:</span> {viewCampaign.name}</div>
            <div style={{ marginBottom: 12 }}><span style={{ color: "#9ca3af", fontWeight: "bold" }}>Subject Line:</span> {viewCampaign.subject}</div>
            <div style={{ marginBottom: 20 }}><span style={{ color: "#9ca3af", fontWeight: "bold" }}>Sent On:</span> <span style={{ color: "#4ade80" }}>{formatDate(viewCampaign.sent_at)}</span></div>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #374151", paddingTop: 16, marginBottom: 8 }}>
              <div style={{ color: "#9ca3af", fontWeight: "bold" }}>Email Content:</div>
              {!['sending', 'sent', 'paused', 'completed'].includes(viewCampaign.status) && (
                !isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>✏️ Edit Content</button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setIsEditing(false); setEditedContent(viewCampaign.body_html); }} style={{ background: "transparent", color: "#f87171", border: "1px solid #f87171", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                    <button onClick={saveEditedCampaign} style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>💾 Save</button>
                  </div>
                )
              )}
            </div>

            {isEditing ? (
              <div style={{ background: "#fff", color: "#000", borderRadius: 8, overflow: "hidden" }}>
                <ReactQuill theme="snow" value={editedContent} onChange={setEditedContent} style={{ minHeight: 200 }} />
              </div>
            ) : (
              <div style={{ background: "#ffffff", color: "#000", padding: 20, borderRadius: 8, border: "1px solid #d1d5db", maxHeight: "40vh", overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: viewCampaign.body_html }} />
            )}
          </div>
        </ModalOverlay>
      )}

      {reportData && (
        <ModalOverlay title="Detailed Tracking Report" onClose={closeReport}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {reportData.length} recipient(s) · auto-refreshes every 15s
            </span>
            <button onClick={() => loadReport(reportCampaignId)} disabled={reportLoading} style={{ background: "#1f2937", color: "#60a5fa", border: "1px solid #374151", borderRadius: 6, padding: "6px 12px", cursor: reportLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
              {reportLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
          <table style={{ width: "100%", textAlign: "left", color: "#d1d5db", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#9ca3af", borderBottom: "1px solid #374151" }}>
                <th style={{ padding: "8px 0" }}>Recipient</th>
                <th style={{ padding: "8px 0" }}>Variant</th>
                <th style={{ padding: "8px 0" }}>Opens</th>
                <th style={{ padding: "8px 0" }}>Clicks</th>
              </tr>
            </thead>
            <input type="text" placeholder="🔍 Search recipient..." value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} style={{ width: "100%", padding: "10px", marginBottom: "15px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", boxSizing: "border-box" }} />
            <tbody>
              {reportData.filter(log => (log.email || "").toLowerCase().includes(reportSearch.toLowerCase())).map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                  <td style={{ padding: "10px 0", color: "#f9fafb" }}>{log.email}</td>
                  <td style={{ padding: "10px 0" }}><span style={{ background: log.variant === 'A' ? '#374151' : '#1e3a8a', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{log.variant}</span></td>
                  <td style={{ padding: "10px 0", color: log.opens > 0 ? "#4ade80" : "#9ca3af", fontWeight: log.opens > 0 ? "bold" : "normal" }}>{log.opens}</td>
                  <td style={{ padding: "10px 0", color: log.clicks > 0 ? "#a78bfa" : "#9ca3af", fontWeight: log.clicks > 0 ? "bold" : "normal" }}>{log.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ModalOverlay>
      )}

      {sendModal && (
        <ModalOverlay title={sendProgress ? "Sending Progress" : "Target Audience Selection"} onClose={closeSendModal}>
          {sendProgress ? (
            (() => {
              const done = sendProgress.total === 0 || (sendProgress.pending + sendProgress.sending) === 0;
              const pctVal = sendProgress.total > 0 ? sendProgress.percent_complete : (done ? 100 : 0);
              return (
                <div>
                  {sendProgress.total === 0 ? (
                    <div style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
                      Nothing new to send — all selected recipients were already queued or processed.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                        <span style={{ color: "#d1d5db", fontSize: 14, fontWeight: 600 }}>{done ? "✅ Completed" : "📤 Sending…"}</span>
                        <span style={{ color: "#f9fafb", fontSize: 20, fontWeight: 700, fontFamily: "'Space Grotesk', monospace" }}>{pctVal}%</span>
                      </div>
                      <div style={{ height: 12, background: "#0d1117", borderRadius: 999, overflow: "hidden", border: "1px solid #1f2937" }}>
                        <div style={{ width: `${Math.min(100, pctVal)}%`, height: "100%", background: done ? "#22c55e" : "#3b82f6", transition: "width 0.4s ease" }} />
                      </div>
                    </>
                  )}
                  <button onClick={closeSendModal} style={{ marginTop: 20, width: "100%", background: done ? "#22c55e" : "#374151", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
                    {done ? "Done" : "Run in Background"}
                  </button>
                </div>
              );
            })()
          ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <h4 style={{ color: "#d1d5db", marginTop: 0 }}>Select Groups</h4>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #1f2937", padding: 12, borderRadius: 8, background: "#0d1117" }}>
                {groups.map(g => (
                  <label key={g.id} style={{ display: "block", marginBottom: 8, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={selGroups.includes(g.id)} onChange={() => setSelGroups(p => p.includes(g.id) ? p.filter(x => x !== g.id) : [...p, g.id])} style={{ marginRight: 8, accentColor: "#3b82f6" }} /> {g.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button onClick={executeSend} style={{ marginTop: 20, width: "100%", background: "#22c55e", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            Confirm & Send Campaign
          </button>
          </>
          )}
        </ModalOverlay>
      )}

      {/* --- THE UPDATED CAMPAIGN LIST UI --- */}
      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {sortedCampaigns.map(c => (
          <div key={c.id} style={{ background: "#111827", borderRadius: 12, padding: "18px 24px", border: "1px solid #1f2937", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            
            <div style={{ flex: 1, minWidth: "250px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 600, color: "#f9fafb", fontSize: 16 }}>{c.name}</span>
                {/* Visual Status Indicator */}
                {c.status === "sending" && <span style={{ background: "#064e3b", color: "#34d399", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: "bold" }}>Sending</span>}
                {c.status === "paused" && <span style={{ background: "#78350f", color: "#fbbf24", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: "bold" }}>Paused</span>}
                {c.status === "cancelled" && <span style={{ background: "#7f1d1d", color: "#fca5a5", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: "bold" }}>Cancelled</span>}
                {c.status === "completed" && <span style={{ background: "#1e3a8a", color: "#60a5fa", fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: "bold" }}>Completed</span>}
              </div>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                {c.is_ab_test ? <span style={{ color: "#60a5fa", marginRight: 8, fontSize: 11, background: "#1e3a8a", padding: "2px 6px", borderRadius: 4 }}>A/B Test</span> : null}
                {c.subject}
              </div>
            </div>

            <div style={{ textAlign: "right", marginRight: 20, minWidth: 120 }}>
              <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: "bold" }}>Sent: {c.total_sent || 0}</div>
              <div style={{ fontSize: 12, color: "#4ade80" }}>Open Rate: {c.open_rate ? `${Number(c.open_rate || 0).toFixed(1)}%` : "0.0%"}</div>
              <div style={{ fontSize: 12, color: "#a78bfa" }}>Click Rate: {c.click_rate ? `${Number(c.click_rate || 0).toFixed(1)}%` : "0.0%"}</div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => { setViewCampaign(c); setIsEditing(false); setEditedContent(c.body_html); }} style={{ background: "transparent", color: "#60a5fa", border: "1px solid #1e3a8a", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: "bold" }}>🔍 Details</button>
              
              {/* Dynamic Action Buttons based on Status */}
              {['sending', 'sent', 'paused', 'completed', 'cancelled'].includes(c.status) && (
                <button onClick={() => viewReport(c.id)} style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>📊 Report</button>
              )}

              {/* Show Pause/Cancel if Sending */}
              {c.status === 'sending' && (
                <>
                  <button onClick={() => handleStatusChange(c.id, 'pause')} style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>⏸️ Pause</button>
                  <button onClick={() => handleStatusChange(c.id, 'cancel')} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>⏹️ Cancel</button>
                </>
              )}

              {/* Show Resume/Cancel if Paused */}
              {c.status === 'paused' && (
                <>
                  <button onClick={() => handleStatusChange(c.id, 'resume')} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>▶️ Resume</button>
                  <button onClick={() => handleStatusChange(c.id, 'cancel')} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>⏹️ Cancel</button>
                </>
              )}

              {/* Show Send Now if it hasn't been queued yet */}
              {!['sending', 'sent', 'paused', 'completed', 'cancelled'].includes(c.status) && (
                <button onClick={() => { setSelRecs([]); setSelGroups([]); setSendProgress(null); setSendModal(c.id); }} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>Send Now ▶</button>
              )}
              
              <button onClick={() => deleteCampaign(c.id)} style={{ background: "transparent", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [overview, setOverview] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [toast, setToast] = useState(null);
  const [showSmtpSettings, setShowSmtpSettings] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_username: "", smtp_password: "" });

  const formatPercentage = (value) => `${Number(value || 0).toFixed(1)}%`;

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setGlobalLoading(true);
    try {
      await api("/settings/smtp", { method: "POST", body: JSON.stringify(smtpForm) });
      showToast("SMTP settings saved securely!");
      setShowSmtpSettings(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const loadAllData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [ov, tl, cmp, grp] = await Promise.all([
        api('/analytics/overview').catch(() => ({})),
        api('/analytics/opens-over-time').catch(() => []),
        api('/campaigns/').catch(() => []),
        api('/groups/').catch(() => [])
      ]);

      setOverview(ov.data || ov);
      setTimeline(Array.isArray(tl.data || tl) ? (tl.data || tl) : (tl?.timeline || []));
      setCampaigns(Array.isArray(cmp.data || cmp) ? (cmp.data || cmp) : (cmp?.campaigns || []));
      setGroups(Array.isArray(grp.data || grp) ? (grp.data || grp) : (grp?.groups || []));
    } catch (e) {
      console.error(e);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated, loadAllData]);

  const pieData = [
      { name: "Hot", value: overview?.engagement_breakdown?.hot || 0, fill: "#22c55e" },
      { name: "Warm", value: overview?.engagement_breakdown?.warm || 0, fill: "#f59e0b" },
      { name: "Cold", value: overview?.engagement_breakdown?.cold || 0, fill: "#60a5fa" },
      { name: "Inactive", value: overview?.engagement_breakdown?.inactive || 0, fill: "#f87171" }
  ];

  if (!isAuthenticated) {
    return <AuthPage onLogin={(token) => { setToken(token); setIsAuthenticated(true); }} showToast={showToast} />;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      <GlobalLoader active={globalLoading} />
      
      <div className="app-container">
        
        <div className="hamburger" onClick={() => setSidebarOpen(true)}>☰ MailPulse</div>

        {sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} />
        )}

        <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div style={{ marginBottom: 24, padding: "0 8px", marginTop: "10px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa", letterSpacing: "-0.5px" }}>✉️ MailPulse</div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>AI Email Intelligence</div>
          </div>
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "dashboard", icon: "📊", label: "Dashboard" },
              { id: "campaigns", icon: "📨", label: "Campaigns" },
              { id: "recipients", icon: "👥", label: "Recipients" },
              { id: "groups", icon: "📂", label: "Groups" },
              { id: "compose", icon: "✍️", label: "Smart Compose" },
              { id: "senders", icon: "📬", label: "Sender Accounts" },
              { id: "settings", icon: "🔧", label: "Profile Details" }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => { setPage(item.id); setSidebarOpen(false); }}
                style={{
                  background: page === item.id ? "#1d4ed820" : "transparent",
                  color: page === item.id ? "#60a5fa" : "#9ca3af",
                  border: page === item.id ? "1px solid #1d4ed840" : "1px solid transparent",
                  padding: "10px 16px", borderRadius: 8, textAlign: "left", cursor: "pointer",
                  fontSize: 14, fontWeight: page === item.id ? "600" : "400", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 10
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </nav>

          <div style={{ marginTop: "auto", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowSmtpSettings(true)} style={{ background: "transparent", color: "#60a5fa", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "left", padding: "8px 0" }}>⚙️ SMTP Defaults</button>
            <button onClick={handleLogout} style={{ background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "left", padding: "8px 0" }}>🚪 Logout</button>
          </div>
        </div>

        <main className="main-content">
          {page === "dashboard" && <DashboardPage overview={overview} timeline={timeline} pieData={pieData} pct={formatPercentage} />}
          {page === "settings" && <SettingsPage />}
          {page === "senders" && <SenderAccountManager showToast={showToast} setGlobalLoading={setGlobalLoading} />}
          
          {page === "campaigns" && (
            <CampaignsPage 
              campaigns={campaigns} 
              groups={groups} 
              onRefresh={loadAllData} 
              showToast={showToast}
              setGlobalLoading={setGlobalLoading} 
            />
          )}
          
          {page === "recipients" && (
            <RecipientsPage 
              groups={groups} 
              showToast={showToast} 
              setGlobalLoading={setGlobalLoading}
            />
          )}
          
          {page === "groups" && (
            <GroupsPage 
              groups={groups} 
              onRefresh={loadAllData} 
              showToast={showToast}
              setGlobalLoading={setGlobalLoading} 
            />
          )}
          
          {page === "compose" && <UnifiedAIFlowPage showToast={showToast} onRefresh={loadAllData} setGlobalLoading={setGlobalLoading} />}

          {showSmtpSettings && (
            <ModalOverlay title="Configure Your Outbound SMTP Server" onClose={() => setShowSmtpSettings(false)}>
              <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Connect your custom sender email. If using Gmail, you must enter a 16-character <strong>App Password</strong>, not your regular login password.</p>
                <div><label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Host</label><input value={smtpForm.smtp_host} onChange={e => setSmtpForm({...smtpForm, smtp_host: e.target.value})} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required /></div>
                <div><label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Port</label><input type="number" value={smtpForm.smtp_port} onChange={e => setSmtpForm({...smtpForm, smtp_port: parseInt(e.target.value) || 587})} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required /></div>
                <div><label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>Sender Email Address (Username)</label><input type="email" placeholder="you@gmail.com" value={smtpForm.smtp_username} onChange={e => setSmtpForm({...smtpForm, smtp_username: e.target.value})} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required /></div>
                <div><label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Password / App Password</label><input type="password" placeholder="xxxx xxxx xxxx xxxx" value={smtpForm.smtp_password} onChange={e => setSmtpForm({...smtpForm, smtp_password: e.target.value})} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required /></div>
                <button type="submit" style={{ background: "#22c55e", color: "#fff", border: "none", padding: 12, borderRadius: 8, fontWeight: "bold", cursor: "pointer", marginTop: 10 }}>Save Server Settings</button>
              </form>
            </ModalOverlay>
          )}

        </main>
      </div>
      
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: toast.type === "error" ? "#7f1d1d" : "#065f46", color: toast.type === "error" ? "#fca5a5" : "#34d399", padding: "12px 24px", borderRadius: 8, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)", zIndex: 100000, fontWeight: "bold" }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}