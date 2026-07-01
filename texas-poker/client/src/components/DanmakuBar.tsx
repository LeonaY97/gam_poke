import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../stores/gameStore';

interface DanmakuItem {
  id: number;
  nickname: string;
  text: string;
  color: string;
}

let danmakuIdCounter = 0;

export default function DanmakuBar() {
  const [input, setInput] = useState('');
  const [danmakus, setDanmakus] = useState<DanmakuItem[]>([]);
  const [showInput, setShowInput] = useState(false);
  const { getSocket } = useSocket();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ws = getSocket();
    if (!ws) return;
    const handler = (data: { playerId: string; nickname: string; text: string; color: string }) => {
      const item: DanmakuItem = {
        id: ++danmakuIdCounter,
        nickname: data.nickname,
        text: data.text,
        color: data.color,
      };
      setDanmakus(prev => [...prev.slice(-8), item]); // 最多保留9条
      // 6秒后移除
      setTimeout(() => {
        setDanmakus(prev => prev.filter(d => d.id !== item.id));
      }, 6000);
    };
    ws.on('danmaku_received', handler);
    return () => { ws.off('danmaku_received', handler); };
  }, [getSocket]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const ws = getSocket();
    ws?.emit('send_danmaku', { text });
    setInput('');
    setShowInput(false);
  };

  return (
    <>
      {/* 弹幕轨道 */}
      <div className="fixed top-12 left-0 right-0 z-30 pointer-events-none flex flex-col gap-1 px-2 overflow-hidden">
        {danmakus.map(d => (
          <div
            key={d.id}
            className="danmaku-fly text-sm font-medium whitespace-nowrap"
            style={{ color: d.color, textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)' }}
          >
            <span className="opacity-70 text-xs mr-1">{d.nickname}:</span>
            {d.text}
          </div>
        ))}
      </div>

      {/* 弹幕输入入口 */}
      <button
        onClick={() => setShowInput(!showInput)}
        className="fixed bottom-32 right-3 z-40 w-9 h-9 rounded-full bg-gray-800/80 border border-gray-600 flex items-center justify-center text-base active:scale-90 transition-transform"
        title="发送弹幕"
      >
        💬
      </button>

      {/* 弹幕输入框 */}
      {showInput && (
        <div className="fixed bottom-28 left-3 right-14 z-40 slide-up">
          <div className="flex items-center gap-2 bg-gray-800/95 backdrop-blur rounded-full px-3 py-2 border border-gray-600">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              maxLength={50}
              placeholder="发送弹幕..."
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="text-yellow-400 text-sm font-bold disabled:opacity-30 active:scale-90 transition-transform"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
