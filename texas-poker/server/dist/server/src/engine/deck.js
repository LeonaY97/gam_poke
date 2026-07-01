"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeck = createDeck;
exports.shuffleDeck = shuffleDeck;
exports.dealCards = dealCards;
exports.cardIndexToCard = cardIndexToCard;
exports.cardToIndex = cardToIndex;
exports.getHandValue = getHandValue;
exports.getBestHand = getBestHand;
exports.compareHands = compareHands;
exports.getNextPhase = getNextPhase;
exports.getCommunityCardsCount = getCommunityCardsCount;
exports.getAvailableActions = getAvailableActions;
exports.generateRoomCode = generateRoomCode;
function createDeck() {
    const deck = [];
    for (let i = 0; i < 52; i++) {
        deck.push(i);
    }
    return deck;
}
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = cryptoRandomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
function cryptoRandomInt(max) {
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    return randomBuffer[0] % max;
}
function dealCards(deck, count) {
    const cards = deck.slice(0, count);
    const remainingDeck = deck.slice(count);
    return { cards, remainingDeck };
}
function cardIndexToCard(index) {
    const suitIndex = Math.floor(index / 13);
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const rank = ((index % 13) + 2);
    return { suit: suits[suitIndex], rank };
}
function cardToIndex(card) {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    return suits.indexOf(card.suit) * 13 + (card.rank - 2);
}
function getRankPrime(rank) {
    const primes = {
        2: 2, 3: 3, 4: 5, 5: 7, 6: 11, 7: 13, 8: 17, 9: 19, 10: 23,
        11: 29, 12: 31, 13: 37, 14: 41,
    };
    return primes[rank];
}
function evaluate5Cards(cards) {
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    ranks.sort((a, b) => b - a);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = ranks[0] - ranks[4] === 4 ||
        (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2);
    if (isStraight && isFlush) {
        if (ranks[0] === 14 && ranks[1] === 13)
            return 9;
        return 8;
    }
    const countMap = new Map();
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
function getHandValue(cards) {
    const handRank = evaluate5Cards(cards);
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const isWheel = handRank === 4 && ranks[0] === 14 && ranks[4] === 2;
    let value = handRank * 10000000000;
    const countMap = new Map();
    for (const r of ranks) {
        countMap.set(r, (countMap.get(r) || 0) + 1);
    }
    const entries = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const adjustedRanks = isWheel ? ranks.map(r => r === 14 ? 1 : r) : ranks;
    const sortedByFreq = [];
    for (const [rank, count] of entries) {
        for (let i = 0; i < count; i++) {
            sortedByFreq.push(isWheel && rank === 14 ? 1 : rank);
        }
    }
    for (let i = 0; i < 5; i++) {
        value += sortedByFreq[i] * Math.pow(100, 4 - i);
    }
    return value;
}
function getBestHand(hand, communityCards) {
    const allCards = [...hand, ...communityCards];
    if (allCards.length < 5) {
        return { handRank: 0, handDescription: '高牌', bestCards: allCards };
    }
    let bestValue = -1;
    let bestCombo = [];
    const combinations = getCombinations(allCards, 5);
    for (const combo of combinations) {
        const value = getHandValue(combo);
        if (value > bestValue) {
            bestValue = value;
            bestCombo = combo;
        }
    }
    const handRank = Math.floor(bestValue / 10000000000);
    const handNames = {
        0: '高牌', 1: '一对', 2: '两对', 3: '三条', 4: '顺子',
        5: '同花', 6: '葫芦', 7: '四条', 8: '同花顺', 9: '皇家同花顺',
    };
    return { handRank, handDescription: handNames[handRank] || '高牌', bestCards: bestCombo };
}
function getCombinations(arr, k) {
    if (k === 0)
        return [[]];
    if (arr.length === 0)
        return [];
    const result = [];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}
function compareHands(hands) {
    const results = hands.map(h => {
        const best = getBestHand(h.hand, h.communityCards);
        return { playerId: h.playerId, ...best };
    });
    results.sort((a, b) => {
        if (a.handRank !== b.handRank)
            return b.handRank - a.handRank;
        const aValue = getHandValue(a.bestCards);
        const bValue = getHandValue(b.bestCards);
        return bValue - aValue;
    });
    return results;
}
function getNextPhase(currentPhase) {
    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = phases.indexOf(currentPhase);
    if (idx < phases.length - 1)
        return phases[idx + 1];
    return 'showdown';
}
function getCommunityCardsCount(phase) {
    switch (phase) {
        case 'preflop': return 0;
        case 'flop': return 3;
        case 'turn': return 4;
        case 'river': return 5;
        default: return 5;
    }
}
function getAvailableActions(playerChips, currentBet, highestBet, bigBlind, isFirstToAct, lastRaiseAmount) {
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
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        const randomBuffer = new Uint32Array(1);
        crypto.getRandomValues(randomBuffer);
        code += chars[randomBuffer[0] % chars.length];
    }
    return code;
}
