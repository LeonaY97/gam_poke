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
      botCount: settings.botCount ?? 8,
      aiDifficulty: settings.aiDifficulty || 'medium',
    };

    const player: Player = {
      id: playerId,
      nickname,
      chips: roomSettings.initialChips,
      isAI: false,
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

    if (roomSettings.botCount > 0) {
      this.addBots(roomCode, roomSettings.botCount);
    }

    return { room, playerId };
  }

  joinRoom(roomCode: string, nickname: string): { room: Room; playerId: string } | null {
    const normalized = roomCode.trim();
    const room = this.rooms.get(normalized);
    if (!room) return null;

    const playerCount = room.players instanceof Map ? room.players.size : Object.keys(room.players).length;
    if (playerCount >= room.settings.maxPlayers) return null;
    if (room.game && room.game.phase !== 'waiting') return null;

    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const player: Player = {
      id: playerId,
      nickname,
      chips: room.settings.initialChips,
      isAI: false,
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

    for (const persona of personas) {
      const botId = `bot_${persona.id}_${Math.random().toString(36).slice(2, 6)}`;

      const bot: Player = {
        id: botId,
        nickname: persona.nickname,
        chips: room.settings.initialChips,
        isAI: true,
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

    if (playerId === room.hostId) {
      if (room.players instanceof Map && room.players.size > 0) {
        for (const [id, p] of room.players) {
          if (!p.isAI) {
            room.hostId = id;
            p.isHost = true;
            break;
          }
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

  listRooms(): RoomListItem[] {
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

  setGameController(roomCode: string, controller: GameController): void {
    this.gameControllers.set(roomCode, controller);
  }

  updatePlayerConnection(roomCode: string, playerId: string, connected: boolean): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const player = room.players instanceof Map
      ? room.players.get(playerId)
      : null;

    if (!player) return null;

    player.isConnected = connected;
    return room;
  }

  disbandRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
    this.gameControllers.delete(roomCode);
  }

  private cleanupRooms(): void {
    const now = Date.now();
    const expireMs = 30 * 60 * 1000;

    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > expireMs) {
        const playerCount = room.players instanceof Map ? room.players.size : 0;
        const hasHuman = room.players instanceof Map
          ? Array.from(room.players.values()).some(p => !p.isAI)
          : false;

        if (!hasHuman || playerCount === 0) {
          this.rooms.delete(code);
          this.gameControllers.delete(code);
        }
      }
    }
  }

  private generateUniqueCode(): string {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));
    return code;
  }
}
