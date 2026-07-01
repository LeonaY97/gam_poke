import { Room, RoomListItem, Player, RoomSettings } from '../../shared/types';
import { generateRoomCode } from '../engine/deck';
import { GameController } from './GameController';
import { selectAIPersonas } from '../ai/aiPersonas';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private gameControllers: Map<string, GameController> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupRooms(), 5 * 60 * 1000);
  }

  createRoom(nickname: string, settings: Partial<RoomSettings>): { room: Room; playerId: string } {
    const roomCode = this.generateUniqueCode();
    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const roomSettings: RoomSettings = {
      initialChips: settings.initialChips || 1000,
      smallBlind: settings.smallBlind || 10,
      bigBlind: settings.bigBlind || 20,
      maxPlayers: settings.maxPlayers || 9,
      blindInterval: settings.blindInterval || 0,
      botCount: settings.botCount || 0,
    };

    const player: Player = {
      id: playerId,
      nickname,
      chips: roomSettings.initialChips,
      seatIndex: 0,
      isReady: true,
      isConnected: true,
      isHost: true,
      borrowCount: 1,
    };

    const room: Room = {
      id: roomCode,
      name: `${nickname}的房间`,
      hostId: playerId,
      players: new Map([[playerId, player]]),
      settings: roomSettings,
      game: null,
      createdAt: Date.now(),
      isPaused: false,
    };

    this.rooms.set(roomCode, room);

    // 创建房间时立即加入 AI 玩家
    if (roomSettings.botCount > 0) {
      this.addBots(roomCode, roomSettings.botCount);
    }

    return { room, playerId };
  }

  joinRoom(roomCode: string, nickname: string): { room: Room; playerId: string } | null {
    const normalized = roomCode.toUpperCase().trim();
    const room = this.rooms.get(normalized);
    if (!room) return null;

    const playerCount = room.players instanceof Map ? room.players.size : Object.keys(room.players).length;
    if (playerCount >= room.settings.maxPlayers) return null;

    if (room.game && room.game.phase !== 'waiting' && room.game.phase !== 'showdown') {
      return null;
    }

    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const player: Player = {
      id: playerId,
      nickname,
      chips: room.settings.initialChips,
      seatIndex: playerCount,
      isReady: true,
      isConnected: true,
      isHost: false,
      borrowCount: 1,
    };

    if (room.players instanceof Map) {
      room.players.set(playerId, player);
    }

    return { room, playerId };
  }

  addBots(roomCode: string, count: number): Player[] {
    const room = this.rooms.get(roomCode);
    if (!room) return [];

    const personas = selectAIPersonas(count);
    const bots: Player[] = [];

    for (let i = 0; i < count; i++) {
      const playerCount = room.players instanceof Map ? room.players.size : Object.keys(room.players).length;
      const persona = personas[i];
      const botId = `bot_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      const bot: Player = {
        id: botId,
        nickname: persona.nickname,
        chips: room.settings.initialChips,
        seatIndex: playerCount,
        isReady: true,
        isConnected: true,
        isHost: false,
        borrowCount: 1,
        aiPersonaId: persona.id,
      };

      if (room.players instanceof Map) {
        room.players.set(botId, bot);
      }
      bots.push(bot);
    }

    return bots;
  }

  leaveRoom(roomCode: string, playerId: string): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (room.players instanceof Map) {
      room.players.delete(playerId);
    }

    if (room.hostId === playerId) {
      if (room.players instanceof Map && room.players.size > 0) {
        const nextHost = room.players.values().next().value;
        if (nextHost) {
          room.hostId = nextHost.id;
          nextHost.isHost = true;
        }
      }
    }

    if (room.players instanceof Map && room.players.size === 0) {
      this.rooms.delete(roomCode);
      this.gameControllers.delete(roomCode);
      return null;
    }

    if (room.game && room.game.phase !== 'waiting' && room.game.phase !== 'showdown') {
      const controller = this.gameControllers.get(roomCode);
      if (controller) {
        controller.handlePlayerDisconnect(playerId);
      }
    }

    return room;
  }

  getRoom(roomCode: string): Room | null {
    return this.rooms.get(roomCode) || null;
  }

  getRoomList(): RoomListItem[] {
    const list: RoomListItem[] = [];
    for (const room of this.rooms.values()) {
      const players = room.players instanceof Map
        ? Array.from(room.players.values())
        : Object.values(room.players);
      list.push({ ...room, players });
    }
    return list;
  }

  toRoomListItem(room: Room): RoomListItem {
    const players = room.players instanceof Map
      ? Array.from(room.players.values())
      : Object.values(room.players);
    return { ...room, players };
  }

  getGameController(roomCode: string): GameController | null {
    return this.gameControllers.get(roomCode) || null;
  }

  createGameController(
    roomCode: string,
    broadcastFn: (event: string, data: unknown) => void,
    privateFn: (playerId: string, event: string, data: unknown) => void
  ): GameController {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');

    const controller = new GameController(room, broadcastFn, privateFn);
    this.gameControllers.set(roomCode, controller);
    return controller;
  }

  removeGameController(roomCode: string): void {
    this.gameControllers.delete(roomCode);
  }

  disbandRoom(roomCode: string): boolean {
    this.gameControllers.delete(roomCode);
    return this.rooms.delete(roomCode);
  }

  isHost(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    return room ? room.hostId === playerId : false;
  }

  /**
   * 玩家借入筹码（筹码归零后可再借一手）
   * 返回更新后的 room，或 null（房间/玩家不存在）
   */
  borrowChips(roomCode: string, playerId: string): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (room.players instanceof Map) {
      const player = room.players.get(playerId);
      if (!player) return null;
      // 只有筹码归零时才能借入
      if (player.chips > 0) return null;
      player.chips = room.settings.initialChips;
      player.borrowCount += 1;
      return room;
    }
    return null;
  }

  updatePlayerConnection(roomCode: string, playerId: string, connected: boolean): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (room.players instanceof Map) {
      const player = room.players.get(playerId);
      if (player) {
        player.isConnected = connected;
      }
    }

    return room;
  }

  private generateUniqueCode(): string {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));
    return code;
  }

  private cleanupRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      const playerCount = room.players instanceof Map ? room.players.size : Object.keys(room.players).length;
      const allDisconnected = room.players instanceof Map
        ? Array.from(room.players.values()).every(p => !p.isConnected)
        : Object.values(room.players).every(p => !p.isConnected);

      if (playerCount === 0 || (allDisconnected && now - room.createdAt > 30 * 60 * 1000)) {
        this.rooms.delete(code);
        this.gameControllers.delete(code);
      }
    }
  }
}
