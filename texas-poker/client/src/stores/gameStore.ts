import { create } from 'zustand';
import type {
  Card, GamePhase, Player, RoomListItem, TurnOptions,
  PlayerAction, HandResult, RoomSettings, FinalSettlementData,
} from '../types/game';

export interface DanmakuItem {
  id: number;
  nickname: string;
  text: string;
  color: string;
  isSpectator?: boolean;
}

export interface SpectatorPlayerHand {
  playerId: string;
  nickname: string;
  cards: Card[];
  isFolded: boolean;
}

interface GameState {
  connected: boolean;
  playerId: string | null;
  playerName: string;
  room: RoomListItem | null;
  inGame: boolean;
  /** 当前玩家是否是旁观者 */
  isSpectator: boolean;
  myCards: Card[];
  /** 旁观者视角下所有玩家的手牌 */
  spectatorHands: SpectatorPlayerHand[];
  communityCards: Card[];
  gamePhase: GamePhase;
  pot: number;
  currentPlayerId: string | null;
  turnOptions: TurnOptions | null;
  countdown: number;
  offlineCountdown: { playerId: string; seconds: number } | null;
  lastAction: { playerId: string; playerName: string; action: PlayerAction; amount: number } | null;
  handResult: HandResult | null;
  serverUrl: string;
  borrowRequest: { borrowCount: number; initialChips: number } | null;
  finalSettlement: FinalSettlementData | null;
  danmakus: DanmakuItem[];

  setConnected: (v: boolean) => void;
  setPlayerId: (id: string | null) => void;
  setPlayerName: (name: string) => void;
  setRoom: (room: RoomListItem | null) => void;
  setInGame: (v: boolean) => void;
  setIsSpectator: (v: boolean) => void;
  setOfflineCountdown: (data: { playerId: string; seconds: number } | null) => void;
  setMyCards: (cards: Card[]) => void;
  setSpectatorHands: (hands: SpectatorPlayerHand[]) => void;
  setCommunityCards: (cards: Card[]) => void;
  setGamePhase: (phase: GamePhase) => void;
  setPot: (pot: number) => void;
  setCurrentPlayerId: (id: string | null) => void;
  setTurnOptions: (options: TurnOptions | null) => void;
  setCountdown: (n: number) => void;
  setLastAction: (action: { playerId: string; playerName: string; action: PlayerAction; amount: number } | null) => void;
  setHandResult: (result: HandResult | null) => void;
  setServerUrl: (url: string) => void;
  setBorrowRequest: (req: { borrowCount: number; initialChips: number } | null) => void;
  setFinalSettlement: (data: FinalSettlementData | null) => void;
  addDanmaku: (danmaku: { nickname: string; text: string; color: string; isSpectator?: boolean }) => void;
  removeDanmaku: (id: number) => void;

  /**
   * 细粒度更新单玩家筹码：避免 action_result 时全量 setRoom 引发整树重渲染。
   * 仅修改 room.players 中对应玩家的 chips 字段，保持其他玩家对象引用不变。
   */
  updatePlayerChips: (playerId: string, chips: number) => void;
  /**
   * 细粒度更新游戏状态：仅修改 room.game 的部分字段，保持 room 引用尽量不变。
   * 传入 patch 对象，会被浅合并到 room.game。
   */
  updateGameState: (patch: {
    pot?: number;
    gamePlayers?: any[];
    betHistory?: any[];
    phase?: GamePhase;
  }) => void;

  reset: () => void;
}

let danmakuIdCounter = 0;

