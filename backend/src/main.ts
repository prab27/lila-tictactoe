// Nakama TypeScript Runtime - Multiplayer Tic-Tac-Toe
// Server-authoritative game with matchmaking, leaderboard, and timer support

const OpCode = {
  MAKE_MOVE: 1,
  GAME_STATE: 2,
  GAME_OVER: 3,
  TIMER_UPDATE: 4,
  ERROR: 5,
  OPPONENT_LEFT: 6,
  MATCH_READY: 7,
};

const LEADERBOARD_ID = "global_wins";
const LEADERBOARD_WINS_ID = "global_wins";
const TICK_RATE = 1;
const TURN_TIME_LIMIT = 30;
const GAME_OVER_WAIT_TICKS = 5;
const MAX_EMPTY_TICKS = 120;

interface Player {
  userId: string;
  sessionId: string;
  symbol: string; // 'X' or 'O'
  name: string;
}

interface MatchState {
  board: string[];
  players: { [sessionId: string]: Player };
  playerOrder: string[];
  currentPlayerIndex: number;
  moveCount: number;
  winner: string | null;
  winnerSymbol: string | null;
  winnerName: string | null;
  isDraw: boolean;
  phase: string; // 'waiting' | 'playing' | 'game_over'
  timedMode: boolean;
  turnTimeLimit: number;
  timeRemaining: number;
  gameOverTicks: number;
  emptyTicks: number;
}

function checkWinner(board: string[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function buildGameStateMsg(state: MatchState): object {
  const playersArr = state.playerOrder.map(sid => {
    const p = state.players[sid];
    return p ? { userId: p.userId, symbol: p.symbol, name: p.name } : null;
  }).filter(Boolean);

  return {
    board: state.board,
    players: playersArr,
    currentPlayerIndex: state.currentPlayerIndex,
    phase: state.phase,
    moveCount: state.moveCount,
    timedMode: state.timedMode,
    timeRemaining: state.timeRemaining,
  };
}

function buildGameOverMsg(state: MatchState): object {
  return {
    board: state.board,
    winner: state.winner,
    winnerSymbol: state.winnerSymbol,
    winnerName: state.winnerName,
    isDraw: state.isDraw,
    phase: state.phase,
  };
}

const matchInit: nkruntime.MatchInitFunction = function(ctx, logger, nk, params) {
  const timedMode = (params && params["mode"] === "timed") ? true : false;
  const state: MatchState = {
    board: ["", "", "", "", "", "", "", "", ""],
    players: {},
    playerOrder: [],
    currentPlayerIndex: 0,
    moveCount: 0,
    winner: null,
    winnerSymbol: null,
    winnerName: null,
    isDraw: false,
    phase: "waiting",
    timedMode: timedMode,
    turnTimeLimit: TURN_TIME_LIMIT,
    timeRemaining: TURN_TIME_LIMIT,
    gameOverTicks: 0,
    emptyTicks: 0,
  };

  const label = JSON.stringify({ timedMode: timedMode, open: true });

  logger.info("TicTacToe match initialized, timedMode=%v", timedMode);
  return { state: state, tickRate: TICK_RATE, label: label };
};

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState, presence, metadata) {
  if (state.phase !== "waiting") {
    return { state: state, accept: false, rejectMessage: "Match already in progress" };
  }
  if (state.playerOrder.length >= 2) {
    return { state: state, accept: false, rejectMessage: "Match is full" };
  }
  // Check not already in match
  for (const sid of state.playerOrder) {
    if (state.players[sid] && state.players[sid].userId === presence.userId) {
      return { state: state, accept: false, rejectMessage: "Already in match" };
    }
  }
  return { state: state, accept: true };
};

const matchJoin: nkruntime.MatchJoinFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState, presences) {
  for (const presence of presences) {
    const symbol = state.playerOrder.length === 0 ? "X" : "O";
    const name = (presence as any).username || ("Player " + (state.playerOrder.length + 1));
    const player: Player = {
      userId: presence.userId,
      sessionId: presence.sessionId,
      symbol: symbol,
      name: name,
    };
    state.players[presence.sessionId] = player;
    state.playerOrder.push(presence.sessionId);
    logger.info("Player joined: %v as %v", presence.userId, symbol);
  }

  if (state.playerOrder.length === 2) {
    state.phase = "playing";
    state.timeRemaining = state.turnTimeLimit;

    const label = JSON.stringify({ timedMode: state.timedMode, open: false });
    dispatcher.matchLabelUpdate(label);

    // Broadcast match ready + game state
    const gameStateMsg = buildGameStateMsg(state);
    dispatcher.broadcastMessage(OpCode.MATCH_READY, JSON.stringify({ message: "Match started!" }), null, null, true);
    dispatcher.broadcastMessage(OpCode.GAME_STATE, JSON.stringify(gameStateMsg), null, null, true);
    logger.info("Match started with 2 players");
  }

  return { state: state };
};

