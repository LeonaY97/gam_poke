import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';

interface JoinRoomModalProps {
  onClose: () => void;
  onJoin: (nickname: string, roomCode: string) => void;
}

export default function JoinRoomModal({ onClose, onJoin }: JoinRoomModalProps) {
  const playerName = useGameStore(s => s.playerName);
  const [nickname, setNickname] = useState(playerName || '');
  const [roomCode, setRoomCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) return;
    onJoin(nickname.trim(), roomCode.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm slide-up border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">加入房间</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">你的昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="输入昵称"
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:border-yellow-500 focus:outline-none"
              required
              maxLength={12}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">房间号</label>
            <input
              type="text"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="输入4位房间号"
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:border-yellow-500 focus:outline-none text-center text-xl tracking-widest font-mono"
              required
              maxLength={4}
              inputMode="numeric"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition-colors"
            >
              加入
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
