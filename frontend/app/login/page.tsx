'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

const AUTH_CSS = `
.v4-auth {
  min-height: 100vh;
  background:
    radial-gradient(900px 500px at 50% -8%, rgba(255,46,107,.18), transparent 60%),
    radial-gradient(700px 400px at 85% 110%, rgba(255,122,24,.14), transparent 60%),
    var(--s-0);
  color: var(--ink);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px 60px;
}
.v4-auth .brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  margin-bottom: 28px;
}
.v4-auth .brand .logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--amber), var(--pink));
  box-shadow: 0 8px 24px rgba(255,46,107,.35);
  display: grid;
  place-items: center;
  color: #0a0508;
  font-weight: 800;
  font-family: var(--font-display);
  font-size: 18px;
}
.v4-auth .brand .wordmark {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.v4-auth .auth-card {
  width: 100%;
  max-width: 440px;
  background: var(--s-1);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px;
  padding: 32px 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
}
.v4-auth .auth-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}
.v4-auth .auth-sub {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 22px;
}
.v4-auth .field {
  display: block;
  margin-bottom: 14px;
}
.v4-auth .field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  margin-bottom: 6px;
}
.v4-auth .field .hint {
  color: var(--muted);
  font-weight: 400;
  font-size: 12px;
}
.v4-auth .input {
  width: 100%;
  padding: 12px 14px;
  background: rgba(0,0,0,.32);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 12px;
  color: var(--ink);
  font-size: 14px;
  font-family: inherit;
  transition: border-color .15s ease, box-shadow .15s ease;
  min-height: 44px;
}
.v4-auth .input:focus {
  outline: none;
  border-color: var(--amber);
  box-shadow: 0 0 0 3px rgba(255,122,24,.18);
}
.v4-auth .input::placeholder {
  color: var(--muted);
}
.v4-auth .pwd-wrap { position: relative; }
.v4-auth .pwd-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  color: var(--muted);
  cursor: pointer;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.v4-auth .pwd-toggle:hover { color: var(--ink); }
.v4-auth .forgot {
  text-align: right;
  margin: -6px 0 14px;
}
.v4-auth .forgot a {
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}
.v4-auth .forgot a:hover { color: var(--amber); }
.v4-auth .alert {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.4;
}
.v4-auth .alert-error {
  background: rgba(239,68,68,.08);
  border: 1px solid rgba(239,68,68,.3);
  color: #fca5a5;
}
.v4-auth .alert-success {
  background: rgba(34,197,94,.08);
  border: 1px solid rgba(34,197,94,.3);
  color: #86efac;
}
.v4-auth .resend-box {
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
}
.v4-auth .resend-box .label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 10px;
  color: var(--ink);
}
.v4-auth .btn-submit {
  width: 100%;
  margin-top: 6px;
  padding: 14px;
  font-size: 14px;
  font-weight: 600;
  min-height: 48px;
}
.v4-auth .btn-resend {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  font-size: 13px;
}
.v4-auth .divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 22px 0;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.v4-auth .divider::before,
.v4-auth .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,.08);
}
.v4-auth .oauth-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.v4-auth .oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 12px;
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s ease;
  min-height: 44px;
}
.v4-auth .oauth-btn:hover {
  background: rgba(255,255,255,.04);
  border-color: rgba(255,255,255,.18);
}
.v4-auth .auth-footer {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  margin-top: 22px;
}
.v4-auth .auth-footer a {
  color: var(--amber);
  text-decoration: none;
  font-weight: 500;
}
.v4-auth .auth-footer a:hover { color: var(--pink); }
.v4-auth .spinner-inline {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,.25);
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
`;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setLoading(true);
      const provider = params.has('state') ? 'spotify' : 'google';
      const oauthUrl = `${API_URL}/auth/oauth/${provider}`;
      fetch(oauthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: `${window.location.origin}/login` }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.access_token) {
            localStorage.setItem('trackcue_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('trackcue_refresh', data.refresh_token);
            router.push('/dashboard');
          } else {
            setError(data.detail || 'OAuth échoué');
            setLoading(false);
          }
        })
        .catch(() => { setError('Erreur OAuth'); setLoading(false); });
      window.history.replaceState({}, '', '/login');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedsVerification(false);
    setResendDone(false);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 403) {
        setNeedsVerification(true);
        if (username.includes('@')) setResendEmail(username);
        setError('Email non vérifié. Entre ton email ci-dessous pour recevoir un nouveau lien.');
      } else {
        const msg = e.message || '';
        const translated = msg.includes('Invalid') || msg.includes('invalid')
          ? 'Identifiant ou mot de passe incorrect'
          : msg || 'Connexion échouée';
        setError(translated);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification(e: FormEvent) {
    e.preventDefault();
    setResendLoading(true);
    try {
      await fetch(`${API_URL}/auth/resend-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
    } catch {
      // silencieux
    } finally {
      setResendLoading(false);
      setResendDone(true);
    }
  }

  return (
    <>
      <link rel="stylesheet" href="/v4/shared.css?v=20260422d" />
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <div className="v4-auth">
        <Link href="/" className="brand">
          <span className="logo">T</span>
          <span className="wordmark">TrackCue</span>
        </Link>

        <div className="auth-card">
          <h1 className="auth-title">Se connecter</h1>
          <p className="auth-sub">Bienvenue. Entre tes identifiants pour continuer.</p>

          {error && (
            <div className="alert alert-error" role="alert">{error}</div>
          )}

          {needsVerification && !resendDone && (
            <form onSubmit={handleResendVerification} className="resend-box">
              <div className="label">Renvoyer le lien de vérification</div>
              <input
                type="email"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                placeholder="ton@email.com"
                required
                aria-label="Adresse email pour renvoyer le lien"
                className="input"
              />
              <button
                type="submit"
                disabled={resendLoading}
                className="btn btn-ghost btn-resend"
              >
                {resendLoading ? (
                  <><span className="spinner-inline" />Envoi…</>
                ) : 'Envoyer le lien'}
              </button>
            </form>
          )}
          {resendDone && (
            <div className="alert alert-success">
              Lien envoyé ! Vérifie ta boîte de réception (et les spams).
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="username">Email ou pseudo</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ton@email.com ou ton_pseudo"
                required
                autoComplete="username"
                autoFocus
                aria-required="true"
                className="input"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <div className="pwd-wrap">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  aria-required="true"
                  className="input"
                  style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="pwd-toggle"
                >
                  {showPwd ? 'Masquer' : 'Voir'}
                </button>
              </div>
            </div>

            <div className="forgot">
              <Link href="/forgot-password">Mot de passe oublié ?</Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-submit"
            >
              {loading ? (
                <><span className="spinner-inline" />Connexion…</>
              ) : 'Se connecter'}
            </button>
          </form>

          <div className="divider">ou continuer avec</div>

          <div className="oauth-grid">
            <button
              type="button"
              onClick={() => {
                const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                if (!clientId) { setError('Google OAuth non configuré'); return; }
                const redirect = `${window.location.origin}/login`;
                window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile&access_type=offline`;
              }}
              className="oauth-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => {
                const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
                if (!clientId) { setError('Spotify OAuth non configuré'); return; }
                const redirect = `${window.location.origin}/login`;
                window.location.href = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=user-read-email%20user-read-private`;
              }}
              className="oauth-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              Spotify
            </button>
          </div>
        </div>

        <p className="auth-footer">
          Pas encore de compte ?{' '}
          <Link href="/register">S&apos;inscrire gratuitement</Link>
        </p>
      </div>
    </>
  );
}