const matchLeave: nkruntime.MatchLeaveFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState, presences) {
  for (const presence of presences) {
    logger.info("Player left: %v", presence.userId);

    if (state.phase === "playing") {
      // Other player wins by forfeit
      let remainingSessionId: string | undefined;
      for (let i = 0; i < state.playerOrder.length; i++) {
        if (state.playerOrder[i] !== presence.sessionId) { remainingSessionId = state.playerOrder[i]; break; }
      }
      if (remainingSessionId && state.players[remainingSessionId]) {
        const winner = state.players[remainingSessionId];
        state.winner = winner.userId;
        state.winnerSymbol = winner.symbol;
        state.winnerName = winner.name;
        state.isDraw = false;
        state.phase = "game_over";

        const msg = { message: "Opponent disconnected. You win!", winner: winner.userId, winnerName: winner.name, winnerSymbol: winner.symbol, isDraw: false };
        const remainingPresences = state.playerOrder
          .filter(sid => sid !== presence.sessionId && state.players[sid])
          .map(sid => state.players[sid]);

        dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, JSON.stringify(msg), null, null, true);

        // Update leaderboard
        try {
          nk.leaderboardRecordWrite(LEADERBOARD_WINS_ID, winner.userId, winner.name, 1, 0, {});
        } catch (e) {
          logger.warn("Failed to write leaderboard: %v", e);
        }
      }
    }

    // Remove player
    delete state.players[presence.sessionId];
    const idx = state.playerOrder.indexOf(presence.sessionId);
    if (idx > -1) state.playerOrder.splice(idx, 1);
  }

  return { state: state };
};

const matchLoop: nkruntime.MatchLoopFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState, messages) {
  // Handle empty match cleanup
  if (state.playerOrder.length === 0) {
    state.emptyTicks++;
    if (state.emptyTicks > MAX_EMPTY_TICKS) {
      logger.info("Empty match terminating");
      return null;
    }
    return { state: state };
  }

  // Handle game over phase
  if (state.phase === "game_over") {
    state.gameOverTicks++;
    if (state.gameOverTicks >= GAME_OVER_WAIT_TICKS) {
      logger.info("Game over, terminating match");
      return null;
    }
    return { state: state };
  }

  // Process incoming messages
  for (const msg of messages) {
    if (msg.opCode !== OpCode.MAKE_MOVE) continue;

    const senderSessionId = msg.sender.sessionId;
    const player = state.players[senderSessionId];

    if (!player) {
      logger.warn("Message from unknown player %v", senderSessionId);
      continue;
    }

    if (state.phase !== "playing") {
      dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: "Game is not in progress" }), [msg.sender], null, true);
      continue;
    }

    // Validate it's this player's turn
    const currentSessionId = state.playerOrder[state.currentPlayerIndex];
    if (senderSessionId !== currentSessionId) {
      dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: "Not your turn" }), [msg.sender], null, true);
      continue;
    }

    // Parse move
    let moveData: { position: number };
    try {
      moveData = JSON.parse(nk.binaryToString(msg.data));
    } catch (e) {
      dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: "Invalid move data" }), [msg.sender], null, true);
      continue;
    }

    const position = moveData.position;
    if (position < 0 || position > 8 || state.board[position] !== "") {
      dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: "Invalid position" }), [msg.sender], null, true);
      continue;
    }

    // Apply move
    state.board[position] = player.symbol;
    state.moveCount++;

    // Reset timer
    state.timeRemaining = state.turnTimeLimit;

    // Check for winner
    const winSymbol = checkWinner(state.board);
    if (winSymbol) {
      state.winner = player.userId;
      state.winnerSymbol = winSymbol;
      state.winnerName = player.name;
      state.isDraw = false;
      state.phase = "game_over";

      const gameOverMsg = buildGameOverMsg(state);
      dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify(gameOverMsg), null, null, true);

      // Update leaderboards
      try {
        // Winner gets +1 win
        nk.leaderboardRecordWrite(LEADERBOARD_WINS_ID, player.userId, player.name, 1, 0, {});
      } catch (e) {
        logger.warn("Leaderboard write failed: %v", e);
      }

      logger.info("Game over - winner: %v (%v)", player.name, winSymbol);
      return { state: state };
    }

    // Check for draw
    if (state.moveCount === 9) {
      state.isDraw = true;
      state.phase = "game_over";
      state.winner = null;
      state.winnerSymbol = null;
      state.winnerName = null;

      const gameOverMsg = buildGameOverMsg(state);
      dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify(gameOverMsg), null, null, true);
      logger.info("Game over - draw");
      return { state: state };
    }

    // Advance turn
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % 2;
    state.timeRemaining = state.turnTimeLimit;

    const gameStateMsg = buildGameStateMsg(state);
    dispatcher.broadcastMessage(OpCode.GAME_STATE, JSON.stringify(gameStateMsg), null, null, true);
  }

  // Timer logic (timed mode)
  if (state.phase === "playing" && state.timedMode) {
    state.timeRemaining--;

    // Broadcast timer update every second
    dispatcher.broadcastMessage(OpCode.TIMER_UPDATE, JSON.stringify({ timeRemaining: state.timeRemaining }), null, null, true);

    if (state.timeRemaining <= 0) {
      // Current player forfeits - other player wins
      const currentSessionId = state.playerOrder[state.currentPlayerIndex];
      const otherIndex = (state.currentPlayerIndex + 1) % 2;
      const otherSessionId = state.playerOrder[otherIndex];
      const winner = otherSessionId ? state.players[otherSessionId] : null;

      if (winner) {
        state.winner = winner.userId;
        state.winnerSymbol = winner.symbol;
        state.winnerName = winner.name;
      } else {
        state.isDraw = true;
      }
      state.phase = "game_over";

      const gameOverMsg = buildGameOverMsg(state);
      const timeoutMsg = { board: (gameOverMsg as any).board, winner: (gameOverMsg as any).winner, winnerSymbol: (gameOverMsg as any).winnerSymbol, winnerName: (gameOverMsg as any).winnerName, isDraw: (gameOverMsg as any).isDraw, phase: (gameOverMsg as any).phase, reason: "timeout" };
      dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify(timeoutMsg), null, null, true);

      if (winner) {
        try {
          nk.leaderboardRecordWrite(LEADERBOARD_WINS_ID, winner.userId, winner.name, 1, 0, {});
        } catch (e) {
          logger.warn("Leaderboard write failed: %v", e);
        }
      }
      logger.info("Game over - timeout, winner: %v", winner ? winner.name : "draw");
    }
  }

  return { state: state };
};

