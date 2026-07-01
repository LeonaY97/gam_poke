import {
  Room, Game, GamePlayer, GamePhase, Player, Card,
  PlayerAction, TurnOptions, HandResult, SidePot,
  HandHistoryEntry, FinalSettlementData,
} from '../../shared/types';
import {
  createDeck, shuffleDeck, dealCards, cardIndexToCard,
  getBestHand, compareHands, getNextPhase, getCommunityCardsCount,
  getAvailableActions, getHandValue,
} from '../engine/deck';

export class GameController {
  private room: Room;
  private game: Game;
  private broadcastFn: (event: string, data: unknown) => void;
  private privateFn: (playerId: string, event: string, data: unknown) => void;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private showdownTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private botPlayers: Set<string> = new Set();
  /** 等待借入决策的真人玩家 playerId 集合 */
  private pendingBorrowers: Set<string> = new Set();
  /** 等待确认关闭结算画面的真人玩家 playerId 集合 */
  private pendingHandResultAcks: Set<string> = new Set();
  /** 最近一次结算结果（用于重连玩家重发） */
  private lastHandResult: HandResult | null = null;
  /** 每局历史记录 */
  private handHistory: HandHistoryEntry[] = [];

  constructor(
    room: Room,
    broadcastFn: (event: string, data: unknown) => void,
    privateFn: (playerId: string, event: string, data: unknown) => void,
  ) {
    this.room = room;
    this.broadcastFn = broadcastFn;
    this.privateFn = privateFn;
    this.game = this.createGame();
  }

  private createGame(): Game {
    return {
      id: `game_${Date.now()}`,
      round: 1,
      phase: 'waiting',
      deck: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      dealerIndex: 0,
      currentPlayerIndex: 0,
      players: [],
      betHistory: [],
    };
  }

  startGame(): void {
    const players = this.getPlayersArray();
    const realPlayers = players.filter(p => !p.id.startsWith('bot_'));
    const bots = players.filter(p => p.id.startsWith('bot_'));

    const allPlayers = [...realPlayers.filter(p => p.isConnected), ...bots];

    if (allPlayers.length < 2) {
      this.broadcastFn('error', { message: '至少需要 2 名玩家' });
      return;
    }

    for (const b of bots) {
      this.botPlayers.add(b.id);
    }

    allPlayers.forEach((p, i) => {
      p.chips = Math.max(p.chips, 0);
      p.seatIndex = i;
      p.isConnected = true;
    });

    if (this.room.players instanceof Map) {
      this.room.players.clear();
      for (const p of allPlayers) {
        this.room.players.set(p.id, p);
      }
    }

    // 首次开局：创建新 game，dealerIndex 从 0 开始
    this.game = this.createGame();
    this.game.round = 1;
    this.startNewHand();
  }

  /**
   * 开始一手新牌局：发牌、下盲注、开始下注轮。
   * startGame（首次开局）和 resetForNewRound（下一手）都调用此方法。
   * 调用前需已设置 this.game（含 dealerIndex）。
   */
  private startNewHand(): void {
    // 只有筹码 > 0 的玩家参与这一手
    const allPlayers = this.getPlayersArray().filter(p => p.chips > 0);

    this.game.communityCards = [];
    this.game.pot = 0;
    this.game.sidePots = [];
    this.game.betHistory = [];
    this.game.phase = 'waiting';
    this.game.players = allPlayers.map(p => ({
      playerId: p.id,
      hand: [],
      currentBet: 0,
      totalBet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: true,
    }));

    this.room.game = this.game;

    this.broadcastFn('game_started', {
      seats: this.getPlayersArray(),
      dealerPos: this.game.dealerIndex,
      currentPlayerId: this.game.players[this.game.currentPlayerIndex]?.playerId,
    });

    setTimeout(() => this.dealHoleCards(), 500);
  }

  private dealHoleCards(): void {
    const deck = shuffleDeck(createDeck());
    let remaining = deck;

    for (const gp of this.game.players) {
      const { cards: holeCards, remainingDeck: newDeck } = dealCards(remaining, 2);
      remaining = newDeck;
      gp.hand = holeCards.map(cardIndexToCard);
    }

    this.game.deck = remaining;
    this.game.phase = 'preflop';

    for (const gp of this.game.players) {
      if (!this.botPlayers.has(gp.playerId)) {
        this.privateFn(gp.playerId, 'cards_dealt', { cards: gp.hand });
      }
    }

    setTimeout(() => this.postBlinds(), 300);
  }

  private postBlinds(): void {
    const numPlayers = this.game.players.length;
    const smallBlindIdx = (this.game.dealerIndex + 1) % numPlayers;
    const bigBlindIdx = (this.game.dealerIndex + 2) % numPlayers;

    if (numPlayers === 2) {
      this.forceBet(this.game.players[this.game.dealerIndex], this.room.settings.smallBlind);
      this.forceBet(this.game.players[(this.game.dealerIndex + 1) % 2], this.room.settings.bigBlind);
    } else {
      this.forceBet(this.game.players[smallBlindIdx], this.room.settings.smallBlind);
      this.forceBet(this.game.players[bigBlindIdx], this.room.settings.bigBlind);
    }

    this.updatePot();

    if (numPlayers === 2) {
      this.game.currentPlayerIndex = this.game.dealerIndex;
    } else {
      this.game.currentPlayerIndex = (this.game.dealerIndex + 3) % numPlayers;
    }

    this.startBettingRound();
  }

