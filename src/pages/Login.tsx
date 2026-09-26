import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, isStaff, homePath } from '../lib/auth';
import { requestPasswordReset, confirmPasswordReset } from '../lib/api';

/** The K mark, drawn rather than shipped as an asset so it stays crisp. */
const Mark: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <path d="M4 3h7v26H4z" fill="var(--accent)" />
    <path d="M11 16 21 3h8L19 16z" fill="#e0a24f" />
    <path d="M11 16h8l10 13h-8z" fill="var(--accent-strong)" />
  </svg>
);

const MailIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
  </svg>
);

const LockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const EyeIcon: React.FC<{ off: boolean }> = ({ off }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/**
 * The brand panel's illustration: the admin dashboard on a laptop.
 *
 * Decorative, so it carries an empty alt and is hidden from screen readers —
 * every idea in it is already said in the heading beside it. Eager-loaded
 * because it is the first thing painted on this screen, not below a fold.
 */
const PanelPreview: React.FC = () => (
  <div className="login-art">
    <img src="/images/adminlogin.png" alt="" aria-hidden width={1613} height={975} />
  </div>
);

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Password reset, inline. Staff had no way back into their own account
  // before this: the reset endpoints existed but nothing in the panel used them.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStage, setResetStage] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (isStaff()) navigate(homePath(), { replace: true });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(homePath(), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setBusy(false);
    }
  };

  const startReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!email.trim()) {
      setResetError('Enter your email address above first.');
      return;
    }
    setResetBusy(true);
    try {
      const res = await requestPasswordReset(email.trim());
      // The server answers the same way whether or not the address has an
      // account, so the wording must not imply one exists.
      setResetNote(res.code_required
        ? 'If that address has an account, a six-digit code is on its way. Enter it below with your new password.'
        : 'Enter a new password below.');
      setResetStage('confirm');
    } catch (err: any) {
      setResetError(err.message || 'Could not start the reset.');
    } finally {
      setResetBusy(false);
    }
  };

  const finishReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (newPassword.length < 8) {
      setResetError('Use at least 8 characters.');
      return;
    }
    setResetBusy(true);
    try {
      await confirmPasswordReset(email.trim(), resetCode.trim(), newPassword);
      setResetOpen(false);
      setResetStage('request');
      setResetCode('');
      setNewPassword('');
      setPassword('');
      setError('');
      setResetNote('');
      setResetError('');
      setShowPassword(false);
      // Not signed in automatically: a reset should end at a deliberate login.
      setResetNote('');
      setError('Password updated. Sign in with your new password.');
    } catch (err: any) {
      setResetError(err.message || 'Could not update the password.');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="login-screen">
      {/* ── Brand panel ── */}
      <section className="login-brand">
        <header className="login-brand-head">
          <span className="login-logo"><Mark /> Knovate</span>
          <span className="login-sub">Admin Panel</span>
        </header>

        <div className="login-brand-copy">
          <h1>Manage. Monitor. <em>Grow.</em></h1>
          <p>Users, courses, enquiries, exams and referrals — everything that keeps the platform running, in one place.</p>
        </div>

        <PanelPreview />

        <footer className="login-brand-foot">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9.6C7.4 20.3 4 17 4 12V6z" />
          </svg>
          Secure <span>•</span> Reliable <span>•</span> Built for education
        </footer>
      </section>

      {/* ── Sign-in card ── */}
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <span className="login-logo login-card-logo"><Mark size={30} /> Knovate</span>
          <h2>Admin login</h2>
          <p className="login-card-sub">Sign in with your admin or recruiter account.</p>

          <label className="login-label" htmlFor="login-email">Email address</label>
          <div className="login-input">
            <span className="login-input-icon"><MailIcon /></span>
            <input
              id="login-email"
              type="email"
              value={email}
              autoFocus
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@knovate.com"
            />
          </div>

          <label className="login-label" htmlFor="login-password">Password</label>
          <div className="login-input">
            <span className="login-input-icon"><LockIcon /></span>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="login-input-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>

          {error && <div className="err mb">{error}</div>}

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>

          <div className="login-or"><span>or</span></div>

          {!resetOpen ? (
            <button type="button" className="login-link" onClick={() => { setResetOpen(true); setResetError(''); }}>
              Forgot password?
            </button>
          ) : (
            <div className="login-reset">
              {resetStage === 'request' ? (
                <>
                  <p className="muted">
                    We will send a code to <strong>{email.trim() || 'your email address'}</strong>.
                  </p>
                  {resetError && <div className="err">{resetError}</div>}
                  <div className="login-reset-actions">
                    <button type="button" className="secondary sm" onClick={() => setResetOpen(false)}>Cancel</button>
                    <button type="button" className="sm" onClick={startReset} disabled={resetBusy}>
                      {resetBusy ? 'Sending…' : 'Send reset code'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {resetNote && <p className="muted">{resetNote}</p>}
                  <input
                    className="login-reset-input"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Six-digit code"
                    inputMode="numeric"
                    aria-label="Reset code"
                  />
                  <input
                    className="login-reset-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (8+ characters)"
                    aria-label="New password"
                  />
                  {resetError && <div className="err">{resetError}</div>}
                  <div className="login-reset-actions">
                    <button type="button" className="secondary sm" onClick={() => setResetOpen(false)}>Cancel</button>
                    <button type="button" className="sm" onClick={finishReset} disabled={resetBusy}>
                      {resetBusy ? 'Updating…' : 'Set new password'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </section>
    </div>
  );
};

export default Login;
