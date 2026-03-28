import React from 'react';
import { GameMode } from '../types/game';

interface MenuProps {
  username: string;
  onFindMatch: (mode: GameMode) => void;
  loading: boolean;
}

export default function Menu({ username, onFindMatch, loading }: MenuProps) {
  return (
    <div className="screen menu-screen">
      <div className="card menu-card">
        <div className="logo">LILA</div>
        <h2 className="welcome-text">Welcome, <span className="accent">{username}</span></h2>
        <p className="subtitle">Choose your game mode</p>

        <div className="mode-buttons">
          <button
            className="btn btn-primary mode-btn"
            onClick={() => onFindMatch('classic')}
            disabled={loading}
          >
            <span className="mode-icon">♟</span>
            <span className="mode-name">Classic</span>
            <span className="mode-desc">No time limit</span>
          </button>

          <button
            className="btn btn-accent mode-btn"
            onClick={() => onFindMatch('timed')}
            disabled={loading}
          >
            <span className="mode-icon">⏱</span>
            <span className="mode-name">Timed</span>
            <span className="mode-desc">30s per move</span>
          </button>
        </div>

        {loading && <p className="status-text">Finding a match...</p>}
      </div>
    </div>
  );
}