  private forceBet(gp: GamePlayer, amount: number): void {
    const player = this.getPlayer(gp.playerId);
    if (!player) return;

    const actualAmount = Math.min(amount, player.chips);
    gp.currentBet = actualAmount;
    gp.totalBet += actualAmount;
    player.chips -= actualAmount;

    if (player.chips === 0) {
      gp.isAllIn = true;
    }
  }

  private startBettingRound(): void {
    const activePlayers = this.game.players.filter(p => !p.isFolded && !p.isAllIn);
    if (activePlayers.length <= 1) {
      this.endBettingRound();
      return;
    }

    // preflop: currentPlayerIndex 已由 postBlinds 设好（UTG 或 heads-up 的 button）
    // flop/turn/river: currentPlayerIndex 已由 endBettingRound 设好（SB 位）
    // 这里只做校验：当前位置若不可行动，才向后找
    let currentPlayer = this.game.players[this.game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isFolded || currentPlayer.isAllIn) {
      this.findNextActivePlayer();
      currentPlayer = this.game.players[this.game.currentPlayerIndex];
    }

    if (!currentPlayer || currentPlayer.isFolded || currentPlayer.isAllIn) {
      this.endBettingRound();
      return;
    }

    this.sendTurnToPlayer(currentPlayer);
  }

  private findNextActivePlayer(): void {
    const numPlayers = this.game.players.length;
    let attempts = 0;
    while (attempts < numPlayers) {
      this.game.currentPlayerIndex = (this.game.currentPlayerIndex + 1) % numPlayers;
      const gp = this.game.players[this.game.currentPlayerIndex];
      if (!gp.isFolded && !gp.isAllIn && gp.isActive) {
        return;
      }
      attempts++;
    }
  }

