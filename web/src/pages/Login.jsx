import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

// Admin sign-in is by mobile number; email was retired as a portal login. Keep
// only digits, so a pasted "09-1234-5678" still works before the API looks it up.
function normalizeInput(v) {
  return String(v).replace(/[^0-9]/g, '');
}

export default function Login() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Seconds left of a throttling cooldown after too many failed attempts.
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (cooldown > 0) return;
    const value = normalizeInput(mobile);
    if (value.length < 11) {
      setError('Please enter the complete 11-digit mobile number (09XXXXXXXXX)');
      return;
    }
    setBusy(true);
    try {
      const user = await api.login(value, password);
      if (user.role === 'beneficiary') {
        setError('Beneficiary accounts use the AgriConnect Medina mobile app.');
        api.logout();
        return;
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
      if (err.status === 429) {
        setCooldown(Math.max(1, Number(err.retryAfterSeconds) || 60));
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || cooldown > 0;

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/mao-seal.png" alt="MAO" style={{ width: 64, height: "auto", margin: "0 auto 12px", display: "block", borderRadius: 10 }} />
        <h1>AgriConnect Medina</h1>
        <p className="sub">Municipal Agriculture Office · Web Portal</p>

        <div className="field">
          <span>Mobile number</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="09123456789"
            required
          />
        </div>
        <div className="field">
          <span>Password</span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error && <p className="muted" style={{ color: 'var(--danger)', margin: '8px 0' }}>{error}</p>}

        <button className="btn primary" style={{ width: '100%', padding: '11px' }} disabled={disabled}>
          {busy ? 'Signing in…' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Sign in'}
        </button>
      </form>
    </div>
  );
}