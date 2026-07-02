import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import type { RoomSettings } from '../types/game';

interface CreateRoomModalProps {
  onClose: () => void;
  onCreate: (nickname: string, settings: Partial<RoomSettings>) => void;
  submitting?: boolean;
}

export default function CreateRoomModal({ onClose, onCreate, submitting }: CreateRoomModalProps) {
  const playerName = useGameStore(s => s.playerName);
  const [nickname, setNickname] = useState(playerName || '');
  const [roomName, setRoomName] = useState('');
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(9);
  const [botCount, setBotCount] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!nickname.trim()) return;

    const bigBlind = smallBlind * 2;
    onCreate(nickname.trim(), {
      initialChips,
      smallBlind,
      bigBlind,
      maxPlayers,
      blindInterval: 0,
      botCount,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm slide-up border border-gray-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">创建房间</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">你的昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="输入昵称"
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:border-yellow-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              required
              maxLength={12}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">房间名称</label>
            <input
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="可选，如：周末局"
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 border border-gray-600 focus:border-yellow-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              maxLength={20}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              初始筹码: <span className="text-yellow-400">{initialChips}</span>
            </label>
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setInitialChips(v)}
                  disabled={submitting}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    initialChips === v ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              小盲注: <span className="text-yellow-400">{smallBlind}/{smallBlind * 2}</span>
            </label>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSmallBlind(v)}
                  disabled={submitting}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    smallBlind === v ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {v}/{v * 2}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              最大人数: <span className="text-yellow-400">{maxPlayers}</span>
            </label>
            <input
              type="range"
              min={2}
              max={9}
              value={maxPlayers}
              onChange={e => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-yellow-500 disabled:opacity-50"
              disabled={submitting}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              🤖 AI 电脑玩家: <span className="text-yellow-400">{botCount} 个</span>
            </label>
            <input
              type="range"
              min={0}
              max={maxPlayers - 1}
              value={botCount}
              onChange={e => setBotCount(Number(e.target.value))}
              className="w-full accent-purple-500 disabled:opacity-50"
              disabled={submitting}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0</span>
              {Array.from({ length: maxPlayers - 1 }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              AI 会自动跟注/加注/弃牌，陪你练习
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
            <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting && <span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" />}
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
