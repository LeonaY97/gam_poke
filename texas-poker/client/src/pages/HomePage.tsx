import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { useSocket } from '../hooks/useSocket';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import type { RoomSettings, RoomListItem } from '../types/game';

function getServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('server');
  if (fromUrl) return fromUrl;
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  return localStorage.getItem('poker_server_url') || 'http://localhost:3001';
}

export default function HomePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl());
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [submittingAction, setSubmittingAction] = useState<'create' | 'join' | null>(null);
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();
  const connected = useGameStore(s => s.connected);
  const { connect, getSocket } = useSocket();

  const doConnect = useCallback((url: string, onSuccess?: () => void) => {
    setConnecting(true);
    setConnectionError('');
    const cleanUrl = url.replace(/\/+$/, '');
    const s = connect(cleanUrl);

    // 如果 socket 已经连接，立即执行 onSuccess
    if (s.connected) {
      setConnecting(false);
      localStorage.setItem('poker_server_url', cleanUrl);
      useGameStore.getState().setServerUrl(cleanUrl);
      onSuccess?.();
      return;
    }

    const timeout = setTimeout(() => { setConnecting(false); setConnectionError('连接超时，请确认服务器已启动'); }, 8000);
    s.on('connect', () => {
      clearTimeout(timeout);
      setConnecting(false);
      setConnectionError('');
      localStorage.setItem('poker_server_url', cleanUrl);
      useGameStore.getState().setServerUrl(cleanUrl);
      onSuccess?.();
    });
    s.on('connect_error', (err: any) => {
      clearTimeout(timeout);
      setConnecting(false);
      setConnectionError(`连接失败: ${err.message}`);
    });
  }, [connect]);

  useEffect(() => {
    const url = getServerUrl();
    const roomFromUrl = searchParams.get('room');
    const storedPlayerId = localStorage.getItem('poker_player_id');
    const storedRoomCode = localStorage.getItem('poker_room_code');

    // 场景 1：URL 带 room 参数 → 新玩家或朋友通过链接加入
    if (roomFromUrl) {
      doConnect(url, () => autoJoinRoom(roomFromUrl));
      return;
    }

    // 场景 2：有持久化的 playerId + roomCode → 房主/玩家刷新后重连
    // App 已经做了 HTTP 拉取 + socket 连接 + reconnect_player，这里只需跳转
    if (storedPlayerId && storedRoomCode) {
      const httpBase = url.replace(/\/+$/, '');
      fetch(`${httpBase}/api/room/${storedRoomCode}`)
        .then(r => r.json())
        .then(data => {
          if (data.room) {
            const target = data.room.game && data.room.game.phase !== 'waiting'
              ? `/room/${storedRoomCode}/game`
              : `/room/${storedRoomCode}`;
            navigate(target, { replace: true });
          } else {
            // 房间已解散，清掉持久化数据，留在首页
            localStorage.removeItem('poker_player_id');
            localStorage.removeItem('poker_room_code');
          }
        })
        .catch(() => {});
      return;
    }

    // 场景 3：默认 → 确保 socket 已连接（App 会处理，这里兜底）
    if (!connected) doConnect(url);
  }, []);

  const autoJoinRoom = (roomCode: string) => {
    const ws = getSocket();
    if (!ws?.connected) return;
    const nickname = localStorage.getItem('poker_nickname') || '玩家' + Math.random().toString(36).slice(2, 6);
    ws.emit('join_room', { roomCode, nickname }, (res: any) => {
      if (res.success && res.room) {
        useGameStore.getState().setPlayerName(nickname);
        useGameStore.getState().setRoom(res.room as RoomListItem);
        if (res.playerId) useGameStore.getState().setPlayerId(res.playerId);
        navigate(`/room/${roomCode}`);
      }
    });
  };

  const handleCreate = useCallback((nickname: string, settings: Partial<RoomSettings>) => {
    const ws = getSocket();
    if (!ws?.connected) { alert('请先连接服务器'); return; }
    localStorage.setItem('poker_nickname', nickname);
    useGameStore.getState().setPlayerName(nickname);
    setSubmittingAction('create');
    // 超时兜底：10s 没收到 ack 自动恢复
    const safety = setTimeout(() => {
      setSubmittingAction(null);
      alert('创建房间超时，请检查网络后重试');
    }, 10000);
    ws.emit('create_room', { nickname, settings }, (res: any) => {
      clearTimeout(safety);
      if (res.success && res.roomCode) {
        setShowCreate(false);
        if (res.room) useGameStore.getState().setRoom(res.room as RoomListItem);
        if (res.playerId) useGameStore.getState().setPlayerId(res.playerId);
        navigate(`/room/${res.roomCode}`);
      } else {
        alert(res.error || '创建房间失败');
      }
      setSubmittingAction(null);
    });
  }, [getSocket, navigate]);

  const handleJoin = useCallback((nickname: string, roomCode: string) => {
    const ws = getSocket();
    if (!ws?.connected) { alert('请先连接服务器'); return; }
    localStorage.setItem('poker_nickname', nickname);
    useGameStore.getState().setPlayerName(nickname);
    setSubmittingAction('join');
    const safety = setTimeout(() => {
      setSubmittingAction(null);
      alert('加入房间超时，请检查网络后重试');
    }, 10000);
    ws.emit('join_room', { roomCode, nickname }, (res: any) => {
      clearTimeout(safety);
      if (res.success && res.room) {
        setShowJoin(false);
        useGameStore.getState().setRoom(res.room as RoomListItem);
        if (res.playerId) useGameStore.getState().setPlayerId(res.playerId);
        // 标记旁观者身份
        useGameStore.getState().setIsSpectator(res.isSpectator === true);
        // 旁观者提示
        if (res.spectatorNote) {
          alert(res.spectatorNote);
        }
        navigate(`/room/${roomCode}`);
      } else if (res.spectatorNote === 'ROOM_FULL_ASK_SPECTATOR') {
        // 房间已满，询问是否以旁观者身份加入
        const ok = window.confirm(res.error || '房间已满，是否以旁观者身份加入？');
        if (ok) {
          // 重新 emit，带 asSpectator=true
          setSubmittingAction('join');
          const safety2 = setTimeout(() => {
            setSubmittingAction(null);
            alert('加入房间超时，请检查网络后重试');
          }, 10000);
          ws.emit('join_room', { roomCode, nickname, asSpectator: true }, (res2: any) => {
            clearTimeout(safety2);
            if (res2.success && res2.room) {
              setShowJoin(false);
              useGameStore.getState().setRoom(res2.room as RoomListItem);
              if (res2.playerId) useGameStore.getState().setPlayerId(res2.playerId);
              useGameStore.getState().setIsSpectator(res2.isSpectator === true);
              if (res2.spectatorNote) alert(res2.spectatorNote);
              navigate(`/room/${roomCode}`);
            } else {
              alert(res2.error || '加入房间失败');
            }
            setSubmittingAction(null);
          });
          return;
        }
        setSubmittingAction(null);
      } else {
        alert(res.error || '加入房间失败');
        setSubmittingAction(null);
      }
    });
  }, [getSocket, navigate]);

  const handleSaveServerUrl = () => {
    if (serverUrlInput.trim()) {
      doConnect(serverUrlInput.trim());
      setShowSettings(false);
    }
  };

  // 重启服务：调用后端 /api/restart，后端清理状态并断开所有连接，前端 1 秒后刷新
  // 关键：定时刷新不依赖 fetch 完成（fetch 可能因 socket 断开而卡住）
  const [cleaning, setCleaning] = useState(false);
  const handleCleanup = useCallback(() => {
    if (!window.confirm('确定重启服务吗？\n\n这会：\n• 清理所有房间和牌局\n• 断开所有玩家连接\n• 重新加载前端页面\n\n适合在卡死/僵尸状态时一键重置。')) return;
    setCleaning(true);
    // 清空本地缓存与 store（立即执行）
    localStorage.removeItem('poker_player_id');
    localStorage.removeItem('poker_room_code');
    useGameStore.getState().reset();

    // 先安排刷新（不依赖 fetch 结果），1.5 秒后必定刷新
    setTimeout(() => window.location.reload(), 1500);

    // 异步发请求通知后端清理（fire-and-forget，不等返回）
    const httpBase = getServerUrl().replace(/\/+$/, '');
    fetch(`${httpBase}/api/restart`, { method: 'POST' }).catch(() => {});
  }, []);

  const shareableUrl = connected && getServerUrl() && window.location.hostname !== 'localhost'
    ? `${window.location.origin}?server=${encodeURIComponent(getServerUrl())}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">🃏</div>
        <h1 className="text-3xl font-bold text-white mb-2">多人德州扑克</h1>
        <p className="text-gray-400 text-sm">私密房间 · 朋友对战 · AI陪玩 · 完全免费</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {!connected ? (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">服务器地址</label>
              <button onClick={() => setShowSettings(true)} className="text-xs text-gray-500 hover:text-yellow-400">修改</button>
            </div>
            <div className="bg-gray-700 text-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3 truncate">
              {connecting ? <span className="flex items-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />连接中...</span> : serverUrlInput}
            </div>
            {connectionError && <p className="text-red-400 text-xs mt-2">{connectionError}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-green-400 text-sm mb-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />已连接服务器
            </div>

            {shareableUrl && (
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <p className="text-gray-400 text-xs mb-1.5">📤 分享链接给朋友（一键连接+加入）：</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={shareableUrl} className="flex-1 bg-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 truncate" />
                  <button onClick={() => { navigator.clipboard.writeText(shareableUrl); alert('已复制!'); }} className="text-yellow-400 text-xs hover:text-yellow-300 flex-shrink-0">复制</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowCreate(true)} className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold text-lg shadow-lg hover:from-yellow-400 hover:to-yellow-500 transition-all active:scale-95">创建房间</button>
            <button onClick={() => setShowJoin(true)} className="w-full py-4 rounded-2xl bg-gray-700 text-white font-bold text-lg border border-gray-600 hover:bg-gray-600 transition-all active:scale-95">加入房间</button>
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              className="w-full py-2.5 rounded-xl bg-red-900/40 text-red-300 font-semibold text-sm border border-red-700/50 hover:bg-red-900/60 hover:text-red-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              title="重启后端服务（清理所有房间和牌局）并刷新页面"
            >
              {cleaning && <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />}
              {cleaning ? '重启中...1.5 秒后刷新' : '🔄 重启服务'}
            </button>
          </>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={handleCreate} submitting={submittingAction === 'create'} />}
      {showJoin && <JoinRoomModal onClose={() => setShowJoin(false)} onJoin={handleJoin} submitting={submittingAction === 'join'} />}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm slide-up border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">服务器设置</h2>
            <input type="text" value={serverUrlInput} onChange={e => setServerUrlInput(e.target.value)} placeholder="http://localhost:3001" className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:border-yellow-500 focus:outline-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold">取消</button>
              <button onClick={handleSaveServerUrl} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold">连接</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
