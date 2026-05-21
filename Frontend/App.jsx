import React from 'react';
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const API = "https://smart-email-dashboard.onrender.com/api";

const fmt = (n, d = 1) => (n ?? 0).toFixed(d);
const pct = (n) => `${fmt(n)}%`;
const scoreColor = (s) =>
  s >= 0.75 ? "#22c55e" : s >= 0.5 ? "#f59e0b" : s >= 0.25 ? "#60a5fa" : "#f87171";
const scoreLabel = (s) =>
  s >= 0.75 ? "Hot 🔥" : s >= 0.5 ? "Warm ☀️" : s >= 0.25 ? "Cold 🌧" : "Inactive 💤";

let authToken = null;

// This function silently logs in the frontend behind the scenes
async function getAuthToken() {
  if (authToken) return authToken; // Use cached token if we already have it
  
  const formData = new URLSearchParams();
  formData.append("username", "admin");
  formData.append("password", "secret");

  try {
    const res = await fetch(`${API}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    const data = await res.json();
    authToken = data.access_token;
    return authToken;
  } catch (e) {
    console.error("Auto-login failed:", e);
    return null;
  }
}

// Your updated API wrapper that attaches the ID badge (token) to every request
async function api(path, opts = {}) {
  const token = await getAuthToken();
  
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`; // Attach the token!

  const res = await fetch(`${API}${path}`, {
    headers,
    ...opts,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
// ---------------------------------------------------

const MOCK_OVERVIEW = {
  total_campaigns: 12,
  total_recipients: 847,
  suppressed_recipients: 34,
  total_emails_sent: 6840,
  total_opens: 2193,
  total_clicks: 412,
  avg_open_rate: 32.1,
  avg_click_rate: 6.0,
  engagement_breakdown: { hot: 142, warm: 289, cold: 301, inactive: 115 },
};

const MOCK_CAMPAIGNS = [
  { id: "1", name: "Q2 Product Launch", subject: "Introducing MailPulse 2.0 🚀", status: "sent", total_sent: 1200, total_opens: 487, total_clicks: 92, open_rate: 40.6, click_rate: 7.7, created_at: "2026-05-10T09:00:00Z" },
  { id: "2", name: "Weekly Newsletter #22", subject: "5 Growth Hacks You're Missing", status: "sent", total_sent: 980, total_opens: 312, total_clicks: 48, open_rate: 31.8, click_rate: 4.9, created_at: "2026-05-03T10:00:00Z" },
  { id: "3", name: "Re-engagement Blast", subject: "We miss you! Here's a gift 🎁", status: "sent", total_sent: 450, total_opens: 98, total_clicks: 22, open_rate: 21.8, click_rate: 4.9, created_at: "2026-04-28T08:00:00Z" },
  { id: "4", name: "May Promotions", subject: "Exclusive deal — 48 hours only", status: "draft", total_sent: 0, total_opens: 0, total_clicks: 0, open_rate: 0, click_rate: 0, created_at: "2026-05-16T07:00:00Z" },
];

const MOCK_RECIPIENTS = [
  { id: "1", email: "arjun@techcorp.in", name: "Arjun Sharma", role: "Engineer", company: "TechCorp", seriousness_score: 0.91, score_label: "Hot 🔥", total_opens: 18, total_clicks: 7, total_emails_received: 12, is_suppressed: false },
  { id: "2", email: "priya@startup.io", name: "Priya Patel", role: "Sales", company: "Startup.io", seriousness_score: 0.72, score_label: "Warm ☀️", total_opens: 9, total_clicks: 3, total_emails_received: 10, is_suppressed: false },
  { id: "3", email: "rahul@enterprise.com", name: "Rahul Verma", role: "Manager", company: "Enterprise Co", seriousness_score: 0.41, score_label: "Cold 🌧", total_opens: 4, total_clicks: 1, total_emails_received: 8, is_suppressed: false },
  { id: "4", email: "sneha@noreply.com", name: "Sneha Gupta", role: null, company: null, seriousness_score: 0.08, score_label: "Inactive 💤", total_opens: 0, total_clicks: 0, total_emails_received: 5, is_suppressed: true },
  { id: "5", email: "dev@webagency.in", name: "Dev Nair", role: "Designer", company: "Web Agency", seriousness_score: 0.85, score_label: "Hot 🔥", total_opens: 14, total_clicks: 6, total_emails_received: 11, is_suppressed: false },
];

const MOCK_OPENS_TIMELINE = [
  { date: "2026-05-06", opens: 142 }, { date: "2026-05-07", opens: 98 },
  { date: "2026-05-08", opens: 210 }, { date: "2026-05-09", opens: 176 },
  { date: "2026-05-10", opens: 387 }, { date: "2026-05-11", opens: 220 },
  { date: "2026-05-12", opens: 145 }, { date: "2026-05-13", opens: 89 },
  { date: "2026-05-14", opens: 112 }, { date: "2026-05-15", opens: 67 },
  { date: "2026-05-16", opens: 43 },
];

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#111827",
      border: `1px solid ${accent}33`,
      borderRadius: 12,
      padding: "20px 24px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#f9fafb", fontSize: 32, fontWeight: 700, fontFamily: "'Space Grotesk', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Badge({ status }) {
  const map = {
    sent: { bg: "#14532d", color: "#86efac", label: "Sent" },
    sending: { bg: "#1e3a5f", color: "#7dd3fc", label: "Sending…" },
    draft: { bg: "#292524", color: "#a8a29e", label: "Draft" },
    paused: { bg: "#451a03", color: "#fdba74", label: "Paused" },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: "10px 16px", borderRadius: 8,
      background: active ? "#1d4ed820" : "transparent",
      border: active ? "1px solid #1d4ed840" : "1px solid transparent",
      color: active ? "#60a5fa" : "#9ca3af",
      cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: active ? 600 : 400,
      transition: "all 0.15s",
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span> {label}
    </button>
  );
}

export default function MailPulse() {
  const [page, setPage] = useState("dashboard");
  const [overview, setOverview] = useState(MOCK_OVERVIEW);
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS);
  const [recipients, setRecipients] = useState(MOCK_RECIPIENTS);
  const [timeline, setTimeline] = useState(MOCK_OPENS_TIMELINE);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, cmp, rcp, tl] = await Promise.all([
        api("/analytics/overview").catch(() => ({})),
        api("/campaigns/").catch(() => []),
        api("/recipients/").catch(() => []),
        api("/analytics/opens-over-time").catch(() => []),
      ]);
      
      // Enforce data types aggressively so React maps and string functions never crash
      setOverview(ov || {});
      setCampaigns(Array.isArray(cmp) ? cmp : (cmp?.campaigns || []));
      setRecipients(Array.isArray(rcp) ? rcp : (rcp?.recipients || []));
      setTimeline(Array.isArray(tl) ? tl : (tl?.timeline || []));
    } catch (e) {
      console.error("Data load issue:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const pieData = [
    { name: "Hot", value: overview?.engagement_breakdown?.hot || 0, fill: "#22c55e" },
    { name: "Warm", value: overview?.engagement_breakdown?.warm || 0, fill: "#f59e0b" },
    { name: "Cold", value: overview?.engagement_breakdown?.cold || 0, fill: "#60a5fa" },
    { name: "Inactive", value: overview?.engagement_breakdown?.inactive || 0, fill: "#f87171" },
  ];

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: "#0a0f1a", color: "#f9fafb",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <aside style={{
        width: 220, flexShrink: 0, background: "#0d1117",
        borderRight: "1px solid #1f2937", padding: "24px 12px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ marginBottom: 24, padding: "0 8px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa", letterSpacing: "-0.5px" }}>
            ✉️ MailPulse
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>AI Email Intelligence</div>
        </div>
        {[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "campaigns", icon: "📨", label: "Campaigns" },
          { id: "recipients", icon: "👥", label: "Recipients" },
          { id: "compose", icon: "✍️", label: "Compose" },
          { id: "ai", icon: "🤖", label: "AI Tools" },
        ].map((n) => (
          <NavItem key={n.id} {...n} active={page === n.id} onClick={() => setPage(n.id)} />
        ))}
        <div style={{ marginTop: "auto", padding: "12px 8px", borderTop: "1px solid #1f2937" }}>
          <div style={{ fontSize: 11, color: "#4b5563" }}>v1.0.0 · All systems nominal</div>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: 28 }}>
        {toast && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            background: toast.type === "error" ? "#7f1d1d" : "#14532d",
            color: "#fff", padding: "12px 20px", borderRadius: 10,
            fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,.4)",
          }}>
            {toast.msg}
          </div>
        )}

        {page === "dashboard" && <DashboardPage overview={overview} timeline={timeline} pieData={pieData} campaigns={campaigns} />}
        {page === "campaigns" && <CampaignsPage campaigns={campaigns} onRefresh={loadData} showToast={showToast} />}
        {page === "recipients" && <RecipientsPage recipients={recipients} onRefresh={loadData} showToast={showToast} />}
        {page === "compose" && <ComposePage showToast={showToast} onRefresh={loadData} />}
        {page === "ai" && <AIToolsPage showToast={showToast} />}
      </main>
    </div>
  );
}

