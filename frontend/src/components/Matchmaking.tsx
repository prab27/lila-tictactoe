import React from 'react';

interface MatchmakingProps {
  onCancel: () => void;
  mode: string;
}

export default function Matchmaking({ onCancel, mode }: MatchmakingProps) {
  return (
    <div className="screen matchmaking-screen">
      <div className="card matchmaking-card">
        <div className="spinner-ring"></div>
        <h2 className="matching-title">Finding a random player...</h2>
        <p className="matching-sub">
          {mode === 'timed' ? 'Timed mode · 30s per move' : 'Classic mode'}
        </p>
        <p className="matching-hint">It usually takes 20 seconds.</p>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
