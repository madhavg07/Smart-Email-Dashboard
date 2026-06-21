import React, { useState } from 'react';

const SenderAccountManager = ({ userId }) => {
  // Assuming user_id is 1 for testing; replace with your actual auth state later
  const [formData, setFormData] = useState({
    email_address: '',
    password_or_api_key: '',
    provider: 'smtp',
    daily_limit: 400,
  });
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Adding account...' });

    const API_BASE = "https://smart-email-dashboard.onrender.com";
    const API_URL = `${API_BASE}/senders/add`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email_address: formData.email_address,
          password_or_api_key: formData.password_or_api_key,
          provider: formData.provider,
          daily_limit: parseInt(formData.daily_limit, 10) || 400, // Fallback to 400 if empty
          user_id: String(userId) 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: data.message || 'Account added successfully!' });
        setFormData({ ...formData, email_address: '', password_or_api_key: '' });
      } else {
        // --- CRITICAL FIX: Safely format the FastAPI error array into a readable string ---
        let errorMessage = 'Failed to add account';
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            // Extracts the exact field name and the error message (e.g., "body.daily_limit: value is not a valid integer")
            errorMessage = data.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(', ');
          } else {
            errorMessage = String(data.detail);
          }
        }
        
        setStatus({ type: 'error', message: `Validation Error -> ${errorMessage}` });
        // ---------------------------------------------------------------------------------
      }
    } catch (error) {
      setStatus({ type: 'error', message: 'Network error. Is FastAPI running?' });
    }
  };

  return (
    <div className="max-w-lg p-6 bg-white rounded-lg shadow-md mt-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Add Sender Account</h2>
      <p className="text-sm text-gray-600 mb-6">
        Connect additional email accounts to enable automatic sender rotation and bypass daily sending limits.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email Address</label>
          <input
            type="email"
            name="email_address"
            required
            value={formData.email_address}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., outreach1@yourdomain.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">App Password / API Key</label>
          <input
            type="password"
            name="password_or_api_key"
            required
            value={formData.password_or_api_key}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Provider</label>
            <select
              name="provider"
              value={formData.provider}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="smtp">SMTP (Gmail/Outlook)</option>
              <option value="sendgrid">SendGrid</option>
              <option value="ses">AWS SES</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Daily Limit</label>
            <input
              type="number"
              name="daily_limit"
              value={formData.daily_limit}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={status.type === 'loading'}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {status.type === 'loading' ? 'Saving...' : 'Add Account to Rotation'}
        </button>

        {status.message && (
          <div
            className={`p-3 mt-4 text-sm rounded-md ${
              status.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
};

export default SenderAccountManager;