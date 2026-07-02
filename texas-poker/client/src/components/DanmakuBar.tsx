import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../stores/gameStore';

export default function DanmakuBar() {
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const { getSocket } = useSocket();
  const inputRef = useRef<HTMLInputElement>(null);
  const danmakus = useGameStore((s) => s.danmakus);

  // 根据屏幕宽度计算弹幕飞行时长（秒）
  // 手机窄（<640px）→ 18s 较快；电脑宽（≥1280px）→ 36s 较慢，看得清楚
  const [duration, setDuration] = useState(24);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      if (w < 640) setDuration(18);
      else if (w < 1024) setDuration(24);
      else if (w < 1440) setDuration(30);
      else setDuration(36);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // store 中弹幕存活时长也要匹配飞行时长，避免动画没飞完就被移除
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
      {/* 弹幕轨道容器：绝对定位，不占据布局空间 */}
      <div className="fixed top-12 left-0 right-0 z-30 pointer-events-none overflow-hidden" style={{ height: '40vh' }}>
        {danmakus.map((d, i) => {
          // 多条弹幕按索引错开轨道，避免重叠
          const track = (i % 4) * 3; // 0rem, 3rem, 6rem, 9rem
          return (
            <div
              key={d.id}
              className="absolute whitespace-nowrap text-xl sm:text-2xl font-bold"
              style={{
                top: `${track}rem`,
                color: d.color,
                textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)',
                animation: `danmakuFlyResponsive ${duration}s linear forwards`,
              }}
            >
              {d.isSpectator && (
                <span className="text-[10px] bg-cyan-500/30 text-cyan-200 px-1 py-0.5 rounded mr-1 align-middle">旁观</span>
              )}
              <span className="opacity-70 text-base sm:text-lg mr-1">{d.nickname}:</span>
              {d.text}
            </div>
          );
        })}
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
