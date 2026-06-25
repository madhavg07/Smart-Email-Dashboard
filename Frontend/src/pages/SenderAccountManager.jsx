import React, { useState, useEffect } from "react";

const API_BASE = "https://smart-email-dashboard.onrender.com";

export default function SenderAccountManager() {
  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [provider, setProvider] = useState("SMTP (Gmail/Outlook)");
  const [dailyLimit, setDailyLimit] = useState(400);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem("token");
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
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/senders/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email_address: emailAddress,
          app_password: appPassword,
          provider: provider,
          daily_limit: parseInt(dailyLimit),
        }),
      });

      if (response.ok) {
        setEmailAddress("");
        setAppPassword("");
        setDailyLimit(400);
        fetchAccounts();
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 text-white bg-[#0f172a] min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Sender Accounts</h2>
          <p className="text-gray-400">Connect and manage your rotating email accounts to bypass sending limits.</p>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg">
          <h3 className="text-xl font-semibold mb-4">Add New Sender</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-sm text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="bg-[#0f172a] border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm text-gray-400 mb-1">App Password / API Key</label>
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  className="bg-[#0f172a] border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm text-gray-400 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="bg-[#0f172a] border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option>SMTP (Gmail/Outlook)</option>
                  <option>SendGrid</option>
                  <option>AWS SES</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-sm text-gray-400 mb-1">Daily Limit</label>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="bg-[#0f172a] border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Account to Rotation"}
            </button>
          </form>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg">
          <h3 className="text-xl font-semibold mb-4">Active Senders</h3>
          {accounts.length === 0 ? (
            <p className="text-gray-400 py-4">No sender accounts added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Provider</th>
                    <th className="pb-3 pr-4">Daily Limit</th>
                    <th className="pb-3 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc, index) => (
                    <tr key={index} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 pr-4">{acc.email_address}</td>
                      <td className="py-3 pr-4">
                        <span className="bg-gray-700 px-2 py-1 rounded text-xs">{acc.provider}</span>
                      </td>
                      <td className="py-3 pr-4">{acc.daily_limit}</td>
                      <td className="py-3 pr-4">
                        <span className="text-green-400 flex items-center gap-1 text-sm">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
