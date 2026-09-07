import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, isAdmin } from '../lib/auth';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin()) navigate('/users', { replace: true });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/users', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand-mark" aria-hidden="true">K</div>
        <h1>Knovate Admin</h1>
        <p className="muted" style={{ margin: '0 0 24px' }}>Sign in with an administrator account.</p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            autoFocus
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@knovate.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <div className="err mb">{error}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '9px 14px' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

export default Login;
