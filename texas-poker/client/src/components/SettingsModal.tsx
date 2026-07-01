import { useAudio, type SoundType } from '../hooks/useAudio';

interface SettingsModalProps {
  onClose: () => void;
}

// 各音效测试按钮配置
const SOUND_TESTS: { type: SoundType; label: string }[] = [
  { type: 'fold', label: '弃牌' },
  { type: 'check', label: '过牌' },
  { type: 'call', label: '跟注' },
  { type: 'raise', label: '加注' },
  { type: 'allin', label: '全押' },
  { type: 'win', label: '胜利' },
];

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { bgmEnabled, sfxVolume, bgmVolume, toggleBgm, setSfxVolume, setBgmVolume, playSound } = useAudio();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm slide-up border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">声音设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-5">
          {/* 音效音量 */}
          <div>
            <label className="flex items-center justify-between text-sm text-gray-400 mb-1">
              <span>🔊 音效音量</span>
              <span className="text-yellow-400">{sfxVolume}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={sfxVolume}
              onChange={e => setSfxVolume(Number(e.target.value))}
              className="w-full accent-yellow-500"
            />
          </div>

          {/* BGM 音量 */}
          <div>
            <label className="flex items-center justify-between text-sm text-gray-400 mb-1">
              <span>🎵 背景音乐音量</span>
              <span className="text-yellow-400">{bgmVolume}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={bgmVolume}
              onChange={e => setBgmVolume(Number(e.target.value))}
              className="w-full accent-yellow-500"
            />
          </div>

          {/* BGM 开关 */}
          <div className="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2.5">
            <span className="text-sm text-gray-300">背景音乐</span>
            <button
              onClick={toggleBgm}
              className={`relative w-12 h-6 rounded-full transition-colors ${bgmEnabled ? 'bg-yellow-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${bgmEnabled ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          {/* 测试音效 */}
          <div>
            <p className="text-sm text-gray-400 mb-2">试听音效</p>
            <div className="grid grid-cols-3 gap-2">
              {SOUND_TESTS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => playSound(type)}
                  className="py-2 rounded-lg text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
