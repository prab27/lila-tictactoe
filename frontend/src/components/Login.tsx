import React, { useState } from 'react';

interface LoginProps {
  onLogin: (username: string) => Promise<void>;
  error: string;
  loading: boolean;
}

export default function Login({ onLogin, error, loading }: LoginProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length >= 2) onLogin(trimmed);
  };

  return (
    <div className="screen login-screen">
      <div className="card login-card">
        <div className="logo">LILA</div>
        <h1 className="game-title">Tic-Tac-Toe</h1>
        <p className="subtitle">Multiplayer · Real-time · Server-authoritative</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="input-label">Who are you?</label>
          <input
            className="text-input"
            type="text"
            placeholder="Enter your nickname"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="off"
          />
          {error && <p className="error-msg">{error}</p>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={name.trim().length < 2 || loading}
          >
            {loading ? 'Connecting...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
