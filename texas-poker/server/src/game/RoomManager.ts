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

  /**
   * 加入房间（含旁观者模式）。
   * 返回值说明：
   *   - 成功（正常加入或旁观加入）：{ room, playerId, isSpectator }
   *   - 失败：{ error: 错误原因 }（房间不存在/同昵称/其他）
   * 调用方根据 asSpectator 标志和房间满员状态决定行为：
   *   - 普通加入且房间未满：asSpectator=false → 正常加入
   *   - 普通加入但房间已满：asSpectator=false → 返回错误"房间已满"，前端询问是否旁观
   *   - 旁观加入：asSpectator=true → 跳过 maxPlayers 校验，但同昵称仍校验
   */
  joinRoom(
    roomCode: string,
    nickname: string,
    asSpectator: boolean = false,
  ): { room: Room; playerId: string; isSpectator: boolean } | { error: string } {
    const normalized = roomCode.trim();
    const room = this.rooms.get(normalized);
    if (!room) return { error: '房间不存在' };

    // 现有玩家列表
    const existingPlayers: Player[] = room.players instanceof Map
      ? Array.from(room.players.values())
      : Object.values(room.players);

    // 同昵称校验（不区分旁观者，旁观者也不允许和现有玩家同名）
    const sameName = existingPlayers.find(
      p => p.nickname === nickname && !p.isAI,
    );
    if (sameName) return { error: '房间内已存在相同昵称的玩家，请换个昵称' };

    const realPlayerCount = existingPlayers.filter(p => !p.isSpectator).length;
    const isFull = realPlayerCount >= room.settings.maxPlayers;

    // 非旁观模式下房间已满 → 返回提示，让前端询问是否以旁观者加入
    if (!asSpectator && isFull) {
      return { error: 'ROOM_FULL' };
    }

    // 旁观模式下，或房间未满的正常加入
    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const willBeSpectator = asSpectator || isFull;

    const player: Player = {
      id: playerId,
      nickname,
      chips: 0, // 旁观者不持有筹码
      isAI: false,
      isConnected: true,
      isHost: false,
      borrowCount: 0,
      isSpectator: willBeSpectator,
    };

    if (room.players instanceof Map) {
      room.players.set(playerId, player);
    }

    return { room, playerId, isSpectator: willBeSpectator };
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
          ? Array.from(room.players.values()).some((p: Player) => !p.isAI)
          : false;

        if (!hasHuman || playerCount === 0) {
          this.rooms.delete(code);
          this.gameControllers.delete(code);
        }
      }
    }
  }

  /**
   * 清理全部房间与 GameController（用于"清空房间"功能）。
   * 返回被销毁的房间数 + controller 数，便于前端展示反馈。
   * 不会停止服务器进程本身——仅清空内存状态，为新建房间做好准备。
   */
  clearAll(): { rooms: number; controllers: number } {
    let controllerCount = 0;
    for (const [, controller] of this.gameControllers) {
      try { controller.destroy(); } catch {}
      controllerCount++;
    }
    const roomCount = this.rooms.size;
    this.rooms.clear();
    this.gameControllers.clear();
    return { rooms: roomCount, controllers: controllerCount };
  }

  private generateUniqueCode(): string {
    let code: string;
    do { code = generateRoomCode(); } while (this.rooms.has(code));
    return code;
  }
}
