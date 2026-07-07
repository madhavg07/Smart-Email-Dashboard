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
const scoreColor = (s) =>
  s >= 0.75 ? "#22c55e" : s >= 0.5 ? "#f59e0b" : s >= 0.25 ? "#60a5fa" : "#f87171";
const scoreLabel = (s) =>
  s >= 0.75 ? "Hot 🔥" : s >= 0.5 ? "Warm ☀️" : s >= 0.25 ? "Cold 🌧" : "Inactive 💤";

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
      <div style={{ background: "#111827", padding: 24, borderRadius: 12, border: "1px solid #3b82f6", width: "100%", maxWidth: 650, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid #1f2937", paddingBottom: 12 }}>
          <h3 style={{ margin: 0, color: "#60a5fa", fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 20, fontWeight: "bold" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, paddingRight: 8 }}>{children}</div>
      </div>
    </div>
  );
}

function DashboardPage({ overview, timeline, pieData, campaigns, pct }) {
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: "#f9fafb" }}>Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Sent" value={(overview?.total_emails_sent || 0).toLocaleString()} sub="all time" accent="#60a5fa" />
        <StatCard label="Avg Open Rate" value={pct(overview?.avg_open_rate || 0)} sub={`${(overview?.unique_opens || 0).toLocaleString()} opens`} accent="#22c55e" />
        <StatCard label="Avg Click Rate" value={pct(overview?.avg_click_rate || 0)} sub={`${(overview?.unique_clicks || 0).toLocaleString()} clicks`} accent="#a78bfa" />
        <StatCard label="Suppressed" value={overview?.suppressed_recipients || 0} sub="auto-filtered" accent="#f87171" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#111827", borderRadius: 12, padding: 20, border: "1px solid #1f2937" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#d1d5db", marginBottom: 16 }}>Opens Over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d?.slice(5) || d} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, color: "#f9fafb" }} />
              <Line type="monotone" dataKey="opens" stroke="#60a5fa" strokeWidth={2} dot={false} />
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

