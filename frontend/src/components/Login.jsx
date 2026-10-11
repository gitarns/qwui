import { useEffect } from 'react';
import './Login.css';

const Login = () => {
    useEffect(() => {
        // Clear any cached login data on page load
        localStorage.removeItem('auth_token');
        localStorage.removeItem('oidc_state');
        sessionStorage.clear();

        // Clear session cookies by calling logout endpoint
        fetch('/logout', { method: 'GET' }).catch(() => {
            // Silently fail if logout endpoint fails
        });
    }, []);

    const handleLogin = async () => {
        // Clear any cached login data before initiating login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('oidc_state');
        sessionStorage.clear();

        // Call logout to clear session cookies before starting new login
        try {
            await fetch('/logout', { method: 'GET' });
        } catch (error) {
            console.error('Failed to clear session:', error);
        }

        // Redirect to login after clearing data, handing the backend the page
        // we are on so the login comes back to it. Without this a shared
        // search link opened by someone signed out lost its search: the
        // callback always landed on "/".
        const { pathname, search, hash } = window.location;
        const returnTo = `${pathname}${search}${hash}`;
        window.location.href = returnTo === '/'
            ? '/login'
            : `/login?return_to=${encodeURIComponent(returnTo)}`;
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>Quickwit UI</h1>
                    <p>Please sign in to continue</p>
                </div>
                <button className="login-button" onClick={handleLogin}>
                    Sign in with SSO
                </button>
            </div>
        </div>
    );
};

export default Login;
