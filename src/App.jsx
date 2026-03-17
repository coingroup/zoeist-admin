import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase, adminFetch, YEAR_END_API_URL, RECURRING_API_URL, COMPLIANCE_REPORTS_URL, COMPLIANCE_ALERTS_URL, COMPLIANCE_FIN_STMT_URL, MATCHING_GIFTS_API_URL, EVENTS_API_URL, FUNDRAISING_API_URL, ADMIN_EXTRAS_API_URL, ACCOUNTING_API_URL } from './supabase';

/* ═══════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════ */
const STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0b0f; --bg-card: #16151b; --bg-hover: #1e1d25; --bg-input: #1a1922;
    --border: #2a2935; --border-focus: #c8a855;
    --text: #e8e6f0; --text-muted: #8b8899; --text-dim: #5d5b6a;
    --gold: #c8a855; --gold-dim: rgba(200,168,85,0.15); --gold-text: #e0c872;
    --green: #4ade80; --green-bg: rgba(74,222,128,0.1);
    --red: #f87171; --red-bg: rgba(248,113,113,0.1);
    --blue: #60a5fa; --blue-bg: rgba(96,165,250,0.1);
    --font: 'DM Sans', -apple-system, sans-serif;
    --mono: 'DM Mono', 'SF Mono', monospace;
  }
  html, body, #root { height: 100%; }
  body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  a { color: var(--gold-text); text-decoration: none; }
  a:hover { text-decoration: underline; }
  input, select, button { font-family: var(--font); }

  /* Layout */
  .layout { display: flex; height: 100vh; }
  .sidebar {
    width: 240px; background: var(--bg-card); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .sidebar-logo {
    padding: 24px 20px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px;
  }
  .sidebar-logo .z-mark {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), #a07c3a);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 16px;
  }
  .sidebar-logo h1 { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
  .sidebar-logo span { font-size: 11px; color: var(--text-muted); font-weight: 400; }

  .sidebar-nav { padding: 16px 12px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .sidebar-nav a {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px; font-size: 13.5px; font-weight: 500;
    color: var(--text-muted); transition: all 0.15s;
  }
  .sidebar-nav a:hover { background: var(--bg-hover); color: var(--text); text-decoration: none; }
  .sidebar-nav a.active { background: var(--gold-dim); color: var(--gold-text); }
  .sidebar-nav a .nav-icon { font-size: 16px; width: 20px; text-align: center; }

  .sidebar-footer {
    padding: 16px 20px; border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text-dim);
  }
  .sidebar-footer .admin-name { color: var(--text-muted); font-weight: 500; }
  .sidebar-footer button {
    background: none; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 12px; padding: 4px 0; margin-top: 4px;
  }
  .sidebar-footer button:hover { color: var(--red); }

  .main-content { flex: 1; overflow-y: auto; padding: 32px; }
  .page-header { margin-bottom: 28px; }
  .page-header h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; }
  .page-header p { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

  /* Cards */
  .card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
    padding: 20px; transition: border-color 0.2s;
  }
  .card:hover { border-color: #3a3948; }
  .card-title { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 8px; }
  .card-value { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; font-family: var(--mono); }
  .card-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  @media (max-width: 1100px) { .charts-grid { grid-template-columns: 1fr; } }

  /* Tables */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; color: var(--text-dim); font-size: 11px; font-weight: 600;
       text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); }
  td { padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); }
  tr:hover td { background: var(--bg-hover); }
  .td-primary { color: var(--text); font-weight: 500; }
  .td-mono { font-family: var(--mono); font-size: 12px; }

  /* Badges */
  .badge {
    display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.02em;
  }
  .badge-green { background: var(--green-bg); color: var(--green); }
  .badge-red { background: var(--red-bg); color: var(--red); }
  .badge-blue { background: var(--blue-bg); color: var(--blue); }
  .badge-gold { background: var(--gold-dim); color: var(--gold-text); }

  /* Controls */
  .controls { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
  .controls input, .controls select {
    background: var(--bg-input); border: 1px solid var(--border); color: var(--text);
    padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none;
  }
  .controls input:focus, .controls select:focus { border-color: var(--border-focus); }
  .controls input { min-width: 220px; }

  .btn {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
    border: none; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn-gold { background: var(--gold); color: #1a1a1a; }
  .btn-gold:hover { background: #d4b45e; }
  .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
  .btn-ghost:hover { border-color: var(--gold); color: var(--gold-text); }
  .btn-sm { padding: 5px 10px; font-size: 11px; }
  .btn-danger { background: var(--red-bg); color: var(--red); border: 1px solid rgba(248,113,113,0.2); }

  .pagination { display: flex; gap: 8px; align-items: center; margin-top: 16px; justify-content: center; }
  .pagination button { padding: 6px 12px; }
  .pagination span { font-size: 13px; color: var(--text-muted); }

  /* Login */
  .login-page {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg);
  }
  .login-card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
    padding: 40px; width: 380px; max-width: 90vw;
  }
  .login-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 24px; text-align: center; }
  .login-card .z-mark-lg {
    width: 52px; height: 52px; border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), #a07c3a);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 22px; margin: 0 auto 16px;
  }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
  .form-group input {
    width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: var(--text);
    padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none;
  }
  .form-group input:focus { border-color: var(--border-focus); }
  .login-error { color: var(--red); font-size: 13px; margin-bottom: 12px; text-align: center; }
  .login-btn { width: 100%; padding: 12px; font-size: 14px; margin-top: 8px; }

  /* Alert banner */
  .alert-banner {
    padding: 12px 16px; border-radius: 10px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500;
  }
  .alert-warning { background: rgba(200,168,85,0.1); border: 1px solid rgba(200,168,85,0.2); color: var(--gold-text); }
  .alert-danger { background: var(--red-bg); border: 1px solid rgba(248,113,113,0.2); color: var(--red); }
  .alert-success { background: var(--green-bg); border: 1px solid rgba(74,222,128,0.2); color: var(--green); }

  /* Modal */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
    padding: 28px; width: 480px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
  }
  .modal h3 { font-size: 17px; font-weight: 700; margin-bottom: 20px; }
  .modal .form-group { margin-bottom: 14px; }
  .modal .form-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 5px; font-weight: 500; }
  .modal .form-group input, .modal .form-group select, .modal .form-group textarea {
    width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: var(--text);
    padding: 9px 12px; border-radius: 8px; font-size: 13px; outline: none; font-family: var(--font);
  }
  .modal .form-group textarea { min-height: 60px; resize: vertical; }
  .modal .form-group input:focus, .modal .form-group select:focus, .modal .form-group textarea:focus { border-color: var(--border-focus); }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

  /* Loading */
  .loading { display: flex; align-items: center; justify-content: center; padding: 60px; color: var(--text-dim); }
  .spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 10px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Compliance cards */
  .compliance-section { margin-bottom: 32px; }
  .compliance-section h3 { font-size: 15px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .compliance-count { font-family: var(--mono); font-size: 13px; color: var(--gold-text); background: var(--gold-dim); padding: 2px 8px; border-radius: 6px; }
`;

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
const fmt = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const fmtK = (cents) => {
  const val = cents / 100;
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtMonth = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

// Parse user-entered dollar strings like "1,250.00" or "1250" to cents
const parseCents = (v) => {
  if (!v && v !== 0) return 0;
  const cleaned = String(v).replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(cleaned || '0') * 100);
};

// Dollar input: shows $ prefix, accepts commas/decimals, stores raw string
function DollarInput({ value, onChange, placeholder }) {
  const handleChange = (e) => {
    const raw = e.target.value;
    // Allow digits, commas, periods, and empty
    const filtered = raw.replace(/[^0-9,.]/g, '');
    onChange(filtered);
  };
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 12, color: 'var(--text-dim)', fontSize: 13, pointerEvents: 'none', zIndex: 1 }}>$</span>
      <input
        type="text"
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder || '0.00'}
        style={{ paddingLeft: 24, width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px 9px 24px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'var(--font)' }}
      />
    </div>
  );
}

const CHART_GOLD = '#c8a855';
const PIE_COLORS = ['#c8a855', '#60a5fa', '#4ade80', '#f87171', '#a78bfa'];

/* ═══════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════ */
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      onLogin(data.session);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="z-mark-lg">Z</div>
        <h2>Zoeist Admin</h2>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@zoeist.org" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          <button type="submit" className="btn btn-gold login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OVERVIEW VIEW
   ═══════════════════════════════════════════ */
function OverviewView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch('overview').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" />Loading dashboard...</div>;
  if (!data) return <div className="loading">Failed to load data</div>;

  const { summary, monthly, recentDonations, topDonors, designations } = data;
  const s = summary || {};

  const monthlyChart = (monthly || []).slice().reverse().map(m => ({
    month: fmtMonth(m.month),
    amount: (m.total_cents || 0) / 100,
    count: m.donation_count,
  }));

  const designationChart = (designations || []).map(d => ({
    name: (d.designation || 'unrestricted').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: (d.total_cents || 0) / 100,
    count: d.count,
  }));

  return (
    <>
      <div className="page-header">
        <h2>Overview</h2>
        <p>Real-time snapshot of your fundraising performance</p>
      </div>

      {(s.pending_receipts > 0) && (
        <div className="alert-banner alert-warning">
          ⚠ {s.pending_receipts} donation{s.pending_receipts > 1 ? 's' : ''} pending receipt — check Compliance tab
        </div>
      )}

      <div className="kpi-grid">
        <div className="card">
          <div className="card-title">Total Raised</div>
          <div className="card-value">{fmtK(s.total_amount_cents || 0)}</div>
          <div className="card-sub">{s.total_donations || 0} donations</div>
        </div>
        <div className="card">
          <div className="card-title">This Month</div>
          <div className="card-value">{fmtK(s.this_month_cents || 0)}</div>
          <div className="card-sub">{s.this_month_count || 0} donations</div>
        </div>
        <div className="card">
          <div className="card-title">This Year</div>
          <div className="card-value">{fmtK(s.this_year_cents || 0)}</div>
          <div className="card-sub">{s.this_year_count || 0} donations</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Donation</div>
          <div className="card-value">{fmt(s.avg_amount_cents || 0)}</div>
          <div className="card-sub">{s.unique_donors || 0} unique donors</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-title">Monthly Revenue</div>
          <div style={{ height: 260, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2935" />
                <XAxis dataKey="month" stroke="#5d5b6a" fontSize={11} />
                <YAxis stroke="#5d5b6a" fontSize={11} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`} />
                <Tooltip
                  contentStyle={{ background: '#1e1d25', border: '1px solid #2a2935', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`$${v.toLocaleString()}`, 'Amount']}
                />
                <Bar dataKey="amount" fill={CHART_GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">By Designation</div>
          <div style={{ height: 260, marginTop: 12 }}>
            {designationChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={designationChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} stroke="none">
                    {designationChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e1d25', border: '1px solid #2a2935', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="loading" style={{ padding: 20 }}>No designation data yet</div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {designationChart.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8b8899' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Donations</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Receipt</th><th>Donor</th><th>Amount</th><th>Date</th><th>Status</th><th>Receipt Sent</th></tr>
            </thead>
            <tbody>
              {(recentDonations || []).slice(0, 8).map(d => (
                <tr key={d.id}>
                  <td className="td-mono">{d.receipt_number}</td>
                  <td className="td-primary">{d.first_name} {d.last_name}</td>
                  <td className="td-mono">{fmt(d.amount_cents)}</td>
                  <td>{fmtDate(d.donated_at)}</td>
                  <td><span className={`badge ${d.status === 'succeeded' ? 'badge-green' : d.status === 'refunded' ? 'badge-red' : 'badge-blue'}`}>{d.status}</span></td>
                  <td>{d.thank_you_sent_at ? <span className="badge badge-green">Sent</span> : <span className="badge badge-red">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   DONATIONS VIEW
   ═══════════════════════════════════════════ */
function DonationsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 25 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    adminFetch(`donations?${params}`).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load(); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminFetch('export/donations');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    setExporting(false);
  };

  const handleResend = async (donationId) => {
    if (!confirm('Resend receipt email for this donation?')) return;
    try {
      await adminFetch('resend-receipt', { method: 'POST', body: JSON.stringify({ donation_id: donationId }) });
      alert('Receipt resent!');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <>
      <div className="page-header">
        <h2>Donations</h2>
        <p>View and manage all donation records</p>
      </div>

      <div className="controls">
        <form onSubmit={handleSearch} style={{ display: 'contents' }}>
          <input placeholder="Search by name, email, receipt #..." value={search} onChange={e => setSearch(e.target.value)} />
        </form>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="refunded">Refunded</option>
          <option value="pending">Pending</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : '↓ Export CSV'}
        </button>
      </div>

      {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
        <>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Receipt</th><th>Donor</th><th>Email</th><th>Amount</th><th>Type</th><th>Date</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {(data?.donations || []).map(d => (
                    <tr key={d.id}>
                      <td className="td-mono">{d.receipt_number}</td>
                      <td className="td-primary">{d.donor?.first_name} {d.donor?.last_name}</td>
                      <td>{d.donor?.email}</td>
                      <td className="td-mono">{fmt(d.amount_cents)}</td>
                      <td><span className="badge badge-gold">{(d.designation || 'unrestricted').replace(/_/g, ' ')}</span></td>
                      <td>{fmtDate(d.donated_at)}</td>
                      <td><span className={`badge ${d.status === 'succeeded' ? 'badge-green' : 'badge-red'}`}>{d.status}</span></td>
                      <td>
                        {!d.thank_you_sent_at && d.status === 'succeeded' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleResend(d.id)}>Resend</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!data?.donations || data.donations.length === 0) && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#5d5b6a' }}>No donations found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span>Page {page} of {data.totalPages} ({data.total} total)</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   DONORS VIEW
   ═══════════════════════════════════════════ */
function DonorDetailField({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#5d5b6a', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? '#e8e6f0' : '#5d5b6a' }}>{value || '—'}</div>
    </div>
  );
}

function DonorsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [donorDetail, setDonorDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 25, sort_by: 'total_donated_cents' });
    if (search) params.set('search', search);
    adminFetch(`donors?${params}`).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load(); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminFetch('export/donors');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `donors-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    setExporting(false);
  };

  const openDonorDetail = async (donor) => {
    setSelectedDonor(donor.id);
    setLoadingDetail(true);
    setEditing(false);
    try {
      const detail = await adminFetch(`donor/${donor.id}`);
      setDonorDetail(detail);
    } catch (err) {
      console.error(err);
      // Fallback: use the donor data we already have
      setDonorDetail({ donor, donations: [] });
    }
    setLoadingDetail(false);
  };

  const startEdit = () => {
    setEditForm({ ...donorDetail.donor });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await adminFetch(`donor/${donorDetail.donor.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          email: editForm.email,
          phone: editForm.phone,
          address_line1: editForm.address_line1,
          address_line2: editForm.address_line2,
          city: editForm.city,
          state: editForm.state,
          zip: editForm.zip,
          country: editForm.country,
          employer: editForm.employer,
          is_anonymous: editForm.is_anonymous,
        })
      });
      // Refresh detail
      const detail = await adminFetch(`donor/${donorDetail.donor.id}`);
      setDonorDetail(detail);
      setEditing(false);
      load(); // refresh list too
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const updateEdit = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

  const d = donorDetail?.donor;

  return (
    <>
      <div className="page-header">
        <h2>Donors</h2>
        <p>View and manage your donor database</p>
      </div>

      <div className="controls">
        <form onSubmit={handleSearch} style={{ display: 'contents' }}>
          <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </form>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : '↓ Export CSV'}
        </button>
      </div>

      {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
        <>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Total Given</th><th>Donations</th><th>First Gift</th><th>Last Gift</th><th>Location</th></tr>
                </thead>
                <tbody>
                  {(data?.donors || []).map(dn => (
                    <tr key={dn.id} onClick={() => openDonorDetail(dn)} style={{ cursor: 'pointer', background: selectedDonor === dn.id ? 'var(--gold-dim)' : undefined }}>
                      <td className="td-primary">{dn.first_name} {dn.last_name}</td>
                      <td>{dn.email}</td>
                      <td className="td-mono" style={{ fontWeight: 600, color: '#e0c872' }}>{fmt(dn.total_donated_cents || 0)}</td>
                      <td className="td-mono">{dn.donation_count || 0}</td>
                      <td>{fmtDate(dn.first_donated_at)}</td>
                      <td>{fmtDate(dn.last_donated_at)}</td>
                      <td>{[dn.city, dn.state].filter(Boolean).join(', ') || '—'}</td>
                    </tr>
                  ))}
                  {(!data?.donors || data.donors.length === 0) && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#5d5b6a' }}>No donors found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span>Page {page} of {data.totalPages} ({data.total} total)</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Donor Detail Panel */}
      {selectedDonor && (
        <div className="modal-overlay" onClick={() => { setSelectedDonor(null); setDonorDetail(null); setEditing(false); }}>
          <div className="modal" style={{ width: 620, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            {loadingDetail ? (
              <div className="loading"><div className="spinner" />Loading donor profile...</div>
            ) : d ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 19 }}>{d.first_name} {d.last_name}</h3>
                    <div style={{ fontSize: 12, color: '#8b8899', marginTop: 2 }}>{d.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!editing && <button className="btn btn-gold btn-sm" onClick={startEdit}>Edit</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedDonor(null); setDonorDetail(null); setEditing(false); }}>×</button>
                  </div>
                </div>

                {/* Summary badges */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--gold-dim)', padding: '8px 14px', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#8b8899', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Given</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: '#e0c872' }}>{fmt(d.total_donated_cents || 0)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-hover)', padding: '8px 14px', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#8b8899', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Donations</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)' }}>{d.donation_count || 0}</div>
                  </div>
                  <div style={{ background: 'var(--bg-hover)', padding: '8px 14px', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#8b8899', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Donor Since</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtDate(d.first_donated_at)}</div>
                  </div>
                  {d.is_anonymous && <span className="badge badge-blue" style={{ alignSelf: 'center' }}>Anonymous</span>}
                </div>

                {editing ? (
                  /* Edit Form */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                      <div className="form-group">
                        <label>First Name</label>
                        <input value={editForm.first_name || ''} onChange={e => updateEdit('first_name', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Last Name</label>
                        <input value={editForm.last_name || ''} onChange={e => updateEdit('last_name', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={editForm.email || ''} onChange={e => updateEdit('email', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Phone</label>
                        <input value={editForm.phone || ''} onChange={e => updateEdit('phone', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Address Line 1</label>
                        <input value={editForm.address_line1 || ''} onChange={e => updateEdit('address_line1', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Address Line 2</label>
                        <input value={editForm.address_line2 || ''} onChange={e => updateEdit('address_line2', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>City</label>
                        <input value={editForm.city || ''} onChange={e => updateEdit('city', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <input value={editForm.state || ''} onChange={e => updateEdit('state', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>ZIP</label>
                        <input value={editForm.zip || ''} onChange={e => updateEdit('zip', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Country</label>
                        <input value={editForm.country || ''} onChange={e => updateEdit('country', e.target.value)} placeholder="US" />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Employer</label>
                        <input value={editForm.employer || ''} onChange={e => updateEdit('employer', e.target.value)} placeholder="For matching gift programs" />
                      </div>
                    </div>
                    <div className="modal-actions">
                      <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="btn btn-gold" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                  </>
                ) : (
                  /* Read-only Profile */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                      <DonorDetailField label="Phone" value={d.phone} />
                      <DonorDetailField label="Employer" value={d.employer} />
                      <DonorDetailField label="Address" value={[d.address_line1, d.address_line2].filter(Boolean).join(', ') || null} />
                      <DonorDetailField label="City, State ZIP" value={[d.city, d.state, d.zip].filter(Boolean).join(', ') || null} />
                      <DonorDetailField label="Country" value={d.country} />
                      <DonorDetailField label="Stripe Customer" value={d.stripe_customer_id} />
                    </div>

                    {/* Donation History */}
                    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <div className="card-title" style={{ marginBottom: 10 }}>Donation History</div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Receipt</th><th>Amount</th><th>Date</th><th>Status</th><th>Designation</th></tr>
                          </thead>
                          <tbody>
                            {(donorDetail.donations || []).map(don => (
                              <tr key={don.id}>
                                <td className="td-mono">{don.receipt_number}</td>
                                <td className="td-mono" style={{ fontWeight: 600 }}>{fmt(don.amount_cents)}</td>
                                <td>{fmtDate(don.donated_at)}</td>
                                <td><span className={`badge ${don.status === 'succeeded' ? 'badge-green' : 'badge-red'}`}>{don.status}</span></td>
                                <td><span className="badge badge-gold">{(don.designation || 'unrestricted').replace(/_/g, ' ')}</span></td>
                              </tr>
                            ))}
                            {(!donorDetail.donations || donorDetail.donations.length === 0) && (
                              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, color: '#5d5b6a' }}>No donations recorded</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   COMPLIANCE VIEW
   ═══════════════════════════════════════════ */
function ComplianceView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'deadline'|'registration'|'filing', mode: 'create'|'edit', item?: object }
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Year-End Statements state
  const [yeTaxYear, setYeTaxYear] = useState(new Date().getFullYear() - 1);
  const [yeStatus, setYeStatus] = useState(null); // { total_donors, generated, sent, donors }
  const [yeLoading, setYeLoading] = useState(false);
  const [yeGenerating, setYeGenerating] = useState(false);
  const [yeSending, setYeSending] = useState(false);
  const [yeResult, setYeResult] = useState(null); // last operation result message

  // Compliance Automation state (Phase 9)
  const [readinessTaxYear, setReadinessTaxYear] = useState(new Date().getFullYear());
  const [readinessReport, setReadinessReport] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const [exportTaxYear, setExportTaxYear] = useState(new Date().getFullYear());
  const [exporting990, setExporting990] = useState(false);
  const [exportingSchedB, setExportingSchedB] = useState(false);
  const [gaC200, setGaC200] = useState(null);
  const [gaC200Loading, setGaC200Loading] = useState(false);

  const [finStmtTaxYear, setFinStmtTaxYear] = useState(new Date().getFullYear());
  const [finStmtGenerating, setFinStmtGenerating] = useState(false);
  const [finStmtResult, setFinStmtResult] = useState(null);

  const [alertsRunning, setAlertsRunning] = useState(false);
  const [alertsResult, setAlertsResult] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);

  const load = () => {
    setLoading(true);
    adminFetch('compliance').then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleResend = async (donationId) => {
    setResending(donationId);
    try {
      await adminFetch('resend-receipt', { method: 'POST', body: JSON.stringify({ donation_id: donationId }) });
      load();
    } catch (err) { alert(err.message); }
    setResending(null);
  };

  const openModal = (type, mode, item = null) => {
    setModal({ type, mode });
    if (mode === 'edit' && item) {
      setFormData({ ...item });
    } else {
      // Defaults for new items
      if (type === 'deadline') setFormData({ filing_name: '', description: '', deadline_date: '', status: 'upcoming' });
      else if (type === 'registration') setFormData({ state: '', registration_number: '', status: 'active', expiration_date: '', notes: '' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { type, mode } = modal;
      let endpoint, method;
      if (type === 'deadline') {
        endpoint = mode === 'edit' ? `deadline/${formData.id}` : 'deadline';
        method = mode === 'edit' ? 'PUT' : 'POST';
      } else if (type === 'registration') {
        endpoint = mode === 'edit' ? `state-registration/${formData.id}` : 'state-registration';
        method = mode === 'edit' ? 'PUT' : 'POST';
      } else if (type === 'filing') {
        endpoint = `filing/${formData.id}`;
        method = 'PUT';
      }
      // Clean out id for create, keep for update
      const payload = { ...formData };
      if (mode === 'create') { delete payload.id; delete payload.created_at; delete payload.updated_at; }
      await adminFetch(endpoint, { method, body: JSON.stringify(payload) });
      setModal(null);
      load();
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleDelete = async (type, id) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const endpoint = type === 'deadline' ? `deadline/${id}` : `state-registration/${id}`;
      await adminFetch(endpoint, { method: 'DELETE' });
      load();
    } catch (err) { alert(err.message); }
  };

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // Year-End Statements functions
  const yeLoadStatus = async (year) => {
    setYeLoading(true);
    setYeResult(null);
    try {
      const res = await adminFetch(`${YEAR_END_API_URL}/status?tax_year=${year || yeTaxYear}`);
      setYeStatus(res);
    } catch (err) {
      console.error('Year-end status error:', err);
      setYeStatus(null);
    }
    setYeLoading(false);
  };

  const yeGenerate = async () => {
    setYeGenerating(true);
    setYeResult(null);
    try {
      const res = await adminFetch(`${YEAR_END_API_URL}/generate`, {
        method: 'POST',
        body: JSON.stringify({ tax_year: yeTaxYear }),
      });
      setYeResult(`Generated ${res.generated} of ${res.total} statements${res.failed > 0 ? ` (${res.failed} failed)` : ''}`);
      yeLoadStatus();
    } catch (err) {
      setYeResult(`Error: ${err.message}`);
    }
    setYeGenerating(false);
  };

  const yeSendAll = async () => {
    if (!confirm(`Send year-end statements to all donors for ${yeTaxYear}? This will email each donor their giving statement.`)) return;
    setYeSending(true);
    setYeResult(null);
    try {
      const res = await adminFetch(`${YEAR_END_API_URL}/send`, {
        method: 'POST',
        body: JSON.stringify({ tax_year: yeTaxYear }),
      });
      setYeResult(`Sent ${res.sent} of ${res.total} emails${res.failed > 0 ? ` (${res.failed} failed)` : ''}`);
      yeLoadStatus();
    } catch (err) {
      setYeResult(`Error: ${err.message}`);
    }
    setYeSending(false);
  };

  const yeSendSingle = async (donorId) => {
    try {
      await adminFetch(`${YEAR_END_API_URL}/send-single`, {
        method: 'POST',
        body: JSON.stringify({ donor_id: donorId, tax_year: yeTaxYear }),
      });
      yeLoadStatus();
    } catch (err) {
      alert(`Failed to send: ${err.message}`);
    }
  };

  const yeDownload = async (donorId) => {
    try {
      const path = `statements/${yeTaxYear}/${donorId}.pdf`;
      const { data, error } = await supabase.storage.from('receipts').download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Year-End-Statement-${yeTaxYear}-${donorId.substring(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  // ── Phase 9 Handlers ──
  const runReadiness = async () => {
    setReadinessLoading(true);
    try {
      const res = await adminFetch(`${COMPLIANCE_REPORTS_URL}/readiness?tax_year=${readinessTaxYear}`);
      setReadinessReport(res);
    } catch (err) { alert(err.message); }
    setReadinessLoading(false);
  };

  const download990Csv = async () => {
    setExporting990(true);
    try {
      const res = await adminFetch(`${COMPLIANCE_REPORTS_URL}/form990-csv?tax_year=${exportTaxYear}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `form990-data-${exportTaxYear}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    setExporting990(false);
  };

  const downloadScheduleB = async () => {
    setExportingSchedB(true);
    try {
      const res = await adminFetch(`${COMPLIANCE_REPORTS_URL}/schedule-b?tax_year=${exportTaxYear}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `schedule-b-${exportTaxYear}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    setExportingSchedB(false);
  };

  const runGaC200Check = async () => {
    setGaC200Loading(true);
    try {
      const res = await adminFetch(`${COMPLIANCE_REPORTS_URL}/ga-c200-check?tax_year=${exportTaxYear}`);
      setGaC200(res);
    } catch (err) { alert(err.message); }
    setGaC200Loading(false);
  };

  const generateFinancialStatement = async () => {
    setFinStmtGenerating(true);
    setFinStmtResult(null);
    try {
      const res = await adminFetch(`${COMPLIANCE_FIN_STMT_URL}`, {
        method: 'POST',
        body: JSON.stringify({ tax_year: finStmtTaxYear }),
      });
      setFinStmtResult(res);
    } catch (err) { setFinStmtResult({ error: err.message }); }
    setFinStmtGenerating(false);
  };

  const downloadFinancialStatement = async () => {
    try {
      const path = `compliance/${finStmtTaxYear}/financial-statement.pdf`;
      const { data: blob, error } = await supabase.storage.from('donation-receipts').download(path);
      if (error) throw error;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `financial-statement-${finStmtTaxYear}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(`Download failed: ${err.message}`); }
  };

  const runAlertCheck = async () => {
    setAlertsRunning(true);
    setAlertsResult(null);
    try {
      const res = await adminFetch(`${COMPLIANCE_ALERTS_URL}`, { method: 'POST' });
      setAlertsResult(res);
    } catch (err) { setAlertsResult({ error: err.message }); }
    setAlertsRunning(false);
  };

  const loadRecentAlerts = async () => {
    try {
      const { data: alerts } = await supabase
        .from('compliance_alert_log')
        .select('*, deadline:compliance_deadlines(filing_name)')
        .order('sent_at', { ascending: false })
        .limit(20);
      setRecentAlerts(alerts || []);
    } catch (err) { console.error('Failed to load alerts:', err); }
  };

  useEffect(() => { loadRecentAlerts(); }, []);

  if (loading) return <div className="loading"><div className="spinner" />Loading compliance data...</div>;
  if (!data) return <div className="loading">Failed to load</div>;

  return (
    <>
      <div className="page-header">
        <h2>Compliance</h2>
        <p>IRS receipting, filing deadlines, and state registrations</p>
      </div>

      {(data.pendingCount > 0 || data.largeUnreceiptedCount > 0) && (
        <div className="alert-banner alert-danger">
          ⚠ Action required: {data.pendingCount || 0} pending receipt emails, {data.largeUnreceiptedCount || 0} large donations ({'>'}$250) without issued receipts
        </div>
      )}

      {/* Pending Receipt Emails */}
      <div className="compliance-section">
        <h3>Pending Receipt Emails <span className="compliance-count">{data.pendingCount || 0}</span></h3>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Receipt #</th><th>Donor</th><th>Email</th><th>Amount</th><th>Date</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {(data.pendingReceipts || []).map(d => (
                  <tr key={d.id}>
                    <td className="td-mono">{d.receipt_number}</td>
                    <td className="td-primary">{d.donor?.first_name} {d.donor?.last_name}</td>
                    <td>{d.donor?.email}</td>
                    <td className="td-mono">{fmt(d.amount_cents)}</td>
                    <td>{fmtDate(d.donated_at)}</td>
                    <td>
                      <button className="btn btn-gold btn-sm" onClick={() => handleResend(d.id)} disabled={resending === d.id}>
                        {resending === d.id ? 'Sending...' : 'Send Receipt'}
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data.pendingReceipts || data.pendingReceipts.length === 0) && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#4ade80' }}>✓ All receipts sent</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Large Donations Without Receipts */}
      <div className="compliance-section">
        <h3>Large Donations Without Receipts (≥$250) <span className="compliance-count">{data.largeUnreceiptedCount || 0}</span></h3>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Receipt #</th><th>Donor</th><th>Amount</th><th>Date</th></tr>
              </thead>
              <tbody>
                {(data.largeUnreceipted || []).map(d => (
                  <tr key={d.id}>
                    <td className="td-mono">{d.receipt_number}</td>
                    <td className="td-primary">{d.donor?.first_name} {d.donor?.last_name}</td>
                    <td className="td-mono">{fmt(d.amount_cents)}</td>
                    <td>{fmtDate(d.donated_at)}</td>
                  </tr>
                ))}
                {(!data.largeUnreceipted || data.largeUnreceipted.length === 0) && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#4ade80' }}>✓ All large donations receipted</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Compliance Deadlines */}
      <div className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>Compliance Deadlines</h3>
          <button className="btn btn-gold btn-sm" onClick={() => openModal('deadline', 'create')}>+ Add Deadline</button>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Filing</th><th>Description</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {(data.deadlines || []).map(d => {
                  const isPast = new Date(d.deadline_date) < new Date();
                  return (
                    <tr key={d.id}>
                      <td className="td-primary">{d.filing_name || d.name}</td>
                      <td>{d.description || '—'}</td>
                      <td style={isPast && d.status !== 'completed' ? { color: '#f87171', fontWeight: 600 } : {}}>{fmtDate(d.deadline_date)}</td>
                      <td><span className={`badge ${d.status === 'completed' ? 'badge-green' : isPast ? 'badge-red' : 'badge-blue'}`}>{d.status || 'upcoming'}</span></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        {d.status !== 'completed' && (
                          <button className="btn btn-ghost btn-sm" onClick={async () => {
                            await adminFetch(`deadline/${d.id}`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
                            load();
                          }}>✓ Complete</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openModal('deadline', 'edit', d)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete('deadline', d.id)}>×</button>
                      </td>
                    </tr>
                  );
                })}
                {(!data.deadlines || data.deadlines.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#5d5b6a' }}>No deadlines configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* State Registrations */}
      <div className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>State Registrations</h3>
          <button className="btn btn-gold btn-sm" onClick={() => openModal('registration', 'create')}>+ Add Registration</button>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>State</th><th>Registration #</th><th>Status</th><th>Expiration</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {(data.stateRegistrations || []).map(d => {
                  const isExpired = d.expiration_date && new Date(d.expiration_date) < new Date();
                  return (
                    <tr key={d.id}>
                      <td className="td-primary">{d.state}</td>
                      <td className="td-mono">{d.registration_number || '—'}</td>
                      <td><span className={`badge ${d.status === 'active' ? 'badge-green' : isExpired ? 'badge-red' : 'badge-blue'}`}>{d.status}</span></td>
                      <td style={isExpired ? { color: '#f87171' } : {}}>{fmtDate(d.expiration_date)}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openModal('registration', 'edit', d)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete('registration', d.id)}>×</button>
                      </td>
                    </tr>
                  );
                })}
                {(!data.stateRegistrations || data.stateRegistrations.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#5d5b6a' }}>No state registrations configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Year-End Giving Statements */}
      <div className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>Year-End Giving Statements</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ color: '#8b8899', fontSize: 13 }}>Tax Year:</label>
            <select
              value={yeTaxYear}
              onChange={e => { const yr = parseInt(e.target.value); setYeTaxYear(yr); setYeStatus(null); setYeResult(null); }}
              style={{ background: '#1a1922', color: '#e8e6f0', border: '1px solid #2a2935', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => yeLoadStatus()} disabled={yeLoading}>
              {yeLoading ? 'Loading...' : 'Check Status'}
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          {!yeStatus && !yeLoading && (
            <p style={{ color: '#8b8899', textAlign: 'center', margin: 0 }}>
              Select a tax year and click "Check Status" to view year-end statement progress.
            </p>
          )}
          {yeLoading && <div style={{ textAlign: 'center', color: '#8b8899' }}>Loading status...</div>}

          {yeStatus && (
            <>
              {/* Progress summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                <div style={{ background: '#1a1922', borderRadius: 8, padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ color: '#8b8899', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>Total Donors</div>
                  <div style={{ color: '#e8e6f0', fontSize: 28, fontWeight: 700 }}>{yeStatus.total_donors}</div>
                </div>
                <div style={{ background: '#1a1922', borderRadius: 8, padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ color: '#8b8899', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>PDFs Generated</div>
                  <div style={{ color: yeStatus.generated === yeStatus.total_donors ? '#4ade80' : '#c8a855', fontSize: 28, fontWeight: 700 }}>
                    {yeStatus.generated}/{yeStatus.total_donors}
                  </div>
                </div>
                <div style={{ background: '#1a1922', borderRadius: 8, padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ color: '#8b8899', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>Emails Sent</div>
                  <div style={{ color: yeStatus.sent === yeStatus.total_donors ? '#4ade80' : '#c8a855', fontSize: 28, fontWeight: 700 }}>
                    {yeStatus.sent}/{yeStatus.total_donors}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {yeStatus.total_donors > 0 && (
                <div style={{ background: '#1a1922', borderRadius: 4, height: 8, marginBottom: 20, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(yeStatus.sent / yeStatus.total_donors) * 100}%`,
                    background: yeStatus.sent === yeStatus.total_donors ? '#4ade80' : '#c8a855',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button className="btn btn-gold" onClick={yeGenerate} disabled={yeGenerating || yeStatus.total_donors === 0}>
                  {yeGenerating ? 'Generating...' : yeStatus.generated === yeStatus.total_donors && yeStatus.total_donors > 0
                    ? 'Regenerate All PDFs' : 'Generate All PDFs'}
                </button>
                <button className="btn btn-gold" onClick={yeSendAll}
                  disabled={yeSending || yeStatus.generated === 0 || yeStatus.sent === yeStatus.total_donors}
                  style={yeStatus.generated === 0 ? { opacity: 0.5 } : {}}
                >
                  {yeSending ? 'Sending...' : 'Send All Emails'}
                </button>
              </div>

              {/* Result message */}
              {yeResult && (
                <div className={`alert-banner ${yeResult.startsWith('Error') ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 16 }}>
                  {yeResult}
                </div>
              )}

              {/* Donor table */}
              {yeStatus.donors && yeStatus.donors.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Donor</th><th>Email</th><th>PDF</th><th>Emailed</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {yeStatus.donors.map(d => (
                        <tr key={d.donor_id}>
                          <td className="td-primary">{d.name}</td>
                          <td>{d.email || '—'}</td>
                          <td>
                            <span className={`badge ${d.generated ? 'badge-green' : 'badge-red'}`}>
                              {d.generated ? 'Ready' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${d.sent ? 'badge-green' : 'badge-red'}`}>
                              {d.sent ? 'Sent' : 'Not sent'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            {d.generated && (
                              <button className="btn btn-ghost btn-sm" onClick={() => yeDownload(d.donor_id)}>Download</button>
                            )}
                            {d.generated && !d.sent && d.email && (
                              <button className="btn btn-gold btn-sm" onClick={() => yeSendSingle(d.donor_id)}>Send</button>
                            )}
                            {d.sent && (
                              <button className="btn btn-ghost btn-sm" onClick={() => yeSendSingle(d.donor_id)}>Resend</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Filing Readiness Report ── */}
      <div className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>Filing Readiness Report</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ color: '#8b8899', fontSize: 13 }}>Tax Year:</label>
            <select
              value={readinessTaxYear}
              onChange={e => { setReadinessTaxYear(parseInt(e.target.value)); setReadinessReport(null); }}
              style={{ background: '#1a1922', color: '#e8e6f0', border: '1px solid #2a2935', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
            <button className="btn btn-gold btn-sm" onClick={runReadiness} disabled={readinessLoading}>
              {readinessLoading ? 'Checking...' : 'Run Check'}
            </button>
          </div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {!readinessReport && !readinessLoading && (
            <p style={{ color: '#8b8899', textAlign: 'center', margin: 0 }}>
              Select a tax year and click "Run Check" to generate a filing readiness report.
            </p>
          )}
          {readinessLoading && <div style={{ textAlign: 'center', color: '#8b8899' }}>Running readiness checks...</div>}
          {readinessReport && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <span className={`badge ${readinessReport.overall_status === 'ready' ? 'badge-green' : readinessReport.overall_status === 'needs_attention' ? 'badge-gold' : 'badge-red'}`}
                  style={{ fontSize: 14, padding: '6px 16px' }}>
                  {readinessReport.overall_status === 'ready' ? 'Ready to File' : readinessReport.overall_status === 'needs_attention' ? 'Needs Attention' : 'Not Ready'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {readinessReport.checks.map(check => (
                  <div key={check.id} style={{
                    border: `1px solid ${check.severity === 'critical' ? 'rgba(248,113,113,0.3)' : check.severity === 'warning' ? 'rgba(200,168,85,0.3)' : check.severity === 'info' ? 'rgba(96,165,250,0.3)' : 'rgba(74,222,128,0.3)'}`,
                    borderLeft: `4px solid ${check.severity === 'critical' ? '#f87171' : check.severity === 'warning' ? '#c8a855' : check.severity === 'info' ? '#60a5fa' : '#4ade80'}`,
                    borderRadius: 8,
                    padding: '14px 18px',
                    background: 'var(--bg-hover)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{check.severity === 'critical' ? '!' : check.severity === 'warning' ? '!' : check.severity === 'pass' ? '\u2713' : 'i'}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#e8e6f0' }}>{check.title}</span>
                      <span className={`badge ${check.severity === 'critical' ? 'badge-red' : check.severity === 'warning' ? 'badge-gold' : check.severity === 'info' ? 'badge-blue' : 'badge-green'}`} style={{ marginLeft: 'auto' }}>
                        {check.severity === 'pass' ? 'OK' : check.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8b8899' }}>{check.message}</div>
                    {check.action && <div style={{ fontSize: 11, color: '#5d5b6a', marginTop: 4 }}>{check.action}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Form 990 Data Export ── */}
      <div className="compliance-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>Form 990 Data Export</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ color: '#8b8899', fontSize: 13 }}>Tax Year:</label>
            <select
              value={exportTaxYear}
              onChange={e => { setExportTaxYear(parseInt(e.target.value)); setGaC200(null); }}
              style={{ background: '#1a1922', color: '#e8e6f0', border: '1px solid #2a2935', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-gold" onClick={download990Csv} disabled={exporting990}>
              {exporting990 ? 'Exporting...' : 'Download 990 Data (CSV)'}
            </button>
            <button className="btn btn-ghost" onClick={downloadScheduleB} disabled={exportingSchedB}>
              {exportingSchedB ? 'Exporting...' : 'Download Schedule B (CSV)'}
            </button>
            <button className="btn btn-ghost" onClick={runGaC200Check} disabled={gaC200Loading}>
              {gaC200Loading ? 'Checking...' : 'GA C-200 Check'}
            </button>
          </div>
          {gaC200 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Georgia C-200 Status</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: '#1a1922', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: '#8b8899', textTransform: 'uppercase' }}>Gross Receipts</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: '#e0c872', marginTop: 4 }}>
                    ${gaC200.gross_receipts_dollars?.toLocaleString() || '0'}
                  </div>
                </div>
                <div style={{ background: '#1a1922', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: '#8b8899', textTransform: 'uppercase' }}>GA Registration</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
                    {gaC200.georgia_registration ? (
                      <span className={`badge ${gaC200.georgia_registration.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {gaC200.georgia_registration.status}
                      </span>
                    ) : <span className="badge badge-red">Not Found</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {gaC200.flags?.map((flag, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 6,
                    background: flag.severity === 'critical' ? 'var(--red-bg)' : flag.severity === 'warning' ? 'var(--gold-dim)' : 'var(--blue-bg)',
                    fontSize: 13,
                    color: flag.severity === 'critical' ? '#f87171' : flag.severity === 'warning' ? '#e0c872' : '#60a5fa',
                  }}>
                    <span>{flag.severity === 'critical' ? '!' : flag.severity === 'warning' ? '!' : '\u2713'}</span>
                    {flag.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Financial Statement (GA Renewal) ── */}
      <div className="compliance-section">
        <h3>Financial Statement (GA Renewal)</h3>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <label style={{ color: '#8b8899', fontSize: 13 }}>Tax Year:</label>
            <select
              value={finStmtTaxYear}
              onChange={e => { setFinStmtTaxYear(parseInt(e.target.value)); setFinStmtResult(null); }}
              style={{ background: '#1a1922', color: '#e8e6f0', border: '1px solid #2a2935', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={generateFinancialStatement} disabled={finStmtGenerating}>
              {finStmtGenerating ? 'Generating...' : 'Generate PDF'}
            </button>
            {finStmtResult?.success && (
              <button className="btn btn-ghost" onClick={downloadFinancialStatement}>Download PDF</button>
            )}
          </div>
          {finStmtResult && (
            finStmtResult.error ? (
              <div className="alert-banner alert-danger">{finStmtResult.error}</div>
            ) : (
              <div className="alert-banner alert-success">
                Financial statement generated for {finStmtResult.tax_year}. Revenue: ${(finStmtResult.total_revenue_cents / 100).toLocaleString()} from {finStmtResult.donation_count} donations.
              </div>
            )
          )}
          <p style={{ color: '#5d5b6a', fontSize: 12, margin: '12px 0 0' }}>
            Generates a PDF financial statement pre-filled with revenue data for the Georgia Secretary of State C-200 annual registration renewal. Expense sections are marked for manual completion.
          </p>
        </div>
      </div>

      {/* ── Deadline Email Alerts ── */}
      <div className="compliance-section">
        <h3>Deadline Email Alerts</h3>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-gold" onClick={runAlertCheck} disabled={alertsRunning}>
              {alertsRunning ? 'Running...' : 'Run Alert Check Now'}
            </button>
            <span style={{ color: '#8b8899', fontSize: 12 }}>
              Automated daily via cron. Sends alerts at 90, 60, 30, 14, and 7 days before deadlines.
            </span>
          </div>
          {alertsResult && (
            alertsResult.error ? (
              <div className="alert-banner alert-danger">{alertsResult.error}</div>
            ) : (
              <div className="alert-banner alert-success">
                {alertsResult.message}. {alertsResult.alerts_sent} alert{alertsResult.alerts_sent !== 1 ? 's' : ''} sent.
              </div>
            )
          )}
          {recentAlerts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Recent Alerts</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Filing</th><th>Alert</th><th>Sent To</th><th>Sent At</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {recentAlerts.map(a => (
                      <tr key={a.id}>
                        <td className="td-primary">{a.deadline?.filing_name || '—'}</td>
                        <td className="td-mono">{a.alert_days} days</td>
                        <td>{a.sent_to}</td>
                        <td>{fmtDate(a.sent_at)}</td>
                        <td><span className={`badge ${a.sendgrid_status === 'sent' ? 'badge-green' : 'badge-red'}`}>{a.sendgrid_status || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{modal.mode === 'create' ? 'Add' : 'Edit'} {modal.type === 'deadline' ? 'Compliance Deadline' : 'State Registration'}</h3>

            {modal.type === 'deadline' && (
              <>
                <div className="form-group">
                  <label>Filing Name</label>
                  <input value={formData.filing_name || ''} onChange={e => updateField('filing_name', e.target.value)} placeholder="e.g. IRS Form 990" />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea value={formData.description || ''} onChange={e => updateField('description', e.target.value)} placeholder="Brief description..." />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={formData.deadline_date?.split('T')[0] || ''} onChange={e => updateField('deadline_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={formData.status || 'upcoming'} onChange={e => updateField('status', e.target.value)}>
                    <option value="upcoming">Upcoming</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </>
            )}

            {modal.type === 'registration' && (
              <>
                <div className="form-group">
                  <label>State</label>
                  <input value={formData.state || ''} onChange={e => updateField('state', e.target.value)} placeholder="e.g. Georgia" />
                </div>
                <div className="form-group">
                  <label>Registration Number</label>
                  <input value={formData.registration_number || ''} onChange={e => updateField('registration_number', e.target.value)} placeholder="e.g. CH-12345" />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={formData.status || 'active'} onChange={e => updateField('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Expiration Date</label>
                  <input type="date" value={formData.expiration_date?.split('T')[0] || ''} onChange={e => updateField('expiration_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={formData.notes || ''} onChange={e => updateField('notes', e.target.value)} placeholder="Any additional notes..." />
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   RECURRING DONATIONS VIEW
   ═══════════════════════════════════════════ */
function RecurringView() {
  const [stats, setStats] = useState(null);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null); // { recurring, donations }
  const [actionLoading, setActionLoading] = useState(null); // recurring_id being acted upon

  const loadStats = async () => {
    try {
      const data = await adminFetch(`${RECURRING_API_URL}/stats`);
      setStats(data);
    } catch (err) { console.error('Stats error:', err); }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminFetch(`${RECURRING_API_URL}/list?${params}`);
      setRecurring(data.recurring || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) { console.error('List error:', err); }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = async (id) => {
    try {
      const data = await adminFetch(`${RECURRING_API_URL}/detail/${id}`);
      setDetail(data);
    } catch (err) { alert('Failed to load details: ' + err.message); }
  };

  const handleAction = async (action, recurringId) => {
    const labels = { cancel: 'cancel this subscription', pause: 'pause this subscription', resume: 'resume this subscription' };
    if (action === 'cancel' && !confirm(`Are you sure you want to ${labels[action]}? This cannot be undone.`)) return;
    setActionLoading(recurringId);
    try {
      await adminFetch(`${RECURRING_API_URL}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ recurring_id: recurringId }),
      });
      loadList();
      loadStats();
      if (detail?.recurring?.id === recurringId) setDetail(null);
    } catch (err) { alert(`Failed to ${action}: ${err.message}`); }
    setActionLoading(null);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadList();
  };

  const frequencyLabel = (f) => {
    if (f === 'monthly') return 'Monthly';
    if (f === 'quarterly') return 'Quarterly';
    if (f === 'annual') return 'Annual';
    return f || '—';
  };

  const statusBadge = (s) => {
    const cls = s === 'active' ? 'badge-green' : s === 'paused' ? 'badge-blue' : 'badge-red';
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  return (
    <>
      <div className="page-header">
        <h2>Recurring Donations</h2>
        <p>Subscription-based donations and management</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card">
            <div className="kpi-label">Active</div>
            <div className="kpi-value" style={{ color: 'var(--green)' }}>{stats.active}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Paused</div>
            <div className="kpi-value" style={{ color: 'var(--blue)' }}>{stats.paused}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Cancelled</div>
            <div className="kpi-value" style={{ color: 'var(--red)' }}>{stats.cancelled}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Est. Monthly Revenue</div>
            <div className="kpi-value">{fmt(stats.mrr_cents)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px 20px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1 }}>
            <input
              placeholder="Search by donor name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-gold btn-sm" type="submit">Search</button>
          </form>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Donor</th>
                <th>Email</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Status</th>
                <th>Next Billing</th>
                <th>Installments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
              )}
              {!loading && recurring.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No recurring donations found</td></tr>
              )}
              {!loading && recurring.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => loadDetail(r.id)}>
                  <td className="td-primary">{r.donor_name || '—'}</td>
                  <td>{r.donor_email || '—'}</td>
                  <td className="td-mono">{fmt(r.amount_cents)}</td>
                  <td>{frequencyLabel(r.frequency)}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td>{r.status === 'active' ? fmtDate(r.next_billing_date) : '—'}</td>
                  <td className="td-mono">{r.installment_count || 0}</td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                    {r.status === 'active' && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleAction('pause', r.id)} disabled={actionLoading === r.id}>Pause</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction('cancel', r.id)} disabled={actionLoading === r.id}>Cancel</button>
                      </>
                    )}
                    {r.status === 'paused' && (
                      <>
                        <button className="btn btn-gold btn-sm" onClick={() => handleAction('resume', r.id)} disabled={actionLoading === r.id}>Resume</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction('cancel', r.id)} disabled={actionLoading === r.id}>Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {totalPages} ({total} total)</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <h3>Recurring Donation Details</h3>

            {/* Summary badges */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="donor-badge">
                <span className="donor-badge-label">Amount</span>
                <span className="donor-badge-value">{fmt(detail.recurring.amount_cents)}/{detail.recurring.frequency}</span>
              </div>
              <div className="donor-badge">
                <span className="donor-badge-label">Status</span>
                <span className="donor-badge-value">{statusBadge(detail.recurring.status)}</span>
              </div>
              <div className="donor-badge">
                <span className="donor-badge-label">Installments</span>
                <span className="donor-badge-value">{detail.recurring.installment_count || 0}</span>
              </div>
              <div className="donor-badge">
                <span className="donor-badge-label">Started</span>
                <span className="donor-badge-value">{fmtDate(detail.recurring.started_at)}</span>
              </div>
            </div>

            {/* Donor info */}
            <div style={{ marginBottom: 16 }}>
              <DonorDetailField label="Donor" value={detail.recurring.donor_name} />
              <DonorDetailField label="Email" value={detail.recurring.donor_email} />
              <DonorDetailField label="Designation" value={detail.recurring.designation || 'Unrestricted'} />
              <DonorDetailField label="Next Billing" value={detail.recurring.status === 'active' ? fmtDate(detail.recurring.next_billing_date) : '—'} />
              {detail.recurring.cancelled_at && (
                <DonorDetailField label="Cancelled" value={`${fmtDate(detail.recurring.cancelled_at)} — ${detail.recurring.cancel_reason || ''}`} />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {detail.recurring.status === 'active' && (
                <>
                  <button className="btn btn-ghost" onClick={() => { handleAction('pause', detail.recurring.id); setDetail(null); }}>Pause</button>
                  <button className="btn btn-danger" onClick={() => { handleAction('cancel', detail.recurring.id); setDetail(null); }}>Cancel Subscription</button>
                </>
              )}
              {detail.recurring.status === 'paused' && (
                <>
                  <button className="btn btn-gold" onClick={() => { handleAction('resume', detail.recurring.id); setDetail(null); }}>Resume</button>
                  <button className="btn btn-danger" onClick={() => { handleAction('cancel', detail.recurring.id); setDetail(null); }}>Cancel Subscription</button>
                </>
              )}
            </div>

            {/* Payment History */}
            <h4 style={{ marginBottom: 10, color: 'var(--text)' }}>Payment History</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Receipt #</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(detail.donations || []).map(d => (
                    <tr key={d.id}>
                      <td className="td-mono">{d.receipt_number || '—'}</td>
                      <td className="td-mono">{fmt(d.amount_cents)}</td>
                      <td>{fmtDate(d.donated_at)}</td>
                      <td><span className={`badge ${d.status === 'succeeded' ? 'badge-green' : 'badge-red'}`}>{d.status}</span></td>
                    </tr>
                  ))}
                  {(!detail.donations || detail.donations.length === 0) && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>No payments yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MATCHING GIFTS
   ═══════════════════════════════════════════ */
function MatchingView() {
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState('matches'); // 'matches' | 'eligible' | 'companies'
  const [eligible, setEligible] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(null); // donation obj for creating match
  const [showUpdateModal, setShowUpdateModal] = useState(null); // match obj for updating
  const [showCompanyModal, setShowCompanyModal] = useState(null); // null=closed, {}=new, {id:..}=edit
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const loadStats = async () => {
    try {
      const data = await adminFetch(`${MATCHING_GIFTS_API_URL}/stats`);
      setStats(data);
    } catch (err) { console.error('Stats error:', err); }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminFetch(`${MATCHING_GIFTS_API_URL}/list?${params}`);
      setMatches(data.matches || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) { console.error('List error:', err); }
    setLoading(false);
  }, [page, search, statusFilter]);

  const loadEligible = async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${MATCHING_GIFTS_API_URL}/eligible`);
      setEligible(data.eligible || []);
    } catch (err) { console.error('Eligible error:', err); }
    setLoading(false);
  };

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${MATCHING_GIFTS_API_URL}/companies`);
      setCompanies(data.companies || []);
    } catch (err) { console.error('Companies error:', err); }
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (tab === 'matches') loadList();
    else if (tab === 'eligible') loadEligible();
    else if (tab === 'companies') loadCompanies();
  }, [tab, loadList]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); loadList(); };

  const handleCreateMatch = async () => {
    setSaving(true);
    try {
      await adminFetch(`${MATCHING_GIFTS_API_URL}/create`, {
        method: 'POST',
        body: JSON.stringify({
          donation_id: showCreateModal.id,
          company_name: formData.company_name || showCreateModal.donor?.employer || '',
          match_ratio: formData.match_ratio ? parseFloat(formData.match_ratio) : 1.0,
          match_amount_cents: formData.match_amount ? parseCents(formData.match_amount) : undefined,
          notes: formData.notes,
        }),
      });
      setShowCreateModal(null);
      setFormData({});
      loadStats();
      if (tab === 'matches') loadList();
      else loadEligible();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleUpdateMatch = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (formData.status) updates.status = formData.status;
      if (formData.match_amount) updates.match_amount_cents = parseCents(formData.match_amount);
      if (formData.notes !== undefined) updates.notes = formData.notes;
      if (formData.denial_reason) updates.denial_reason = formData.denial_reason;
      if (formData.match_receipt_number) updates.match_receipt_number = formData.match_receipt_number;
      await adminFetch(`${MATCHING_GIFTS_API_URL}/update/${showUpdateModal.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      setShowUpdateModal(null);
      setFormData({});
      loadStats();
      loadList();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleDeleteMatch = async (id) => {
    if (!confirm('Delete this matching gift record?')) return;
    try {
      await adminFetch(`${MATCHING_GIFTS_API_URL}/delete/${id}`, { method: 'DELETE' });
      loadStats();
      loadList();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      const body = {
        company_name: formData.company_name,
        match_ratio: formData.match_ratio ? parseFloat(formData.match_ratio) : 1.0,
        max_match_cents: formData.max_match ? parseCents(formData.max_match) : null,
        min_donation_cents: formData.min_donation ? parseCents(formData.min_donation) : 2500,
        annual_max_cents: formData.annual_max ? parseCents(formData.annual_max) : null,
        submission_deadline_months: formData.deadline_months ? parseInt(formData.deadline_months) : 12,
        program_url: formData.program_url || null,
        notes: formData.notes || null,
        is_verified: formData.is_verified || false,
      };
      if (showCompanyModal.id) {
        await adminFetch(`${MATCHING_GIFTS_API_URL}/companies/${showCompanyModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await adminFetch(`${MATCHING_GIFTS_API_URL}/companies`, { method: 'POST', body: JSON.stringify(body) });
      }
      setShowCompanyModal(null);
      setFormData({});
      loadCompanies();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleDeleteCompany = async (id) => {
    if (!confirm('Delete this company program?')) return;
    try {
      await adminFetch(`${MATCHING_GIFTS_API_URL}/companies/${id}`, { method: 'DELETE' });
      loadCompanies();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const statusBadge = (s) => {
    const cls = { identified: 'badge-blue', submitted: 'badge-gold', approved: 'badge-green', received: 'badge-green', denied: 'badge-red', expired: 'badge-red' }[s] || 'badge-blue';
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  const tabStyle = (t) => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: tab === t ? 'var(--gold-dim)' : 'transparent', color: tab === t ? 'var(--gold-text)' : 'var(--text-muted)',
  });

  return (
    <>
      <div className="page-header">
        <h2>Matching Gifts</h2>
        <p>Track employer matching gift programs and submissions</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-title">Pipeline</div>
            <div className="card-value">{stats.identified + stats.submitted + stats.approved}</div>
            <div className="card-sub">{stats.identified} identified, {stats.submitted} submitted, {stats.approved} approved</div>
          </div>
          <div className="card">
            <div className="card-title">Pending Match Value</div>
            <div className="card-value">{fmt(stats.total_pending_cents || 0)}</div>
            <div className="card-sub">Awaiting employer payment</div>
          </div>
          <div className="card">
            <div className="card-title">Received</div>
            <div className="card-value" style={{ color: 'var(--green)' }}>{fmt(stats.total_received_cents || 0)}</div>
            <div className="card-sub">{stats.received} match{stats.received !== 1 ? 'es' : ''} collected</div>
          </div>
          <div className="card">
            <div className="card-title">Companies</div>
            <div className="card-value">{stats.companies}</div>
            <div className="card-sub">{stats.denied} denied, {stats.expired} expired</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button style={tabStyle('matches')} onClick={() => setTab('matches')}>All Matches ({total})</button>
        <button style={tabStyle('eligible')} onClick={() => setTab('eligible')}>Eligible Donations</button>
        <button style={tabStyle('companies')} onClick={() => setTab('companies')}>Company Programs</button>
      </div>

      {/* MATCHES TAB */}
      {tab === 'matches' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px 20px' }}>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1 }}>
                <input placeholder="Search by company name..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-gold btn-sm" type="submit">Search</button>
              </form>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <option value="">All Statuses</option>
                <option value="identified">Identified</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="received">Received</option>
                <option value="denied">Denied</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Donor</th>
                    <th>Employer</th>
                    <th>Original</th>
                    <th>Match Amount</th>
                    <th>Ratio</th>
                    <th>Status</th>
                    <th>Receipt #</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
                  {!loading && matches.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No matching gifts found</td></tr>}
                  {!loading && matches.map(m => (
                    <tr key={m.id}>
                      <td className="td-primary">{m.donor ? `${m.donor.first_name} ${m.donor.last_name}` : '—'}</td>
                      <td>{m.company_name}</td>
                      <td className="td-mono">{fmt(m.original_amount_cents)}</td>
                      <td className="td-mono" style={{ color: 'var(--green)' }}>{fmt(m.match_amount_cents)}</td>
                      <td className="td-mono">{m.match_ratio}x</td>
                      <td>{statusBadge(m.status)}</td>
                      <td className="td-mono">{m.donation?.receipt_number || '—'}</td>
                      <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowUpdateModal(m); setFormData({ status: m.status, notes: m.notes || '', match_receipt_number: m.match_receipt_number || '' }); }}>Update</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMatch(m.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span>Page {page} of {totalPages} ({total} total)</span>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ELIGIBLE TAB */}
      {tab === 'eligible' && (
        <div className="card">
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13 }}>
            Donations from donors with an employer on file that don't yet have a matching gift record.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Donor</th><th>Employer</th><th>Amount</th><th>Receipt #</th><th>Date</th><th>Action</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
                {!loading && eligible.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No eligible donations found</td></tr>}
                {!loading && eligible.map(d => (
                  <tr key={d.id}>
                    <td className="td-primary">{d.donor ? `${d.donor.first_name} ${d.donor.last_name}` : '—'}</td>
                    <td>{d.donor?.employer || '—'}</td>
                    <td className="td-mono">{fmt(d.amount_cents)}</td>
                    <td className="td-mono">{d.receipt_number || '—'}</td>
                    <td>{fmtDate(d.donated_at)}</td>
                    <td>
                      <button className="btn btn-gold btn-sm" onClick={() => { setShowCreateModal(d); setFormData({ company_name: d.donor?.employer || '', match_ratio: '1.0' }); }}>
                        Create Match
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COMPANIES TAB */}
      {tab === 'companies' && (
        <div className="card">
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Known employer matching gift programs</span>
            <button className="btn btn-gold btn-sm" onClick={() => { setShowCompanyModal({}); setFormData({ match_ratio: '1.0', deadline_months: '12' }); }}>Add Company</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Company</th><th>Match Ratio</th><th>Max Match</th><th>Min Donation</th><th>Annual Max</th><th>Deadline</th><th>Verified</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
                {!loading && companies.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No companies added yet</td></tr>}
                {!loading && companies.map(c => (
                  <tr key={c.id}>
                    <td className="td-primary">{c.company_name}</td>
                    <td className="td-mono">{c.match_ratio}x</td>
                    <td className="td-mono">{c.max_match_cents ? fmt(c.max_match_cents) : 'No limit'}</td>
                    <td className="td-mono">{fmt(c.min_donation_cents || 0)}</td>
                    <td className="td-mono">{c.annual_max_cents ? fmt(c.annual_max_cents) : 'No limit'}</td>
                    <td>{c.submission_deadline_months || 12} months</td>
                    <td>{c.is_verified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-blue">Unverified</span>}</td>
                    <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setShowCompanyModal(c);
                        setFormData({
                          company_name: c.company_name, match_ratio: String(c.match_ratio),
                          max_match: c.max_match_cents ? (c.max_match_cents / 100).toFixed(2) : '',
                          min_donation: c.min_donation_cents ? (c.min_donation_cents / 100).toFixed(2) : '',
                          annual_max: c.annual_max_cents ? (c.annual_max_cents / 100).toFixed(2) : '',
                          deadline_months: String(c.submission_deadline_months || 12),
                          program_url: c.program_url || '', notes: c.notes || '', is_verified: c.is_verified,
                        });
                      }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCompany(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE MATCH MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Matching Gift</h3>
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{showCreateModal.donor?.first_name} {showCreateModal.donor?.last_name}</strong> donated <strong style={{ color: 'var(--green)' }}>{fmt(showCreateModal.amount_cents)}</strong> ({showCreateModal.receipt_number})
            </div>
            <div className="form-group">
              <label>Employer / Company</label>
              <input value={formData.company_name || ''} onChange={e => setFormData({ ...formData, company_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Match Ratio</label>
              <input type="number" step="0.01" min="0" value={formData.match_ratio || ''} onChange={e => setFormData({ ...formData, match_ratio: e.target.value })} placeholder="1.0 = dollar for dollar" />
            </div>
            <div className="form-group">
              <label>Match Amount ($ override, leave blank to auto-calculate)</label>
              <DollarInput value={formData.match_amount} onChange={v => setFormData({ ...formData, match_amount: v })} placeholder="Auto-calculated from ratio" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleCreateMatch} disabled={saving || !formData.company_name}>{saving ? 'Creating...' : 'Create Match'}</button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE MATCH MODAL */}
      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Update Matching Gift</h3>
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{showUpdateModal.company_name}</strong> — {fmt(showUpdateModal.original_amount_cents)} donation, {fmt(showUpdateModal.match_amount_cents)} match
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={formData.status || ''} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                <option value="identified">Identified</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="received">Received</option>
                <option value="denied">Denied</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            {formData.status === 'received' && (
              <div className="form-group">
                <label>Match Receipt / Check Number</label>
                <input value={formData.match_receipt_number || ''} onChange={e => setFormData({ ...formData, match_receipt_number: e.target.value })} />
              </div>
            )}
            {formData.status === 'denied' && (
              <div className="form-group">
                <label>Denial Reason</label>
                <input value={formData.denial_reason || ''} onChange={e => setFormData({ ...formData, denial_reason: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label>Match Amount ($)</label>
              <DollarInput value={formData.match_amount || (showUpdateModal.match_amount_cents / 100).toFixed(2)} onChange={v => setFormData({ ...formData, match_amount: v })} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowUpdateModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleUpdateMatch} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPANY MODAL */}
      {showCompanyModal && (
        <div className="modal-overlay" onClick={() => setShowCompanyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showCompanyModal.id ? 'Edit Company Program' : 'Add Company Program'}</h3>
            <div className="form-group">
              <label>Company Name</label>
              <input value={formData.company_name || ''} onChange={e => setFormData({ ...formData, company_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Match Ratio (1.0 = 1:1)</label>
              <input type="number" step="0.01" min="0" value={formData.match_ratio || ''} onChange={e => setFormData({ ...formData, match_ratio: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Max Match per Donation ($, leave blank for no limit)</label>
              <DollarInput value={formData.max_match} onChange={v => setFormData({ ...formData, max_match: v })} />
            </div>
            <div className="form-group">
              <label>Min Donation ($)</label>
              <DollarInput value={formData.min_donation} onChange={v => setFormData({ ...formData, min_donation: v })} placeholder="25.00" />
            </div>
            <div className="form-group">
              <label>Annual Max ($, leave blank for no limit)</label>
              <DollarInput value={formData.annual_max} onChange={v => setFormData({ ...formData, annual_max: v })} />
            </div>
            <div className="form-group">
              <label>Submission Deadline (months after donation)</label>
              <input type="number" min="1" value={formData.deadline_months || ''} onChange={e => setFormData({ ...formData, deadline_months: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Program URL</label>
              <input value={formData.program_url || ''} onChange={e => setFormData({ ...formData, program_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={formData.is_verified || false} onChange={e => setFormData({ ...formData, is_verified: e.target.checked })} style={{ width: 'auto' }} />
              <label style={{ margin: 0 }}>Verified program</label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCompanyModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSaveCompany} disabled={saving || !formData.company_name}>{saving ? 'Saving...' : (showCompanyModal.id ? 'Save' : 'Add Company')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   EVENTS & QUID PRO QUO
   ═══════════════════════════════════════════ */
function EventsView() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showEventModal, setShowEventModal] = useState(null); // null=closed, {}=new, {id:..}=edit
  const [detail, setDetail] = useState(null); // { event, attendees, donations }
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkDonations, setLinkDonations] = useState([]);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const loadStats = async () => {
    try {
      const data = await adminFetch(`${EVENTS_API_URL}/stats`);
      setStats(data);
    } catch (err) { console.error('Stats error:', err); }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminFetch(`${EVENTS_API_URL}/list?${params}`);
      setEvents(data.events || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) { console.error('List error:', err); }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = async (id) => {
    try {
      const data = await adminFetch(`${EVENTS_API_URL}/event/${id}`);
      setDetail(data);
    } catch (err) { alert('Failed to load details: ' + err.message); }
  };

  const handleSaveEvent = async () => {
    setSaving(true);
    try {
      const body = {
        name: formData.name,
        description: formData.description || null,
        event_date: formData.event_date,
        venue: formData.venue || null,
        ticket_price_cents: parseCents(formData.ticket_price),
        fair_market_value_cents: parseCents(formData.fmv),
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        is_active: formData.is_active !== false,
      };
      if (showEventModal.id) {
        await adminFetch(`${EVENTS_API_URL}/event/${showEventModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await adminFetch(`${EVENTS_API_URL}/event`, { method: 'POST', body: JSON.stringify(body) });
      }
      setShowEventModal(null);
      setFormData({});
      loadStats();
      loadList();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleDeleteEvent = async (id) => {
    if (!confirm('Delete this event? Linked donations will be unlinked.')) return;
    try {
      await adminFetch(`${EVENTS_API_URL}/event/${id}`, { method: 'DELETE' });
      setDetail(null);
      loadStats();
      loadList();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleAddAttendee = async () => {
    setSaving(true);
    try {
      await adminFetch(`${EVENTS_API_URL}/attendee`, {
        method: 'POST',
        body: JSON.stringify({
          event_id: detail.event.id,
          name: formData.att_name,
          email: formData.att_email || null,
          ticket_type: formData.att_type || 'general',
          ticket_price_cents: formData.att_price ? parseCents(formData.att_price) : detail.event.ticket_price_cents || 0,
        }),
      });
      setShowAttendeeModal(false);
      setFormData({});
      loadDetail(detail.event.id);
      loadStats();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleCheckin = async (attId) => {
    try {
      await adminFetch(`${EVENTS_API_URL}/attendee/${attId}/checkin`, { method: 'PUT' });
      loadDetail(detail.event.id);
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleDeleteAttendee = async (attId) => {
    if (!confirm('Remove this attendee?')) return;
    try {
      await adminFetch(`${EVENTS_API_URL}/attendee/${attId}`, { method: 'DELETE' });
      loadDetail(detail.event.id);
      loadStats();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleOpenLinkModal = async () => {
    try {
      const data = await adminFetch('donations?limit=100');
      setLinkDonations((data.donations || []).filter(d => !d.event_id && d.status === 'succeeded'));
      setShowLinkModal(true);
    } catch (err) { alert('Failed to load donations: ' + err.message); }
  };

  const handleLinkDonation = async (donationId) => {
    try {
      const result = await adminFetch(`${EVENTS_API_URL}/link-donation`, {
        method: 'POST',
        body: JSON.stringify({ event_id: detail.event.id, donation_id: donationId }),
      });
      setShowLinkModal(false);
      loadDetail(detail.event.id);
      loadStats();
      if (result.qpq_applied) {
        alert(`Quid pro quo applied: FMV of $${(detail.event.fair_market_value_cents / 100).toFixed(2)} deducted. Tax-deductible: $${(result.tax_deductible_cents / 100).toFixed(2)}`);
      }
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleUnlinkDonation = async (donationId) => {
    if (!confirm('Unlink this donation from the event? Quid pro quo data will be cleared.')) return;
    try {
      await adminFetch(`${EVENTS_API_URL}/unlink-donation`, {
        method: 'POST',
        body: JSON.stringify({ donation_id: donationId }),
      });
      loadDetail(detail.event.id);
      loadStats();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const qpqBadge = (e) => {
    if (!e.fair_market_value_cents || e.fair_market_value_cents === 0) return <span className="badge badge-green">No QPQ</span>;
    return <span className="badge badge-gold">QPQ: {fmt(e.fair_market_value_cents)} FMV</span>;
  };

  return (
    <>
      <div className="page-header">
        <h2>Events</h2>
        <p>Fundraising events with quid pro quo receipting</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-title">Upcoming</div>
            <div className="card-value" style={{ color: 'var(--green)' }}>{stats.active}</div>
            <div className="card-sub">{stats.past} past events</div>
          </div>
          <div className="card">
            <div className="card-title">Total Revenue</div>
            <div className="card-value">{fmt(stats.total_revenue_cents || 0)}</div>
            <div className="card-sub">From event donations</div>
          </div>
          <div className="card">
            <div className="card-title">Total Attendees</div>
            <div className="card-value">{stats.total_attendees}</div>
            <div className="card-sub">Across all events</div>
          </div>
          <div className="card">
            <div className="card-title">Total Events</div>
            <div className="card-value">{stats.total_events}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-gold" onClick={() => { setShowEventModal({}); setFormData({ is_active: true }); }}>Create Event</button>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          <option value="">All Events</option>
          <option value="active">Active</option>
          <option value="past">Past</option>
        </select>
      </div>

      {/* Events Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Venue</th>
                <th>Ticket Price</th>
                <th>FMV</th>
                <th>Tax Deductible</th>
                <th>Tickets Sold</th>
                <th>Revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
              {!loading && events.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No events found</td></tr>}
              {!loading && events.map(e => (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => loadDetail(e.id)}>
                  <td className="td-primary">{e.name}</td>
                  <td>{fmtDate(e.event_date)}</td>
                  <td>{e.venue || '—'}</td>
                  <td className="td-mono">{fmt(e.ticket_price_cents || 0)}</td>
                  <td className="td-mono">{fmt(e.fair_market_value_cents || 0)}</td>
                  <td className="td-mono" style={{ color: 'var(--green)' }}>{fmt(e.tax_deductible_cents || 0)}</td>
                  <td className="td-mono">{e.tickets_sold || 0}{e.capacity ? ` / ${e.capacity}` : ''}</td>
                  <td className="td-mono">{fmt(e.total_revenue_cents || 0)}</td>
                  <td>{e.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Closed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {totalPages} ({total} total)</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* EVENT DETAIL MODAL */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{detail.event.name}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setShowEventModal(detail.event);
                  setFormData({
                    name: detail.event.name, description: detail.event.description || '',
                    event_date: detail.event.event_date?.slice(0, 16) || '', venue: detail.event.venue || '',
                    ticket_price: detail.event.ticket_price_cents ? (detail.event.ticket_price_cents / 100).toFixed(2) : '',
                    fmv: detail.event.fair_market_value_cents ? (detail.event.fair_market_value_cents / 100).toFixed(2) : '',
                    capacity: detail.event.capacity || '', is_active: detail.event.is_active,
                  });
                  setDetail(null);
                }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteEvent(detail.event.id)}>Delete</button>
              </div>
            </div>

            {/* Event summary badges */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="donor-badge"><span className="donor-badge-label">Date</span><span className="donor-badge-value">{fmtDate(detail.event.event_date)}</span></div>
              <div className="donor-badge"><span className="donor-badge-label">Venue</span><span className="donor-badge-value">{detail.event.venue || '—'}</span></div>
              <div className="donor-badge"><span className="donor-badge-label">Ticket</span><span className="donor-badge-value">{fmt(detail.event.ticket_price_cents || 0)}</span></div>
              <div className="donor-badge"><span className="donor-badge-label">FMV</span><span className="donor-badge-value">{fmt(detail.event.fair_market_value_cents || 0)}</span></div>
              <div className="donor-badge"><span className="donor-badge-label">Tax Deductible</span><span className="donor-badge-value" style={{ color: 'var(--green)' }}>{fmt(detail.event.tax_deductible_cents || 0)}</span></div>
            </div>

            {detail.event.fair_market_value_cents > 0 && (
              <div className="alert-banner alert-warning" style={{ marginBottom: 16 }}>
                Quid pro quo: Donors receive goods/services valued at {fmt(detail.event.fair_market_value_cents)}. Donations over $75 require QPQ disclosure on receipts.
              </div>
            )}

            {detail.event.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{detail.event.description}</p>}

            {/* Attendees */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ color: 'var(--text)' }}>Attendees ({detail.attendees.length}{detail.event.capacity ? ` / ${detail.event.capacity}` : ''})</h4>
              <button className="btn btn-gold btn-sm" onClick={() => { setShowAttendeeModal(true); setFormData({ att_price: detail.event.ticket_price_cents ? (detail.event.ticket_price_cents / 100).toFixed(2) : '0' }); }}>Add Attendee</button>
            </div>
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Ticket</th><th>Checked In</th><th>Actions</th></tr></thead>
                <tbody>
                  {detail.attendees.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, color: 'var(--text-dim)' }}>No attendees yet</td></tr>}
                  {detail.attendees.map(a => (
                    <tr key={a.id}>
                      <td className="td-primary">{a.name}</td>
                      <td>{a.email || '—'}</td>
                      <td>{a.ticket_type}</td>
                      <td className="td-mono">{fmt(a.ticket_price_cents || 0)}</td>
                      <td>{a.checked_in ? <span className="badge badge-green">Yes</span> : <span className="badge badge-blue">No</span>}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {!a.checked_in && <button className="btn btn-gold btn-sm" onClick={() => handleCheckin(a.id)}>Check In</button>}
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAttendee(a.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Linked Donations */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ color: 'var(--text)' }}>Linked Donations ({detail.donations.length})</h4>
              <button className="btn btn-ghost btn-sm" onClick={handleOpenLinkModal}>Link Donation</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Receipt #</th><th>Donor</th><th>Amount</th><th>QPQ FMV</th><th>Tax Deductible</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {detail.donations.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 16, color: 'var(--text-dim)' }}>No linked donations</td></tr>}
                  {detail.donations.map(d => (
                    <tr key={d.id}>
                      <td className="td-mono">{d.receipt_number || '—'}</td>
                      <td className="td-primary">{d.donor ? `${d.donor.first_name} ${d.donor.last_name}` : '—'}</td>
                      <td className="td-mono">{fmt(d.amount_cents)}</td>
                      <td className="td-mono">{d.goods_services_value_cents ? fmt(d.goods_services_value_cents) : '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--green)' }}>{d.tax_deductible_amount_cents != null ? fmt(d.tax_deductible_amount_cents) : fmt(d.amount_cents)}</td>
                      <td>{fmtDate(d.donated_at)}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => handleUnlinkDonation(d.id)}>Unlink</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE/EDIT EVENT MODAL */}
      {showEventModal && (
        <div className="modal-overlay" onClick={() => setShowEventModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showEventModal.id ? 'Edit Event' : 'Create Event'}</h3>
            <div className="form-group">
              <label>Event Name</label>
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Date & Time</label>
              <input type="datetime-local" value={formData.event_date || ''} onChange={e => setFormData({ ...formData, event_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Venue</label>
              <input value={formData.venue || ''} onChange={e => setFormData({ ...formData, venue: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Ticket Price ($)</label>
              <DollarInput value={formData.ticket_price} onChange={v => setFormData({ ...formData, ticket_price: v })} />
            </div>
            <div className="form-group">
              <label>Fair Market Value of Goods/Services ($) — triggers quid pro quo disclosure</label>
              <DollarInput value={formData.fmv} onChange={v => setFormData({ ...formData, fmv: v })} />
            </div>
            {formData.ticket_price && formData.fmv && parseCents(formData.fmv) > 0 && (
              <div className="alert-banner alert-warning" style={{ marginBottom: 14 }}>
                Tax-deductible per ticket: {fmt(Math.max(0, parseCents(formData.ticket_price) - parseCents(formData.fmv)))}. IRS QPQ disclosure required for payments over $75.
              </div>
            )}
            <div className="form-group">
              <label>Capacity (leave blank for unlimited)</label>
              <input type="number" min="1" value={formData.capacity || ''} onChange={e => setFormData({ ...formData, capacity: e.target.value })} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={formData.is_active !== false} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} style={{ width: 'auto' }} />
              <label style={{ margin: 0 }}>Active event</label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowEventModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSaveEvent} disabled={saving || !formData.name || !formData.event_date}>{saving ? 'Saving...' : (showEventModal.id ? 'Save' : 'Create Event')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ATTENDEE MODAL */}
      {showAttendeeModal && (
        <div className="modal-overlay" onClick={() => setShowAttendeeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Attendee</h3>
            <div className="form-group">
              <label>Name</label>
              <input value={formData.att_name || ''} onChange={e => setFormData({ ...formData, att_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={formData.att_email || ''} onChange={e => setFormData({ ...formData, att_email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Ticket Type</label>
              <select value={formData.att_type || 'general'} onChange={e => setFormData({ ...formData, att_type: e.target.value })}>
                <option value="general">General</option>
                <option value="vip">VIP</option>
                <option value="sponsor">Sponsor</option>
                <option value="complimentary">Complimentary</option>
              </select>
            </div>
            <div className="form-group">
              <label>Ticket Price ($)</label>
              <DollarInput value={formData.att_price} onChange={v => setFormData({ ...formData, att_price: v })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAttendeeModal(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleAddAttendee} disabled={saving || !formData.att_name}>{saving ? 'Adding...' : 'Add Attendee'}</button>
            </div>
          </div>
        </div>
      )}

      {/* LINK DONATION MODAL */}
      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <h3>Link Donation to Event</h3>
            {detail?.event?.fair_market_value_cents > 0 && (
              <div className="alert-banner alert-warning" style={{ marginBottom: 14 }}>
                Linking will apply quid pro quo: FMV {fmt(detail.event.fair_market_value_cents)} will be deducted from tax-deductible amount for donations over $75.
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Receipt #</th><th>Donor</th><th>Amount</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>
                  {linkDonations.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>No unlinked donations available</td></tr>}
                  {linkDonations.map(d => (
                    <tr key={d.id}>
                      <td className="td-mono">{d.receipt_number || '—'}</td>
                      <td className="td-primary">{d.donor ? `${d.donor.first_name} ${d.donor.last_name}` : '—'}</td>
                      <td className="td-mono">{fmt(d.amount_cents)}</td>
                      <td>{fmtDate(d.donated_at)}</td>
                      <td><button className="btn btn-gold btn-sm" onClick={() => handleLinkDonation(d.id)}>Link</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => setShowLinkModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   FUNDRAISING: PLEDGES, IN-KIND, GRANTS, UTM
   ═══════════════════════════════════════════ */
function FundraisingView() {
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('pledges');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [donors, setDonors] = useState([]);
  const [utmData, setUtmData] = useState(null);

  const loadStats = async () => {
    try { setStats(await adminFetch(`${FUNDRAISING_API_URL}/stats`)); } catch (err) { console.error(err); }
  };

  const loadDonors = async () => {
    try { const d = await adminFetch(`${FUNDRAISING_API_URL}/donors-list`); setDonors(d.donors || []); } catch (err) { console.error(err); }
  };

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) params.set('status', statusFilter);
      if (tab === 'pledges') {
        const d = await adminFetch(`${FUNDRAISING_API_URL}/pledges?${params}`);
        setItems(d.pledges || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1);
      } else if (tab === 'in-kind') {
        const d = await adminFetch(`${FUNDRAISING_API_URL}/in-kind?${params}`);
        setItems(d.donations || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1);
      } else if (tab === 'grants') {
        const d = await adminFetch(`${FUNDRAISING_API_URL}/grants?${params}`);
        setItems(d.grants || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1);
      } else if (tab === 'utm') {
        const d = await adminFetch(`${FUNDRAISING_API_URL}/utm-report`);
        setUtmData(d);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [tab, page, statusFilter]);

  useEffect(() => { loadStats(); loadDonors(); }, []);
  useEffect(() => { setPage(1); setStatusFilter(''); }, [tab]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === 'pledges') {
        const body = {
          donor_id: formData.donor_id,
          total_pledge_cents: parseCents(formData.total_pledge),
          installment_count: formData.installment_count ? parseInt(formData.installment_count) : null,
          installment_amount_cents: formData.installment_amount ? parseCents(formData.installment_amount) : null,
          frequency: formData.frequency || null,
          designation: formData.designation || 'unrestricted',
          start_date: formData.start_date,
          next_payment_date: formData.next_payment_date || formData.start_date,
          end_date: formData.end_date || null,
          notes: formData.notes || null,
        };
        if (showModal.id) {
          body.paid_to_date_cents = formData.paid_to_date ? parseCents(formData.paid_to_date) : undefined;
          body.status = formData.status;
          await adminFetch(`${FUNDRAISING_API_URL}/pledge/${showModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await adminFetch(`${FUNDRAISING_API_URL}/pledge`, { method: 'POST', body: JSON.stringify(body) });
        }
      } else if (tab === 'in-kind') {
        const body = {
          donor_id: formData.donor_id,
          description: formData.description,
          category: formData.category || 'other',
          estimated_value_cents: parseCents(formData.estimated_value),
          valuation_method: formData.valuation_method || null,
          appraiser_name: formData.appraiser_name || null,
          donated_at: formData.donated_at || undefined,
          tax_year: formData.tax_year ? parseInt(formData.tax_year) : new Date().getFullYear(),
          notes: formData.notes || null,
        };
        if (showModal.id) {
          body.form_8283_signed = formData.form_8283_signed || false;
          await adminFetch(`${FUNDRAISING_API_URL}/in-kind/${showModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await adminFetch(`${FUNDRAISING_API_URL}/in-kind`, { method: 'POST', body: JSON.stringify(body) });
        }
      } else if (tab === 'grants') {
        const body = {
          funder_name: formData.funder_name,
          funder_contact_email: formData.funder_contact_email || null,
          award_amount_cents: parseCents(formData.award_amount),
          restriction_type: formData.restriction_type || 'unrestricted',
          purpose: formData.purpose || null,
          program: formData.program || null,
          grant_period_start: formData.grant_period_start || null,
          grant_period_end: formData.grant_period_end || null,
          reporting_frequency: formData.reporting_frequency || null,
          next_report_due: formData.next_report_due || null,
          deliverables: formData.deliverables || null,
          notes: formData.notes || null,
        };
        if (showModal.id) {
          body.spent_to_date_cents = formData.spent_to_date ? parseCents(formData.spent_to_date) : undefined;
          body.status = formData.status;
          await adminFetch(`${FUNDRAISING_API_URL}/grant/${showModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await adminFetch(`${FUNDRAISING_API_URL}/grant`, { method: 'POST', body: JSON.stringify(body) });
        }
      }
      setShowModal(null); setFormData({}); loadStats(); loadItems();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const endpoint = tab === 'pledges' ? 'pledge' : tab === 'in-kind' ? 'in-kind' : 'grant';
    if (!confirm(`Delete this ${endpoint}?`)) return;
    try {
      await adminFetch(`${FUNDRAISING_API_URL}/${endpoint}/${id}`, { method: 'DELETE' });
      loadStats(); loadItems();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const openEdit = (item) => {
    if (tab === 'pledges') {
      setFormData({
        donor_id: item.donor_id, total_pledge: (Number(item.total_pledge_cents) / 100).toFixed(2),
        paid_to_date: (Number(item.paid_to_date_cents) / 100).toFixed(2),
        installment_count: item.installment_count || '', installment_amount: item.installment_amount_cents ? (item.installment_amount_cents / 100).toFixed(2) : '',
        frequency: item.frequency || '', designation: item.designation || 'unrestricted',
        start_date: item.start_date || '', next_payment_date: item.next_payment_date || '', end_date: item.end_date || '',
        status: item.status, notes: item.notes || '',
      });
    } else if (tab === 'in-kind') {
      setFormData({
        donor_id: item.donor_id, description: item.description, category: item.category,
        estimated_value: (Number(item.estimated_value_cents) / 100).toFixed(2),
        valuation_method: item.valuation_method || '', appraiser_name: item.appraiser_name || '',
        donated_at: item.donated_at?.slice(0, 10) || '', tax_year: item.tax_year || '',
        form_8283_signed: item.form_8283_signed || false, notes: item.notes || '',
      });
    } else if (tab === 'grants') {
      setFormData({
        funder_name: item.funder_name, funder_contact_email: item.funder_contact_email || '',
        award_amount: (Number(item.award_amount_cents) / 100).toFixed(2),
        spent_to_date: (Number(item.spent_to_date_cents) / 100).toFixed(2),
        restriction_type: item.restriction_type, purpose: item.purpose || '', program: item.program || '',
        grant_period_start: item.grant_period_start || '', grant_period_end: item.grant_period_end || '',
        reporting_frequency: item.reporting_frequency || '', next_report_due: item.next_report_due || '',
        deliverables: item.deliverables || '', status: item.status, notes: item.notes || '',
      });
    }
    setShowModal(item);
  };

  const statusBadge = (s) => {
    const cls = s === 'active' ? 'badge-green' : s === 'completed' ? 'badge-blue' : 'badge-red';
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  const tabStyle = (t) => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: tab === t ? 'var(--gold-dim)' : 'transparent', color: tab === t ? 'var(--gold-text)' : 'var(--text-muted)',
  });

  const donorName = (item) => item.donor ? `${item.donor.first_name} ${item.donor.last_name}` : '—';

  return (
    <>
      <div className="page-header">
        <h2>Fundraising</h2>
        <p>Pledges, in-kind donations, grants, and UTM tracking</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-title">Pledges</div>
            <div className="card-value">{fmt(stats.pledges.total_pledged)}</div>
            <div className="card-sub">{stats.pledges.active} active, {fmt(stats.pledges.total_paid)} paid</div>
          </div>
          <div className="card">
            <div className="card-title">In-Kind</div>
            <div className="card-value">{fmt(stats.in_kind.total_value)}</div>
            <div className="card-sub">{stats.in_kind.count} items{stats.in_kind.pending_8283 > 0 ? `, ${stats.in_kind.pending_8283} pending 8283` : ''}</div>
          </div>
          <div className="card">
            <div className="card-title">Grants</div>
            <div className="card-value">{fmt(stats.grants.total_awarded)}</div>
            <div className="card-sub">{stats.grants.active} active, {fmt(stats.grants.total_spent)} spent</div>
          </div>
          <div className="card">
            <div className="card-title">Grant Reports Due</div>
            <div className="card-value" style={{ color: stats.grants.reports_due_soon > 0 ? 'var(--red)' : 'var(--green)' }}>{stats.grants.reports_due_soon}</div>
            <div className="card-sub">Overdue or due today</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button style={tabStyle('pledges')} onClick={() => setTab('pledges')}>Pledges</button>
        <button style={tabStyle('in-kind')} onClick={() => setTab('in-kind')}>In-Kind</button>
        <button style={tabStyle('grants')} onClick={() => setTab('grants')}>Grants</button>
        <button style={tabStyle('utm')} onClick={() => setTab('utm')}>UTM Tracking</button>
      </div>

      {/* PLEDGES TAB */}
      {tab === 'pledges' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <button className="btn btn-gold" onClick={() => { setShowModal({}); setFormData({ designation: 'unrestricted' }); }}>Add Pledge</button>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
              <option value="">All</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="card">
            <div className="table-wrap"><table><thead><tr><th>Donor</th><th>Total Pledge</th><th>Paid</th><th>Remaining</th><th>Frequency</th><th>Next Payment</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No pledges found</td></tr>}
              {!loading && items.map(p => (
                <tr key={p.id}>
                  <td className="td-primary">{donorName(p)}</td>
                  <td className="td-mono">{fmt(Number(p.total_pledge_cents))}</td>
                  <td className="td-mono">{fmt(Number(p.paid_to_date_cents))}</td>
                  <td className="td-mono" style={{ color: 'var(--gold-text)' }}>{fmt(Number(p.total_pledge_cents) - Number(p.paid_to_date_cents))}</td>
                  <td>{p.frequency || '—'}</td>
                  <td>{p.next_payment_date || '—'}</td>
                  <td>{statusBadge(p.status)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
            {totalPages > 1 && <div className="pagination"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
          </div>
        </>
      )}

      {/* IN-KIND TAB */}
      {tab === 'in-kind' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-gold" onClick={() => { setShowModal({}); setFormData({ category: 'other', tax_year: String(new Date().getFullYear()) }); }}>Add In-Kind Donation</button>
          </div>
          <div className="card">
            <div className="table-wrap"><table><thead><tr><th>Donor</th><th>Description</th><th>Category</th><th>Est. Value</th><th>Date</th><th>Form 8283</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No in-kind donations</td></tr>}
              {!loading && items.map(ik => (
                <tr key={ik.id}>
                  <td className="td-primary">{donorName(ik)}</td>
                  <td>{ik.description}</td>
                  <td>{ik.category}</td>
                  <td className="td-mono">{fmt(Number(ik.estimated_value_cents))}</td>
                  <td>{fmtDate(ik.donated_at)}</td>
                  <td>{ik.form_8283_required ? (ik.form_8283_signed ? <span className="badge badge-green">Signed</span> : <span className="badge badge-red">Required</span>) : <span className="badge badge-blue">N/A</span>}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(ik)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ik.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
            {totalPages > 1 && <div className="pagination"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
          </div>
        </>
      )}

      {/* GRANTS TAB */}
      {tab === 'grants' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <button className="btn btn-gold" onClick={() => { setShowModal({}); setFormData({ restriction_type: 'unrestricted' }); }}>Add Grant</button>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
              <option value="">All</option><option value="active">Active</option><option value="completed">Completed</option>
            </select>
          </div>
          <div className="card">
            <div className="table-wrap"><table><thead><tr><th>Funder</th><th>Award</th><th>Spent</th><th>Remaining</th><th>Restriction</th><th>Period</th><th>Next Report</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No grants found</td></tr>}
              {!loading && items.map(g => (
                <tr key={g.id}>
                  <td className="td-primary">{g.funder_name}</td>
                  <td className="td-mono">{fmt(Number(g.award_amount_cents))}</td>
                  <td className="td-mono">{fmt(Number(g.spent_to_date_cents))}</td>
                  <td className="td-mono" style={{ color: 'var(--gold-text)' }}>{fmt(Number(g.award_amount_cents) - Number(g.spent_to_date_cents))}</td>
                  <td>{g.restriction_type}</td>
                  <td style={{ fontSize: 12 }}>{g.grant_period_start && g.grant_period_end ? `${g.grant_period_start} to ${g.grant_period_end}` : '—'}</td>
                  <td style={{ color: g.next_report_due && g.next_report_due <= new Date().toISOString().split('T')[0] ? 'var(--red)' : undefined }}>{g.next_report_due || '—'}</td>
                  <td>{statusBadge(g.status)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
            {totalPages > 1 && <div className="pagination"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
          </div>
        </>
      )}

      {/* UTM TAB */}
      {tab === 'utm' && (
        <div className="card">
          {loading && <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
          {!loading && utmData && (
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{utmData.total_tracked} donations with UTM tracking data</p>
              {utmData.total_tracked === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No UTM-tagged donations yet. Pass utm_source, utm_medium, utm_campaign parameters when creating checkout sessions.</p>}

              {utmData.by_source.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ marginBottom: 10 }}>By Source</h4>
                  <table><thead><tr><th>Source</th><th>Donations</th><th>Total</th></tr></thead>
                  <tbody>{utmData.by_source.map(s => <tr key={s.name}><td className="td-primary">{s.name}</td><td className="td-mono">{s.count}</td><td className="td-mono">{fmt(s.total)}</td></tr>)}</tbody></table>
                </div>
              )}
              {utmData.by_medium.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ marginBottom: 10 }}>By Medium</h4>
                  <table><thead><tr><th>Medium</th><th>Donations</th><th>Total</th></tr></thead>
                  <tbody>{utmData.by_medium.map(s => <tr key={s.name}><td className="td-primary">{s.name}</td><td className="td-mono">{s.count}</td><td className="td-mono">{fmt(s.total)}</td></tr>)}</tbody></table>
                </div>
              )}
              {utmData.by_campaign.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 10 }}>By Campaign</h4>
                  <table><thead><tr><th>Campaign</th><th>Donations</th><th>Total</th></tr></thead>
                  <tbody>{utmData.by_campaign.map(s => <tr key={s.name}><td className="td-primary">{s.name}</td><td className="td-mono">{s.count}</td><td className="td-mono">{fmt(s.total)}</td></tr>)}</tbody></table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PLEDGE MODAL */}
      {showModal && tab === 'pledges' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showModal.id ? 'Edit Pledge' : 'Add Pledge'}</h3>
            <div className="form-group"><label>Donor</label>
              <select value={formData.donor_id || ''} onChange={e => setFormData({ ...formData, donor_id: e.target.value })}>
                <option value="">Select donor...</option>
                {donors.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.email})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Total Pledge Amount</label><DollarInput value={formData.total_pledge} onChange={v => setFormData({ ...formData, total_pledge: v })} /></div>
            {showModal.id && <div className="form-group"><label>Paid to Date</label><DollarInput value={formData.paid_to_date} onChange={v => setFormData({ ...formData, paid_to_date: v })} /></div>}
            <div className="form-group"><label>Installment Amount</label><DollarInput value={formData.installment_amount} onChange={v => setFormData({ ...formData, installment_amount: v })} /></div>
            <div className="form-group"><label># of Installments</label><input type="number" min="1" value={formData.installment_count || ''} onChange={e => setFormData({ ...formData, installment_count: e.target.value })} /></div>
            <div className="form-group"><label>Frequency</label>
              <select value={formData.frequency || ''} onChange={e => setFormData({ ...formData, frequency: e.target.value })}>
                <option value="">One-time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
              </select>
            </div>
            <div className="form-group"><label>Designation</label><input value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} /></div>
            <div className="form-group"><label>Start Date</label><input type="date" value={formData.start_date || ''} onChange={e => setFormData({ ...formData, start_date: e.target.value })} /></div>
            <div className="form-group"><label>Next Payment Date</label><input type="date" value={formData.next_payment_date || ''} onChange={e => setFormData({ ...formData, next_payment_date: e.target.value })} /></div>
            <div className="form-group"><label>End Date</label><input type="date" value={formData.end_date || ''} onChange={e => setFormData({ ...formData, end_date: e.target.value })} /></div>
            {showModal.id && <div className="form-group"><label>Status</label>
              <select value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                <option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>}
            <div className="form-group"><label>Notes</label><textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSave} disabled={saving || !formData.donor_id || !formData.total_pledge}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* IN-KIND MODAL */}
      {showModal && tab === 'in-kind' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showModal.id ? 'Edit In-Kind Donation' : 'Add In-Kind Donation'}</h3>
            <div className="form-group"><label>Donor</label>
              <select value={formData.donor_id || ''} onChange={e => setFormData({ ...formData, donor_id: e.target.value })}>
                <option value="">Select donor...</option>
                {donors.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.email})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Description</label><input value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>
            <div className="form-group"><label>Category</label>
              <select value={formData.category || 'other'} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                <option value="supplies">Supplies</option><option value="equipment">Equipment</option><option value="vehicle">Vehicle</option>
                <option value="real_estate">Real Estate</option><option value="securities">Securities</option><option value="services">Services</option>
                <option value="food">Food</option><option value="clothing">Clothing</option><option value="other">Other</option>
              </select>
            </div>
            <div className="form-group"><label>Estimated Value</label><DollarInput value={formData.estimated_value} onChange={v => setFormData({ ...formData, estimated_value: v })} /></div>
            {parseCents(formData.estimated_value) >= 50000 && <div className="alert-banner alert-warning" style={{ marginBottom: 14 }}>IRS Form 8283 required for non-cash donations over $500.</div>}
            <div className="form-group"><label>Valuation Method</label>
              <select value={formData.valuation_method || ''} onChange={e => setFormData({ ...formData, valuation_method: e.target.value })}>
                <option value="">Select...</option><option value="donor_estimate">Donor Estimate</option><option value="fair_market_value">Fair Market Value</option>
                <option value="independent_appraisal">Independent Appraisal</option><option value="thrift_shop_value">Thrift Shop Value</option>
              </select>
            </div>
            <div className="form-group"><label>Appraiser Name (if applicable)</label><input value={formData.appraiser_name || ''} onChange={e => setFormData({ ...formData, appraiser_name: e.target.value })} /></div>
            <div className="form-group"><label>Date Donated</label><input type="date" value={formData.donated_at || ''} onChange={e => setFormData({ ...formData, donated_at: e.target.value })} /></div>
            <div className="form-group"><label>Tax Year</label><input type="number" value={formData.tax_year || ''} onChange={e => setFormData({ ...formData, tax_year: e.target.value })} /></div>
            {showModal.id && showModal.form_8283_required && (
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={formData.form_8283_signed || false} onChange={e => setFormData({ ...formData, form_8283_signed: e.target.checked })} style={{ width: 'auto' }} />
                <label style={{ margin: 0 }}>Form 8283 signed</label>
              </div>
            )}
            <div className="form-group"><label>Notes</label><textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSave} disabled={saving || !formData.donor_id || !formData.description}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* GRANT MODAL */}
      {showModal && tab === 'grants' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showModal.id ? 'Edit Grant' : 'Add Grant'}</h3>
            <div className="form-group"><label>Funder Name</label><input value={formData.funder_name || ''} onChange={e => setFormData({ ...formData, funder_name: e.target.value })} /></div>
            <div className="form-group"><label>Funder Contact Email</label><input type="email" value={formData.funder_contact_email || ''} onChange={e => setFormData({ ...formData, funder_contact_email: e.target.value })} /></div>
            <div className="form-group"><label>Award Amount</label><DollarInput value={formData.award_amount} onChange={v => setFormData({ ...formData, award_amount: v })} /></div>
            {showModal.id && <div className="form-group"><label>Spent to Date</label><DollarInput value={formData.spent_to_date} onChange={v => setFormData({ ...formData, spent_to_date: v })} /></div>}
            <div className="form-group"><label>Restriction Type</label>
              <select value={formData.restriction_type || 'unrestricted'} onChange={e => setFormData({ ...formData, restriction_type: e.target.value })}>
                <option value="unrestricted">Unrestricted</option><option value="temporarily_restricted">Temporarily Restricted</option><option value="permanently_restricted">Permanently Restricted</option>
              </select>
            </div>
            <div className="form-group"><label>Purpose</label><input value={formData.purpose || ''} onChange={e => setFormData({ ...formData, purpose: e.target.value })} /></div>
            <div className="form-group"><label>Program</label><input value={formData.program || ''} onChange={e => setFormData({ ...formData, program: e.target.value })} /></div>
            <div className="form-group"><label>Grant Period Start</label><input type="date" value={formData.grant_period_start || ''} onChange={e => setFormData({ ...formData, grant_period_start: e.target.value })} /></div>
            <div className="form-group"><label>Grant Period End</label><input type="date" value={formData.grant_period_end || ''} onChange={e => setFormData({ ...formData, grant_period_end: e.target.value })} /></div>
            <div className="form-group"><label>Reporting Frequency</label>
              <select value={formData.reporting_frequency || ''} onChange={e => setFormData({ ...formData, reporting_frequency: e.target.value })}>
                <option value="">None</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semi-annual">Semi-Annual</option><option value="annual">Annual</option><option value="final">Final Only</option>
              </select>
            </div>
            <div className="form-group"><label>Next Report Due</label><input type="date" value={formData.next_report_due || ''} onChange={e => setFormData({ ...formData, next_report_due: e.target.value })} /></div>
            <div className="form-group"><label>Deliverables</label><textarea value={formData.deliverables || ''} onChange={e => setFormData({ ...formData, deliverables: e.target.value })} /></div>
            {showModal.id && <div className="form-group"><label>Status</label>
              <select value={formData.status || 'active'} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                <option value="active">Active</option><option value="completed">Completed</option><option value="closed">Closed</option>
              </select>
            </div>}
            <div className="form-group"><label>Notes</label><textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSave} disabled={saving || !formData.funder_name || !formData.award_amount}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   ADMIN EXTRAS — Letters, Comms, Refunds, Board Report
   ═══════════════════════════════════════════ */
function AdminExtrasView() {
  const [tab, setTab] = useState('letters');
  const [letters, setLetters] = useState([]);
  const [comms, setComms] = useState([]);
  const [report, setReport] = useState(null);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [donors, setDonors] = useState([]);
  const [donations, setDonations] = useState([]);

  const loadLetters = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${ADMIN_EXTRAS_API_URL}/letters?page=${page}&limit=25`);
      setLetters(data.letters || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [page]);

  const loadComms = async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${ADMIN_EXTRAS_API_URL}/communications`);
      setComms(data.preferences || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${ADMIN_EXTRAS_API_URL}/board-report?year=${reportYear}`);
      setReport(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [reportYear]);

  const loadDonorsAndDonations = async () => {
    try {
      const d = await adminFetch('donors?limit=500');
      setDonors(d.donors || []);
      const dn = await adminFetch('donations?limit=500');
      setDonations((dn.donations || []).filter(x => x.status === 'succeeded'));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if (tab === 'letters') loadLetters(); }, [tab, loadLetters]);
  useEffect(() => { if (tab === 'comms') loadComms(); }, [tab]);
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab, loadReport]);

  const handleSaveLetter = async () => {
    setSaving(true);
    try {
      if (showModal?.id) {
        await adminFetch(`${ADMIN_EXTRAS_API_URL}/letter/${showModal.id}`, { method: 'PUT', body: JSON.stringify(formData) });
      } else {
        await adminFetch(`${ADMIN_EXTRAS_API_URL}/letter`, { method: 'POST', body: JSON.stringify(formData) });
      }
      setShowModal(null); setFormData({}); loadLetters();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleDeleteLetter = async (id) => {
    if (!confirm('Delete this acknowledgment letter?')) return;
    try {
      await adminFetch(`${ADMIN_EXTRAS_API_URL}/letter/${id}`, { method: 'DELETE' });
      loadLetters();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleMarkSent = async (id, via) => {
    try {
      await adminFetch(`${ADMIN_EXTRAS_API_URL}/letter/${id}`, { method: 'PUT', body: JSON.stringify({ mark_sent: true, sent_via: via }) });
      loadLetters();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const handleBatch = async () => {
    setSaving(true);
    try {
      const result = await adminFetch(`${ADMIN_EXTRAS_API_URL}/letters/batch`, { method: 'POST', body: JSON.stringify({ since: formData.since, signed_by: formData.signed_by }) });
      alert(`Created ${result.created} acknowledgment letters`);
      setShowBatchModal(false); setFormData({}); loadLetters();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleRefund = async () => {
    setSaving(true);
    try {
      const body = { donation_id: formData.donation_id, reason: formData.reason };
      if (formData.partial_amount) body.amount_cents = parseCents(formData.partial_amount);
      const result = await adminFetch(`${ADMIN_EXTRAS_API_URL}/refund`, { method: 'POST', body: JSON.stringify(body) });
      alert(`Refunded ${fmt(result.refunded_cents)}${result.partial ? ' (partial)' : ''}`);
      setShowRefundModal(false); setFormData({});
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleToggleComm = async (id, currentVal) => {
    try {
      await adminFetch(`${ADMIN_EXTRAS_API_URL}/communication/${id}`, { method: 'PUT', body: JSON.stringify({ opted_in: !currentVal }) });
      loadComms();
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const tierColors = { standard: '#8b8899', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#c8a855', platinum: '#e5e4e2' };

  return (
    <>
      <div className="page-header">
        <h2>Admin Tools</h2>
        <p>Acknowledgment letters, communication preferences, refunds & board reports</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['letters', 'Letters'], ['refunds', 'Refunds'], ['comms', 'Communications'], ['report', 'Board Report']].map(([k, label]) => (
          <button key={k} className={`btn ${tab === k ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ─── LETTERS TAB ─── */}
      {tab === 'letters' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Acknowledgment Letters</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setShowBatchModal(true); setFormData({ since: `${new Date().getFullYear()}-01-01` }); }}>Batch Generate</button>
              <button className="btn btn-gold" onClick={() => { loadDonorsAndDonations(); setShowModal({}); setFormData({}); }}>+ New Letter</button>
            </div>
          </div>
          {loading ? <p style={{ color: 'var(--text-muted)', padding: 20 }}>Loading...</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Donor</th><th>Donation</th><th>Tier</th><th>Sent</th><th>Signed By</th><th>Actions</th></tr></thead>
                <tbody>
                  {letters.map(l => (
                    <tr key={l.id}>
                      <td className="td-primary">{l.donor?.first_name} {l.donor?.last_name}</td>
                      <td className="td-mono">{l.donation ? `${l.donation.receipt_number} — ${fmt(l.donation.amount_cents)}` : '—'}</td>
                      <td><span style={{ color: tierColors[l.template_tier] || '#8b8899', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{l.template_tier}</span></td>
                      <td>{l.sent_at ? <span className="badge badge-green">{l.sent_via || 'sent'} — {new Date(l.sent_at).toLocaleDateString()}</span> : <span className="badge badge-dim">unsent</span>}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.signed_by || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!l.sent_at && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleMarkSent(l.id, 'email')}>Mark Sent</button>}
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => { loadDonorsAndDonations(); setShowModal(l); setFormData({ template_tier: l.template_tier, sent_via: l.sent_via, signed_by: l.signed_by }); }}>Edit</button>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--red)' }} onClick={() => handleDeleteLetter(l.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {letters.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>No acknowledgment letters yet</td></tr>}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
                  <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>Page {page} of {totalPages}</span>
                  <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── REFUNDS TAB ─── */}
      {tab === 'refunds' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Process Refund</h3>
            <button className="btn btn-gold" onClick={() => { loadDonorsAndDonations(); setShowRefundModal(true); setFormData({}); }}>+ New Refund</button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Process full or partial refunds through Stripe. Refunds automatically void associated receipts and update donor totals.
          </p>
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 8 }}>Refund workflow:</p>
            <ol style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Select a donation to refund</li>
              <li>Choose full or partial refund amount</li>
              <li>Stripe processes the refund automatically</li>
              <li>Receipt is voided, donor totals recalculated</li>
              <li>Action logged in audit trail</li>
            </ol>
          </div>
        </div>
      )}

      {/* ─── COMMUNICATIONS TAB ─── */}
      {tab === 'comms' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Communication Preferences</h3>
          </div>
          {loading ? <p style={{ color: 'var(--text-muted)', padding: 20 }}>Loading...</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Donor</th><th>Channel</th><th>Category</th><th>Opted In</th><th>Actions</th></tr></thead>
                <tbody>
                  {comms.map(c => (
                    <tr key={c.id}>
                      <td className="td-primary">{c.donor?.first_name} {c.donor?.last_name}</td>
                      <td>{c.channel}</td>
                      <td>{c.category}</td>
                      <td>{c.opted_in ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
                      <td>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleToggleComm(c.id, c.opted_in)}>
                          {c.opted_in ? 'Opt Out' : 'Opt In'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {comms.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>No communication preferences configured</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── BOARD REPORT TAB ─── */}
      {tab === 'report' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <select value={reportYear} onChange={e => setReportYear(parseInt(e.target.value))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={loadReport}>Refresh</button>
          </div>

          {loading ? <p style={{ color: 'var(--text-muted)', padding: 20 }}>Loading report...</p> : report && (
            <>
              <div className="kpi-grid">
                <div className="card"><div className="card-title">Gross Donations</div><div className="card-value">{fmt(report.donations.total_cents)}</div><div className="card-sub">{report.donations.count} donations</div></div>
                <div className="card"><div className="card-title">Net (After Refunds)</div><div className="card-value">{fmt(report.donations.net_cents)}</div><div className="card-sub">{fmt(report.donations.refund_cents)} refunded</div></div>
                <div className="card"><div className="card-title">Total Donors</div><div className="card-value">{report.donors.total}</div><div className="card-sub">{report.donors.new_this_year} new in {report.year}</div></div>
                <div className="card"><div className="card-title">Recurring MRR</div><div className="card-value">{fmt(report.recurring.mrr_cents)}</div><div className="card-sub">ARR: {fmt(report.recurring.arr_cents)} · {report.recurring.active_count} active</div></div>
              </div>

              <div className="charts-grid">
                <div className="card">
                  <div className="card-title">Donations by Month</div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={report.donations.by_month.map(m => ({ ...m, amount: m.total / 100 }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                        <Tooltip formatter={v => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Amount']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="amount" fill="var(--gold)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">By Designation</div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={report.donations.by_designation.map(d => ({ ...d, value: d.total / 100 }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: $${value.toLocaleString()}`}>
                          {report.donations.by_designation.map((_, i) => <Cell key={i} fill={['#c8a855', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c'][i % 6]} />)}
                        </Pie>
                        <Tooltip formatter={v => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Amount']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="card"><div className="card-title">Active Grants</div><div className="card-value">{report.grants.active_count}</div><div className="card-sub">Total awarded: {fmt(report.grants.total_awarded_cents)}</div></div>
                <div className="card"><div className="card-title">Active Pledges</div><div className="card-value">{report.pledges.active_count}</div><div className="card-sub">Pledged: {fmt(report.pledges.total_pledged_cents)} · Paid: {fmt(report.pledges.total_paid_cents)}</div></div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── NEW/EDIT LETTER MODAL ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{showModal.id ? 'Edit Letter' : 'New Acknowledgment Letter'}</h3>
            {!showModal.id && (
              <>
                <div className="form-group">
                  <label>Donor *</label>
                  <select value={formData.donor_id || ''} onChange={e => setFormData({ ...formData, donor_id: e.target.value })}>
                    <option value="">Select donor...</option>
                    {donors.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} — {d.email}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Donation (optional)</label>
                  <select value={formData.donation_id || ''} onChange={e => setFormData({ ...formData, donation_id: e.target.value })}>
                    <option value="">No specific donation</option>
                    {donations.filter(d => !formData.donor_id || d.donor_id === formData.donor_id).map(d => <option key={d.id} value={d.id}>{d.receipt_number} — {fmt(d.amount_cents)}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Tier</label>
              <select value={formData.template_tier || ''} onChange={e => setFormData({ ...formData, template_tier: e.target.value })}>
                <option value="">Auto-detect from donor total</option>
                <option value="standard">Standard (&lt; $1K)</option>
                <option value="bronze">Bronze ($1K+)</option>
                <option value="silver">Silver ($5K+)</option>
                <option value="gold">Gold ($25K+)</option>
                <option value="platinum">Platinum ($100K+)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Sent Via</label>
              <select value={formData.sent_via || ''} onChange={e => setFormData({ ...formData, sent_via: e.target.value })}>
                <option value="">Not yet sent</option>
                <option value="email">Email</option>
                <option value="mail">Mail</option>
                <option value="in_person">In Person</option>
              </select>
            </div>
            <div className="form-group">
              <label>Signed By</label>
              <input value={formData.signed_by || ''} onChange={e => setFormData({ ...formData, signed_by: e.target.value })} placeholder="Executive Director" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSaveLetter} disabled={saving || (!showModal.id && !formData.donor_id)}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── BATCH MODAL ─── */}
      {showBatchModal && (
        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Batch Generate Letters</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Generate acknowledgment letters for all donations since a given date that don't already have one.</p>
            <div className="form-group">
              <label>Since Date *</label>
              <input type="date" value={formData.since || ''} onChange={e => setFormData({ ...formData, since: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Signed By</label>
              <input value={formData.signed_by || ''} onChange={e => setFormData({ ...formData, signed_by: e.target.value })} placeholder="Executive Director" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowBatchModal(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleBatch} disabled={saving || !formData.since}>{saving ? 'Generating...' : 'Generate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REFUND MODAL ─── */}
      {showRefundModal && (
        <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Process Refund</h3>
            <div className="form-group">
              <label>Donation *</label>
              <select value={formData.donation_id || ''} onChange={e => setFormData({ ...formData, donation_id: e.target.value })}>
                <option value="">Select donation...</option>
                {donations.map(d => <option key={d.id} value={d.id}>{d.receipt_number} — {fmt(d.amount_cents)} ({d.donor?.first_name} {d.donor?.last_name})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Partial Amount (leave blank for full refund)</label>
              <DollarInput value={formData.partial_amount || ''} onChange={v => setFormData({ ...formData, partial_amount: v })} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Reason</label>
              <input value={formData.reason || ''} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="Reason for refund" />
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
              This will process a refund through Stripe, void the receipt, and update donor totals. This action cannot be undone.
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowRefundModal(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleRefund} disabled={saving || !formData.donation_id}>{saving ? 'Processing...' : 'Process Refund'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   ACCOUNTING & SYSTEM CONFIG
   ═══════════════════════════════════════════ */
function AccountingView() {
  const [tab, setTab] = useState('export');
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(null);
  const [formData, setFormData] = useState({});

  const loadConfig = async () => {
    try {
      const data = await adminFetch(`${ACCOUNTING_API_URL}/config`);
      setConfig(data.config || {});
    } catch (err) { console.error(err); }
  };

  const loadMappings = async () => {
    try {
      const data = await adminFetch(`${ACCOUNTING_API_URL}/mappings`);
      setMappings(data.mappings || {});
    } catch (err) { console.error(err); }
  };

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`${ACCOUNTING_API_URL}/fiscal-summary?year=${year}`);
      setSummary(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [year]);

  useEffect(() => { loadConfig(); loadMappings(); }, []);
  useEffect(() => { if (tab === 'export' || tab === 'summary') loadSummary(); }, [tab, loadSummary]);

  const handleExport = async (format) => {
    try {
      const res = await adminFetch(`${ACCOUNTING_API_URL}/export/${format}?year=${year}`);
      if (res instanceof Response) {
        const blob = await res.blob();
        const ext = format === 'quickbooks' ? 'iif' : 'csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zoeist-${format}-${year}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) { alert('Export failed: ' + err.message); }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await adminFetch(`${ACCOUNTING_API_URL}/config/${showConfigModal}`, { method: 'PUT', body: JSON.stringify({ value: formData.value }) });
      setShowConfigModal(null);
      setFormData({});
      loadConfig();
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    try {
      await adminFetch(`${ACCOUNTING_API_URL}/mappings`, { method: 'PUT', body: JSON.stringify({ mappings }) });
      alert('Account mappings saved');
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const handleUpdateFiscalYear = async () => {
    setSaving(true);
    try {
      await adminFetch(`${ACCOUNTING_API_URL}/config/fiscal_year`, {
        method: 'PUT',
        body: JSON.stringify({ value: { start_month: parseInt(formData.start_month), start_day: parseInt(formData.start_day), end_month: parseInt(formData.end_month), end_day: parseInt(formData.end_day) } }),
      });
      setShowConfigModal(null);
      setFormData({});
      loadConfig();
      loadSummary();
      alert('Fiscal year updated');
    } catch (err) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  const fy = config?.fiscal_year || { start_month: 1, start_day: 1, end_month: 12, end_day: 31 };
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <>
      <div className="page-header">
        <h2>Accounting & Settings</h2>
        <p>Export to QuickBooks/Xero, configure fiscal year & account mappings</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['export', 'Export'], ['summary', 'Fiscal Summary'], ['mappings', 'Account Mappings'], ['config', 'System Config']].map(([k, label]) => (
          <button key={k} className={`btn ${tab === k ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ─── EXPORT TAB ─── */}
      {tab === 'export' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Fiscal year: {monthNames[fy.start_month]} {fy.start_day} – {monthNames[fy.end_month]} {fy.end_day}
            </span>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleExport('quickbooks')}>
              <div className="card-title">QuickBooks IIF</div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📗</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>IIF import file with double-entry journal entries. Includes cash donations, refunds, and in-kind contributions.</p>
              <button className="btn btn-gold" style={{ marginTop: 12, width: '100%' }} onClick={(e) => { e.stopPropagation(); handleExport('quickbooks'); }}>Download .iif</button>
            </div>

            <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleExport('xero')}>
              <div className="card-title">Xero CSV</div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📘</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>CSV invoice import for Xero. Maps donations to account codes with tax-exempt designation.</p>
              <button className="btn btn-gold" style={{ marginTop: 12, width: '100%' }} onClick={(e) => { e.stopPropagation(); handleExport('xero'); }}>Download .csv</button>
            </div>

            <div className="card" style={{ cursor: 'pointer' }} onClick={() => handleExport('generic')}>
              <div className="card-title">Generic CSV</div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Comprehensive CSV with all donation details, in-kind contributions, and grant data for any accounting system.</p>
              <button className="btn btn-gold" style={{ marginTop: 12, width: '100%' }} onClick={(e) => { e.stopPropagation(); handleExport('generic'); }}>Download .csv</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FISCAL SUMMARY TAB ─── */}
      {tab === 'summary' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
              {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={loadSummary}>Refresh</button>
          </div>

          {loading ? <p style={{ color: 'var(--text-muted)', padding: 20 }}>Loading...</p> : summary && (
            <>
              <div className="kpi-grid">
                <div className="card"><div className="card-title">Gross Cash Donations</div><div className="card-value">{fmt(summary.cash_donations.gross_cents)}</div><div className="card-sub">{summary.cash_donations.count} transactions</div></div>
                <div className="card"><div className="card-title">Net (After Refunds)</div><div className="card-value">{fmt(summary.cash_donations.net_cents)}</div><div className="card-sub">{fmt(summary.cash_donations.refund_cents)} refunded</div></div>
                <div className="card"><div className="card-title">In-Kind Contributions</div><div className="card-value">{fmt(summary.in_kind.total_cents)}</div><div className="card-sub">{summary.in_kind.count} items</div></div>
                <div className="card"><div className="card-title">Total Revenue</div><div className="card-value" style={{ color: 'var(--gold)' }}>{fmt(summary.total_revenue_cents)}</div><div className="card-sub">Cash + In-Kind</div></div>
              </div>

              <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="card"><div className="card-title">Active Grants</div><div className="card-value">{summary.grants.active}</div><div className="card-sub">Awarded: {fmt(summary.grants.total_awarded_cents)}</div></div>
                <div className="card"><div className="card-title">Recurring Revenue</div><div className="card-value">{fmt(summary.recurring.mrr_cents)}/mo</div><div className="card-sub">ARR: {fmt(summary.recurring.arr_cents)} · {summary.recurring.active} active</div></div>
              </div>

              {summary.by_designation.length > 0 && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>Revenue by Designation</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Designation</th><th>Count</th><th>Gross</th><th>Refunds</th><th>Net</th></tr></thead>
                      <tbody>
                        {summary.by_designation.map(d => (
                          <tr key={d.name}>
                            <td className="td-primary">{d.name}</td>
                            <td>{d.count}</td>
                            <td className="td-mono">{fmt(d.gross)}</td>
                            <td className="td-mono" style={{ color: d.refunds > 0 ? 'var(--red)' : undefined }}>{fmt(d.refunds)}</td>
                            <td className="td-mono" style={{ fontWeight: 600 }}>{fmt(d.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── ACCOUNT MAPPINGS TAB ─── */}
      {tab === 'mappings' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Chart of Accounts Mapping</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Map fund designations to accounting software account codes</p>
            </div>
            <button className="btn btn-gold" onClick={handleSaveMappings} disabled={saving}>{saving ? 'Saving...' : 'Save Mappings'}</button>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Default Bank Account (QB)</label>
                <input value={mappings._default_bank || ''} onChange={e => setMappings({ ...mappings, _default_bank: e.target.value })} placeholder="1000 · Checking" />
              </div>
              <div className="form-group">
                <label>Default Income Account (QB)</label>
                <input value={mappings._default_income || ''} onChange={e => setMappings({ ...mappings, _default_income: e.target.value })} placeholder="4000 · Contribution Revenue" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>In-Kind Account (QB)</label>
                <input value={mappings._inkind || ''} onChange={e => setMappings({ ...mappings, _inkind: e.target.value })} placeholder="4100 · In-Kind Contributions" />
              </div>
              <div className="form-group">
                <label>Default Income Code (Xero)</label>
                <input value={mappings._default_income_code || ''} onChange={e => setMappings({ ...mappings, _default_income_code: e.target.value })} placeholder="200" />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>Per-Designation Overrides (leave blank to use default)</p>
              {['General Fund', 'Youth Programs', 'Education', 'Community Development'].map(desig => (
                <div key={desig} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{desig}</span>
                  <input value={mappings[desig] || ''} onChange={e => setMappings({ ...mappings, [desig]: e.target.value })} placeholder="QB Account" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12 }} />
                  <input value={mappings[`xero_${desig}`] || ''} onChange={e => setMappings({ ...mappings, [`xero_${desig}`]: e.target.value })} placeholder="Xero Code" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SYSTEM CONFIG TAB ─── */}
      {tab === 'config' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Fiscal Year</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Current: {monthNames[fy.start_month]} {fy.start_day} – {monthNames[fy.end_month]} {fy.end_day}</p>
              </div>
              <button className="btn btn-ghost" onClick={() => { setShowConfigModal('fiscal_year'); setFormData({ start_month: String(fy.start_month), start_day: String(fy.start_day), end_month: String(fy.end_month), end_day: String(fy.end_day) }); }}>Edit</button>
            </div>
          </div>

          {config && Object.entries(config).filter(([k]) => k !== 'fiscal_year' && k !== 'account_mappings').map(([key, value]) => (
            <div className="card" key={key} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
                  <pre style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', maxHeight: 120, overflow: 'auto' }}>{JSON.stringify(value, null, 2)}</pre>
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowConfigModal(key); setFormData({ value }); }}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── FISCAL YEAR MODAL ─── */}
      {showConfigModal === 'fiscal_year' && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Configure Fiscal Year</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Start Month</label>
                <select value={formData.start_month || '1'} onChange={e => setFormData({ ...formData, start_month: e.target.value })}>
                  {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Start Day</label>
                <input type="number" min="1" max="31" value={formData.start_day || '1'} onChange={e => setFormData({ ...formData, start_day: e.target.value })} />
              </div>
              <div className="form-group">
                <label>End Month</label>
                <select value={formData.end_month || '12'} onChange={e => setFormData({ ...formData, end_month: e.target.value })}>
                  {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>End Day</label>
                <input type="number" min="1" max="31" value={formData.end_day || '31'} onChange={e => setFormData({ ...formData, end_day: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfigModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleUpdateFiscalYear} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── GENERIC CONFIG EDIT MODAL ─── */}
      {showConfigModal && showConfigModal !== 'fiscal_year' && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Edit {showConfigModal.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
            <div className="form-group">
              <label>Value (JSON)</label>
              <textarea value={typeof formData.value === 'string' ? formData.value : JSON.stringify(formData.value, null, 2)} onChange={e => { try { setFormData({ value: JSON.parse(e.target.value) }); } catch { setFormData({ value: e.target.value }); } }} style={{ minHeight: 200, fontFamily: 'var(--mono)', fontSize: 12 }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfigModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSaveConfig} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (checking) return <div className="loading" style={{ height: '100vh' }}><div className="spinner" />Loading...</div>;

  if (!session) return (
    <>
      <style>{STYLES}</style>
      <LoginPage onLogin={setSession} />
    </>
  );

  return (
    <>
      <style>{STYLES}</style>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="z-mark">Z</div>
            <div>
              <h1>Zoeist Admin</h1>
              <span>Donation Management</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <NavLink to="/" end><span className="nav-icon">◉</span> Overview</NavLink>
            <NavLink to="/donations"><span className="nav-icon">◈</span> Donations</NavLink>
            <NavLink to="/donors"><span className="nav-icon">◎</span> Donors</NavLink>
            <NavLink to="/recurring"><span className="nav-icon">↻</span> Recurring</NavLink>
            <NavLink to="/compliance"><span className="nav-icon">◇</span> Compliance</NavLink>
            <NavLink to="/matching"><span className="nav-icon">⬡</span> Matching</NavLink>
            <NavLink to="/events"><span className="nav-icon">◆</span> Events</NavLink>
            <NavLink to="/fundraising"><span className="nav-icon">▣</span> Fundraising</NavLink>
            <NavLink to="/admin-tools"><span className="nav-icon">⚙</span> Admin Tools</NavLink>
            <NavLink to="/accounting"><span className="nav-icon">☰</span> Accounting</NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="admin-name">{session.user?.email}</div>
            <button onClick={handleLogout}>Sign out</button>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<OverviewView />} />
            <Route path="/donations" element={<DonationsView />} />
            <Route path="/donors" element={<DonorsView />} />
            <Route path="/recurring" element={<RecurringView />} />
            <Route path="/compliance" element={<ComplianceView />} />
            <Route path="/matching" element={<MatchingView />} />
            <Route path="/events" element={<EventsView />} />
            <Route path="/fundraising" element={<FundraisingView />} />
            <Route path="/admin-tools" element={<AdminExtrasView />} />
            <Route path="/accounting" element={<AccountingView />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
