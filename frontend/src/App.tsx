import React, { useState, useCallback, useRef } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import Login from './components/Login';
import Menu from './components/Menu';
import Matchmaking from './components/Matchmaking';
import Game from './components/Game';
import GameOver from './components/GameOver';
import { Screen, GameMode, GameState, GameOverData, LeaderboardEntry, OpCode } from './types/game';
import './App.css';

const NAKAMA_HOST = process.env.REACT_APP_NAKAMA_HOST || 'localhost';
const NAKAMA_PORT = process.env.REACT_APP_NAKAMA_PORT || '7350';
const NAKAMA_USE_SSL = process.env.REACT_APP_NAKAMA_SSL === 'true';
const NAKAMA_KEY  = process.env.REACT_APP_NAKAMA_KEY  || 'defaultkey';

const defaultGameState: GameState = {
  board: ['', '', '', '', '', '', '', '', ''],
  players: [],
  currentPlayerIndex: 0,
  phase: 'waiting',
  moveCount: 0,
  timedMode: false,
  timeRemaining: 30,
};

export default function App() {
  const [screen, setScreen]           = useState<Screen>('login');
  const [loginError, setLoginError]   = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [gameMode, setGameMode]       = useState<GameMode>('classic');

  const [myUserId, setMyUserId]     = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [mySymbol, setMySymbol]     = useState('X');
  const [matchId, setMatchId]       = useState('');

  const [gameState, setGameState]     = useState<GameState>(defaultGameState);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(30);

  const clientRef  = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef  = useRef<Socket | null>(null);
  const matchIdRef = useRef('');

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_USE_SSL, 60000, false);
    }
    return clientRef.current;
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (username: string) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const client = getClient();
      let deviceId = localStorage.getItem('ttt_deviceId');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
        localStorage.setItem('ttt_deviceId', deviceId);
      }

      const session = await client.authenticateDevice(deviceId, true, username);
      // update display name (snake_case field)
      await client.updateAccount(session, { display_name: username });
      sessionRef.current = session;
      setMyUserId(session.user_id || '');
      setMyUsername(username);

      // Connect WebSocket
      const socket = client.createSocket(NAKAMA_USE_SSL, false);
      socket.ondisconnect = () => {};   // handle silently
      await socket.connect(session, true);
      socketRef.current = socket;

      setScreen('menu');
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : null) || err?.statusText || `HTTP ${err?.status}` || 'Connection failed';
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  }, [getClient]);

  // ── Find / join match ─────────────────────────────────────────────
  const handleFindMatch = useCallback(async (mode: GameMode) => {
    setMenuLoading(true);
    setGameMode(mode);
    const socket  = socketRef.current;
    const session = sessionRef.current;
    const client  = getClient();
    if (!socket || !session) { setMenuLoading(false); return; }

    try {
      // Wakeup ping first in case Railway is cold-starting
      try { await fetch(`https://${NAKAMA_HOST}/healthcheck`); } catch (_) {}

      // RPC returns payload as a parsed object already
      const result = await client.rpc(session, 'find_match', { mode });
      const data   = result.payload as { matchId: string; mode: string };
      const foundMatchId = data.matchId;

      setMatchId(foundMatchId);
      matchIdRef.current = foundMatchId;
      setScreen('matchmaking');
      setGameState({ ...defaultGameState, timedMode: mode === 'timed' });

      // ── Socket handlers ──────────────────────────────────────────
      socket.onmatchdata = (matchData) => {
        const opCode = matchData.op_code;
        let payload: any = {};
        try {
          if (matchData.data && matchData.data.length > 0) {
            payload = JSON.parse(new TextDecoder().decode(matchData.data));
          }
        } catch (e) { console.warn('Parse error', e); }

        if (opCode === OpCode.MATCH_READY) {
          // wait for GAME_STATE
        } else if (opCode === OpCode.GAME_STATE) {
          const gs = payload as GameState;
          setGameState(gs);
          setTimerSeconds(gs.timeRemaining || 30);
          setScreen('game');
          // determine my symbol
          const me = gs.players?.find((p: any) => p.userId === session.user_id);
          if (me) setMySymbol(me.symbol);
        } else if (opCode === OpCode.TIMER_UPDATE) {
          setTimerSeconds(payload.timeRemaining ?? 0);
        } else if (opCode === OpCode.GAME_OVER) {
          setGameOverData(payload as GameOverData);
          setScreen('gameover');
        } else if (opCode === OpCode.OPPONENT_LEFT) {
          setGameOverData({
            board: [],
            winner: payload.winner,
            winnerSymbol: payload.winnerSymbol,
            winnerName: payload.winnerName,
            isDraw: false,
          });
          setScreen('gameover');
        } else if (opCode === OpCode.ERROR) {
          console.warn('Game error:', payload.message);
        }
      };

      socket.onmatchpresence = (presence) => {
        console.log('Presence update:', presence);
      };

      await socket.joinMatch(foundMatchId);
    } catch (err: any) {
      console.error('Find match error:', err);
      const msg = err?.message || (typeof err === 'string' ? err : null) || err?.statusText || (err?.status ? `HTTP ${err.status}` : null) || JSON.stringify(err) || 'Unknown error';
      alert('Failed to find match: ' + msg);
      setScreen('menu');
    } finally {
      setMenuLoading(false);
    }
  }, [getClient]);

  // ── Send move ─────────────────────────────────────────────────────
  const handleMove = useCallback((position: number) => {
    const socket = socketRef.current;
    const mid    = matchIdRef.current;
    if (!socket || !mid) return;
    const data = new TextEncoder().encode(JSON.stringify({ position }));
    socket.sendMatchState(mid, OpCode.MAKE_MOVE, data);
  }, []);

  // ── Cancel matchmaking ────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    const socket = socketRef.current;
    const mid    = matchIdRef.current;
    if (socket && mid) {
      try { await socket.leaveMatch(mid); } catch (e) {}
    }
    matchIdRef.current = '';
    setMatchId('');
    setScreen('menu');
  }, []);

  // ── Play again ────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(async () => {
    const socket = socketRef.current;
    const mid    = matchIdRef.current;
    if (socket && mid) {
      try { await socket.leaveMatch(mid); } catch (e) {}
    }
    matchIdRef.current = '';
    setMatchId('');
    setGameState(defaultGameState);
    setGameOverData(null);
    setScreen('menu');
  }, []);

  // ── Leaderboard ───────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (): Promise<LeaderboardEntry[]> => {
    try {
      const client  = getClient();
      const session = sessionRef.current;
      if (!session) return [];
      const result = await client.rpc(session, 'get_leaderboard', {});
      const data   = result.payload as { records: LeaderboardEntry[] };
      return data?.records || [];
    } catch (e) {
      return [];
    }
  }, [getClient]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="app">
      {screen === 'login'      && <Login onLogin={handleLogin} error={loginError} loading={loginLoading} />}
      {screen === 'menu'       && <Menu  username={myUsername} onFindMatch={handleFindMatch} loading={menuLoading} />}
      {screen === 'matchmaking'&& <Matchmaking onCancel={handleCancel} mode={gameMode} />}
      {screen === 'game'       && (
        <Game
          gameState={gameState}
          myUserId={myUserId}
          mySymbol={mySymbol}
          onMove={handleMove}
          timerSeconds={timerSeconds}
        />
      )}
      {screen === 'gameover' && gameOverData && (
        <GameOver
          gameOverData={gameOverData}
          myUserId={myUserId}
          myName={myUsername}
          onPlayAgain={handlePlayAgain}
          fetchLeaderboard={fetchLeaderboard}
        />
      )}
    </div>
  );
}
