import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { RoomManager } from './game/RoomManager';
import { GameController } from './game/GameController';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/types';

const app = express();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const roomManager = new RoomManager();
const playerRoomMap = new Map<string, string>();
const playerIdToSocket = new Map<string, string>();

app.get('/health', (_req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  res.json({ status: 'ok', ips, port: 3001 });
});

app.get('/api/room/:roomCode', (req, res) => {
  const room = roomManager.getRoom(req.params.roomCode.trim());
  if (!room) {
    return res.status(404).json({ error: '房间不存在' });
  }
  res.json({ room: roomManager.toRoomListItem(room) });
});

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  socket.on('create_room', (data, callback) => {
    const { room, playerId } = roomManager.createRoom(data.nickname, data.settings || {});
    playerRoomMap.set(socket.id, room.id);
    playerIdToSocket.set(playerId, socket.id);
    socket.join(room.id);
    socket.join(`player:${playerId}`);

    const roomData = roomManager.toRoomListItem(room);

    callback({
      success: true,
      roomCode: room.id,
      playerId,
      room: roomData,
    });

    io.to(room.id).emit('room_updated', { room: roomData });
    console.log(`[房间] ${data.nickname} 创建了房间 ${room.id}`);
  });

  socket.on('join_room', (data, callback) => {
    const result = roomManager.joinRoom(data.roomCode, data.nickname);
    if (!result) {
      return callback({ success: false, error: '房间不存在或已满或游戏已开始' });
    }

    const { room, playerId } = result;
    playerRoomMap.set(socket.id, room.id);
    playerIdToSocket.set(playerId, socket.id);
    socket.join(room.id);
    socket.join(`player:${playerId}`);

    callback({
      success: true,
      room: roomManager.toRoomListItem(room),
      playerId,
    });

    const roomData = roomManager.toRoomListItem(room);
    io.to(room.id).emit('room_updated', { room: roomData });
    console.log(`[房间] ${data.nickname} 加入了房间 ${room.id}`);
  });

  socket.on('reconnect_player', (data, callback) => {
    const { playerId, roomCode } = data;
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return callback({ success: false, error: '房间不存在' });
    }

    const player = room.players instanceof Map ? room.players.get(playerId) : null;
    if (!player) {
      return callback({ success: false, error: '玩家不在房间中' });
    }

    playerRoomMap.set(socket.id, roomCode);
    playerIdToSocket.set(playerId, socket.id);
    socket.join(roomCode);
    socket.join(`player:${playerId}`);

    const updatedRoom = roomManager.updatePlayerConnection(roomCode, playerId, true);
    if (updatedRoom) {
      const roomData = roomManager.toRoomListItem(updatedRoom);
      io.to(roomCode).emit('room_updated', { room: roomData });
      io.to(roomCode).emit('player_reconnected', { playerId, nickname: player.nickname });
    }

    callback({ success: true, room: roomManager.toRoomListItem(room) });
  });

  socket.on('start_game', (data) => {
    const roomCode = data.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;

    try {
      const controller = new GameController(
        room,
        (event, payload) => {
          io.to(roomCode).emit(event, payload);
        },
        (playerId, event, payload) => {
          io.to(`player:${playerId}`).emit(event, payload);
        },
      );
      roomManager.setGameController(roomCode, controller);
      controller.startGame();

      // startGame 重排了 room.players（真人在前、机器人在后），
      // 必须广播 room_updated 让前端拿到重排后的顺序，否则
      // dealerIndex（相对 game.players）与前端 seatIndex（相对 room.players）错位，
      // 导致位置标记(BTN/SB/BB)标错座位、行动顺序看起来跳跃。
      io.to(roomCode).emit('room_updated', { room: roomManager.toRoomListItem(room) });
      console.log(`[游戏] 房间 ${roomCode} 游戏开始`);
    } catch (e: any) {
      socket.emit('error', { message: e?.message || '无法开始游戏' });
    }
  });

  socket.on('player_action', (data, callback) => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) {
      return callback({ success: false, error: '你不在任何房间中' });
    }

    const controller = roomManager.getGameController(roomCode);
    if (!controller) {
      return callback({ success: false, error: '游戏未开始' });
    }

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];

    if (!playerId) {
      return callback({ success: false, error: '找不到玩家信息' });
    }

    const result = controller.handleAction(playerId, data.action, data.amount || 0);
    callback(result);
  });

  socket.on('borrow_chips', (data, callback) => {
    const roomCode = data.roomCode;
    const room = roomManager.getRoom(roomCode);
    if (!room) return callback({ success: false, error: '房间不存在' });

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return callback({ success: false, error: '找不到玩家信息' });

    const player = room.players instanceof Map ? room.players.get(playerId) : null;
    if (!player) return callback({ success: false, error: '玩家不在房间中' });

    if (player.borrowCount <= 0) {
      return callback({ success: false, error: '借入次数已用完' });
    }

    const initialChips = room.settings.initialChips;
    player.chips += initialChips;
    player.borrowCount--;

    const roomData = roomManager.toRoomListItem(room);
    io.to(roomCode).emit('room_updated', { room: roomData });

    callback({ success: true });
    console.log(`[借入] ${player.nickname} 借入 ${initialChips} 筹码，剩余 ${player.borrowCount} 次`);
  });

  socket.on('resolve_borrow', (data, callback) => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return callback({ success: false, error: '你不在任何房间中' });

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return callback({ success: false, error: '找不到玩家信息' });

    const controller = roomManager.getGameController(roomCode);
    if (!controller) return callback({ success: false, error: '游戏未开始' });

    const borrow = data.borrow !== false;
    controller.resolveBorrower(playerId, borrow);

    callback({ success: true });
    console.log(`[借入] 玩家 ${playerId} ${borrow ? '借入筹码' : '选择旁观'}`);
  });

  socket.on('next_hand', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return;

    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;

    controller.startNewHand();
    console.log(`[游戏] 房间 ${roomCode} 开始新一局`);
  });

  socket.on('pause_game', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;

    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;

    controller.pauseGame();
    const roomData = roomManager.toRoomListItem(room);
    io.to(roomCode).emit('room_updated', { room: roomData });
    console.log(`[游戏] 房间 ${roomCode} 游戏暂停`);
  });

  socket.on('resume_game', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;

    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;

    controller.resumeGame();
    const roomData = roomManager.toRoomListItem(room);
    io.to(roomCode).emit('room_updated', { room: roomData });
    console.log(`[游戏] 房间 ${roomCode} 游戏恢复`);
  });

  socket.on('next_hand', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return;

    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;

    try {
      controller.startNewHand();
    } catch (e: any) {
      socket.emit('error', { message: e?.message || '无法继续牌局' });
    }
  });

  // 玩家确认关闭结算画面 → 推进下一手
  socket.on('ack_hand_result', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return;
    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;
    controller.ackHandResult(playerId);
  });

  // 房主请求最终清算数据
  socket.on('request_final_settlement', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;
    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;
    const data = controller.getFinalSettlement();
    io.to(roomCode).emit('final_settlement', data);
    console.log(`[清算] 房间 ${roomCode} 最终清算已发送`);
  });

  // 房主继续牌局（保留积分和借入手数）
  socket.on('continue_game', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;
    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;
    try {
      controller.continueGame();
      const roomData = roomManager.toRoomListItem(room);
      io.to(roomCode).emit('room_updated', { room: roomData });
      console.log(`[游戏] 房间 ${roomCode} 继续牌局（保留积分）`);
    } catch (e: any) {
      socket.emit('error', { message: e?.message || '无法继续牌局' });
    }
  });

  // 房主重新开始（重置筹码和借入手数）
  socket.on('restart_game', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;
    const controller = roomManager.getGameController(roomCode);
    if (!controller) return;
    controller.restartGame();
    const roomData = roomManager.toRoomListItem(room);
    io.to(roomCode).emit('room_updated', { room: roomData });
    console.log(`[游戏] 房间 ${roomCode} 重新开始`);
  });

  socket.on('send_danmaku', (data: { text: string; color?: string }) => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    const player = room.players instanceof Map ? room.players.get(playerId) : null;
    if (!player) return;

    const text = (data.text || '').trim().slice(0, 50);
    if (!text) return;

    const colors = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6'];
    const color = data.color || colors[Math.floor(Math.random() * colors.length)];

    io.to(roomCode).emit('danmaku_received', {
      playerId,
      nickname: player.nickname,
      text,
      color,
    });
  });

  socket.on('leave_room', () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];

    if (playerId) {
      roomManager.leaveRoom(roomCode, playerId);
      playerIdToSocket.delete(playerId);
    }

    playerRoomMap.delete(socket.id);
    socket.leave(roomCode);

    const room = roomManager.getRoom(roomCode);
    if (room) {
      const roomData = roomManager.toRoomListItem(room);
      io.to(roomCode).emit('room_updated', { room: roomData });
    } else {
      io.to(roomCode).emit('room_disbanded');
    }

    console.log(`[房间] 玩家离开房间 ${roomCode}`);
  });

  socket.on('disband_room', async () => {
    const roomCode = playerRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];
    if (!playerId || playerId !== room.hostId) return;

    io.to(roomCode).emit('room_disbanded');

    const sockets = await io.in(roomCode).fetchSockets();
    if (sockets) {
      for (const sid of sockets) {
        playerRoomMap.delete(sid);
      }
    }

    roomManager.disbandRoom(roomCode);
    console.log(`[房间] 房间 ${roomCode} 已解散`);
  });

  socket.on('disconnect', () => {
    const roomCode = playerRoomMap.get(socket.id);
    const playerId = Array.from(playerIdToSocket.entries())
      .find(([, sid]) => sid === socket.id)?.[0];

    if (roomCode && playerId) {
      const room = roomManager.updatePlayerConnection(roomCode, playerId, false);
      if (room) {
        const controller = roomManager.getGameController(roomCode);
        if (controller) {
          controller.handlePlayerDisconnect(playerId);
        }

        const player = room.players instanceof Map
          ? room.players.get(playerId)
          : (room.players as Record<string, any>)[playerId];

        if (player) {
          io.to(roomCode).emit('player_disconnected', {
            playerId,
            nickname: player.nickname,
          });
        }

        const roomData = roomManager.toRoomListItem(room);
        io.to(roomCode).emit('room_updated', { room: roomData });
      }
    }

    playerRoomMap.delete(socket.id);
    console.log(`[断开] ${socket.id}`);
  });
});

// ===== 前端静态文件服务 =====
// 后端同时托管前端构建产物（client/dist），手机通过 ngrok 公网访问时
// 直接由 3001 端口返回页面，无需单独跑前端 dev server。
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA 回退：所有非 API、非 socket.io 的 GET 请求都返回 index.html
  app.get(/^\/(?!api|socket\.io|health).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🃏 德州扑克服务器已启动: http://localhost:${PORT}`);
  console.log(`   前端页面 + WebSocket + API 全部在此端口`);
});
