import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { api, getToken, clearToken } from './api';
import Login from './pages/Login';

const fmt = (n, d = 1) => (n ?? 0).toFixed(d);
const pct = (n) => `${fmt(n)}%`;
const scoreColor = (s) =>
  s >= 0.75 ? "#22c55e" : s >= 0.5 ? "#f59e0b" : s >= 0.25 ? "#60a5fa" : "#f87171";
const scoreLabel = (s) =>
  s >= 0.75 ? "Hot 🔥" : s >= 0.5 ? "Warm ☀️" : s >= 0.25 ? "Cold 🌧" : "Inactive 💤";

export default function MailPulse() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [page, setPage] = useState("dashboard");
  const [overview, setOverview] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
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
        api("/recipients/").catch(() => []),
        api("/analytics/opens-over-time").catch(() => []),
        api("/groups/").catch(() => []),
      ]);
      setOverview(ov || {});
      setCampaigns(Array.isArray(cmp) ? cmp : (cmp?.campaigns || []));
      setRecipients(Array.isArray(rcp) ? rcp : (rcp?.recipients || []));
      setTimeline(Array.isArray(tl) ? tl : (tl?.timeline || []));
      setGroups(Array.isArray(grp) ? grp : []);
    } catch (e) {
      console.error("Data load issue:", e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

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
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
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
        ].map((n) => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", borderRadius: 8, background: page === n.id ? "#1d4ed820" : "transparent", border: page === n.id ? "1px solid #1d4ed840" : "1px solid transparent", color: page === n.id ? "#60a5fa" : "#9ca3af", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: page === n.id ? 600 : 400, transition: "all 0.15s" }}>
            <span style={{ fontSize: 18 }}>{n.icon}</span> {n.label}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "12px 8px", borderTop: "1px solid #1f2937" }}>
          <button onClick={handleLogout} style={{ background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "left", padding: "8px 0" }}>🚪 Logout</button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: 28 }}>
        {toast && (
          <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? "#7f1d1d" : "#14532d", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
            {toast.msg}
          </div>
        )}
        {page === "dashboard" && <DashboardPage overview={overview} timeline={timeline} pieData={pieData} campaigns={campaigns} />}
        {page === "campaigns" && <CampaignsPage campaigns={campaigns} recipients={recipients} groups={groups} onRefresh={loadData} showToast={showToast} />}
        {page === "recipients" && <RecipientsPage recipients={recipients} groups={groups} onRefresh={loadData} showToast={showToast} />}
        {page === "groups" && <GroupsPage groups={groups} recipients={recipients} onRefresh={loadData} showToast={showToast} />}
        {page === "compose" && <UnifiedAIFlowPage showToast={showToast} onRefresh={loadData} />}
      </main>
    </div>
  );
}

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

function Badge({ status }) {
  const map = { sent: { bg: "#14532d", color: "#86efac", label: "Sent" }, sending: { bg: "#1e3a5f", color: "#7dd3fc", label: "Sending…" }, draft: { bg: "#292524", color: "#a8a29e", label: "Draft" }, paused: { bg: "#451a03", color: "#fdba74", label: "Paused" } };
  const s = map[status] || map.draft;
  return <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

function DashboardPage({ overview, timeline, pieData, campaigns }) {
  const safeCampaigns = campaigns || [];
  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: "#f9fafb" }}>Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Sent" value={(overview?.total_emails_sent || 0).toLocaleString()} sub="all time" accent="#60a5fa" />
        <StatCard label="Avg Open Rate" value={pct(overview?.avg_open_rate || 0)} sub={`${(overview?.total_opens || 0).toLocaleString()} opens`} accent="#22c55e" />
        <StatCard label="Avg Click Rate" value={pct(overview?.avg_click_rate || 0)} sub={`${(overview?.total_clicks || 0).toLocaleString()} clicks`} accent="#a78bfa" />
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
function GroupsPage({ groups, recipients, onRefresh, showToast }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewGroup, setViewGroup] = useState(null); // Controls the Recipients Modal

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

  // Find recipients belonging to the currently viewed group
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


