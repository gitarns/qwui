import React from 'react';
import './Login.css';

const Login = () => {
    const handleLogin = () => {
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
