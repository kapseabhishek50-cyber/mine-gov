import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Eye, EyeOff, Fingerprint, HardHat, LockKeyhole, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

const accounts = [
  { email: 'admin@example.com', name: 'Administrator', role: 'Portfolio access' },
  { email: 'officer@example.com', name: 'Mine officer', role: 'Mine operations' },
  { email: 'inspector@example.com', name: 'Inspector', role: 'Field reporting' },
  { email: 'manager@example.com', name: 'Management', role: 'Executive access' },
];
const demoPassword = 'MineGov2026!';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState(accounts[0].email);
  const [password, setPassword] = useState(demoPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      toast('Welcome back to MineGov AI.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const isStatic = api.isStaticMode();

  return (
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-showcase-top">
          <Link to="/login" className="brand-lockup">
            <span className="brand-mark">
              <span />
              <span />
              <span />
            </span>
            <span className="brand-name">
              MineGov <b>AI</b>
              <small>SMART MINE GOVERNANCE</small>
            </span>
          </Link>
          <span className="demo-env-pill">
            <i /> {isStatic ? 'STATIC DEMO MODE' : 'DEMO ENVIRONMENT'}
          </span>
        </div>
        <div className="showcase-content">
          <span className="showcase-kicker">
            <span>
              <Sparkles size={13} />
            </span>{' '}
            INTELLIGENCE FOR SAFER MINES
          </span>
          <h1>
            Governance that
            <br />
            moves <em>work forward.</em>
          </h1>
          <p>One operational picture for mine compliance, field inspections, violations and verified corrective action.</p>
          <div className="showcase-workflow">
            <div>
              <span className="workflow-icon detect">
                <TriangleAlert size={15} />
              </span>
              <b>Detect</b>
              <small>Find risks early</small>
            </div>
            <i />
            <div>
              <span className="workflow-icon monitor">
                <Activity size={15} />
              </span>
              <b>Monitor</b>
              <small>Track obligations</small>
            </div>
            <i />
            <div>
              <span className="workflow-icon act">
                <HardHat size={15} />
              </span>
              <b>Act</b>
              <small>Assign ownership</small>
            </div>
            <i />
            <div>
              <span className="workflow-icon verify">
                <ShieldCheck size={15} />
              </span>
              <b>Verify</b>
              <small>Close with evidence</small>
            </div>
          </div>
          <div className="showcase-dashboard-card">
            <div className="showcase-card-top">
              <div>
                <span className="showcase-card-dot" />
                <b>Portfolio pulse</b>
              </div>
              <span>LIVE DEMO DATA</span>
            </div>
            <div className="showcase-pulse-grid">
              <div>
                <strong>05</strong>
                <small>Monitored mines</small>
              </div>
              <div>
                <strong>
                  87<span>%</span>
                </strong>
                <small>Compliance score</small>
              </div>
              <div>
                <strong>03</strong>
                <small>Sites to review</small>
              </div>
            </div>
            <div className="showcase-sparkline">
              <svg viewBox="0 0 520 52" preserveAspectRatio="none">
                <path
                  d="M0 42 C 45 39, 47 33, 85 35 S 129 45, 159 27 S 194 31, 229 26 S 267 34, 305 19 S 353 28, 386 16 S 426 23, 449 9 S 493 18, 520 4"
                  fill="none"
                  stroke="#7aa2ff"
                  strokeWidth="2.5"
                />
                <path
                  d="M0 42 C 45 39, 47 33, 85 35 S 129 45, 159 27 S 194 31, 229 26 S 267 34, 305 19 S 353 28, 386 16 S 426 23, 449 9 S 493 18, 520 4 L520 52 L0 52 Z"
                  fill="url(#loginGradient)"
                  opacity=".22"
                />
                <defs>
                  <linearGradient id="loginGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#75a4ff" />
                    <stop offset="1" stopColor="#75a4ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>
        <div className="login-showcase-bottom">
          <span>
            <LockKeyhole size={13} /> Secure by design
          </span>
          <span>MineGov AI · v1.0 {isStatic ? 'static' : 'demo'}</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-container">
          <div className="login-welcome">
            <div className="login-mini-mark">
              <Fingerprint size={20} />
            </div>
            <span className="eyebrow">SECURE ACCESS</span>
            <h2>Welcome back</h2>
            <p>Sign in to your MineGov workspace. {isStatic && 'Static demo mode enabled.'}</p>
          </div>
          <form className="login-form" onSubmit={submit}>
            <label className="form-field">
              <span>Demo account</span>
              <select value={email} onChange={(event) => setEmail(event.target.value)}>
                {accounts.map((account) => (
                  <option value={account.email} key={account.email}>
                    {account.name} · {account.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Email address</span>
              <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="password-label">
                Password{' '}
                <a
                  href="#demo-credentials"
                  onClick={(event) => {
                    event.preventDefault();
                    setPassword(demoPassword);
                  }}
                >
                  Use demo password
                </a>
              </span>
              <span className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            {error && (
              <div className="login-error">
                <TriangleAlert size={15} />
                {error}
              </div>
            )}
            <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
              {busy ? <span className="mini-spinner" /> : <LockKeyhole size={16} />}
              {busy ? 'Signing in…' : 'Sign in securely'}
              <ArrowRight size={15} />
            </button>
            <div className="login-security-note">
              <ShieldCheck size={14} /> Your session is encrypted and role-scoped. {isStatic && 'Static mode stores data locally in your browser.'}
            </div>
          </form>
          <div className="login-demo-note" id="demo-credentials">
            <div>
              <Sparkles size={15} />
              <b>Demo accounts — always available</b>
            </div>
            <p>
              For evaluation and static deployment. Shared password: <code>{demoPassword}</code>
            </p>
            <div className="demo-account-grid">
              {accounts.map((account) => (
                <button
                  type="button"
                  key={account.email}
                  className={email === account.email ? 'selected' : ''}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(demoPassword);
                  }}
                >
                  <b>{account.name}</b>
                  <small>{account.email}</small>
                </button>
              ))}
            </div>
            {isStatic && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
                Static mode: data is stored in localStorage and works without backend. Deploy to Netlify/Vercel as static site.
              </div>
            )}
          </div>
          <p className="login-form-footer">Continuing means you agree to the MineGov demonstration environment policy.</p>
        </div>
      </section>
    </div>
  );
}