function RecipientsPage({ recipients, groups, onRefresh, showToast }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newRecipient, setNewRecipient] = useState({ email: "", name: "", role: "", industry: "", company: "", newGroupName: "" });
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false); // Controls the Group Selection Modal

  const safeRecipients = recipients || [];
  const filtered = safeRecipients.filter(r => {
    if (filter === "suppressed" && !r.is_suppressed) return false;
    if (filter === "hot" && (r.seriousness_score || 0) < 0.75) return false;
    if (filter === "active" && r.is_suppressed) return false;
    if (search && !(r.email || "").includes(search) && !(r.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
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

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Recipients</h1>

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

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0d1117", color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
              {["Recipient", "Groups", "Engagement", "Stats", "Action"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 16px" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const rGroups = (r.metadata_?.group_ids || []).map(id => groups.find(g => g.id === id)?.name).filter(Boolean);
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #0f172a", opacity: r.is_suppressed ? 0.5 : 1 }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500, color: "#e5e7eb" }}>{r.name || r.email}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{r.email}</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#9ca3af", maxWidth: 150 }}>{rGroups.length > 0 ? rGroups.join(", ") : "—"}</td>
                  <td style={{ padding: "12px 16px", color: scoreColor(r.seriousness_score || 0) }}>{scoreLabel(r.seriousness_score || 0)}</td>
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
      </div>
    </div>
  );
}


function CampaignsPage({ campaigns, recipients, groups, onRefresh, showToast }) {
  const [reportData, setReportData] = useState(null);
  const [sendModal, setSendModal] = useState(null);
  const [selRecs, setSelRecs] = useState([]);
  const [selGroups, setSelGroups] = useState([]);
  const [sending, setSending] = useState(false);

  const viewReport = async (id) => {
    try {
      const res = await api(`/campaigns/${id}/report`);
      setReportData(res.logs);
    } catch (e) { showToast("Failed to load report", "error"); }
  };

  const deleteCampaign = async (id) => {
    if (!window.confirm("Are you sure you want to delete this campaign? This will also delete its tracking data.")) return;
    try {
      await api(`/campaigns/${id}`, { method: "DELETE" });
      showToast("Campaign deleted successfully");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
  };

  const executeSend = async () => {
    setSending(true);
    try {
      await api(`/campaigns/${sendModal}/send`, { method: "POST", body: JSON.stringify({ recipient_ids: selRecs, group_ids: selGroups, personalize: true }) });
      showToast("Campaign queued for sending!");
      setSendModal(null);
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    setSending(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb" }}>Campaigns</h1>

      {reportData && (
        <ModalOverlay title="Detailed Tracking Report" onClose={() => setReportData(null)}>
          <table style={{ width: "100%", textAlign: "left", color: "#d1d5db", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#9ca3af", borderBottom: "1px solid #374151" }}>
                <th style={{ padding: "8px 0" }}>Recipient</th>
                <th style={{ padding: "8px 0" }}>Variant</th>
                <th style={{ padding: "8px 0" }}>Opens</th>
                <th style={{ padding: "8px 0" }}>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                  <td style={{ padding: "10px 0", color: "#f9fafb" }}>{log.email}</td>
                  <td style={{ padding: "10px 0" }}>{log.variant}</td>
                  <td style={{ padding: "10px 0", color: log.opens > 0 ? "#4ade80" : "#9ca3af", fontWeight: log.opens > 0 ? "bold" : "normal" }}>{log.opens}</td>
                  <td style={{ padding: "10px 0", color: log.clicks > 0 ? "#a78bfa" : "#9ca3af", fontWeight: log.clicks > 0 ? "bold" : "normal" }}>{log.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ModalOverlay>
      )}

      {sendModal && (
        <ModalOverlay title="Target Audience Selection" onClose={() => setSendModal(null)}>
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
          <button onClick={executeSend} disabled={sending} style={{ marginTop: 20, width: "100%", background: "#22c55e", color: "#fff", border: "none", padding: "12px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
            {sending ? "Processing..." : "Confirm & Send Campaign"}
          </button>
        </ModalOverlay>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {campaigns.map(c => (
          <div key={c.id} style={{ background: "#111827", borderRadius: 12, padding: "18px 24px", border: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: "#f9fafb", fontSize: 16 }}>{c.name}</span>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{c.subject}</div>
            </div>

            <div style={{ textAlign: "right", marginRight: 20, minWidth: 120 }}>
              <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: "bold" }}>Sent: {c.total_sent || 0}</div>
              <div style={{ fontSize: 12, color: "#4ade80" }}>Open Rate: {pct(c.open_rate)}</div>
              <div style={{ fontSize: 12, color: "#a78bfa" }}>Click Rate: {pct(c.click_rate)}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {c.status === "sent" || c.status === "sending" ? (
                <button onClick={() => viewReport(c.id)} style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>📊 Report</button>
              ) : (
                <button onClick={() => { setSelRecs([]); setSelGroups([]); setSendModal(c.id); }} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: "bold" }}>Send Now ▶</button>
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

  const [baseForm, setBaseForm] = useState({ subject: "", body: "", name: "Alex", role: "Manager", company: "TechCorp", industry: "Software" });

  const [personalized, setPersonalized] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [hoveredVariant, setHoveredVariant] = useState(null);
  const [spamScore, setSpamScore] = useState(null);

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
      const targetBody = personalized ? personalized.body : baseForm.body;
      const res = await api("/ai/spam-check", { method: "POST", body: JSON.stringify({ subject: variant.subject, body: targetBody }) });
      setSpamScore(res);
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  const saveToDrafts = async () => {
    if (!campaignName) return showToast("Provide a campaign name first", "error");
    setLoading(true);
    try {
      await api("/campaigns/", {
        method: "POST", body: JSON.stringify({
          name: campaignName,
          subject: selectedVariant.subject,
          body_html: personalized ? personalized.body : baseForm.body,
          ab_variants: variants
        })
      });
      showToast("Saved to Drafts!");
      onRefresh();
      setBaseForm({ subject: "", body: "", name: "Alex", role: "Manager", company: "TechCorp", industry: "Software" });
      setPersonalized(null);
      setVariants([]);
      setSelectedVariant(null);
      setSpamScore(null);
      setCampaignName("");
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

      <div style={sectionStyle(true)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>1. Base Context</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input style={inputStyle} placeholder="Target Persona Name" value={baseForm.name} onChange={e => setBaseForm({ ...baseForm, name: e.target.value })} />
          <input style={inputStyle} placeholder="Role (e.g., CEO)" value={baseForm.role} onChange={e => setBaseForm({ ...baseForm, role: e.target.value })} />
        </div>
        <input style={inputStyle} placeholder="Base Subject" value={baseForm.subject} onChange={e => setBaseForm({ ...baseForm, subject: e.target.value })} />
        <textarea style={{ ...inputStyle, minHeight: 100 }} placeholder="Base Body..." value={baseForm.body} onChange={e => setBaseForm({ ...baseForm, body: e.target.value })} />
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button onClick={runPersonalization} disabled={loading || !baseForm.subject || !baseForm.body} style={{ background: "#1d4ed8", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}>1a. Personalize Context</button>
          <button onClick={runABVariants} disabled={loading || !baseForm.subject || !baseForm.body} style={{ background: "#374151", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}>1b. Skip directly to A/B Variants</button>
        </div>
      </div>

      <div style={sectionStyle(personalized !== null)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>2. AI Personalized Output</h3>
        <div style={{ color: "#d1d5db", fontSize: 14, marginBottom: 8 }}><strong>Subject:</strong> {personalized?.subject}</div>
        <div style={{ color: "#9ca3af", fontSize: 13, whiteSpace: "pre-wrap", background: "#0d1117", padding: 12, borderRadius: 8 }}>{personalized?.body}</div>
        <button onClick={runABVariants} disabled={loading} style={{ marginTop: 12, background: "#1d4ed8", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}>Generate A/B Variants</button>
      </div>

      <div style={sectionStyle(variants.length > 0)}>
        <h3 style={{ marginTop: 0, color: "#60a5fa" }}>3. Select a Variant to Analyze</h3>
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
              <div style={{ color: "#6b7280", fontSize: 12 }}>{v.rationale}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={sectionStyle(spamScore !== null)}>
        <h3 style={{ marginTop: 0, color: "#22c55e" }}>4. Final Review & Save</h3>
        <div style={{ fontSize: 18, color: spamScore?.score > 5 ? "#f87171" : "#4ade80", marginBottom: 12 }}>Spam Score: {spamScore?.score}/10</div>
        <input style={inputStyle} placeholder="Name this Campaign (e.g., Q3 Outreach)" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
        <button onClick={saveToDrafts} disabled={loading} style={{ background: "#22c55e", color: "#fff", padding: "12px 24px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: "bold" }}>💾 Save as Draft Campaign</button>
      </div>
    </div>
  );
}