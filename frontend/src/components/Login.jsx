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

        // Redirect to login after clearing data
        window.location.href = '/login';
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