const matchTerminate: nkruntime.MatchTerminateFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState, graceSeconds) {
  logger.info("Match terminating");
  dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify({ message: "Match terminated" }), null, null, true);
  return { state: state };
};

const matchSignal: nkruntime.MatchSignalFunction = function(ctx, logger, nk, dispatcher, tick, state: MatchState) {
  return { state: state };
};

// RPC: Create a new match
const rpcCreateMatch: nkruntime.RpcFunction = function(ctx, logger, nk, payload) {
  let mode = "classic";
  if (payload) {
    try {
      const data = JSON.parse(payload);
      if (data.mode) mode = data.mode;
    } catch (e) {}
  }

  const matchId = nk.matchCreate("tictactoe", { mode: mode });
  logger.info("Created match %v (mode=%v)", matchId, mode);
  return JSON.stringify({ matchId: matchId, mode: mode });
};

// RPC: Find an open match or create one
const rpcFindMatch: nkruntime.RpcFunction = function(ctx, logger, nk, payload) {
  let mode = "classic";
  if (payload) {
    try {
      const data = JSON.parse(payload);
      if (data.mode) mode = data.mode;
    } catch (e) {}
  }

  const timedMode = mode === "timed";
  const query = "+label.open:T +label.timedMode:" + timedMode;

  let matches: nkruntime.Match[] = [];
  try {
    matches = nk.matchList(10, true, null, null, 1, query);
  } catch (e) {
    logger.warn("Match list error: %v", e);
  }

  let matchId: string;
  if (matches.length > 0) {
    matchId = matches[0].matchId;
    logger.info("Found existing match %v", matchId);
  } else {
    matchId = nk.matchCreate("tictactoe", { mode: mode });
    logger.info("Created new match %v (mode=%v)", matchId, mode);
  }

  return JSON.stringify({ matchId: matchId, mode: mode });
};

// RPC: Get leaderboard
const rpcGetLeaderboard: nkruntime.RpcFunction = function(ctx, logger, nk, payload) {
  try {
    const records = nk.leaderboardRecordsList(LEADERBOARD_WINS_ID, [], 10, null, 0);
    const result = {
      records: (records.records || []).map((r, idx) => ({
        rank: idx + 1,
        userId: r.ownerId,
        username: r.username,
        wins: r.score,
        score: r.score,
      })),
    };
    return JSON.stringify(result);
  } catch (e) {
    logger.warn("Get leaderboard error: %v", e);
    return JSON.stringify({ records: [] });
  }
};

// Module entry point
const InitModule: nkruntime.InitModule = function(ctx, logger, nk, initializer) {
  // Register match handler
  initializer.registerMatch("tictactoe", {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });

  // Register RPC functions
  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_match", rpcFindMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);

  // Create leaderboard (ignore if already exists)
  try {
    nk.leaderboardCreate(LEADERBOARD_WINS_ID, false, nkruntime.SortOrder.DESCENDING, nkruntime.Operator.INCREMENTAL, "0 0 * * 1 *", {});
  } catch (e) {
    logger.info("Leaderboard already exists or error: %v", e);
  }

  logger.info("Lila TicTacToe module loaded successfully");
};
