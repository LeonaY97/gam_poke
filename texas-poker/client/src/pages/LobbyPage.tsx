import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { useSocket } from '../hooks/useSocket';
import { useCallback, useEffect, useState } from 'react';
import type { RoomListItem } from '../types/game';

export default function LobbyPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getSocket } = useSocket();

  const room = useGameStore(s => s.room);
  const playerId = useGameStore(s => s.playerId);
  const connected = useGameStore(s => s.connected);
  const inGame = useGameStore(s => s.inGame);
  const serverUrl = useGameStore(s => s.serverUrl);

  const [fetching, setFetching] = useState(!room || room.id !== roomId);

  // 房主重进：如果 store 里有 room 且 id 匹配，直接用，不重新 fetch
  useEffect(() => {
    if (room && room.id === roomId) {
      setFetching(false);
      return;
    }

    // 兜底：通过 HTTP 拉取房间数据（App 已处理重连，这里只在 store 为空时兜底）
    if (!roomId || !serverUrl) {
      setFetching(false);
      return;
    }

    const httpBase = serverUrl.replace(/\/+$/, '');
    fetch(`${httpBase}/api/room/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.room) {
          const st = useGameStore.getState();
          st.setRoom(data.room as RoomListItem);
          // 如果游戏已在进行中，跳转
          if (data.room.game && data.room.game.phase !== 'waiting') {
            st.setInGame(true);
            st.setGamePhase(data.room.game.phase);
            st.setPot(data.room.game.pot);
            navigate(`/room/${roomId}/game`);
          }
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [roomId, serverUrl]);

  useEffect(() => {
    if (inGame && room) {
      navigate(`/room/${room.id}/game`);
    }
  }, [inGame, room, navigate]);

  const handleStartGame = useCallback(() => {
    const ws = getSocket();
    if (!ws || !room) return;
    ws.emit('start_game', { roomCode: room.id });
  }, [getSocket, room]);

  const handleLeaveRoom = useCallback(() => {
    const ws = getSocket();
    if (ws) ws.emit('leave_room');
    useGameStore.getState().reset();
    navigate('/');
  }, [getSocket, navigate]);

  const handleCopyRoomCode = useCallback(() => {
    if (room) navigator.clipboard.writeText(room.id);
  }, [room]);

  const handleKickPlayer = useCallback((pid: string) => {
    const ws = getSocket();
    if (!ws) return;
    ws.emit('kick_player', { playerId: pid });
  }, [getSocket]);

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">正在进入房间...</p>
          {!connected && !fetching && (
            <button onClick={() => navigate('/')} className="mt-4 text-yellow-400 underline text-sm">返回首页</button>
          )}
        </div>
      </div>
    );
  }

  const isHost = room.hostId === playerId;
  const players = room.players || [];
  const botCount = room.settings.botCount || 0;

  // 模式判断基于房间配置：
  //   maxPlayers === botCount + 1 → 局域网模式（只有房主+AI，无需互联网玩家）
  //   maxPlayers >  botCount + 1 → 互联网模式（需要互联网真人玩家加入）
  const isLanOnly = room.settings.maxPlayers === botCount + 1;
  // 房间人数未满不允许开始游戏
  const isRoomFull = players.length >= room.settings.maxPlayers;
  const canStart = isRoomFull;

  // window.location.origin 已含端口，无需再拼
  const shareUrl = `${window.location.origin}/?room=${room.id}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={handleLeaveRoom} className="text-gray-400 hover:text-white text-sm">← 返回</button>
          <h1 className="text-lg font-bold text-white">等待大厅</h1>
          <div className="w-10" />
        </div>

        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">房间号</span>
            <button onClick={handleCopyRoomCode} className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-600 transition-colors">
              <span className="text-yellow-400 font-mono font-bold text-lg tracking-widest">{room.id}</span>
              <span className="text-gray-400 text-xs">📋</span>
            </button>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="flex-1 bg-gray-700/50 rounded-lg p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">盲注</div>
              <div className="text-white font-semibold">{room.settings.smallBlind}/{room.settings.bigBlind}</div>
            </div>
            <div className="flex-1 bg-gray-700/50 rounded-lg p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">初始筹码</div>
              <div className="text-white font-semibold">{room.settings.initialChips}</div>
            </div>
            <div className="flex-1 bg-gray-700/50 rounded-lg p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">人数</div>
              <div className="text-white font-semibold">{players.length}/{room.settings.maxPlayers}</div>
            </div>
          </div>
        </div>

        {/* 模式提示 */}
        {isLanOnly ? (
          <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20 mb-4">
            <p className="text-green-400 text-sm text-center font-semibold">🏠 局域网模式</p>
            <p className="text-gray-400 text-xs text-center mt-1">全部是 AI 玩家，无需 ngrok，直接开始游戏</p>
          </div>
        ) : (
          <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20 mb-4">
            <p className="text-blue-400 text-sm text-center font-semibold">🌐 互联网模式</p>
            <p className="text-gray-400 text-xs text-center mt-1">需要真人玩家加入。请将下方链接分享给朋友</p>
            {isHost && (
              <div className="mt-2 bg-gray-800/50 rounded-lg p-2 flex items-center gap-2">
                <input readOnly value={shareUrl} className="flex-1 bg-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 truncate" />
                <button onClick={() => { navigator.clipboard.writeText(shareUrl); alert('已复制!'); }} className="text-yellow-400 text-xs hover:text-yellow-300 flex-shrink-0">复制</button>
              </div>
            )}
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-white font-semibold">玩家列表 ({players.length})</h2>
          </div>
          <div className="divide-y divide-gray-700/50">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{player.nickname}</span>
                    {player.id === room.hostId && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">房主</span>}
                    {player.id === playerId && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">你</span>}
                    {player.id.startsWith('bot_') && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">AI</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gray-400 text-xs">筹码: {player.chips}</span>
                    <span className="text-gray-500 text-[10px]">借入 {player.borrowCount ?? 1} 手</span>
                    {!player.id.startsWith('bot_') && (
                      <>
                        <span className={`w-2 h-2 rounded-full ${player.isConnected ? 'bg-green-400' : 'bg-gray-500'}`} />
                        <span className="text-xs text-gray-500">{player.isConnected ? '在线' : '离线'}</span>
                      </>
                    )}
                    {player.id.startsWith('bot_') && <span className="text-xs text-purple-400">🤖 电脑玩家</span>}
                  </div>
                </div>
                {isHost && player.id !== playerId && !player.id.startsWith('bot_') && (
                  <button onClick={() => handleKickPlayer(player.id)} className="text-red-400 text-xs hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10">踢出</button>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, room.settings.maxPlayers - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-3 px-4 py-3 opacity-40">
                <div className="w-10 h-10 rounded-full bg-gray-700 border-2 border-dashed border-gray-600" />
                <div><span className="text-gray-500 text-sm">空位</span></div>
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 ${canStart ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:from-green-400 hover:to-green-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
          >
            {canStart ? '开始游戏' : `等待玩家加入... (${players.length}/${room.settings.maxPlayers})`}
          </button>
        ) : (
          <div className="text-center text-gray-400 text-sm py-4">等待房主开始游戏...</div>
        )}
      </div>
    </div>
  );
}
