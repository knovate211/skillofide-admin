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
    if (isAdmin()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card card-pad" style={{ width: 380 }} onSubmit={submit}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Knovate Admin</div>
        <p className="muted mb">Sign in with an administrator account.</p>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@knovate.com"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="err mb">{error}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

export default Login;
