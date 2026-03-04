import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase, adminFetch, YEAR_END_API_URL, RECURRING_API_URL, COMPLIANCE_REPORTS_URL, COMPLIANCE_ALERTS_URL, COMPLIANCE_FIN_STMT_URL } from './supabase';

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

const CHART_GOLD = '#c8a855';
const CHART_COLORS = ['#c8a855', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c'];
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
      const { data: blob, error } = await supabase.storage.from('receipts').download(path);
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
