import React, { useEffect, useState } from 'react';
import { GameOverData, LeaderboardEntry } from '../types/game';

interface GameOverProps {
  gameOverData: GameOverData;
  myUserId: string;
  myName: string;
  onPlayAgain: () => void;
  fetchLeaderboard: () => Promise<LeaderboardEntry[]>;
}

export default function GameOver({ gameOverData, myUserId, myName, onPlayAgain, fetchLeaderboard }: GameOverProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const iWon = gameOverData.winner === myUserId;
  const isDraw = gameOverData.isDraw;

  useEffect(() => {
    fetchLeaderboard()
      .then(setLeaderboard)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchLeaderboard]);

  return (
    <div className="screen gameover-screen">
      <div className="card gameover-card">
        {/* Result banner */}
        <div className={`result-banner ${isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
          {isDraw ? (
            <>
              <span className="result-symbol">🤝</span>
              <span className="result-text">DRAW!</span>
            </>
          ) : iWon ? (
            <>
              <span className="result-symbol">{gameOverData.winnerSymbol}</span>
              <span className="result-text">WINNER! <span className="pts">+200 pts</span></span>
            </>
          ) : (
            <>
              <span className="result-symbol">{gameOverData.winnerSymbol}</span>
              <span className="result-text">
                {gameOverData.winnerName || 'Opponent'} wins
              </span>
            </>
          )}
        </div>

        {gameOverData.reason === 'timeout' && (
          <p className="reason-text">Time ran out!</p>
        )}

        {/* Leaderboard */}
        <div className="leaderboard">
          <h3 className="lb-title">Leaderboard</h3>
          <div className="lb-header">
            <span>Player</span>
            <span>Wins</span>
            <span>Score</span>
          </div>
          {loading ? (
            <p className="lb-loading">Loading...</p>
          ) : leaderboard.length === 0 ? (
            <p className="lb-empty">No records yet</p>
          ) : (
            leaderboard.map(entry => (
              <div
                key={entry.userId}
                className={`lb-row ${entry.userId === myUserId ? 'lb-me' : ''}`}
              >
                <span className="lb-rank">{entry.rank}.</span>
                <span className="lb-name">{entry.username || 'Player'} {entry.userId === myUserId ? '(you)' : ''}</span>
                <span className="lb-wins">{entry.wins}</span>
                <span className="lb-score">{entry.score * 100}</span>
              </div>
            ))
          )}
        </div>

        <button className="btn btn-primary play-again-btn" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
