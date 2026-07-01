import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import AudioSettingsButton from './components/AudioSettingsButton';
import { useSocket } from './hooks/useSocket';
import { useGameStore } from './stores/gameStore';
import type { RoomListItem } from './types/game';

function getServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('server');
  if (fromUrl) return fromUrl;
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  return localStorage.getItem('poker_server_url') || 'http://localhost:3001';
}

export default function App() {
  const { connect, getSocket } = useSocket();
  const connected = useGameStore(s => s.connected);

  // App 级别确保 socket 始终连接（避免在 GamePage 刷新时没有 socket）
  useEffect(() => {
    if (connected) return;
    const url = getServerUrl();
    const existing = getSocket();
    if (existing?.connected) return;
    useGameStore.getState().setServerUrl(url);

    const storedPlayerId = localStorage.getItem('poker_player_id');
    const storedRoomCode = localStorage.getItem('poker_room_code');

    // 如果有持久化的 playerId + roomCode，先 HTTP 拉取 room 到 store
    // 这样 socket connect 事件才能 emit reconnect_player
    if (storedPlayerId && storedRoomCode) {
      const httpBase = url.replace(/\/+$/, '');
      fetch(`${httpBase}/api/room/${storedRoomCode}`)
        .then(r => r.json())
        .then(data => {
          if (data.room) {
            const st = useGameStore.getState();
            st.setRoom(data.room as RoomListItem);
            if (data.room.game && data.room.game.phase !== 'waiting') {
              st.setInGame(true);
              st.setGamePhase(data.room.game.phase);
              st.setPot(data.room.game.pot);
            }
          } else {
            // 房间已解散，清掉持久化数据
            localStorage.removeItem('poker_player_id');
            localStorage.removeItem('poker_room_code');
          }
        })
        .catch(() => {})
        .finally(() => connect(url));
    } else {
      connect(url);
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<><AudioSettingsButton /><HomePage /></>} />
        <Route path="/room/:roomId" element={<><AudioSettingsButton /><LobbyPage /></>} />
        <Route path="/room/:roomId/game" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  );
}