function GroupsPage({ groups, recipients, onRefresh, showToast }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewGroup, setViewGroup] = useState(null);

  const safeRecipients = recipients || [];

  const addGroup = async () => {
    if (!name) return showToast("Group name required", "error");
    setLoading(true);
    try {
      await api("/groups/", { method: "POST", body: JSON.stringify({ name, description: desc }) });
      showToast("Group created successfully");
      setName(""); setDesc("");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const deleteGroup = async (id) => {
    try {
      await api(`/groups/${id}`, { method: "DELETE" });
      showToast("Group deleted");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleAddRecipient = async (groupId, recipientId) => {
    if (!recipientId) return;
    try {
      await api(`/groups/${groupId}/add_recipient`, { method: "POST", body: JSON.stringify({ recipient_id: recipientId }) });
      showToast("Recipient added to group");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
  };

  const groupMembers = viewGroup ? safeRecipients.filter(r => (r.metadata_?.group_ids || []).includes(viewGroup.id)) : [];

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Recipient Groups</h1>

      {viewGroup && (
        <ModalOverlay title={`Members of "${viewGroup.name}"`} onClose={() => setViewGroup(null)}>
          {groupMembers.length === 0 ? (
            <div style={{ color: "#9ca3af", textAlign: "center", padding: 20 }}>No recipients in this group yet.</div>
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
          <button onClick={addGroup} disabled={loading} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>Create Group</button>
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
              <button onClick={() => setViewGroup(g)} style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>👥 View List</button>
              <select onChange={(e) => { handleAddRecipient(g.id, e.target.value); e.target.value = ""; }} style={{ padding: "6px", borderRadius: 6, background: "#0d1117", border: "1px solid #374151", color: "#9ca3af", outline: "none", fontSize: 12 }}>
                <option value="">+ Add Member</option>
                {safeRecipients.filter(r => !(r.metadata_?.group_ids || []).includes(g.id)).map(r => (
                  <option key={r.id} value={r.id}>{r.email}</option>
                ))}
              </select>
              <button onClick={() => deleteGroup(g.id)} style={{ background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 13 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipientsPage({ recipients, groups, onRefresh, showToast, skip, setSkip, limit }) {
  const [filter, setFilter] = useState("all");
  // const [search, setSearch] = useState("");
  const [newRecipient, setNewRecipient] = useState({ email: "", name: "", role: "", industry: "", company: "", newGroupName: "" });
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  
  const fileInputRef = useRef(null);

  const safeRecipients = Array.isArray(recipients) ? recipients : (recipients?.data || []);
  const totalCount = recipients?.total || safeRecipients.length;

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("default");

  // Unified Filter & Sort Pipeline
  const processedRecipients = safeRecipients
    .filter(r => {
      // 1. Tab Filters
      if (filter === "suppressed" && !r.is_suppressed) return false;
      if (filter === "hot" && (r.seriousness_score || 0) < 0.75) return false;
      if (filter === "active" && r.is_suppressed) return false;
      
      // 2. Search Bar Filter
      const term = searchTerm.toLowerCase();
      if (term) {
        const emailMatch = (r.email || "").toLowerCase().includes(term);
        const nameMatch = (r.name || "").toLowerCase().includes(term);
        if (!emailMatch && !nameMatch) return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      // 3. Sort Logic
      if (sortBy === "opens") return (b.total_opens || 0) - (a.total_opens || 0);
      if (sortBy === "clicks") return (b.total_clicks || 0) - (a.total_clicks || 0);
      return 0;
    });

  const toggleSuppress = async (id, suppress) => {
    try {
      await api(`/recipients/${id}/suppress?suppress=${suppress}`, { method: "PATCH" });
      onRefresh();
    } catch { }
  };

  const updateNewRecipient = (key, value) => setNewRecipient(curr => ({ ...curr, [key]: value }));
  const handleToggleGroup = (id) => setSelectedGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const initiateGroupSelection = () => {
    if (!newRecipient.email) return showToast("Please enter an email address first", "error");
    setShowGroupModal(true);
  };

  const addRecipient = async () => {
    setSaving(true);
    try {
      await api("/recipients/", {
        method: "POST",
        body: JSON.stringify({ ...newRecipient, group_ids: selectedGroups, new_group_name: newRecipient.newGroupName || null })
      });
      showToast("Recipient added successfully");
      setNewRecipient({ email: "", name: "", role: "", industry: "", company: "", newGroupName: "" });
      setSelectedGroups([]);
      setShowGroupModal(false);
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const [uploadGroupId, setUploadGroupId] = useState("");

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      // Attach the selected group ID to the form data (if they chose one!)
      if (uploadGroupId) {
        formData.append("group_id", uploadGroupId);
      }

      const authToken = localStorage.getItem("mailpulse_token");

      const response = await fetch("https://smart-email-dashboard.onrender.com/api/recipients/upload-csv", {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unauthorized or Server Error");
      }

      const data = await response.json();
      showToast(data.message || "CSV Uploaded", "success");
      onRefresh();
    } catch (e) {
      showToast(e.message || "Failed to upload CSV", "error");
    } finally {
      setSaving(false);
      event.target.value = null;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>
          Recipients <span style={{ fontSize: 16, color: "#6b7280", fontWeight: 500 }}>({totalCount} Total)</span>
        </h1>
        
        <div>
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            style={{ display: "none" }} 
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {/* THE NEW DROPDOWN */}
              <select 
                value={uploadGroupId} 
                onChange={(e) => setUploadGroupId(e.target.value)}
                style={{ padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#f9fafb", fontSize: 13, outline: "none" }}
              >
                <option value="">No Group (Default)</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                style={{ display: "none" }} 
              />
              <button 
                onClick={() => fileInputRef.current.click()} 
                disabled={saving}
                style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Uploading..." : "Upload CSV"}
              </button>
            </div>
          </div>
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
              <input value={newRecipient.newGroupName} onChange={e => updateNewRecipient("newGroupName", e.target.value)} placeholder="Type new group name..." style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #374151", color: "#f9fafb", fontSize: 13, outline: "none" }} />
              <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>This group will be created instantly and the recipient will be added to it.</p>
            </div>
          </div>
          <button onClick={addRecipient} disabled={saving} style={{ width: "100%", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving..." : "Confirm & Add Recipient"}
          </button>
        </ModalOverlay>
      )}

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: 20, margin: "20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
          {["email", "name", "role", "industry", "company"].map(key => (
            <input key={key} value={newRecipient[key]} onChange={e => updateNewRecipient(key, e.target.value)} placeholder={key.charAt(0).toUpperCase() + key.slice(1)} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb", fontSize: 13, outline: "none" }} />
          ))}
        </div>
        <button onClick={initiateGroupSelection} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Choose Groups & Save ➔</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all", "hot", "active", "suppressed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500, background: filter === f ? "#1d4ed8" : "#111827", color: filter === f ? "#fff" : "#9ca3af", border: filter === f ? "1px solid #3b82f6" : "1px solid #1f2937" }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 15, marginBottom: 20 }}>
        <input 
            type="text" 
            placeholder="🔍 Search email or name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: "10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff", flex: 1 }}
        />
        <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: "10px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }}
        >
            <option value="default">Default Sort</option>
            <option value="opens">🔥 Most Opens</option>
            <option value="clicks">🖱️ Most Clicks</option>
        </select>
      </div>

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0d1117", color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
              {["Recipient", "Groups", "Engagement", "Stats", "Action"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 16px" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {processedRecipients.map(r => {
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
              onClick={() => {
                setSkip(skip - limit);
                onRefresh(); 
              }} 
              disabled={skip === 0}
              style={{ padding: "8px 16px", borderRadius: 8, background: skip === 0 ? "#1f2937" : "#374151", color: skip === 0 ? "#6b7280" : "#f9fafb", border: "none", cursor: skip === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}
            >
              ← Previous
            </button>
            <button 
              onClick={() => {
                setSkip(skip + limit);
                onRefresh();
              }} 
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

function CampaignsPage({ campaigns, recipients, groups, onRefresh, showToast }) {
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

  const { data: fetchedCampaigns, isLoading, refresh } = useApiCache('campaigns', async () => {
        const response = await api.get('/campaigns/'); 
        return response.data;
  });

  // Clean up the report timer if the component unmounts with it open.
  useEffect(() => stopReportPolling, []);

  // Load content-revision history whenever the campaign detail modal opens.
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

  // Clean up the polling timer if the component unmounts mid-send.
  useEffect(() => stopPolling, []);

if (isLoading) return <div style={{ color: "#fff", padding: "20px" }}>Loading Campaigns...</div>;
  // 2. Safely combine them: use the freshly fetched data, or fallback to the prop
  const currentCampaigns = fetchedCampaigns || campaigns || [];

  const sortedCampaigns = [...currentCampaigns].sort((a, b) => {
    const dateA = new Date(a.sent_at || a.created_at || 0);
    const dateB = new Date(b.sent_at || b.created_at || 0);
    return dateB - dateA;
  });


  const formatDate = (dateString) => {
    if (!dateString) return "Not sent yet";
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  // Cache-busted fetch — the report GET was being served stale (showing days-old
  // data) because the response sat in an HTTP cache. The ?_t param + the backend
  // no-store headers guarantee a fresh pull every time.
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

  const viewReport = async (id) => {
    setReportCampaignId(id);
    await loadReport(id);
    // Keep the open report live as opens/clicks trickle in.
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
    try {
      await api(`/campaigns/${id}`, { method: "DELETE" });
      showToast("Campaign deleted successfully");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchProgress = async (campaignId) => {
    try {
      const s = await api(`/campaigns/${campaignId}/queue-status`);
      setSendProgress(s);
      // Done when nothing is left pending or actively sending.
      if (s.total === 0 || (s.pending + s.sending) === 0) {
        stopPolling();
        setSending(false);
        onRefresh();
      }
    } catch (e) {
      // Ignore transient errors while polling; keep the last known progress.
    }
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
    try {
      const res = await api(`/campaigns/${sendModal}/send`, {
        method: "POST",
        body: JSON.stringify({ recipient_ids: selRecs, group_ids: selGroups, personalize: useAIPersonalization, sender_name: sendSenderName })
      });
      showToast(`Queued ${res.queued ?? 0} recipient(s) for sending`);
      // Switch the modal into live-progress mode, then poll queue-status.
      setSendProgress({
        total: (res.queued ?? 0) + (res.already_queued ?? 0),
        pending: res.queued ?? 0,
        sending: 0, sent: 0, failed: 0, skipped: 0,
        percent_complete: 0,
      });
      fetchProgress(sendModal);
      pollRef.current = setInterval(() => fetchProgress(sendModal), 2000);
    } catch (e) {
      showToast(e.message, "error");
      setSending(false);
    }
  };

  const createCampaign = async () => {
    try {
      const payload = { 
        name: newCampName, 
        subject: newCampSubject, 
        body_html: newCampBody,
        is_ab_test: isABTest,
        subject_b: isABTest ? subjectB : null,
        body_html_b: isABTest ? bodyHtmlB : null
      };
      await api("/campaigns/", { method: "POST", body: JSON.stringify(payload) });
      showToast("Campaign created successfully");
      setNewCampModal(false);
      setNewCampName(""); setNewCampSubject(""); setNewCampBody("");
      setIsABTest(false); setSubjectB(""); setBodyHtmlB("");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
  };

  const saveEditedCampaign = async () => {
    try {
      await api(`/campaigns/${viewCampaign.id}`, {
        method: "PUT",
        body: JSON.stringify({ body_html: editedContent })
      });
      showToast("Content updated successfully");
      setIsEditing(false);
      setViewCampaign({ ...viewCampaign, body_html: editedContent });
      onRefresh();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb" }}>Campaigns</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={refresh} style={{ background: "#374151", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            ⟳ Refresh
          </button>
          <button onClick={() => setNewCampModal(true)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            + New Campaign
          </button>
        </div>
      </div>

      {newCampModal && (
        <ModalOverlay title="Create New Campaign" onClose={() => setNewCampModal(false)}>
          <input placeholder="Campaign Name (e.g. Q3 Newsletter)" value={newCampName} onChange={e => setNewCampName(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 15, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }} />
          <div style={{ background: "#1f2937", padding: 15, borderRadius: 8, marginBottom: 15 }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#9ca3af" }}>Variant A (Standard)</h4>
            <input placeholder="Subject Line" value={newCampSubject} onChange={e => setNewCampSubject(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }} />
            
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
              <input placeholder="Variant B Subject Line" value={subjectB} onChange={e => setSubjectB(e.target.value)} style={{ width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }} />
              
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

            {campaignRevisions.length > 0 && (
              <div style={{ marginTop: 20, borderTop: "1px solid #374151", paddingTop: 16 }}>
                <div style={{ color: "#9ca3af", fontWeight: "bold", marginBottom: 4 }}>📝 Content History</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                  This campaign's content was automatically rewritten because engagement was low (likely spam-foldered). The version shown above is the current live one.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {campaignRevisions.map(rev => (
                    <div key={rev.id} style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: "bold", padding: "2px 8px", borderRadius: 4, marginRight: 8, background: rev.source === "auto_ai" ? "#1e3a8a" : "#374151", color: "#fff" }}>
                            {rev.source === "auto_ai" ? "AI Rewrite" : rev.source === "original" ? "Original" : rev.source}
                          </span>
                          <span style={{ fontSize: 12, color: "#f9fafb" }}>{rev.subject}</span>
                        </div>
                        <button onClick={() => setOpenRevId(openRevId === rev.id ? null : rev.id)} style={{ flexShrink: 0, background: "transparent", color: "#60a5fa", border: "1px solid #1e3a8a", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
                          {openRevId === rev.id ? "Hide" : "View"}
                        </button>
                      </div>
                      {rev.reason && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>{rev.reason}</div>}
                      {openRevId === rev.id && (
                        <div style={{ background: "#ffffff", color: "#000", padding: 12, borderRadius: 6, marginTop: 8, maxHeight: "30vh", overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: rev.body_html }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
            {/* The new search bar */}
            <input 
                type="text" 
                placeholder="🔍 Search recipient..." 
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                style={{ width: "100%", padding: "10px", marginBottom: "15px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }}
            />
            <tbody>
              {reportData
                .filter(log => (log.email || "").toLowerCase().includes(reportSearch.toLowerCase()))
                .map((log, i) => (
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
                        <span style={{ color: "#f9fafb", fontSize: 20, fontWeight: 700, fontFamily: "'Space Grotesk', monospace" }}>{fmt(pctVal)}%</span>
                      </div>
                      <div style={{ height: 12, background: "#0d1117", borderRadius: 999, overflow: "hidden", border: "1px solid #1f2937" }}>
                        <div style={{ width: `${Math.min(100, pctVal)}%`, height: "100%", background: done ? "#22c55e" : "#3b82f6", transition: "width 0.4s ease" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 16 }}>
                        {[
                          { label: "Sent", value: sendProgress.sent, color: "#4ade80" },
                          { label: "Pending", value: sendProgress.pending + sendProgress.sending, color: "#facc15" },
                          { label: "Failed", value: sendProgress.failed, color: "#f87171" },
                          { label: "Skipped", value: sendProgress.skipped, color: "#9ca3af" },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                            <div style={{ color: stat.color, fontSize: 20, fontWeight: 700 }}>{stat.value}</div>
                            <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12, textAlign: "center", marginTop: 12 }}>
                        {sendProgress.sent + sendProgress.failed + sendProgress.skipped} of {sendProgress.total} processed
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
            <div>
              <h4 style={{ color: "#d1d5db", marginTop: 0 }}>Select Specific Recipients</h4>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #1f2937", padding: 12, borderRadius: 8, background: "#0d1117" }}>
                {recipients.filter(r => !r.is_suppressed).map(r => (
                  <label key={r.id} style={{ display: "block", marginBottom: 8, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={selRecs.includes(r.id)} onChange={() => setSelRecs(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} style={{ marginRight: 8, accentColor: "#3b82f6" }} /> {r.email}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#d1d5db", cursor: "pointer" }}>
              <input 
                type="checkbox" 
                checked={useAIPersonalization} 
                onChange={(e) => setUseAIPersonalization(e.target.checked)} 
                style={{ accentColor: "#3b82f6", width: 18, height: 18 }} 
              />
              Run AI Personalization before sending (Auto-injects names/roles)
            </label>
          </div>
          <div style={{ marginTop: 20 }}>
            <h4 style={{ color: "#d1d5db", marginTop: 0 }}>Sender Identity</h4>
            <input 
              placeholder="Authority Name (e.g. University Placement Cell)" 
              value={sendSenderName} 
              onChange={e => setSendSenderName(e.target.value)} 
              style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#fff" }} 
            />
          </div>
          <button onClick={executeSend} disabled={sending} style={{ marginTop: 20, width: "100%", background: "#22c55e", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            {sending ? "Processing..." : "Confirm & Send Campaign"}
          </button>
          </>
          )}
        </ModalOverlay>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {sortedCampaigns.map(c => (
          <div key={c.id} style={{ background: "#111827", borderRadius: 12, padding: "18px 24px", border: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: "#f9fafb", fontSize: 16 }}>{c.name}</span>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                {c.is_ab_test ? <span style={{ color: "#60a5fa", marginRight: 8, fontSize: 11, background: "#1e3a8a", padding: "2px 6px", borderRadius: 4 }}>A/B Test</span> : null}
                {c.subject}
              </div>
            </div>
            <div style={{ textAlign: "right", marginRight: 20, minWidth: 120 }}>
              <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: "bold" }}>Sent: {c.total_sent || 0}</div>
              <div style={{ fontSize: 12, color: "#4ade80" }}>Open Rate: {pct(c.open_rate)}</div>
              <div style={{ fontSize: 12, color: "#a78bfa" }}>Click Rate: {pct(c.click_rate)}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setViewCampaign(c); setIsEditing(false); setEditedContent(c.body_html); }} style={{ background: "transparent", color: "#60a5fa", border: "1px solid #1e3a8a", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: "bold" }}>🔍 Details</button>
              {['sending', 'sent', 'paused', 'completed'].includes(c.status) ? (
                <button onClick={() => viewReport(c.id)} style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>📊 Report</button>
              ) : (
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

function UnifiedAIFlowPage({ showToast, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [baseForm, setBaseForm] = useState({ subject: "", body: "", name: "", role: "", company: "", industry: "" });
  const [personalized, setPersonalized] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [hoveredVariant, setHoveredVariant] = useState(null);
  const [spamScore, setSpamScore] = useState(null);
  
  // NEW: State for the NLP Subject Scorer
  const [aiScore, setAiScore] = useState(null);
  const [isScoring, setIsScoring] = useState(false);

  // Pings the Hugging Face subject scorer. NOTE: this endpoint is mounted at the
  // API root (POST /analyze-subject, no /api prefix), so we bypass the api()
  // wrapper (which always prepends /api) and call the root origin directly.
  const analyzeSubjectLine = async (text) => {
    if (!text) {
      setAiScore(null);
      return;
    }

    setIsScoring(true);
    try {
      const ROOT_URL = API_URL.replace(/\/api\/?$/, "");
      const response = await fetch(`${ROOT_URL}/analyze-subject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: text }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Backend returns { subject, score (1-10 float), feedback }.
      // Derive is_optimal for the UI (backend calls >7 "great").
      const res = await response.json();
      setAiScore({
        score: res.score,
        is_optimal: (res.score ?? 0) >= 7,
        feedback: res.feedback,
      });
    } catch (e) {
      console.error("Failed to score subject line:", e);
      setAiScore(null);
    } finally {
      setIsScoring(false);
    }
  };

  const runPersonalization = async () => {
    setLoading(true);
    try {
      const res = await api("/ai/personalize", { method: "POST", body: JSON.stringify({ subject: baseForm.subject, body: baseForm.body, recipient_name: baseForm.name, recipient_role: baseForm.role, recipient_industry: baseForm.industry, recipient_company: baseForm.company }) });
      setPersonalized(res);
      showToast("Personalization generated!");
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const runABVariants = async () => {
    setLoading(true);
    try {
      const targetSubj = personalized ? personalized.subject : baseForm.subject;
      const targetBody = personalized ? personalized.body : baseForm.body;
      const res = await api("/ai/ab-variants", { method: "POST", body: JSON.stringify({ subject: targetSubj, body: targetBody, num_variants: 3 }) });
      setVariants(res.variants);
      showToast("Variants generated!");
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const runSpamCheck = async (variant) => {
    setSelectedVariant(variant);
    setLoading(true);
    try {
      const targetBody = variant.body; 
      const res = await api("/ai/spam-check", { method: "POST", body: JSON.stringify({ subject: variant.subject, body: targetBody }) });
      setSpamScore(res);
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const saveToDrafts = async (includeABTest = false) => {
    if (!campaignName) return showToast("Please provide a Campaign Name at the top first", "error");
    setLoading(true);
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
      setAiScore(null); // Reset score
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const sectionStyle = (isActive) => ({
    background: "#111827", borderRadius: 12, padding: 24,
    border: isActive ? "1px solid #3b82f6" : "1px solid #1f2937",
    opacity: isActive ? 1 : 0.4,
    pointerEvents: isActive ? "auto" : "none",
    transition: "all 0.3s",
    marginBottom: 16
  });

  const inputStyle = { width: "100%", padding: "10px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb", marginBottom: 12 };

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Unified AI Composer</h1>
      
      <input 
        style={{ ...inputStyle, fontSize: 16, fontWeight: 'bold', borderColor: "#3b82f6", marginBottom: 20 }} 
        placeholder="Name this Campaign (e.g., Q3 Outreach) - Required to Save" 
        value={campaignName} 
        onChange={e => setCampaignName(e.target.value)} 
      />

      <div style={sectionStyle(true)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>1. Base Context</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input style={inputStyle} placeholder="Target Persona Name" value={baseForm.name} onChange={e => setBaseForm({ ...baseForm, name: e.target.value })} />
          <input style={inputStyle} placeholder="Role (e.g., CEO)" value={baseForm.role} onChange={e => setBaseForm({ ...baseForm, role: e.target.value })} />
        </div>
        
        {/* MODIFIED: Subject Line Input with AI Scoring Integration */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af", marginLeft: 2 }}>Base Subject</label>
            
            {isScoring ? (
              <span style={{ fontSize: 12, color: "#60a5fa" }}>Analyzing... 🧠</span>
            ) : aiScore ? (
              <span style={{ 
                fontSize: 11, 
                fontWeight: "bold", 
                padding: "2px 8px", 
                borderRadius: 12,
                background: aiScore.is_optimal ? "#166534" : "#991b1b",
                color: "#fff" 
              }}>
                {aiScore.is_optimal ? "🔥 Great Subject" : "⚠️ Low Engagement"} ({aiScore.score}/10)
              </span>
            ) : null}
          </div>
          
          <input 
            style={{ 
              ...inputStyle, 
              marginBottom: 0,
              border: aiScore ? (aiScore.is_optimal ? "1px solid #22c55e" : "1px solid #ef4444") : "1px solid #1f2937",
            }} 
            placeholder="Enter an engaging subject line..." 
            value={baseForm.subject} 
            onChange={e => setBaseForm({ ...baseForm, subject: e.target.value })} 
            onBlur={() => analyzeSubjectLine(baseForm.subject)} // Analyzes when user clicks outside the input
          />
          
          {aiScore && !aiScore.is_optimal && (
            <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, marginLeft: 2 }}>
              Try adding a sense of urgency, a question, or an actionable hook to increase open rates.
            </div>
          )}
        </div>

        <textarea style={{ ...inputStyle, minHeight: 100 }} placeholder="Paste raw text here..." value={baseForm.body} onChange={e => setBaseForm({ ...baseForm, body: e.target.value })} />
        
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={runPersonalization} disabled={loading || !baseForm.subject || !baseForm.body} style={{ background: "#1d4ed8", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Personalize Context</button>
        </div>
      </div>

      <div style={sectionStyle(personalized !== null)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>2. AI Personalized Output</h3>
        <div style={{ color: "#d1d5db", fontSize: 14, marginBottom: 8 }}><strong>Subject:</strong> {personalized?.subject}</div>
        <div style={{ background: "#ffffff", color: "#000", padding: 15, borderRadius: 8, border: "1px solid #d1d5db" }} dangerouslySetInnerHTML={{ __html: personalized?.body }} />
        
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button onClick={() => saveToDrafts(false)} disabled={loading} style={{ background: "#10b981", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>💾 Save to Drafts (Skip A/B)</button>
          <button onClick={runABVariants} disabled={loading} style={{ background: "#374151", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>Generate A/B Test Variants ➔</button>
        </div>
      </div>

      <div style={sectionStyle(variants.length > 0)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>3. Select a Variant to Analyze & Review Formats</h3>
        <p style={{ fontSize: 12, color: "#9ca3af" }}>Click a variant below to see the HTML formatted output and run a spam check.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {variants.map((v, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoveredVariant(i)}
              onMouseLeave={() => setHoveredVariant(null)}
              onClick={() => runSpamCheck(v)}
              style={{
                background: selectedVariant === v ? "#1e3a8a" : hoveredVariant === i ? "#1f2937" : "#0d1117",
                padding: 16, borderRadius: 8,
                border: selectedVariant === v ? "1px solid #60a5fa" : "1px solid #374151",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
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

        <button onClick={() => saveToDrafts(true)} disabled={loading} style={{ background: "#22c55e", color: "#fff", padding: "12px 24px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold", width: "100%" }}>💾 Save Complete A/B Test Campaign</button>
      </div>
    </div>
  );
}

const getUserIdFromToken = () => {
  const token = getToken();
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    // Strictly return the token's ID, or null if it doesn't exist
    return payload.sub || payload.id || null; 
    
  } catch (e) {
    // If the token is corrupted or fake, reject it completely
    console.error("Failed to decode token");
    return null; 
  }
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [page, setPage] = useState("dashboard");
  const [overview, setOverview] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_username: "", smtp_password: "" });
  const userId = getUserIdFromToken();

  const [skip, setSkip] = useState(0);
  const limit = 100;

  const formatPercentage = (value) => {
    return `${((value || 0) * 100).toFixed(1)}%`;
  };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      await api("/settings/smtp", { method: "POST", body: JSON.stringify(smtpForm) });
      showToast("SMTP settings saved securely!");
      setShowSettings(false);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [ov, cmp, rcp, tl, grp] = await Promise.all([
        api("/analytics/overview").catch(() => ({})),
        api("/campaigns/").catch(() => []),
        api(`/recipients/?skip=${skip}&limit=${limit}`).catch(() => []),
        api("/analytics/opens-over-time").catch(() => []),
        api("/groups/").catch(() => []),
      ]);
      
      setOverview(ov || {});
      setCampaigns(Array.isArray(cmp) ? cmp : (cmp?.campaigns || []));
      
      // 🚀 THE FIX: Pass the whole object (or a safe fallback) so your pagination 
      // keeps both the .data array and the .total count!
      setRecipients(rcp || { data: [], total: 0 });
      
      setTimeline(Array.isArray(tl) ? tl : (tl?.timeline || []));
      setGroups(Array.isArray(grp) ? grp : (grp?.data || grp?.groups || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, skip, limit]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  const pieData = [
    { name: "Hot", value: overview?.engagement_breakdown?.hot || 0, fill: "#22c55e" },
    { name: "Warm", value: overview?.engagement_breakdown?.warm || 0, fill: "#f59e0b" },
    { name: "Cold", value: overview?.engagement_breakdown?.cold || 0, fill: "#60a5fa" },
    { name: "Inactive", value: overview?.engagement_breakdown?.inactive || 0, fill: "#f87171" },
  ];

  if (!isAuthenticated) {
    return (
      <AuthPage 
        onLogin={(newToken) => {
          setToken(newToken);
          setIsAuthenticated(true);
        }} 
        showToast={showToast} 
      />
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1a", color: "#f9fafb", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <aside style={{ width: 220, flexShrink: 0, background: "#0d1117", borderRight: "1px solid #1f2937", padding: "24px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ marginBottom: 24, padding: "0 8px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa", letterSpacing: "-0.5px" }}>✉️ MailPulse</div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>AI Email Intelligence</div>
        </div>
        {[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "campaigns", icon: "📨", label: "Campaigns" },
          { id: "recipients", icon: "👥", label: "Recipients" },
          { id: "groups", icon: "📂", label: "Groups" },
          { id: "compose", icon: "✍️", label: "Smart Compose" },
          { id: "senders", icon: "📬", label: "Sender Accounts" },
        ].map((n) => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", borderRadius: 8, background: page === n.id ? "#1d4ed820" : "transparent", border: page === n.id ? "1px solid #1d4ed840" : "1px solid transparent", color: page === n.id ? "#60a5fa" : "#9ca3af", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: page === n.id ? 600 : 400, transition: "all 0.15s" }}>
            <span style={{ fontSize: 18 }}>{n.icon}</span> {n.label}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => setShowSettings(true)} style={{ background: "transparent", color: "#60a5fa", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "left", padding: "8px 0" }}>⚙️ SMTP Settings</button>
          <button onClick={handleLogout} style={{ background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "left", padding: "8px 0" }}>🚪 Logout</button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: 28 }}>
        {toast && (
          <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? "#7f1d1d" : "#14532d", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
            {toast.msg}
          </div>
        )}
        {page === "dashboard" && (
          <DashboardPage 
            overview={overview} 
            timeline={timeline} 
            pieData={pieData} 
            campaigns={campaigns} 
            pct={formatPercentage}
          />
        )}
        {page === "campaigns" && (
          <CampaignsPage 
            campaigns={campaigns} 
            recipients={Array.isArray(recipients) ? recipients : (recipients?.data || [])} 
            groups={groups} 
            onRefresh={loadData} 
            showToast={showToast} 
          />
        )}
        
        {page === "recipients" && (
          <RecipientsPage 
            recipients={recipients} 
            groups={groups} 
            onRefresh={loadData} 
            showToast={showToast} 
            skip={skip} 
            setSkip={setSkip} 
            limit={limit} 
          />
        )}
        
        {page === "groups" && (
          <GroupsPage 
            groups={groups} 
            recipients={Array.isArray(recipients) ? recipients : (recipients?.data || [])} 
            onRefresh={loadData} 
            showToast={showToast} 
          />
        )}
        {page === "compose" && <UnifiedAIFlowPage showToast={showToast} onRefresh={loadData} />}
        {page === "senders" && <SenderAccountManager userId={userId} />}
        {showSettings && (
          <ModalOverlay title="Configure Your Outbound SMTP Server" onClose={() => setShowSettings(false)}>
            <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Connect your custom sender email. If using Gmail, you must enter a 16-character <strong>App Password</strong>, not your regular login password.</p>
              
              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Host</label>
                <input value={smtpForm.smtp_host} onChange={e => setSmtpForm({...smtpForm, smtp_host: e.target.value})} style={{ width: "100%", padding: 10, borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required />
              </div>
              
              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Port</label>
                <input type="number" value={smtpForm.smtp_port} onChange={e => setSmtpForm({...smtpForm, smtp_port: parseInt(e.target.value) || 587})} style={{ width: "100%", padding: 10, borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required />
              </div>

              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>Sender Email Address (Username)</label>
                <input type="email" placeholder="you@gmail.com" value={smtpForm.smtp_username} onChange={e => setSmtpForm({...smtpForm, smtp_username: e.target.value})} style={{ width: "100%", padding: 10, borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required />
              </div>

              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>SMTP Password / App Password</label>
                <input type="password" placeholder="xxxx xxxx xxxx xxxx" value={smtpForm.smtp_password} onChange={e => setSmtpForm({...smtpForm, smtp_password: e.target.value})} style={{ width: "100%", padding: 10, borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#fff" }} required />
              </div>

              <button type="submit" style={{ background: "#22c55e", color: "#fff", border: "none", padding: 12, borderRadius: 8, fontWeight: "bold", cursor: "pointer", marginTop: 10 }}>Save Server Settings</button>
            </form>
          </ModalOverlay>
        )}
      </main>
    </div>
  );
}