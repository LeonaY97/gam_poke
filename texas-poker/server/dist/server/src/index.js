"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const socket_io_1 = require("socket.io");
const RoomManager_1 = require("./game/RoomManager");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 开启 gzip 压缩：243KB JS → ~75KB，对走 ngrok 的移动端尤其关键
app.use((0, compression_1.default)());
// 托管前端构建产物，让一个端口同时提供页面和 API
const clientDist = path_1.default.resolve(__dirname, '../../client/dist');
if (fs_1.default.existsSync(clientDist)) {
    // 带 hash 的 assets 长缓存，index.html 不缓存（保证更新及时）
    app.use('/assets', express_1.default.static(path_1.default.join(clientDist, 'assets'), {
        maxAge: '7d',
        immutable: true,
    }));
    app.use(express_1.default.static(clientDist, {
        maxAge: 0,
        setHeaders: (res, filePath) => {
            if (path_1.default.basename(filePath) === 'index.html') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
        },
    }));
}
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
});
const roomManager = new RoomManager_1.RoomManager();
const playerRoomMap = new Map();
const playerIdToSocket = new Map();
app.get('/health', (_req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    res.json({ status: 'ok', rooms: roomManager.getRoomList().length, lanIps: ips });
});
app.get('/api/room/:roomCode', (req, res) => {
    const room = roomManager.getRoom(req.params.roomCode.toUpperCase());
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
        callback({
            success: true,
            room: roomManager.toRoomListItem(room),
            playerId,
        });
        const roomData = roomManager.toRoomListItem(room);
        io.to(room.id).emit('room_updated', { room: roomData });
        console.log(`[房间] ${data.nickname} 加入了房间 ${room.id}`);
    });
    // 重连：socket 重连后 socket.id 会变，需要重新建立 playerId → socket.id 映射
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
        // 重新建立映射
        playerRoomMap.set(socket.id, roomCode);
        playerIdToSocket.set(playerId, socket.id);
        socket.join(roomCode);
        // 恢复连接状态
        const updatedRoom = roomManager.updatePlayerConnection(roomCode, playerId, true);
        if (updatedRoom) {
            const roomData = roomManager.toRoomListItem(updatedRoom);
            io.to(roomCode).emit('room_updated', { room: roomData });
            io.to(roomCode).emit('player_reconnected', { playerId, nickname: player.nickname });
        }
        callback({ success: true, room: roomManager.toRoomListItem(room) });
        // 如果游戏进行中，重发该玩家的游戏状态（手牌、社区牌、当前轮次等）
        const controller = roomManager.getGameController(roomCode);
        if (controller) {
            controller.handlePlayerReconnect(playerId);
            controller.resendStateForPlayer(playerId);
        }
        console.log(`[重连] ${player.nickname} (${playerId}) 重新连接到房间 ${roomCode}`);
    });
    socket.on('start_game', (data) => {
        const roomCode = data.roomCode;
        const room = roomManager.getRoom(roomCode);
        if (!room)
            return;
        const hostPlayerId = Array.from(playerIdToSocket.entries())
            .find(([, sid]) => sid === socket.id)?.[0];
        if (room.hostId !== hostPlayerId) {
            socket.emit('error', { message: '只有房主可以开始游戏' });
            return;
        }
        // 房间人数未满不允许开始游戏
        const playerCount = room.players instanceof Map ? room.players.size : Object.keys(room.players).length;
        if (playerCount < room.settings.maxPlayers) {
            socket.emit('error', { message: `房间未满（${playerCount}/${room.settings.maxPlayers}），无法开始游戏` });
            return;
        }
        let controller = roomManager.getGameController(roomCode);
        if (!controller) {
            controller = roomManager.createGameController(roomCode, (event, eventData) => {
                io.to(roomCode).emit(event, eventData);
            }, (playerId, event, eventData) => {
                const sid = playerIdToSocket.get(playerId);
                if (sid) {
                    io.to(sid).emit(event, eventData);
                }
            });
        }
        controller.startGame();
        const updatedRoom = roomManager.toRoomListItem(room);
        io.to(roomCode).emit('room_updated', { room: updatedRoom });
        console.log(`[游戏] 房间 ${roomCode} 游戏开始`);
    });
    // 借入筹码决策：玩家选择借入或旁观
    socket.on('borrow_chips', (data, callback) => {
        const roomCode = data.roomCode;
        const playerId = Array.from(playerIdToSocket.entries())
            .find(([, sid]) => sid === socket.id)?.[0];
        if (!playerId) {
            return callback({ success: false, error: '找不到玩家信息' });
        }
        const controller = roomManager.getGameController(roomCode);
        if (!controller) {
            return callback({ success: false, error: '游戏未在进行中' });
        }
        // borrow=true 借入, borrow=false 旁观
        const borrow = data.borrow !== false;
        controller.resolveBorrower(playerId, borrow);
        callback({ success: true });
        console.log(`[借入] 玩家 ${playerId} ${borrow ? '借入筹码' : '选择旁观'}`);
    });
    // 玩家关闭结算画面
    socket.on('ack_hand_result', () => {
        const roomCode = playerRoomMap.get(socket.id);
        if (!roomCode)
            return;
        const controller = roomManager.getGameController(roomCode);
        if (!controller)
            return;
        const playerId = Array.from(playerIdToSocket.entries())
            .find(([, sid]) => sid === socket.id)?.[0];
        if (playerId)
            controller.ackHandResult(playerId);
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
    socket.on('leave_room', () => {
        const roomCode = playerRoomMap.get(socket.id);
        if (!roomCode)
            return;
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
        }
        console.log(`[房间] ${socket.id} 离开了房间 ${roomCode}`);
    });
    socket.on('kick_player', (data) => {
        const roomCode = playerRoomMap.get(socket.id);
        if (!roomCode)
            return;
        if (!roomManager.isHost(roomCode, socket.id))
            return;
        const room = roomManager.leaveRoom(roomCode, data.playerId);
        if (room) {
            const roomData = roomManager.toRoomListItem(room);
            io.to(roomCode).emit('room_updated', { room: roomData });
        }
    });
    socket.on('disband_room', () => {
        const roomCode = playerRoomMap.get(socket.id);
        if (!roomCode)
            return;
        const playerId = Array.from(playerIdToSocket.entries())
            .find(([, sid]) => sid === socket.id)?.[0];
        if (!playerId || !roomManager.isHost(roomCode, playerId))
            return;
        const controller = roomManager.getGameController(roomCode);
        if (controller)
            controller.destroy();
        io.to(roomCode).emit('room_disbanded');
        const sockets = io.sockets.adapter.rooms.get(roomCode);
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
                    : room.players[playerId];
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
        if (playerId)
            playerIdToSocket.delete(playerId);
        console.log(`[断开] ${socket.id}`);
    });
});
// SPA 回退：非 API/socket.io 路由都返回 index.html
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/health')) {
        return res.status(404).json({ error: 'Not found' });
    }
    const indexPath = path_1.default.join(clientDist, 'index.html');
    if (fs_1.default.existsSync(indexPath)) {
        res.sendFile(indexPath);
    }
    else {
        res.status(404).send('前端未构建，请先运行 cd client && npm run build');
    }
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🃏 德州扑克服务器已启动: http://localhost:${PORT}`);
    console.log(`   前端页面 + WebSocket + API 全部在此端口`);
});
