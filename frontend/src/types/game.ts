export type Screen = 'login' | 'menu' | 'matchmaking' | 'game' | 'gameover';
export type GameMode = 'classic' | 'timed';
export type Symbol = 'X' | 'O' | '';

export interface PlayerInfo {
  userId: string;
  symbol: string;
  name: string;
}

export interface GameState {
  board: string[];
  players: PlayerInfo[];
  currentPlayerIndex: number;
  phase: string;
  moveCount: number;
  timedMode: boolean;
  timeRemaining: number;
}

export interface GameOverData {
  board: string[];
  winner: string | null;
  winnerSymbol: string | null;
  winnerName: string | null;
  isDraw: boolean;
  reason?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  wins: number;
  score: number;
}

export const OpCode = {
  MAKE_MOVE: 1,
  GAME_STATE: 2,
  GAME_OVER: 3,
  TIMER_UPDATE: 4,
  ERROR: 5,
  OPPONENT_LEFT: 6,
  MATCH_READY: 7,
};