  private sendTurnToPlayer(gp: GamePlayer): void {
    const player = this.getPlayer(gp.playerId);
    if (!player) return;

    // 广播"当前轮到谁"，让所有客户端都能高亮行动中玩家
    this.broadcastFn('turn_changed', {
      currentPlayerId: gp.playerId,
      phase: this.game.phase,
      pot: this.game.pot,
    });

    if (this.botPlayers.has(gp.playerId)) {
      this.scheduleBotAction(gp);
      return;
    }

    const highestBet = Math.max(...this.game.players.map(p => p.totalBet));
    const lastRaiseAmount = this.getLastRaiseAmount();
    const isFirstToAct = this.isFirstToActInRound();

    const options = getAvailableActions(
      player.chips,
      gp.totalBet,
      highestBet,
      this.room.settings.bigBlind,
      isFirstToAct,
      lastRaiseAmount
    );

    this.privateFn(gp.playerId, 'your_turn', {
      options,
      phase: this.game.phase,
      pot: this.game.pot,
    });

    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => {
      // 超时自动操作：能过牌就过牌，不能过牌就弃牌
      const highestBet = Math.max(...this.game.players.map(p => p.totalBet));
      const toCall = highestBet - gp.totalBet;
      if (toCall <= 0) {
        this.handleAction(gp.playerId, 'check', 0);
      } else {
        this.handleAction(gp.playerId, 'fold', 0);
      }
    }, options.timeout * 1000);
  }

  private scheduleBotAction(gp: GamePlayer): void {
    // 每个 AI 至少 2s（2.0s ~ 3.0s），确保玩家能看清操作气泡
    const delay = 2000 + Math.random() * 1000;

    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => {
      this.executeBotAction(gp);
    }, delay);
  }

  private executeBotAction(gp: GamePlayer): void {
    const player = this.getPlayer(gp.playerId);
    if (!player || gp.isFolded || gp.isAllIn) return;

    const highestBet = Math.max(...this.game.players.map(p => p.totalBet));
    const toCall = highestBet - gp.totalBet;
    const lastRaise = this.getLastRaiseAmount();
    // 最小加注总额（投入总额 = 跟注部分 + 加注增量）
    const minRaiseTotal = toCall <= 0 ? 1 : highestBet + (lastRaise > 0 ? lastRaise : this.room.settings.bigBlind);

    const handStrength = this.evaluateBotHandStrength(gp);
    const random = Math.random();

    let action: PlayerAction;
    let amount = 0;

    if (toCall <= 0) {
      if (handStrength > 0.7 && random < 0.4) {
        action = 'raise';
        amount = Math.floor(player.chips * (0.3 + random * 0.3));
        amount = Math.max(amount, this.room.settings.bigBlind * 2);
        amount = Math.min(amount, player.chips);
      } else if (handStrength < 0.3 && random < 0.15) {
        action = 'fold';
      } else {
        action = 'check';
      }
    } else if (toCall >= player.chips) {
      if (handStrength > 0.5 || random < 0.3) {
        action = 'allin';
      } else {
        action = 'fold';
      }
    } else {
      if (handStrength > 0.6 && random < 0.3) {
        action = 'raise';
        amount = Math.floor(player.chips * (0.2 + random * 0.3));
        // 必须满足最小加注总额，否则会校验失败
        amount = Math.max(amount, minRaiseTotal);
        amount = Math.min(amount, player.chips);
      } else if (handStrength < 0.25 && toCall > this.room.settings.bigBlind * 4 && random < 0.3) {
        action = 'fold';
      } else {
        action = 'call';
      }
    }

    // 如果筹码不够做最小加注，降级为 call 或 check
    if (action === 'raise' && player.chips < minRaiseTotal) {
      action = toCall > 0 ? 'call' : 'check';
      amount = 0;
    }

    const result = this.handleAction(gp.playerId, action, amount);
    if (!result.success) {
      // 加注失败兜底：能过牌就过牌，能跟注就跟注，否则弃牌
      if (toCall <= 0) {
        this.handleAction(gp.playerId, 'check', 0);
      } else if (toCall < player.chips) {
        this.handleAction(gp.playerId, 'call', 0);
      } else {
        this.handleAction(gp.playerId, 'fold', 0);
      }
    }
  }

  private evaluateBotHandStrength(gp: GamePlayer): number {
    const communityCards = this.game.communityCards;
    const allCards = [...gp.hand, ...communityCards];

    if (allCards.length < 5) {
      const ranks = gp.hand.map(c => c.rank);
      const highCard = Math.max(...ranks) / 14;
      const paired = ranks[0] === ranks[1] ? 0.6 : 0;
      const suited = gp.hand[0].suit === gp.hand[1].suit ? 0.3 : 0;
      const connected = Math.abs(ranks[0] - ranks[1]) <= 2 ? 0.2 : 0;
      const faceCard = ranks.some(r => r >= 11) ? 0.1 : 0;
      return Math.min(0.95, highCard * 0.3 + paired + suited + connected + faceCard);
    }

    const result = getBestHand(gp.hand, communityCards);
    const strengthMap: Record<number, number> = {
      0: 0.1, 1: 0.35, 2: 0.5, 3: 0.65, 4: 0.75, 5: 0.8, 6: 0.88, 7: 0.95, 8: 0.98, 9: 1.0,
    };
    return strengthMap[result.handRank] || 0.1;
  }

  /** 获取最近一次加注的增量（raiseDelta）。无加注记录返回 0。 */
  private getLastRaiseAmount(): number {
    for (let i = this.game.betHistory.length - 1; i >= 0; i--) {
      const rec = this.game.betHistory[i];
      if (rec.action === 'raise' && rec.raiseDelta !== undefined) {
        return rec.raiseDelta;
      }
    }
    return 0;
  }

  /** 判断当前是否为本轮第一个行动者（本轮 betHistory 还没有任何记录） */
  private isFirstToActInRound(): boolean {
    const currentPhase = this.game.phase;
    return !this.game.betHistory.some(rec => rec.phase === currentPhase);
  }

  handleAction(playerId: string, action: PlayerAction, amount: number): { success: boolean; error?: string } {
    const gp = this.game.players.find(p => p.playerId === playerId);
    if (!gp) return { success: false, error: '玩家不在游戏中' };

    const currentGp = this.game.players[this.game.currentPlayerIndex];
    if (currentGp?.playerId !== playerId) return { success: false, error: '还没轮到你' };

    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: '玩家不存在' };

    const highestBet = Math.max(...this.game.players.map(p => p.totalBet));
    const toCall = highestBet - gp.totalBet;

    switch (action) {
      case 'fold':
        gp.isFolded = true;
        gp.isActive = false;
        break;

      case 'check': {
        if (toCall > 0) return { success: false, error: '不能过牌，需要跟注' };
        break;
      }

      case 'call': {
        const callAmount = Math.min(toCall, player.chips);
        player.chips -= callAmount;
        gp.totalBet += callAmount;
        gp.currentBet += callAmount;
        if (player.chips === 0) gp.isAllIn = true;
        amount = callAmount; // 回填实际跟注金额，用于气泡和历史记录
        break;
      }

      case 'raise': {
        if (amount < toCall) return { success: false, error: '加注金额不能低于跟注金额' };
        if (amount > player.chips) return { success: false, error: '筹码不足' };
        // 最小加注校验（与 getAvailableActions 逻辑一致）
        if (toCall <= 0) {
          // 无人下注：允许任意正数
          if (amount < 1) return { success: false, error: '加注金额必须大于 0' };
        } else if (player.chips > toCall) {
          // 有人下注且筹码够跟注：最小加注 = 最高下注 + 上次加注增量（至少大盲）
          const lastRaise = this.getLastRaiseAmount();
          const minRaiseTotal = highestBet + (lastRaise > 0 ? lastRaise : this.room.settings.bigBlind);
          if (amount < minRaiseTotal) {
            return { success: false, error: `最小加注到 ${minRaiseTotal}` };
          }
        }
        player.chips -= amount;
        gp.totalBet += amount;
        gp.currentBet += (amount - toCall);
        if (player.chips === 0) gp.isAllIn = true;
        break;
      }

      case 'allin': {
        const allInAmount = player.chips;
        player.chips -= allInAmount;
        gp.totalBet += allInAmount;
        gp.currentBet += allInAmount;
        gp.isAllIn = true;
        amount = allInAmount;
        break;
      }
    }

    this.game.betHistory.push({
      playerId,
      action,
      amount,
      phase: this.game.phase,
      // raise 记录额外存加注增量（= 本次投入 - 跟注部分 = 新最高下注 - 旧最高下注）
      raiseDelta: action === 'raise' ? Math.max(0, amount - toCall) : undefined,
    });

    this.updatePot();

    this.broadcastFn('action_result', {
      playerId,
      playerName: player.nickname,
      action,
      amount,
      chips: player.chips,
      gamePlayers: this.game.players,
      betHistory: this.game.betHistory,
    });

    console.log(`[行动] ${player.nickname} ${action}${amount > 0 ? ' ' + amount : ''} | 筹码:${player.chips} | 底池:${this.game.pot}`);

    this.broadcastFn('pot_updated', {
      pot: this.game.pot,
      sidePots: this.game.sidePots,
    });

    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.checkBettingRoundEnd();
    return { success: true };
  }

  private checkBettingRoundEnd(): void {
    const activePlayers = this.game.players.filter(p => !p.isFolded && !p.isAllIn);

    // 只剩一人未弃牌 → 直接结算
    if (activePlayers.length <= 1) {
      const notFolded = this.game.players.filter(p => !p.isFolded);
      if (notFolded.length === 1) {
        this.endGameWithSingleWinner(notFolded[0]);
        return;
      }
      this.endBettingRound();
      return;
    }

    const highestBet = Math.max(...this.game.players.map(p => p.totalBet));
    const allMatched = activePlayers.every(p => p.totalBet === highestBet || p.isAllIn);

    // 结束本轮的严格条件：
    //   1. 所有未弃牌、未 all-in 的玩家下注都已匹配
    //   2. 所有这些玩家都至少在本轮行动过一次（防止"翻牌前大盲还没说话就结束"）
    const allActed = activePlayers.every(p => this.hasPlayerActedInRound(p.playerId));

    if (allMatched && allActed) {
      this.endBettingRound();
      return;
    }

    this.findNextActivePlayer();
    const nextPlayer = this.game.players[this.game.currentPlayerIndex];
    if (nextPlayer && !nextPlayer.isFolded && !nextPlayer.isAllIn) {
      console.log(`[轮次] 下一个行动: ${nextPlayer.nickname} (${this.game.phase})`);
      this.sendTurnToPlayer(nextPlayer);
    } else {
      console.log(`[轮次] 无可用玩家，结束本轮`);
      this.endBettingRound();
    }
  }

  private hasPlayerActedInRound(playerId: string): boolean {
    return this.game.betHistory.some(
      b => b.phase === this.game.phase && b.playerId === playerId && b.action !== 'fold'
    );
  }

  private hasActionInRound(): boolean {
    return this.game.betHistory.some(b => b.phase === this.game.phase && b.action !== 'fold');
  }

  private endBettingRound(): void {
    const nextPhase = getNextPhase(this.game.phase);

    if (nextPhase === 'showdown') {
      this.doShowdown();
      return;
    }

    this.game.phase = nextPhase;
    const neededCards = nextPhase === 'flop' ? 3 : 1;

    const { cards: newCards, remainingDeck } = dealCards(this.game.deck, neededCards);
    this.game.deck = remainingDeck;
    this.game.communityCards.push(...newCards.map(cardIndexToCard));

    // 新一轮下注：重置每个玩家的 currentBet（本轮单次下注），保留 totalBet（本手累计）
    this.game.players.forEach(p => {
      p.currentBet = 0;
    });

    this.broadcastFn('community_cards', {
      cards: this.game.communityCards,
      phase: this.game.phase,
    });

    const numPlayers = this.game.players.length;
    // 德扑规则：flop/turn/river 后由 SB 位（dealer+1）开始行动
    // heads-up 例外：button 即 SB，flop 后由 button 先行动
    if (numPlayers === 2) {
      this.game.currentPlayerIndex = this.game.dealerIndex;
    } else {
      this.game.currentPlayerIndex = (this.game.dealerIndex + 1) % numPlayers;
    }

    setTimeout(() => this.startBettingRound(), 500);
  }

  private doShowdown(): void {
    this.game.phase = 'showdown';

    const activePlayers = this.game.players.filter(p => !p.isFolded);
    const results = compareHands(
      activePlayers.map(gp => ({
        playerId: gp.playerId,
        hand: gp.hand,
        communityCards: this.game.communityCards,
      }))
    );

    // 按手牌强度从强到弱排序
    const sortedResults = [...results].sort((a, b) =>
      this.getHandNumericValue(b.bestCards) - this.getHandNumericValue(a.bestCards)
    );

    // 按 side pot 分层分配奖金
    // 没有人 all-in 时 sidePots 为空，用主池整体
    const sidePots = this.game.sidePots.length > 0
      ? this.game.sidePots
      : [{ amount: this.game.pot, eligiblePlayers: activePlayers.map(p => p.playerId) }];

    const winnings = new Map<string, number>();
    // 记录每层是否有多个赢家平分（真平局）
    let anyLayerSplit = false;
    // 记录总赢家来自多少个不同 side pot 层
    const winnerLayerCount = new Map<string, number>();
    let totalLayers = 0;

    for (const sp of sidePots) {
      // 该层 eligible 中手牌最强的
      const eligibleResults = sortedResults.filter(r => sp.eligiblePlayers.includes(r.playerId));
      if (eligibleResults.length === 0) continue;

      totalLayers++;
      const topVal = this.getHandNumericValue(eligibleResults[0].bestCards);
      const layerWinners = eligibleResults.filter(r =>
        this.getHandNumericValue(r.bestCards) === topVal
      );

      // 同一层有多个赢家 = 真平局
      if (layerWinners.length > 1) anyLayerSplit = true;

      const chipsPerWinner = Math.floor(sp.amount / layerWinners.length);
      for (const w of layerWinners) {
        winnings.set(w.playerId, (winnings.get(w.playerId) || 0) + chipsPerWinner);
        winnerLayerCount.set(w.playerId, (winnerLayerCount.get(w.playerId) || 0) + 1);
      }
    }

    // 判断是否真平局：
    // - anyLayerSplit=true：某层多家平分 → 真平局
    // - 多个赢家但都来自同一层（totalLayers=1 且多家）→ 真平局
    // - 多个赢家来自不同层（totalLayers>1 且没平分）→ 多人分池，非平局
    const winnerCount = winnings.size;
    const isSplitPot = winnerCount > 1 && (anyLayerSplit || totalLayers === 1);

    const handResult: HandResult = {
      isSplitPot,
      winners: Array.from(winnings.entries()).map(([playerId, chipsWon]) => {
        const r = results.find(res => res.playerId === playerId)!;
        const player = this.getPlayer(playerId);
        if (player) player.chips += chipsWon;
        return {
          playerId,
          nickname: player?.nickname || 'Unknown',
          handDescription: r.handDescription,
          handRank: r.handRank,
          chipsWon,
          cards: r.bestCards,
        };
      }),
      allHands: activePlayers.map(gp => {
        const best = getBestHand(gp.hand, this.game.communityCards);
        const player = this.getPlayer(gp.playerId);
        return {
          playerId: gp.playerId,
          nickname: player?.nickname || 'Unknown',
          handDescription: best.handDescription,
          handRank: best.handRank,
          cards: gp.hand,
          isFolded: gp.isFolded,
        };
      }),
    };

    this.lastHandResult = handResult;
    this.broadcastFn('hand_result', handResult);
    this.room.game = this.game;

    // 记录本局历史
    this.recordHandHistory(handResult);

    // 筹码归零的玩家：AI自动借入，真人发 borrow_request 等待决策
    this.collectBrokePlayersAndProceed();

    // 等待所有真人玩家关闭结算画面后进入下一局
    this.waitForHandResultAcks();
  }

  private endGameWithSingleWinner(gp: GamePlayer): void {
    this.game.phase = 'showdown';

    const player = this.getPlayer(gp.playerId);

    // all-in 赢家只能赢匹配他下注的部分，超出部分退回给其他玩家
    // 赢家能赢的金额 = sum of min(赢家totalBet, 每个玩家totalBet)
    let winAmount = 0;
    const refunds = new Map<string, number>(); // playerId -> 退回金额

    for (const p of this.game.players) {
      if (p.playerId === gp.playerId) {
        winAmount += p.totalBet; // 自己的部分自己赢回
        continue;
      }
      if (p.totalBet <= gp.totalBet) {
        // 对手下注 <= 赢家下注，全部归赢家
        winAmount += p.totalBet;
      } else {
        // 对手下注 > 赢家下注，赢家只能赢 totalBet 部分，超出退回给对手
        winAmount += gp.totalBet;
        const refund = p.totalBet - gp.totalBet;
        refunds.set(p.playerId, refund);
      }
    }

    if (player) {
      player.chips += winAmount;
    }

    // 退回超出部分
    for (const [pid, refund] of refunds) {
      const p = this.getPlayer(pid);
      if (p) p.chips += refund;
    }

    const handResult: HandResult = {
      winners: [{
        playerId: gp.playerId,
        nickname: player?.nickname || 'Unknown',
        handDescription: '对手弃牌',
        handRank: 0,
        chipsWon: winAmount,
        cards: gp.hand,
      }],
      allHands: this.game.players.map(gp2 => {
        const best = getBestHand(gp2.hand, this.game.communityCards);
        const p = this.getPlayer(gp2.playerId);
        return {
          playerId: gp2.playerId,
          nickname: p?.nickname || 'Unknown',
          handDescription: best.handDescription,
          handRank: best.handRank,
          cards: gp2.hand,
          isFolded: gp2.isFolded,
        };
      }),
    };

    this.lastHandResult = handResult;
    this.broadcastFn('hand_result', handResult);
    this.room.game = this.game;

    // 记录本局历史
    this.recordHandHistory(handResult);

    // 筹码归零的玩家：AI自动借入，真人发 borrow_request 等待决策
    this.collectBrokePlayersAndProceed();

    // 等待所有真人玩家关闭结算画面后进入下一局
    this.waitForHandResultAcks();
  }

  /**
   * 收集筹码归零的玩家：AI 自动借入，真人加入 pendingBorrowers 并发 borrow_request。
   */
  private collectBrokePlayersAndProceed(): void {
    this.pendingBorrowers.clear();
    for (const player of this.getPlayersArray()) {
      if (player.chips <= 0) {
        if (this.botPlayers.has(player.id)) {
          player.chips = this.room.settings.initialChips;
          player.borrowCount += 1;
        } else {
          this.pendingBorrowers.add(player.id);
          this.privateFn(player.id, 'borrow_request', {
            playerId: player.id,
            borrowCount: player.borrowCount,
            initialChips: this.room.settings.initialChips,
          });
        }
      }
    }
  }

  /**
   * 等待所有在线真人玩家关闭结算画面。
   * 所有玩家 ack 后（且无待借入决策）才进入下一局。
   * 设 60s 兜底超时防止卡死。
   */
  private waitForHandResultAcks(): void {
    const realPlayers = this.getPlayersArray().filter(
      p => !this.botPlayers.has(p.id) && p.isConnected
    );
    this.pendingHandResultAcks = new Set(realPlayers.map(p => p.id));

    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    // 60s 兜底：防止有玩家不关闭结算画面导致卡死
    this.showdownTimer = setTimeout(() => {
      this.pendingHandResultAcks.clear();
      this.maybeProceedToNextRound();
    }, 60000);

    // 没有真人玩家（全 AI）或全部离线 → 直接进入下一局
    if (this.pendingHandResultAcks.size === 0) {
      this.maybeProceedToNextRound();
    }
  }

  /**
   * 玩家关闭结算画面后调用。
   */
  ackHandResult(playerId: string): void {
    this.pendingHandResultAcks.delete(playerId);
    if (this.pendingHandResultAcks.size === 0) {
      if (this.showdownTimer) clearTimeout(this.showdownTimer);
      this.maybeProceedToNextRound();
    }
  }

  /**
   * 检查是否可以进入下一局：结算画面全部关闭 + 借入决策全部完成。
   */
  private maybeProceedToNextRound(): void {
    if (this.pendingHandResultAcks.size === 0 && this.pendingBorrowers.size === 0) {
      this.resetForNewRound();
    }
  }

  /** 记录单局历史 */
  private recordHandHistory(handResult: HandResult): void {
    const entry: HandHistoryEntry = {
      round: this.game.round,
      winners: handResult.winners.map(w => ({
        playerId: w.playerId,
        nickname: w.nickname,
        chipsWon: w.chipsWon,
        handDescription: w.handDescription,
      })),
      players: this.game.players.map(gp => {
        const p = this.getPlayer(gp.playerId);
        return {
          playerId: gp.playerId,
          nickname: p?.nickname || 'Unknown',
          chipsAfter: p?.chips ?? 0,
          isFolded: gp.isFolded,
        };
      }),
    };
    this.handHistory.push(entry);
  }

  /** 生成最终清算数据 */
  getFinalSettlementData(): FinalSettlementData {
    const players = this.getPlayersArray();
    const initialChips = this.room.settings.initialChips;
    return {
      players: players.map(p => {
        const totalBorrowed = p.borrowCount * initialChips;
        const netProfit = p.chips - totalBorrowed;
        return {
          playerId: p.id,
          nickname: p.nickname,
          finalChips: p.chips,
          initialChips,
          borrowCount: p.borrowCount,
          netProfit,
          isUnderwater: netProfit < 0,
        };
      }),
      handHistory: [...this.handHistory],
      totalHands: this.handHistory.length,
      roomSettings: this.room.settings,
    };
  }

  /** 房主重新开始：沿用相同配置新开一轮 */
  restartGame(): void {
    // 清理状态
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    this.pendingBorrowers.clear();
    this.pendingHandResultAcks.clear();
    this.lastHandResult = null;
    this.handHistory = [];

    // 重置所有玩家筹码和借入次数
    const players = this.getPlayersArray();
    players.forEach((p, i) => {
      p.chips = this.room.settings.initialChips;
      p.borrowCount = 1;
      p.seatIndex = i;
      p.isConnected = true;
    });

    // 新 game
    this.game = this.createGame();
    this.startNewHand();
  }

  /**
   * 房主继续牌局：保持当前积分和借入手数，直接开新的一局。
   * 与 restartGame 的区别：不重置筹码和借入次数，不清空 handHistory（保留累计历史）。
   * 适用于"最终清算后继续玩"的场景——玩家想看清算数据后接着原班配置继续。
   */
  continueGame(): void {
    // 清理当前局的状态（不重置玩家筹码）
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    this.pendingBorrowers.clear();
    this.pendingHandResultAcks.clear();
    this.lastHandResult = null;

    // 仅保留筹码 > 0 的玩家参与下一手（与 resetForNewRound 逻辑一致）
    const playersWithChips = this.getPlayersArray().filter(p => p.chips > 0);
    if (playersWithChips.length < 2) {
      // 不足 2 人无法继续，由调用方处理错误
      throw new Error('剩余可继续玩家不足 2 人');
    }

    // dealer 顺时针轮转一位
    const prevDealer = this.game.dealerIndex;
    const prevRound = this.game.round;
    this.game = this.createGame();
    this.game.round = prevRound + 1;
    this.game.dealerIndex = (prevDealer + 1) % playersWithChips.length;

    this.startNewHand();
  }

  /**
   * 玩家做出借入决策（借入或旁观）后调用。
   * 当所有待借入玩家都决策完，触发下一局。
   */
  resolveBorrower(playerId: string, borrow: boolean): void {
    if (!this.pendingBorrowers.has(playerId)) return;
    this.pendingBorrowers.delete(playerId);

    if (borrow) {
      const player = this.getPlayer(playerId);
      if (player && player.chips <= 0) {
        player.chips = this.room.settings.initialChips;
        player.borrowCount += 1;
      }
    }

    // 广播房间更新（筹码变化）
    this.broadcastFn('room_updated', {
      room: {
        id: this.room.id,
        name: this.room.name,
        hostId: this.room.hostId,
        players: this.getPlayersArray(),
        settings: this.room.settings,
        game: this.game,
        createdAt: this.room.createdAt,
        isPaused: this.room.isPaused,
      },
    });

    // 所有借入决策完成，检查是否可以进入下一局
    if (this.pendingBorrowers.size === 0) {
      // 短暂延迟让前端看到决策结果
      if (this.showdownTimer) clearTimeout(this.showdownTimer);
      this.showdownTimer = setTimeout(() => {
        this.maybeProceedToNextRound();
      }, 1000);
    }
  }

  private resetForNewRound(): void {
    const allPlayers = this.getPlayersArray();
    // 只有筹码 > 0 的玩家参与下一手（筹码归零且未借入的玩家旁观）
    const playersWithChips = allPlayers.filter(p => p.chips > 0);

    if (playersWithChips.length < 2) {
      this.broadcastFn('error', { message: '游戏结束，可玩人数不足（其他玩家筹码归零，请借入后继续）' });
      this.room.game = null;
      // 通知前端更新房间状态
      this.broadcastFn('room_updated', {
        room: {
          id: this.room.id,
          name: this.room.name,
          hostId: this.room.hostId,
          players: this.getPlayersArray(),
          settings: this.room.settings,
          game: null as any,
          createdAt: this.room.createdAt,
          isPaused: this.room.isPaused,
        },
      });
      return;
    }

    // 下一手：dealerIndex 递增，round +1
    const prevRound = this.game.round;
    const prevDealer = this.game.dealerIndex;
    this.game = this.createGame();
    this.game.round = prevRound + 1;
    this.game.dealerIndex = (prevDealer + 1) % playersWithChips.length;

    // startNewHand 会重新发牌、下盲注、开始下注
    this.startNewHand();

    // 广播 room_updated 让前端更新筹码、座位等
    this.broadcastFn('room_updated', {
      room: {
        id: this.room.id,
        name: this.room.name,
        hostId: this.room.hostId,
        players: this.getPlayersArray(),
        settings: this.room.settings,
        game: this.game,
        createdAt: this.room.createdAt,
        isPaused: this.room.isPaused,
      },
    });
  }

  handlePlayerDisconnect(playerId: string): void {
    if (this.botPlayers.has(playerId)) return;

    // 摊牌阶段断线：从 ack 和借入等待集合中移除，避免卡死
    if (this.game.phase === 'showdown') {
      this.pendingHandResultAcks.delete(playerId);
      this.pendingBorrowers.delete(playerId);
      this.maybeProceedToNextRound();
      return;
    }

    this.disconnectTimers.set(playerId, setTimeout(() => {
      const gp = this.game.players.find(p => p.playerId === playerId);
      if (gp && !gp.isFolded) {
        if (this.game.players[this.game.currentPlayerIndex]?.playerId === playerId) {
          this.handleAction(playerId, 'fold', 0);
        } else {
          gp.isFolded = true;
          gp.isActive = false;
          this.checkBettingRoundEnd();
        }
      }
    }, 30000));
  }

  handlePlayerReconnect(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  private updatePot(): void {
    this.game.pot = this.game.players.reduce((sum: number, p: any) => sum + p.totalBet, 0);
    this.game.sidePots = this.calculateSidePots();
  }

  private calculateSidePots(): SidePot[] {
    const sidePots: SidePot[] = [];
    const allPlayers = this.game.players;

    // 收集所有 all-in 玩家的 totalBet 作为分层阈值
    const allInBets = [...new Set(allPlayers.filter(p => p.isAllIn).map(p => p.totalBet))].sort((a, b) => a - b);

    if (allInBets.length === 0) return [];

    let prevThreshold = 0;
    for (const threshold of allInBets) {
      if (threshold <= prevThreshold) continue;

      // 该层金额 = 每个玩家在 (prevThreshold, threshold] 区间的贡献（含已弃牌玩家）
      let potAmount = 0;
      for (const p of allPlayers) {
        if (p.totalBet <= prevThreshold) continue;
        const contribution = Math.min(p.totalBet, threshold) - prevThreshold;
        potAmount += contribution;
      }

      // eligible = 未弃牌且 totalBet >= threshold
      const eligible = allPlayers
        .filter(p => !p.isFolded && p.totalBet >= threshold)
        .map(p => p.playerId);

      if (potAmount > 0) {
        sidePots.push({ amount: potAmount, eligiblePlayers: eligible });
      }
      prevThreshold = threshold;
    }

    // 主池（剩余部分）：所有玩家超过最高 all-in 阈值的部分
    let mainPotAmount = 0;
    for (const p of allPlayers) {
      if (p.totalBet <= prevThreshold) continue;
      mainPotAmount += p.totalBet - prevThreshold;
    }

    if (mainPotAmount > 0) {
      const eligible = allPlayers
        .filter(p => !p.isFolded && p.totalBet > prevThreshold)
        .map(p => p.playerId);
      sidePots.push({ amount: mainPotAmount, eligiblePlayers: eligible });
    }

    return sidePots;
  }

  private getHandNumericValue(cards: Card[]): number {
    // 直接使用 deck.ts 的 getHandValue，它正确地按频率排序（对子/三条优先于 kicker）
    return getHandValue(cards);
  }

  private getPlayer(playerId: string): Player | null {
    if (this.room.players instanceof Map) {
      return this.room.players.get(playerId) || null;
    }
    return (this.room.players as Record<string, Player>)[playerId] || null;
  }

  private getPlayersArray(): Player[] {
    if (this.room.players instanceof Map) {
      return Array.from(this.room.players.values());
    }
    return Object.values(this.room.players);
  }

  getGame(): Game {
    return this.game;
  }

  getRoom(): Room {
    return this.room;
  }

  /**
   * 玩家重连后，重新发送该玩家需要的游戏状态。
   */
  resendStateForPlayer(playerId: string): void {
    // 摊牌阶段：重发结算画面，让玩家能看到结果并 ack
    if (this.game.phase === 'showdown') {
      if (this.lastHandResult) {
        this.privateFn(playerId, 'hand_result', this.lastHandResult);
      }
      // 如果该玩家在等待借入决策，重发 borrow_request
      if (this.pendingBorrowers.has(playerId)) {
        const player = this.getPlayer(playerId);
        if (player) {
          this.privateFn(playerId, 'borrow_request', {
            playerId,
            borrowCount: player.borrowCount,
            initialChips: this.room.settings.initialChips,
          });
        }
      }
      return;
    }

    // waiting 阶段（两手之间的短暂过渡）：重发 borrow_request（如果有）
    if (this.game.phase === 'waiting') {
      if (this.pendingBorrowers.has(playerId)) {
        const player = this.getPlayer(playerId);
        if (player) {
          this.privateFn(playerId, 'borrow_request', {
            playerId,
            borrowCount: player.borrowCount,
            initialChips: this.room.settings.initialChips,
          });
        }
      }
      return;
    }

    // 正常游戏阶段：重发手牌、社区牌、pot、当前轮次
    const gp = this.game.players.find(p => p.playerId === playerId);
    if (!gp || this.botPlayers.has(playerId)) return;

    // 1. 重发手牌
    if (gp.hand.length > 0) {
      this.privateFn(playerId, 'cards_dealt', { cards: gp.hand });
    }

    // 2. 重发社区牌 + phase
    if (this.game.communityCards.length > 0) {
      this.privateFn(playerId, 'community_cards', {
        cards: this.game.communityCards,
        phase: this.game.phase,
      });
    }

    // 3. 重发 pot
    this.privateFn(playerId, 'pot_updated', {
      pot: this.game.pot,
      sidePots: this.game.sidePots,
    });

    // 4. 广播 turn_changed 让客户端同步当前行动者
    const currentGp = this.game.players[this.game.currentPlayerIndex];
    if (currentGp) {
      this.privateFn(playerId, 'turn_changed', {
        currentPlayerId: currentGp.playerId,
        phase: this.game.phase,
        pot: this.game.pot,
      });
    }

    // 5. 如果轮到该玩家且未弃牌，重发 your_turn
    if (currentGp?.playerId === playerId && !gp.isFolded && !gp.isAllIn) {
      this.sendTurnToPlayer(gp);
    }
  }

  destroy(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }
}
