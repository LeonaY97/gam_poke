import { Card } from '../../shared/types';

export function createDeck(): number[] {
  const deck: number[] = [];
  for (let i = 0; i < 52; i++) {
    deck.push(i);
  }
  return deck;
}

export function shuffleDeck(deck: number[]): number[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cryptoRandomInt(max: number): number {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  return randomBuffer[0] % max;
}

export function dealCards(
  deck: number[],
  count: number,
): { cards: number[]; remainingDeck: number[] } {
  const cards = deck.slice(0, count);
  const remainingDeck = deck.slice(count);
  return { cards, remainingDeck };
}

export function cardIndexToCard(index: number): Card {
  const suitIndex = Math.floor(index / 13);
  const suits: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const rank = ((index % 13) + 2) as Card['rank'];
  return { suit: suits[suitIndex], rank };
}

export function cardToIndex(card: Card): number {
  const suits: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
  return suits.indexOf(card.suit) * 13 + (card.rank - 2);
}

/**
 * 判断 5 张牌（点数已按降序排序）是否构成顺子。
 * 必须满足：
 *   1. 5 张牌点数全部唯一（否则 [10,10,8,7,6] 会被误判，因为 10-6=4）
 *   2. 连续 5 张（最大-最小=4），或 A-5-4-3-2 轮子（A 当 1）
 */
function isStraightRanks(ranksDesc: number[]): boolean {
  if (new Set(ranksDesc).size !== 5) return false;
  // 标准顺子：5 连张
  if (ranksDesc[0] - ranksDesc[4] === 4) return true;
  // A-5-4-3-2 轮子（A 当 1 用，最小顺子）
  if (ranksDesc[0] === 14 && ranksDesc[1] === 5 && ranksDesc[2] === 4 && ranksDesc[3] === 3 && ranksDesc[4] === 2) return true;
  return false;
}

function evaluate5Cards(cards: Card[]): number {
  const ranks = cards.map(c => c.rank);
  const suits = cards.map(c => c.suit);
  ranks.sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = isStraightRanks(ranks);
  if (isStraight && isFlush) {
    // 皇家同花顺：A-K-Q-J-10
    if (ranks[0] === 14 && ranks[1] === 13 && ranks[2] === 12 && ranks[3] === 11 && ranks[4] === 10)
      return 9;
    return 8;
  }
  const countMap = new Map<number, number>();
  for (const r of ranks) {
    countMap.set(r, (countMap.get(r) || 0) + 1);
  }
  const counts = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (counts[0][1] === 4) {
    return 7;
  }
  if (counts[0][1] === 3 && counts[1][1] === 2) {
    return 6;
  }
  if (isFlush) {
    return 5;
  }
  if (isStraight) {
    return 4;
  }
  if (counts[0][1] === 3) {
    return 3;
  }
  if (counts[0][1] === 2 && counts[1][1] === 2) {
    return 2;
  }
  if (counts[0][1] === 2) {
    return 1;
  }
  return 0;
}

export function getHandValue(cards: Card[]): number {
  const handRank = evaluate5Cards(cards);
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  // 轮子（A-2-3-4-5）顺子或同花顺：A 当 1 用，是最小的顺子/同花顺
  // 注意：皇家同花顺（rank 9）不是轮子，无需处理
  const isWheel = (handRank === 4 || handRank === 8) && ranks[0] === 14 && ranks[4] === 2;
  let value = handRank * 10000000000;
  const countMap = new Map<number, number>();
  for (const r of ranks) {
    countMap.set(r, (countMap.get(r) || 0) + 1);
  }
  const entries = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const sortedByFreq: number[] = [];
  for (const [rank, count] of entries) {
    for (let i = 0; i < count; i++) {
      // 轮子顺子（A-5-4-3-2）时 A 当 1 用
      sortedByFreq.push(isWheel && rank === 14 ? 1 : rank);
    }
  }
  // isWheel 时 A 被替换为 1，可能破坏降序（entries 按 rank DESC，A 原本在最前）
  // 重新降序排列，确保高位是最大牌（虽然不影响比较结果，但保持编码语义一致）
  if (isWheel) {
    sortedByFreq.sort((a, b) => b - a);
  }
  for (let i = 0; i < 5; i++) {
    value += sortedByFreq[i] * Math.pow(100, 4 - i);
  }
  return value;
}

export interface HandEvaluation {
  handRank: number;
  handDescription: string;
  bestCards: Card[];
}

export function getBestHand(hand: Card[], communityCards: Card[]): HandEvaluation {
  const allCards = [...hand, ...communityCards];
  if (allCards.length < 5) {
    return { handRank: 0, handDescription: '高牌', bestCards: allCards };
  }
  let bestValue = -1;
  let bestCombo: Card[] = [];
  const combinations = getCombinations(allCards, 5);
  for (const combo of combinations) {
    const value = getHandValue(combo);
    if (value > bestValue) {
      bestValue = value;
      bestCombo = combo;
    }
  }
  const handRank = Math.floor(bestValue / 10000000000);
  const handNames: Record<number, string> = {
    0: '高牌', 1: '一对', 2: '两对', 3: '三条', 4: '顺子',
    5: '同花', 6: '葫芦', 7: '四条', 8: '同花顺', 9: '皇家同花顺',
  };
  return { handRank, handDescription: handNames[handRank] || '高牌', bestCards: bestCombo };
}

function getCombinations(arr: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const result: Card[][] = [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export interface CompareHandInput {
  playerId: string;
  hand: Card[];
  communityCards: Card[];
}

export interface CompareHandResult extends HandEvaluation {
  playerId: string;
}

export function compareHands(hands: CompareHandInput[]): CompareHandResult[] {
  const results = hands.map(h => {
    const best = getBestHand(h.hand, h.communityCards);
    return { playerId: h.playerId, ...best };
  });
  results.sort((a, b) => {
    if (a.handRank !== b.handRank) return b.handRank - a.handRank;
    const aValue = getHandValue(a.bestCards);
    const bValue = getHandValue(b.bestCards);
    return bValue - aValue;
  });
  return results;
}

export function getNextPhase(currentPhase: string): string {
  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const idx = phases.indexOf(currentPhase);
  if (idx < phases.length - 1) return phases[idx + 1];
  return 'showdown';
}

export function getCommunityCardsCount(phase: string): number {
  switch (phase) {
    case 'preflop': return 0;
    case 'flop': return 3;
    case 'turn': return 4;
    case 'river': return 5;
    default: return 5;
  }
}

export interface AvailableActions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  canAllIn: boolean;
  timeout: number;
}

export function getAvailableActions(
  playerChips: number,
  currentBet: number,
  highestBet: number,
  bigBlind: number,
  _isFirstToAct: boolean,
  lastRaiseAmount: number,
): AvailableActions {
  const toCall = highestBet - currentBet;
  if (toCall <= 0) {
    const minRaise = lastRaiseAmount > 0 ? lastRaiseAmount : bigBlind;
    return {
      canCheck: true,
      canCall: false,
      callAmount: 0,
      minRaise: Math.min(minRaise, playerChips),
      maxRaise: playerChips,
      canAllIn: playerChips > 0,
      timeout: 40,
    };
  }
  if (playerChips <= toCall) {
    return {
      canCheck: false,
      canCall: true,
      callAmount: playerChips,
      minRaise: 0,
      maxRaise: 0,
      canAllIn: false,
      timeout: 40,
    };
  }
  const minRaise = Math.max(highestBet + (lastRaiseAmount || bigBlind), highestBet + bigBlind);
  return {
    canCheck: false,
    canCall: true,
    callAmount: toCall,
    minRaise: Math.min(minRaise, playerChips),
    maxRaise: playerChips,
    canAllIn: playerChips > toCall,
    timeout: 40,
  };
}

export function generateRoomCode(): string {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  const num = randomBuffer[0] % 10000;
  return num.toString().padStart(4, '0');
}