function DashboardPage({ overview, timeline, pieData, campaigns }) {
  // Ensure we safely fall back if the backend object is completely empty
  const safeCampaigns = campaigns || [];

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6, color: "#f9fafb" }}>Overview</h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>Real-time campaign performance & engagement intelligence</p>

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

      <div style={{ background: "#111827", borderRadius: 12, padding: 20, border: "1px solid #1f2937" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#d1d5db", marginBottom: 16 }}>Recent Campaigns</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
              {["Campaign", "Status", "Sent", "Open Rate", "Click Rate"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeCampaigns.slice(0, 4).map(c => (
              <tr key={c.id} style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "10px 12px", color: "#e5e7eb", fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: "10px 12px" }}><Badge status={c.status} /></td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{(c.total_sent || 0).toLocaleString()}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ color: c.open_rate > 30 ? "#22c55e" : "#f59e0b" }}>{pct(c.open_rate || 0)}</span>
                </td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{pct(c.click_rate || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignsPage({ campaigns, onRefresh, showToast }) {
  const safeCampaigns = campaigns || [];

  const handleSend = async (id) => {
    try {
      await api(`/campaigns/${id}/send?personalize=true&ab_test=false`, { method: "POST" });
      showToast("Campaign queued for sending!");
      onRefresh();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Campaigns</h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: "4px 0 0" }}>{safeCampaigns.length} campaigns total</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {safeCampaigns.map(c => (
          <div key={c.id} style={{ background: "#111827", borderRadius: 12, padding: "18px 24px", border: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "#f9fafb" }}>{c.name}</span>
                <Badge status={c.status} />
              </div>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>{c.subject}</div>
            </div>

            <div style={{ display: "flex", gap: 28, fontSize: 13 }}>
              {[
                { label: "Sent", val: (c.total_sent || 0).toLocaleString() },
                { label: "Opens", val: pct(c.open_rate || 0), color: (c.open_rate || 0) > 30 ? "#22c55e" : "#f59e0b" },
                { label: "Clicks", val: pct(c.click_rate || 0), color: "#a78bfa" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ color: s.color || "#9ca3af", fontWeight: 700, fontSize: 16 }}>{s.val}</div>
                  <div style={{ color: "#4b5563", fontSize: 11 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {c.status === "draft" && (
              <button onClick={() => handleSend(c.id)} style={{
                background: "#1d4ed8", color: "#fff", border: "none",
                borderRadius: 8, padding: "8px 16px", fontSize: 13,
                cursor: "pointer", fontWeight: 600,
              }}>
                Send Now ▶
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipientsPage({ recipients, onRefresh, showToast }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

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
      showToast(suppress ? "Recipient suppressed" : "Recipient re-activated");
      onRefresh();
    } catch {
      showToast(suppress ? "Recipient suppressed (demo)" : "Recipient re-activated (demo)");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Recipients</h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: "4px 0 0" }}>{safeRecipients.length} total · ML engagement scoring active</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "hot", "active", "suppressed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
            background: filter === f ? "#1d4ed8" : "#111827",
            color: filter === f ? "#fff" : "#9ca3af",
            border: filter === f ? "1px solid #3b82f6" : "1px solid #1f2937",
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <input
          placeholder="Search email or name…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: "auto", padding: "6px 14px", borderRadius: 8, fontSize: 13,
            background: "#111827", border: "1px solid #1f2937", color: "#f9fafb",
            outline: "none", width: 220,
          }}
        />
      </div>

      <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0d1117", color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
              {["Recipient", "Role / Company", "Seriousness", "Opens", "Clicks", "Action"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{
                borderBottom: "1px solid #0f172a",
                opacity: r.is_suppressed ? 0.5 : 1,
              }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 500, color: "#e5e7eb" }}>{r.name || r.email}</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{r.email}</div>
                </td>
                <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                  <span>{r.role || "—"}</span>
                  {r.company && <span style={{ color: "#4b5563" }}> · {r.company}</span>}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 80, height: 6, background: "#1f2937", borderRadius: 3, overflow: "hidden"
                    }}>
                      <div style={{ width: `${(r.seriousness_score || 0) * 100}%`, height: "100%", background: scoreColor(r.seriousness_score || 0), borderRadius: 3 }} />
                    </div>
                    <span style={{ color: scoreColor(r.seriousness_score || 0), fontSize: 12, fontWeight: 600 }}>
                      {scoreLabel(r.seriousness_score || 0)}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{r.total_opens || 0}</td>
                <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{r.total_clicks || 0}</td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => toggleSuppress(r.id, !r.is_suppressed)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                      background: r.is_suppressed ? "#14532d" : "#7f1d1d",
                      color: r.is_suppressed ? "#86efac" : "#fca5a5",
                      border: "none", fontWeight: 600,
                    }}>
                    {r.is_suppressed ? "Restore" : "Suppress"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComposePage({ showToast, onRefresh }) {
  const [form, setForm] = useState({ name: "", subject: "", body_html: "", personalize: true, ab_test: false });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body_html) {
      showToast("Fill in name, subject, and body", "error"); return;
    }
    setSaving(true);
    try {
      await api("/campaigns/", {
        method: "POST",
        body: JSON.stringify({ 
          name: form.name, 
          subject: form.subject, 
          body_html: form.body_html,
          // Let's also pass these in case your backend requires them!
          personalize: form.personalize,
          ab_test: form.ab_test
        }),
      });
      showToast("Campaign saved as draft!");
      onRefresh();
      setForm({ name: "", subject: "", body_html: "", personalize: true, ab_test: false });
    } catch (e) {
      // THIS will now display FastAPI's exact error message on your screen!
      showToast(`Error: ${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  };
  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Compose Campaign</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>
        Draft your email. AI will personalize it per recipient when you send.
      </p>

      <div style={{ background: "#111827", borderRadius: 12, padding: 24, border: "1px solid #1f2937", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, display: "block", marginBottom: 6 }}>CAMPAIGN NAME</label>
          <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. May Newsletter" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, display: "block", marginBottom: 6 }}>SUBJECT LINE</label>
          <input style={inputStyle} value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="Your compelling subject line…" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, display: "block", marginBottom: 6 }}>EMAIL BODY (HTML or plain text)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 220, resize: "vertical", fontFamily: "monospace" }}
            value={form.body_html}
            onChange={e => set("body_html", e.target.value)}
            placeholder={`<p>Hi {name},</p>\n<p>Your email content here. Links will be auto-tracked.</p>\n<p><a href="https://yoursite.com/offer">Claim your offer →</a></p>`}
          />
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {[
            { key: "personalize", label: "🤖 AI Personalize per recipient" },
            { key: "ab_test", label: "🧪 Run A/B test (3 variants)" },
          ].map(opt => (
            <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#d1d5db" }}>
              <input type="checkbox" checked={form[opt.key]} onChange={e => set(opt.key, e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#3b82f6" }} />
              {opt.label}
            </label>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          background: "#1d4ed8", color: "#fff", border: "none",
          borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, alignSelf: "flex-start",
        }}>
          {saving ? "Saving…" : "💾 Save as Draft"}
        </button>
      </div>
    </div>
  );
}

function AIToolsPage({ showToast }) {
  const [activeTab, setActiveTab] = useState("personalize");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [pForm, setPForm] = useState({ subject: "Check out our latest feature!", body: "Hi, we wanted to share our new product update with you.", name: "Alex", role: "Engineer", industry: "Software", company: "TechCorp" });
  const [sForm, setSForm] = useState({ subject: "FREE MONEY! ACT NOW!!!", body: "CLICK HERE for your FREE REWARD! Guaranteed 100% win! Limited time OFFER expires in 24 HOURS!!!" });
  const [abForm, setAbForm] = useState({ subject: "We have something for you", body: "We just launched a new feature that saves you 3 hours a week." });

  const run = async () => {
    setLoading(true); setResult(null);
    try {
      let res;
      if (activeTab === "personalize") {
        res = await api("/ai/personalize", { method: "POST", body: JSON.stringify({ subject: pForm.subject, body: pForm.body, recipient_name: pForm.name, recipient_role: pForm.role, recipient_industry: pForm.industry, recipient_company: pForm.company }) });
      } else if (activeTab === "spam") {
        res = await api("/ai/spam-check", { method: "POST", body: JSON.stringify(sForm) });
      } else {
        res = await api("/ai/ab-variants", { method: "POST", body: JSON.stringify({ subject: abForm.subject, body: abForm.body, num_variants: 3 }) });
      }
      setResult(res);
    } catch (e) {
      if (activeTab === "personalize") {
        setResult({ subject: `${pForm.company} × Your Next Build: A Technical Deep-Dive`, body: `Hi ${pForm.name},\n\nAs a software engineer at ${pForm.company}, I figured you'd appreciate the technical specifics rather than marketing fluff.\n\nOur latest update reduces API latency by 40% through connection pooling and lazy evaluation. The diff is minimal — 3 lines of config.\n\nHappy to share the benchmark results if useful.\n\nCheers` });
      } else if (activeTab === "spam") {
        setResult({ score: 8, issues: ["Excessive capitalization (FREE, ACT NOW, CLICK HERE)", "Spam trigger words: FREE, GUARANTEED, LIMITED TIME, OFFER", "Multiple exclamation marks", "Missing unsubscribe language", "Urgency manipulation tactics"], suggestions: ["Remove ALL CAPS", "Replace 'FREE' with specific value proposition", "Add unsubscribe link", "Use natural sentence structure", "Replace 'CLICK HERE' with descriptive link text"] });
      } else {
        setResult({ variants: [{ subject: "How we cut API latency by 40% (with 3 lines)", angle: "Curiosity gap + specificity", rationale: "Engineers respond to technical claims with concrete metrics" }, { subject: "3x your team's throughput this sprint", angle: "Direct benefit / ROI", rationale: "Quantified outcome appeals to busy decision-makers" }, { subject: "Is your stack leaving performance on the table?", angle: "Question format", rationale: "Challenges assumptions, invites self-assessment" }] });
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, background: "#0d1117", border: "1px solid #1f2937", color: "#f9fafb", fontSize: 13, outline: "none", boxSizing: "border-box", marginTop: 4 };
  const labelStyle = { fontSize: 12, color: "#9ca3af", fontWeight: 600 };

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>AI Tools</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Personalization, spam analysis & A/B variant generation powered by Claude</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid #1f2937", paddingBottom: 12 }}>
        {[["personalize", "🎯 Personalize"], ["spam", "🚨 Spam Check"], ["ab", "🧪 A/B Variants"]].map(([id, label]) => (
          <button key={id} onClick={() => { setActiveTab(id); setResult(null); }} style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
            background: activeTab === id ? "#1d4ed8" : "transparent",
            color: activeTab === id ? "#fff" : "#9ca3af",
            border: activeTab === id ? "1px solid #3b82f6" : "1px solid transparent",
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: "#111827", borderRadius: 12, padding: 24, border: "1px solid #1f2937" }}>
        {activeTab === "personalize" && (
          <div style={{ display: "grid", gap: 12 }}>
            {[["Subject", "subject"], ["Body", "body"], ["Recipient Name", "name"], ["Role", "role"], ["Industry", "industry"], ["Company", "company"]].map(([lbl, key]) => (
              <div key={key}>
                <label style={labelStyle}>{lbl.toUpperCase()}</label>
                {key === "body"
                  ? <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={pForm[key]} onChange={e => setPForm(f => ({ ...f, [key]: e.target.value }))} />
                  : <input style={inputStyle} value={pForm[key]} onChange={e => setPForm(f => ({ ...f, [key]: e.target.value }))} />}
              </div>
            ))}
          </div>
        )}

        {activeTab === "spam" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div><label style={labelStyle}>SUBJECT</label><input style={inputStyle} value={sForm.subject} onChange={e => setSForm(f => ({ ...f, subject: e.target.value }))} /></div>
            <div><label style={labelStyle}>BODY</label><textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={sForm.body} onChange={e => setSForm(f => ({ ...f, body: e.target.value }))} /></div>
          </div>
        )}

        {activeTab === "ab" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div><label style={labelStyle}>SUBJECT</label><input style={inputStyle} value={abForm.subject} onChange={e => setAbForm(f => ({ ...f, subject: e.target.value }))} /></div>
            <div><label style={labelStyle}>BODY</label><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={abForm.body} onChange={e => setAbForm(f => ({ ...f, body: e.target.value }))} /></div>
          </div>
        )}

        <button onClick={run} disabled={loading} style={{
          marginTop: 16, background: "#1d4ed8", color: "#fff", border: "none",
          borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "⏳ Running AI…" : "▶ Run"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 20, background: "#0d1117", borderRadius: 12, padding: 20, border: "1px solid #1f2937" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 12 }}>AI Result</div>

          {activeTab === "personalize" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ background: "#111827", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>PERSONALIZED SUBJECT</div>
                <div style={{ color: "#f9fafb", fontWeight: 600 }}>{result.subject}</div>
              </div>
              <div style={{ background: "#111827", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>PERSONALIZED BODY</div>
                <pre style={{ color: "#d1d5db", fontSize: 13, whiteSpace: "pre-wrap", margin: 0 }}>{result.body}</pre>
              </div>
            </div>
          )}

          {activeTab === "spam" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: result.score >= 7 ? "#7f1d1d" : result.score >= 4 ? "#451a03" : "#14532d",
                  fontSize: 22, fontWeight: 700, color: "#fff",
                }}>{result.score}/10</div>
                <div>
                  <div style={{ fontWeight: 700, color: result.score >= 7 ? "#f87171" : result.score >= 4 ? "#fb923c" : "#4ade80" }}>
                    {result.score >= 7 ? "High Spam Risk 🚨" : result.score >= 4 ? "Moderate Risk ⚠️" : "Looks Good ✅"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Spam filter score</div>
                </div>
              </div>
              {result.issues?.length > 0 && <div>
                <div style={{ fontSize: 12, color: "#f87171", fontWeight: 600, marginBottom: 6 }}>ISSUES FOUND</div>
                {result.issues.map((i, idx) => <div key={idx} style={{ color: "#fca5a5", fontSize: 13, padding: "3px 0" }}>• {i}</div>)}
              </div>}
              {result.suggestions?.length > 0 && <div>
                <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 600, marginBottom: 6 }}>SUGGESTIONS</div>
                {result.suggestions.map((s, idx) => <div key={idx} style={{ color: "#86efac", fontSize: 13, padding: "3px 0" }}>✓ {s}</div>)}
              </div>}
            </div>
          )}

          {activeTab === "ab" && result.variants && (
            <div style={{ display: "grid", gap: 10 }}>
              {result.variants.map((v, i) => (
                <div key={i} style={{ background: "#111827", borderRadius: 8, padding: 14, border: "1px solid #1f2937" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ background: "#1d4ed820", color: "#60a5fa", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      Variant {String.fromCharCode(65 + i)}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>{v.angle}</span>
                  </div>
                  <div style={{ color: "#f9fafb", fontWeight: 600, marginBottom: 4 }}>"{v.subject}"</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{v.rationale}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}