import { useState, type FormEvent } from 'react';
import { api, type AuthUser } from '../api';

interface Props {
  onLogin: (user: AuthUser) => void;
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('estimator@somec.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="panel stack" onSubmit={(e) => void submit(e)} aria-label="login form">
        <div className="login-brand">
          <img src="/quo-captain.svg" alt="" className="login-mark" />
          <div>
            <strong>Quo-Captain</strong>
            <span>by <img src="/somec-logo.svg" alt="Somec Group" className="login-logo" /></span>
          </div>
        </div>
        <h2>Sign in</h2>
        <p className="muted small">Quotation cost analysis for Somec's cruise-ship glazing and flooring. Demo account: estimator@somec.local / somec2026.</p>
        <label className="field">
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