export const useGameStore = create<GameState>((set, get) => ({
  connected: false,
  playerId: localStorage.getItem('poker_player_id') || null,
  playerName: localStorage.getItem('poker_nickname') || '',
  room: null,
  inGame: false,
  isSpectator: false,
  myCards: [],
  spectatorHands: [],
  communityCards: [],
  gamePhase: 'waiting',
  pot: 0,
  currentPlayerId: null,
  turnOptions: null,
  countdown: 0,
  offlineCountdown: null,
  lastAction: null,
  handResult: null,
  serverUrl: localStorage.getItem('poker_server_url') || 'http://localhost:3001',
  borrowRequest: null,
  finalSettlement: null,
  danmakus: [],

  setConnected: (v) => set({ connected: v }),
  setPlayerId: (id) => {
    if (id) localStorage.setItem('poker_player_id', id);
    else localStorage.removeItem('poker_player_id');
    set({ playerId: id });
  },
  setPlayerName: (name) => {
    localStorage.setItem('poker_nickname', name);
    set({ playerName: name });
  },
  setRoom: (room) => {
    if (room) localStorage.setItem('poker_room_code', room.id);
    else localStorage.removeItem('poker_room_code');
    set({ room });
  },
  setInGame: (v) => set({ inGame: v }),
  setIsSpectator: (v) => set({ isSpectator: v }),
  setMyCards: (cards) => set({ myCards: cards }),
  setSpectatorHands: (hands) => set({ spectatorHands: hands }),
  setCommunityCards: (cards) => set({ communityCards: cards }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  setPot: (pot) => set({ pot }),
  setCurrentPlayerId: (id) => set({ currentPlayerId: id }),
  setTurnOptions: (options) => set({ turnOptions: options }),
  setCountdown: (n) => set({ countdown: n }),
  setOfflineCountdown: (data) => set({ offlineCountdown: data }),
  setLastAction: (action) => set({ lastAction: action }),
  setHandResult: (result) => set({ handResult: result }),
  setServerUrl: (url) => {
    localStorage.setItem('poker_server_url', url);
    set({ serverUrl: url });
  },
  setBorrowRequest: (req) => set({ borrowRequest: req }),
  setFinalSettlement: (data) => set({ finalSettlement: data }),
  addDanmaku: (danmaku) => {
    const id = ++danmakuIdCounter;
    const item: DanmakuItem = { id, ...danmaku };
    set((state) => ({ danmakus: [...state.danmakus.slice(-8), item] }));
    // 40 秒后移除（覆盖最大动画时长 36s + 缓冲，避免动画没飞完就被卸载）
    setTimeout(() => {
      useGameStore.getState().removeDanmaku(id);
    }, 40000);
  },
  removeDanmaku: (id) => set((state) => ({ danmakus: state.danmakus.filter(d => d.id !== id) })),

  // 细粒度更新单玩家筹码：仅替换命中玩家的对象，其他玩家引用保持不变
  // 这样 PlayerSeat 的 areEqual 才能识别"我没变"并跳过重渲染
  updatePlayerChips: (playerId, chips) => set((state) => {
    if (!state.room) return {};
    let changed = false;
    const newPlayers = state.room.players.map(p => {
      if (p.id === playerId) {
        if (p.chips !== chips) changed = true;
        return { ...p, chips };
      }
      return p;
    });
    if (!changed) return {};
    return { room: { ...state.room, players: newPlayers } };
  }),

  // 细粒度更新游戏状态：仅修改指定字段，其他字段保持引用不变
  updateGameState: (patch) => set((state) => {
    if (!state.room || !state.room.game) return {};
    const oldGame = state.room.game;
    const newGame = { ...oldGame };
    let changed = false;
    if (patch.pot !== undefined && patch.pot !== oldGame.pot) { newGame.pot = patch.pot; changed = true; }
    if (patch.gamePlayers !== undefined) { newGame.players = patch.gamePlayers; changed = true; }
    if (patch.betHistory !== undefined) { newGame.betHistory = patch.betHistory; changed = true; }
    if (patch.phase !== undefined && patch.phase !== oldGame.phase) { newGame.phase = patch.phase; changed = true; }
    if (!changed) return {};
    return { room: { ...state.room, game: newGame } };
  }),

  reset: () => {
    localStorage.removeItem('poker_player_id');
    localStorage.removeItem('poker_room_code');
    const { connected, serverUrl } = get();
    set({
      // 保留 connected 和 serverUrl：由 socket 的 connect/disconnect 事件管理，
      // 避免 reset 把已连接的 socket 状态错误地标记为断开
      connected,
      serverUrl,
      playerId: null,
      room: null,
      inGame: false,
      isSpectator: false,
      myCards: [],
      spectatorHands: [],
      communityCards: [],
      gamePhase: 'waiting',
      pot: 0,
      currentPlayerId: null,
      turnOptions: null,
      countdown: 0,
      offlineCountdown: null,
      lastAction: null,
      handResult: null,
      borrowRequest: null,
      finalSettlement: null,
      danmakus: [],
    });
  },
}));
