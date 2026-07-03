import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../stores/gameStore';
import { playSound, initAudio, type SoundType } from './useAudio';
import type { HandResult, TurnOptions, GamePhase, Card, RoomListItem, FinalSettlementData } from '../types/game';

let socket: Socket | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandlerRegistered = false;

/** 注册一次 visibilitychange 监听器：手机切回前台时主动重连 socket */
function ensureVisibilityHandler() {
  if (visibilityHandlerRegistered) return;
  visibilityHandlerRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const st = useGameStore.getState();
    if (!socket || !st.playerId) return;
    // socket 断开时主动重连
    if (!socket.connected) {
      console.log('[visibility] 切回前台，socket 断开，主动重连');
      try { socket.connect(); } catch {}
    }
    // 无论 socket 是否连接，切回前台时都标记需要立即轮询一次（由 GamePage 轮询 useEffect 处理）
    // 通过设置一个标志，让轮询逻辑立即执行
    (window as any).__pendingPoll = true;
  });
}

export function useSocket() {
  const getSocket = useCallback((): Socket | null => socket, []);

  const connect = useCallback((serverUrl: string) => {
    // 注册手机切回前台的 visibilitychange 监听器（只注册一次）
    ensureVisibilityHandler();
    // 防止重复连接：如果 socket 已存在且正在连接/已连接到同一服务器，跳过
    if (socket) {
      if (socket.connected) return socket;
      // socket 存在但未连接，可能是正在重连中，不要覆盖
      if (socket.io.engine && socket.io.engine.readyState === 'opening') return socket;
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[socket] connected, id=', socket!.id);
      const st = useGameStore.getState();
      st.setConnected(true);

      // 连接成功后初始化音频上下文（实际发声需用户首次交互后由浏览器解锁）
      initAudio();

      // 重连恢复：如果有 playerId 和 room，自动重新建立服务端映射
      // （socket 重连后 socket.id 会变，必须重新关联，否则收不到 cards_dealt/your_turn）
      const { playerId, room } = st;
      if (playerId && room) {
        // 重连超时兜底：5s 没收到 ack，认为重连失败
        const reconnectTimeout = setTimeout(() => {
          console.warn('[重连] reconnect_player 5s 未响应，视为失败');
          localStorage.removeItem('poker_player_id');
          localStorage.removeItem('poker_room_code');
          useGameStore.getState().reset();
          // 跳回首页，避免卡在 /room/xxx 路由
          if (window.location.pathname !== '/') {
            window.location.href = '/';
          }
        }, 5000);
        socket!.emit('reconnect_player', { playerId, roomCode: room.id }, (res: any) => {
          clearTimeout(reconnectTimeout);
          if (res.success && res.room) {
            useGameStore.getState().setRoom(res.room as RoomListItem);
            // 重连成功后让 GameController 重发状态
            const controller = (window as any).__gameControllerCache?.[room.id];
            if (controller && res.room.game && res.room.game.phase !== 'waiting') {
              useGameStore.getState().setInGame(true);
              useGameStore.getState().setGamePhase(res.room.game.phase);
            }
          } else {
            // 重连失败（房间已解散或玩家被清理），清掉持久化数据并跳回首页
            localStorage.removeItem('poker_player_id');
            localStorage.removeItem('poker_room_code');
            useGameStore.getState().reset();
            if (window.location.pathname !== '/') {
              window.location.href = '/';
            }
          }
        });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected, reason=', reason);
      useGameStore.getState().setConnected(false);
      // io server disconnect（服务端主动断开，如 cleanup）不会自动重连，需要手动重连
      if (reason === 'io server disconnect' && socket) {
        console.log('[socket] 服务端主动断开，1s 后手动重连');
        setTimeout(() => { try { socket!.connect(); } catch (e) { console.error('[socket] 重连失败', e); } }, 1000);
      }
    });

    socket.on('room_created', (data: { roomCode: string; playerId: string; room?: RoomListItem }) => {
      const st = useGameStore.getState();
      st.setPlayerId(data.playerId);
      // 持久化 playerId，便于页面刷新后重连
      localStorage.setItem('poker_player_id', data.playerId);
      if (data.room) {
        st.setRoom(data.room);
        localStorage.setItem('poker_room_code', data.room.id);
      }
    });

    socket.on('room_updated', (data: { room: RoomListItem }) => {
      const st = useGameStore.getState();
      st.setRoom(data.room);
      if (data.room.game && data.room.game.phase !== 'waiting') {
        st.setInGame(true);
        st.setGamePhase(data.room.game.phase);
        st.setPot(data.room.game.pot);
      }
    });

    socket.on('game_started', (data: { seats?: any[]; dealerPos?: number; currentPlayerId?: string }) => {
      console.log('[socket] game_started, seats=', data.seats?.length, 'dealer=', data.dealerPos);
      const st = useGameStore.getState();
      st.setInGame(true);
      st.setGamePhase('preflop');
      st.setMyCards([]);
      st.setCommunityCards([]);
      st.setPot(0);
      st.setHandResult(null);
      st.setTurnOptions(null);
      st.setCurrentPlayerId(null);
      st.setBorrowRequest(null);
      st.setFinalSettlement(null);
      // 不调用 setRoom——服务端在 startGame 后立即广播 room_updated（含完整 room.game），
      // 双重 setRoom 会导致手机端 800+ 行 GamePage 短时间内重渲染两次。
      // room_updated 会带来重排后的 players 和完整 game 状态。
      // 如果 room_updated 丢失，6s 轮询会兜底拉取。
    });

    socket.on('borrow_request', (data: { playerId: string; borrowCount: number; initialChips: number }) => {
      const st = useGameStore.getState();
      if (data.playerId === st.playerId) {
        st.setBorrowRequest({ borrowCount: data.borrowCount, initialChips: data.initialChips });
      }
    });

    socket.on('cards_dealt', (data: { cards: Card[] }) => {
      useGameStore.getState().setMyCards(data.cards);
      playSound('deal');
    });

    socket.on('community_cards', (data: { cards: Card[]; phase: GamePhase }) => {
      const st = useGameStore.getState();
      st.setCommunityCards(data.cards);
      st.setGamePhase(data.phase);
    });

    socket.on('your_turn', (data: { options: TurnOptions; phase: GamePhase; pot: number }) => {
      console.log('[socket] your_turn, phase=', data.phase, 'pot=', data.pot);
      const st = useGameStore.getState();
      st.setTurnOptions(data.options);
      st.setCurrentPlayerId(st.playerId);
      st.setGamePhase(data.phase);
      st.setPot(data.pot);
      st.setCountdown(data.options.timeout);

      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        const current = useGameStore.getState().countdown;
        if (current <= 1) {
          if (countdownTimer) clearInterval(countdownTimer);
          countdownTimer = null;
        }
        useGameStore.getState().setCountdown(Math.max(0, current - 1));
      }, 1000);
    });

    socket.on('turn_changed', (data: { currentPlayerId: string; phase: GamePhase; pot: number }) => {
      console.log('[socket] turn_changed, player=', data.currentPlayerId, 'phase=', data.phase);
      const st = useGameStore.getState();
      st.setCurrentPlayerId(data.currentPlayerId);
      st.setGamePhase(data.phase);
      st.setPot(data.pot);
      // 如果不是轮到自己，清除自己的操作选项和倒计时
      if (data.currentPlayerId !== st.playerId) {
        st.setTurnOptions(null);
        st.setCountdown(0);
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      }
    });

    socket.on('action_result', (data: { playerId: string; playerName: string; action: string; amount: number; chips: number; pot: number; currentBet: number; isFolded: boolean; isAllIn: boolean; gamePlayers?: any[]; betHistory?: any[] }) => {
      const st = useGameStore.getState();
      st.setLastAction({ playerId: data.playerId, playerName: data.playerName, action: data.action as any, amount: data.amount });
      st.setPot(data.pot);
      const actionSounds: Record<string, SoundType> = {
        fold: 'fold', check: 'check', call: 'call', raise: 'raise', allin: 'allin', all_in: 'allin',
      };
      const sound = actionSounds[data.action];
      if (sound) playSound(sound);
      if (data.playerId === st.playerId) {
        st.setTurnOptions(null);
        st.setCountdown(0);
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      }
      // 性能优化：用细粒度 setter 替代全量 setRoom
      // 之前：st.setRoom({...r, players: updatedPlayers, game: updatedGame}) 会触发整树重渲染
      // 现在：仅修改筹码和游戏状态，未变玩家的对象引用保持不变，PlayerSeat memo 才能跳过
      st.updatePlayerChips(data.playerId, data.chips);
      st.updateGameState({
        pot: data.pot,
        gamePlayers: data.gamePlayers,
        betHistory: data.betHistory,
      });
    });

    socket.on('pot_updated', (data: { pot: number }) => {
      useGameStore.getState().setPot(data.pot);
    });

    socket.on('hand_result', (data: HandResult) => {
      const st = useGameStore.getState();
      st.setHandResult(data);
      st.setGamePhase('showdown');
      st.setTurnOptions(null);
      st.setCurrentPlayerId(null);
      st.setCountdown(0);
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      playSound('win');
    });

    socket.on('player_eliminated', (data: { playerId: string; nickname: string }) => {
      const st = useGameStore.getState();
      if (st.room) {
        st.setRoom({ ...st.room, players: st.room.players.filter(p => p.id !== data.playerId) });
      }
    });

    socket.on('player_disconnected', (data: { playerId: string; nickname: string }) => {
      const st = useGameStore.getState();
      if (st.room) {
        st.setRoom({ ...st.room, players: st.room.players.map(p => p.id === data.playerId ? { ...p, isConnected: false } : p) });
      }
    });

    socket.on('player_reconnected', (data: { playerId: string; nickname: string }) => {
      const st = useGameStore.getState();
      if (st.room) {
        st.setRoom({ ...st.room, players: st.room.players.map(p => p.id === data.playerId ? { ...p, isConnected: true } : p) });
      }
      // 重连玩家：清除离线倒计时
      if (st.offlineCountdown?.playerId === data.playerId) {
        st.setOfflineCountdown(null);
      }
    });

    socket.on('offline_countdown', (data: { playerId: string; seconds: number }) => {
      const st = useGameStore.getState();
      st.setOfflineCountdown({ playerId: data.playerId, seconds: data.seconds });
      // 倒计时结束后自动清除
      setTimeout(() => {
        const cur = useGameStore.getState().offlineCountdown;
        if (cur?.playerId === data.playerId) {
          useGameStore.getState().setOfflineCountdown(null);
        }
      }, data.seconds * 1000);
    });

    socket.on('room_disbanded', () => {
      useGameStore.getState().reset();
    });

    socket.on('final_settlement', (data: FinalSettlementData) => {
      useGameStore.getState().setFinalSettlement(data);
    });

    socket.on('danmaku_received', (data: { playerId: string; nickname: string; text: string; color: string; isSpectator?: boolean }) => {
      useGameStore.getState().addDanmaku({
        nickname: data.nickname,
        text: data.text,
        color: data.color,
        isSpectator: data.isSpectator,
      });
    });

    socket.on('spectator_hands', (data: { hands: { playerId: string; nickname: string; cards: Card[]; isFolded: boolean }[]; phase: GamePhase }) => {
      useGameStore.getState().setSpectatorHands(data.hands);
    });

    socket.on('error', (data: { message: string }) => {
      alert(data.message);
    });

    return socket;
  }, []);

  useEffect(() => {
    return () => {
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, []);

  return { connect, getSocket, disconnect: () => socket?.disconnect() };
}
