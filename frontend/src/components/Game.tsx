import React from 'react';
import { GameState, GameOverData } from '../types/game';

interface GameProps {
  gameState: GameState;
  myUserId: string;
  mySymbol: string;
  onMove: (position: number) => void;
  timerSeconds: number;
}

export default function Game({ gameState, myUserId, mySymbol, onMove, timerSeconds }: GameProps) {
  const { board, players, currentPlayerIndex, phase, timedMode } = gameState;

  const me = players.find(p => p.userId === myUserId);
  const opponent = players.find(p => p.userId !== myUserId);

  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.userId === myUserId;

  const timer = timedMode ? timerSeconds : null;
  const timerDanger = timer !== null && timer <= 10;

  const renderCell = (idx: number) => {
    const val = board[idx];
    const isEmpty = val === '';
    const clickable = isEmpty && isMyTurn && phase === 'playing';

    return (
      <button
        key={idx}
        className={`cell ${val ? 'cell-' + val.toLowerCase() : ''} ${clickable ? 'cell-clickable' : ''}`}
        onClick={() => clickable && onMove(idx)}
        disabled={!clickable}
        aria-label={`Cell ${idx + 1}: ${val || 'empty'}`}
      >
        {val && <span className="cell-mark">{val}</span>}
      </button>
    );
  };

  return (
    <div className="screen game-screen">
      {/* Player headers */}
      <div className="players-bar">
        <div className={`player-card ${isMyTurn ? 'active-player' : ''}`}>
          <span className="player-symbol">{mySymbol}</span>
          <span className="player-name">{me?.name || 'You'} (you)</span>
        </div>

        {timedMode && (
          <div className={`timer-circle ${timerDanger ? 'timer-danger' : ''}`}>
            <span className="timer-value">{timerSeconds}</span>
            <span className="timer-label">sec</span>
          </div>
        )}

        <div className={`player-card ${!isMyTurn ? 'active-player' : ''}`}>
          <span className="player-symbol">{opponent?.symbol || '?'}</span>
          <span className="player-name">{opponent?.name || 'Waiting...'} (opp)</span>
        </div>
      </div>

      {/* Turn indicator */}
      <div className={`turn-indicator ${isMyTurn ? 'your-turn' : 'their-turn'}`}>
        {phase === 'playing'
          ? isMyTurn ? 'Your turn' : `${currentPlayer?.name || 'Opponent'}'s turn`
          : 'Game over'}
      </div>

      {/* Board */}
      <div className="board">
        {board.map((_, idx) => renderCell(idx))}
      </div>
    </div>
  );
}
