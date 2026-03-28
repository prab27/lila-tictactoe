import React, { useState, useEffect, useCallback, useRef } from 'react';
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
const NAKAMA_KEY = process.env.REACT_APP_NAKAMA_KEY || 'defaultkey';

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
  const [screen, setScreen] = useState<Screen>('login');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('classic');

  const [myUserId, setMyUserId] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [mySymbol, setMySymbol] = useState('X');
  const [matchId, setMatchId] = useState('');

  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(30);

  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_USE_SSL, 7000, false);
    }
    return clientRef.current;
  }, []);

  // Authenticate user with Nakama
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
      await client.updateAccount(session, { displayName: username });
      sessionRef.current = session;
      setMyUserId(session.user_id || '');
      setMyUsername(username);

      // Connect socket
      const socket = client.createSocket(NAKAMA_USE_SSL, false);
      await socket.connect(session, true);
      socketRef.current = socket;

      setScreen('menu');
    } catch (err: any) {
      setLoginError(err?.message || 'Connection failed. Check Nakama server.');
    } finally {
      setLoginLoading(false);
    }
  }, [getClient]);

  // Find or create match
  const handleFindMatch = useCallback(async (mode: GameMode) => {
    setMenuLoading(true);
    setGameMode(mode);
    try {
      const client = getClient();
      const session = sessionRef.current;
      if (!session) throw new Error('Not authenticated');

      const result = await client.rpcGet(session, 'find_match', JSON.stringify({ mode }));
      const data = JSON.parse(result.payload as string);
      const foundMatchId: string = data.matchId;

      setMatchId(foundMatchId);
      setScreen('matchmaking');
      setGameState({ ...defaultGameState, timedMode: mode === 'timed' });

      // Join the match via socket
      const socket = socketRef.current;
      if (!socket) throw new Error('Socket not connected');

      // Register socket handlers
      socket.onmatchdata = (matchData) => {
        const opCode = matchData.op_code;
        let payload: any = {};
        try {
          if (matchData.data) {
            const text = new TextDecoder().decode(matchData.data as ArrayBuffer);
            payload = JSON.parse(text);
          }
        } catch (e) {}

        if (opCode === OpCode.MATCH_READY) {
          // Match started, stay in matchmaking until GAME_STATE
        } else if (opCode === OpCode.GAME_STATE) {
          setGameState(payload as GameState);
          setTimerSeconds(payload.timeRemaining || 30);
          setScreen('game');

          // Determine my symbol
          const me = (payload as GameState).players?.find((p: any) => p.userId === session.user_id);
          if (me) setMySymbol(me.symbol);
        } else if (opCode === OpCode.TIMER_UPDATE) {
          setTimerSeconds(payload.timeRemaining || 0);
        } else if (opCode === OpCode.GAME_OVER) {
          setGameOverData(payload as GameOverData);
          setScreen('gameover');
        } else if (opCode === OpCode.OPPONENT_LEFT) {
          setGameOverData({
            board: gameState.board,
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
      setMenuLoading(false);
      setScreen('menu');
      alert('Failed to find match: ' + (err?.message || 'Unknown error'));
    } finally {
      setMenuLoading(false);
    }
  }, [getClient, gameState.board]);

  // Send move to server
  const handleMove = useCallback((position: number) => {
    const socket = socketRef.current;
    if (!socket || !matchId) return;

    const data = new TextEncoder().encode(JSON.stringify({ position }));
    socket.sendMatchState(matchId, OpCode.MAKE_MOVE, data);
  }, [matchId]);

  // Cancel matchmaking
  const handleCancel = useCallback(async () => {
    const socket = socketRef.current;
    if (socket && matchId) {
      try {
        await socket.leaveMatch(matchId);
      } catch (e) {}
    }
    setMatchId('');
    setScreen('menu');
  }, [matchId]);

  // Play again - go back to menu
  const handlePlayAgain = useCallback(async () => {
    const socket = socketRef.current;
    if (socket && matchId) {
      try {
        await socket.leaveMatch(matchId);
      } catch (e) {}
    }
    setMatchId('');
    setGameState(defaultGameState);
    setGameOverData(null);
    setScreen('menu');
  }, [matchId]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async (): Promise<LeaderboardEntry[]> => {
    try {
      const client = getClient();
      const session = sessionRef.current;
      if (!session) return [];
      const result = await client.rpcGet(session, 'get_leaderboard', undefined);
      const data = JSON.parse(result.payload as string);
      return data.records || [];
    } catch (e) {
      return [];
    }
  }, [getClient]);

  return (
    <div className="app">
      {screen === 'login' && (
        <Login onLogin={handleLogin} error={loginError} loading={loginLoading} />
      )}
      {screen === 'menu' && (
        <Menu username={myUsername} onFindMatch={handleFindMatch} loading={menuLoading} />
      )}
      {screen === 'matchmaking' && (
        <Matchmaking onCancel={handleCancel} mode={gameMode} />
      )}
      {screen === 'game' && (
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
