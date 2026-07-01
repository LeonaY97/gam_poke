import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * 结算后、下局开始前的清理牌局 loading 遮罩。
 * 触发条件：gamePhase === 'showdown' 且 handResult 已被关闭（null）。
 * 消失条件：gamePhase 变为 preflop（收到 game_started）。
 */
export default function RoundTransitionOverlay() {
  const gamePhase = useGameStore(s => s.gamePhase);
  const handResult = useGameStore(s => s.handResult);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // showdown 阶段且结算结果已被关闭 → 显示 loading
    if (gamePhase === 'showdown' && !handResult) {
      setShow(true);
    } else if (gamePhase !== 'showdown') {
      // 进入下一阶段（preflop）后隐藏
      setShow(false);
    }
  }, [gamePhase, handResult]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 pointer-events-none">
      <div className="flex flex-col items-center">
        {/* 旋转的发牌动画 */}
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-yellow-500/30 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-yellow-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🃏</div>
        </div>
        <p className="text-white font-semibold text-sm mb-1">清理牌局中...</p>
        <p className="text-gray-400 text-xs">准备下一手</p>
      </div>
    </div>
  );
}
