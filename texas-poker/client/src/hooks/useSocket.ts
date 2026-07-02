import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../stores/gameStore';
import { playSound, initAudio, type SoundType } from './useAudio';
import type { HandResult, TurnOptions, GamePhase, Card, RoomListItem, FinalSettlementData } from '../types/game';

let socket: Socket | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

export function useSocket() {
  const getSocket = useCallback((): Socket | null => socket, []);

  const connect = useCallback((serverUrl: string) => {
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
      const st = useGameStore.getState();
      st.setConnected(true);

      // 连接成功后初始化音频上下文（实际发声需用户首次交互后由浏览器解锁）
      initAudio();

      // 重连恢复：如果有 playerId 和 room，自动重新建立服务端映射
      // （socket 重连后 socket.id 会变，必须重新关联，否则收不到 cards_dealt/your_turn）
      const { playerId, room } = st;
      if (playerId && room) {
        socket!.emit('reconnect_player', { playerId, roomCode: room.id }, (res: any) => {
          if (res.success && res.room) {
            useGameStore.getState().setRoom(res.room as RoomListItem);
          } else {
            // 重连失败（房间已解散或玩家被清理），清掉持久化数据
            localStorage.removeItem('poker_player_id');
            localStorage.removeItem('poker_room_code');
            useGameStore.getState().reset();
          }
        });
      }
    });

    socket.on('disconnect', () => {
      useGameStore.getState().setConnected(false);
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
      // 重置 room.game 为新一局，清空上一手的 betHistory / players 等
      const r = st.room;
      if (r) {
        st.setRoom({
          ...r,
          game: {
            id: `game_${Date.now()}`,
            round: 1,
            phase: 'preflop',
            deck: [],
            communityCards: [],
            pot: 0,
            sidePots: [],
            dealerIndex: data.dealerPos ?? 0,
            currentPlayerIndex: 0,
            players: (data.seats || []).map((p: any) => ({
              playerId: p.id,
              hand: [],
              currentBet: 0,
              totalBet: 0,
              isFolded: false,
              isAllIn: false,
              isActive: true,
            })),
            betHistory: [],
          } as any,
        });
      }
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
      const r = st.room;
      if (r) {
        const updatedPlayers = r.players.map(p => p.id === data.playerId ? { ...p, chips: data.chips } : p);
        const updatedGame = r.game ? {
          ...r.game,
          pot: data.pot,
          players: data.gamePlayers || r.game.players,
          betHistory: data.betHistory || r.game.betHistory,
        } : r.game;
        st.setRoom({ ...r, players: updatedPlayers, game: updatedGame });
      }
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
    });

    socket.on('room_disbanded', () => {
      useGameStore.getState().reset();
    });

    socket.on('final_settlement', (data: FinalSettlementData) => {
      useGameStore.getState().setFinalSettlement(data);
    });

    socket.on('danmaku_received', (data: { playerId: string; nickname: string; text: string; color: string }) => {
      useGameStore.getState().addDanmaku({
        nickname: data.nickname,
        text: data.text,
        color: data.color,
      });
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
