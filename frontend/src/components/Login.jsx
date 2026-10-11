import { useState } from 'react';
import { QwuiMark } from './Logo';
import './Login.css';

/*
 * Sign-in screen. OIDC is the only method: there are no local accounts, so
 * there is no form to fill in and the whole screen exists to carry one action.
 *
 * Deliberately no /logout call here. Logging out is a navigation to /logout,
 * which also ends the provider session (RP-initiated logout), so firing it from
 * this page would kill the session the user is about to create. The
 * localStorage and sessionStorage clearing that used to sit alongside it never
 * did anything either: the session lives in an HttpOnly cookie that JavaScript
 * cannot reach.
 */
const Login = ({ darkMode, onToggleTheme }) => {
  const [redirecting, setRedirecting] = useState(false);

  const handleLogin = () => {
    // The browser is about to leave; latching this stops a second click from
    // starting a competing authorisation request with a fresh state token.
    setRedirecting(true);
    // Hand the backend the page we are on, so the login comes back to it.
    // Without this a shared search link opened by someone signed out lost its
    // search: the callback always landed on "/".
    const { pathname, search, hash } = window.location;
    const returnTo = `${pathname}${search}${hash}`;
    window.location.href = returnTo === '/'
      ? '/login'
      : `/login?return_to=${encodeURIComponent(returnTo)}`;
  };

  return (
    <div className="login">
      {onToggleTheme && (
        <button
          type="button"
          className="login__theme qw-btn qw-btn--ghost qw-btn--icon"
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      )}

      <main className="login__card">
        <div className="login__brand">
          <QwuiMark size={40} />
          <span className="login__word">qwui</span>
        </div>

        <h1 className="login__title">Sign in</h1>
        <p className="login__subtitle">
          Continue with your organisation account to search and explore your
          Quickwit logs.
        </p>

        <button
          type="button"
          className="qw-btn qw-btn--primary qw-btn--lg qw-btn--block"
          onClick={handleLogin}
          disabled={redirecting}
        >
          {redirecting ? (
            'Redirecting...'
          ) : (
            <>
              <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Continue with SSO
            </>
          )}
        </button>

        <p className="login__note">
          You will be redirected to your identity provider.
        </p>
      </main>
    </div>
  );
};

export default Login;
