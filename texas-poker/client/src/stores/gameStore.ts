import { create } from 'zustand';
import type {
  Card, GamePhase, Player, RoomListItem, TurnOptions,
  PlayerAction, HandResult, RoomSettings, FinalSettlementData,
} from '../types/game';

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
  lastAction: { playerId: string; playerName: string; action: PlayerAction; amount: number } | null;
  handResult: HandResult | null;
  serverUrl: string;
  borrowRequest: { borrowCount: number; initialChips: number } | null;
  finalSettlement: FinalSettlementData | null;

  setConnected: (v: boolean) => void;
  setPlayerId: (id: string | null) => void;
  setPlayerName: (name: string) => void;
  setRoom: (room: RoomListItem | null) => void;
  setInGame: (v: boolean) => void;
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
  reset: () => void;
}

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
  lastAction: null,
  handResult: null,
  serverUrl: localStorage.getItem('poker_server_url') || 'http://localhost:3001',
  borrowRequest: null,
  finalSettlement: null,

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
  setLastAction: (action) => set({ lastAction: action }),
  setHandResult: (result) => set({ handResult: result }),
  setServerUrl: (url) => {
    localStorage.setItem('poker_server_url', url);
    set({ serverUrl: url });
  },
  setBorrowRequest: (req) => set({ borrowRequest: req }),
  setFinalSettlement: (data) => set({ finalSettlement: data }),
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
      lastAction: null,
      handResult: null,
      borrowRequest: null,
      finalSettlement: null,
    });
  },
}));
