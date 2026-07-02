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
}

interface GameState {
  connected: boolean;
  playerId: string | null;
  playerName: string;
  room: RoomListItem | null;
  inGame: boolean;
  myCards: Card[];
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
  setOfflineCountdown: (data: { playerId: string; seconds: number } | null) => void;
  setMyCards: (cards: Card[]) => void;
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
  addDanmaku: (danmaku: { nickname: string; text: string; color: string }) => void;
  removeDanmaku: (id: number) => void;
  reset: () => void;
}

let danmakuIdCounter = 0;

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  playerId: localStorage.getItem('poker_player_id') || null,
  playerName: localStorage.getItem('poker_nickname') || '',
  room: null,
  inGame: false,
  myCards: [],
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
  setMyCards: (cards) => set({ myCards: cards }),
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
    // 6秒后移除
    setTimeout(() => {
      useGameStore.getState().removeDanmaku(id);
    }, 6000);
  },
  removeDanmaku: (id) => set((state) => ({ danmakus: state.danmakus.filter(d => d.id !== id) })),
  reset: () => {
    localStorage.removeItem('poker_player_id');
    localStorage.removeItem('poker_room_code');
    set({
      connected: false,
      playerId: null,
      room: null,
      inGame: false,
      myCards: [],
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
