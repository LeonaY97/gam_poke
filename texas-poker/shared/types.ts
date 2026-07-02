export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface RoomSettings {
  initialChips: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  blindInterval: number;
  botCount: number;
}

export interface Player {
  id: string;
  nickname: string;
  chips: number;
  seatIndex: number;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  /** 借入次数：开局默认 1（水下一手），筹码归零后可再借 */
  borrowCount: number;
  /** AI 人设 ID，仅 AI 玩家有此字段 */
  aiPersonaId?: string;
  /** 旁观者：不参与牌局，可看所有人手牌；isAI 字段在 RoomManager 中运行时存在 */
  isSpectator?: boolean;
  /** AI 标记（运行时存在，接口未声明以保持向后兼容） */
  isAI?: boolean;
  /** AI 难度（运行时存在，接口未声明以保持向后兼容） */
  aiDifficulty?: string;
}

export interface GamePlayer {
  playerId: string;
  hand: Card[];
  currentBet: number;
  totalBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isActive: boolean;
}

export interface SidePot {
  amount: number;
  eligiblePlayers: string[];
}

export interface BetRecord {
  playerId: string;
  /** 行动类型；'blind' 用于盲注（非玩家主动行动，但需在记录中展示） */
  action: PlayerAction | 'blind';
  amount: number;
  phase: GamePhase;
  /** 仅 raise 记录填充：本次加注的增量（= 新最高下注 - 旧最高下注），用于计算后续最小加注 */
  raiseDelta?: number;
}

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Game {
  id: string;
  round: number;
  phase: GamePhase;
  deck: number[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  dealerIndex: number;
  currentPlayerIndex: number;
  players: GamePlayer[];
  betHistory: BetRecord[];
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, Player> | Record<string, Player>;
  settings: RoomSettings;
  game: Game | null;
  createdAt: number;
  isPaused: boolean;
}

export interface RoomListItem {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  settings: RoomSettings;
  game: Game | null;
  createdAt: number;
  isPaused: boolean;
}

export interface TurnOptions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  canAllIn: boolean;
  timeout: number;
}

export interface HandResult {
  winners: WinnerInfo[];
  allHands: PlayerHandInfo[];
  /** true=同一层底池多家平分（真平局）；false=多家来自不同 side pot 层（多人分池）*/
  isSplitPot?: boolean;
}

export interface WinnerInfo {
  playerId: string;
  nickname: string;
  handDescription: string;
  handRank: number;
  chipsWon: number;
  cards: Card[];
}

export interface PlayerHandInfo {
  playerId: string;
  nickname: string;
  handDescription: string;
  handRank: number;
  cards: Card[];
  isFolded: boolean;
}

/** 单局历史记录 */
export interface HandHistoryEntry {
  round: number;
  winners: { playerId: string; nickname: string; chipsWon: number; handDescription: string }[];
  players: { playerId: string; nickname: string; chipsAfter: number; isFolded: boolean }[];
}

/** 最终清算数据 */
export interface FinalSettlementData {
  players: {
    playerId: string;
    nickname: string;
    finalChips: number;
    initialChips: number;
    borrowCount: number;
    netProfit: number;
    isUnderwater: boolean;
  }[];
  handHistory: HandHistoryEntry[];
  totalHands: number;
  roomSettings: RoomSettings;
}

export interface ServerToClientEvents {
  room_created: (data: { roomCode: string; playerId: string }) => void;
  room_updated: (data: { room: RoomListItem }) => void;
  game_started: (data: { seats: Player[]; dealerPos: number }) => void;
  cards_dealt: (data: { cards: Card[] }) => void;
  community_cards: (data: { cards: Card[]; phase: GamePhase }) => void;
  your_turn: (data: { options: TurnOptions; phase: GamePhase; pot: number }) => void;
  turn_changed: (data: { currentPlayerId: string; phase: GamePhase; pot: number }) => void;
  action_result: (data: { playerId: string; playerName: string; action: PlayerAction; amount: number; chips: number; gamePlayers?: GamePlayer[]; betHistory?: BetRecord[] }) => void;
  hand_result: (data: HandResult) => void;
  pot_updated: (data: { pot: number; sidePots: SidePot[] }) => void;
  player_eliminated: (data: { playerId: string; nickname: string }) => void;
  game_paused: () => void;
  game_resumed: () => void;
  room_disbanded: () => void;
  borrow_request: (data: { playerId: string; borrowCount: number; initialChips: number }) => void;
  player_disconnected: (data: { playerId: string; nickname: string }) => void;
  final_settlement: (data: FinalSettlementData) => void;
  danmaku_received: (data: { playerId: string; nickname: string; text: string; color: string; isSpectator?: boolean }) => void;
  /** 旁观者专用：广播所有玩家手牌 */
  spectator_hands: (data: { hands: { playerId: string; nickname: string; cards: Card[]; isFolded: boolean }[]; phase: GamePhase }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  create_room: (data: { nickname: string; settings: Partial<RoomSettings> }, callback: (res: { success: boolean; roomCode?: string; playerId?: string; room?: RoomListItem; error?: string }) => void) => void;
  join_room: (data: { roomCode: string; nickname: string; asSpectator?: boolean }, callback: (res: { success: boolean; room?: RoomListItem; playerId?: string; error?: string; isSpectator?: boolean; spectatorNote?: string }) => void) => void;
  reconnect_player: (data: { playerId: string; roomCode: string }, callback: (res: { success: boolean; room?: RoomListItem; error?: string }) => void) => void;
  borrow_chips: (data: { roomCode: string; borrow?: boolean }, callback: (res: { success: boolean; room?: RoomListItem; error?: string }) => void) => void;
  ack_hand_result: () => void;
  request_final_settlement: () => void;
  restart_game: () => void;
  continue_game: () => void;
  send_danmaku: (data: { text: string; color?: string }) => void;
  start_game: (data: { roomCode: string }, callback?: (res: { success: boolean; error?: string; message?: string }) => void) => void;
  player_action: (data: { action: PlayerAction; amount?: number }, callback: (res: { success: boolean; error?: string }) => void) => void;
  leave_room: () => void;
  kick_player: (data: { playerId: string }) => void;
  pause_game: () => void;
  resume_game: () => void;
  disband_room: () => void;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades: '#1a1a2e',
  hearts: '#c92a2a',
  diamonds: '#c92a2a',
  clubs: '#1a1a2e',
};

export const RANK_LABELS: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const HAND_NAMES: Record<number, string> = {
  0: '高牌',
  1: '一对',
  2: '两对',
  3: '三条',
  4: '顺子',
  5: '同花',
  6: '葫芦',
  7: '四条',
  8: '同花顺',
  9: '皇家同花顺',
};
