import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useSocket } from '../hooks/useSocket';
import type { PlayerAction } from '../types/game';

export default function ActionBar() {
  const turnOptions = useGameStore(s => s.turnOptions);
  const countdown = useGameStore(s => s.countdown);
  // 性能优化：只订阅 bigBlind（settings 几乎不变），避免订阅整个 room
  // 之前订阅 room，每次玩家行动 room 引用都变 → ActionBar 重渲染
  const bigBlindFromSettings = useGameStore(s => s.room?.settings?.bigBlind ?? 20);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRaisePanel, setShowRaisePanel] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { getSocket } = useSocket();

  // 每次打开加注面板时重置为最小加注
  useEffect(() => {
    if (showRaisePanel && turnOptions) {
      setRaiseAmount(turnOptions.minRaise || 0);
      setCustomInput('');
    }
  }, [showRaisePanel, turnOptions]);

  // 关键：turnOptions 被清空时（轮询/事件/超时），必须清除 loading
  // 否则会永远卡在"操作中..."
  useEffect(() => {
    if (!turnOptions && loading) {
      setLoading(false);
    }
  }, [turnOptions, loading]);

  if (!turnOptions) return null;

  const handleAction = (action: PlayerAction, amount?: number) => {
    const ws = getSocket();
    if (!ws) {
      alert('连接未建立，请刷新页面');
      return;
    }
    // 关键：socket 未连接时 emit 的 ack 永远不会调用，必须先检查
    if (!ws.connected) {
      alert('网络未连接，正在重连...请稍后重试');
      try { ws.connect(); } catch {}
      return;
    }

    setLoading(true);
    setShowRaisePanel(false);

    // 安全超时：3s 后强制恢复（手机用户等不了太久）
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      // 超时后主动拉取一次状态，纠正可能的 UI 不一致
      console.warn('[ActionBar] 操作 3s 未响应，强制清除 loading');
    }, 3000);

    ws.emit('player_action', { action, amount: amount || 0 }, (res: any) => {
      clearTimeout(safetyTimer);
      setLoading(false);
      if (!res.success) {
        alert(res.error || '操作失败');
      } else {
        // ack 成功 = 操作已处理，轮次已结束，立即清除自己的 turnOptions
        useGameStore.getState().setTurnOptions(null);
      }
    });
  };

  const minRaise = turnOptions.minRaise || 0;
  const maxRaise = turnOptions.maxRaise || 0;
  // 大盲从房间设置读取（真实值），不再用 minRaise 推断（无人下注时 minRaise=1 不代表大盲）
  const bigBlind = bigBlindFromSettings;

  // 生成整数档次快捷按钮：基于大盲的倍数
  const quickAmounts = (() => {
    const amounts: number[] = [];
    // 档次：2BB、3BB、4BB、1/4 底池、1/2 底池、3/4 底池、满仓
    const pot = useGameStore.getState().pot;
    const candidates = [
      bigBlind * 2,
      bigBlind * 3,
      bigBlind * 4,
      Math.floor(pot * 0.25),
      Math.floor(pot * 0.5),
      Math.floor(pot * 0.75),
      maxRaise, // 全部
    ];
    for (const a of candidates) {
      if (a >= minRaise && a <= maxRaise && a > 0 && !amounts.includes(a)) {
        amounts.push(a);
      }
    }
    // 确保至少有最小加注和最大加注
    if (amounts.length === 0 && minRaise > 0) amounts.push(minRaise);
    return amounts.slice(0, 6); // 最多 6 个
  })();

  // 处理自定义输入
  const handleCustomSubmit = () => {
    const v = parseInt(customInput, 10);
    if (isNaN(v) || v < minRaise) {
      alert(`最小加注 ${minRaise}`);
      return;
    }
    if (v > maxRaise) {
      handleAction('raise', maxRaise);
      return;
    }
    handleAction('raise', v);
  };

  if (showRaisePanel) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4 spring-in z-50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-semibold">选择加注金额</span>
          <span className="text-gray-400 text-xs">范围 {minRaise} ~ {maxRaise}</span>
        </div>

        {/* 档次快捷按钮 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {quickAmounts.map((a, i) => (
            <button
              key={i}
              onClick={() => setRaiseAmount(a)}
              className={`py-2.5 rounded-lg text-sm font-bold btn-press transition-colors
                ${raiseAmount === a ? 'bg-yellow-500 text-black scale-105' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* 自定义输入 */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            inputMode="numeric"
            value={customInput}
            onChange={e => {
              setCustomInput(e.target.value);
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setRaiseAmount(v);
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(); }}
            placeholder={`自定义金额 (≥${minRaise})`}
            className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2.5 text-sm border border-gray-600 focus:border-yellow-500 focus:outline-none"
          />
          <span className="text-yellow-400 font-bold min-w-[60px] text-right">
            {raiseAmount || minRaise}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowRaisePanel(false)}
            className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold text-base btn-press hover:bg-gray-600"
          >
            取消
          </button>
          <button
            onClick={() => handleAction('raise', raiseAmount || minRaise)}
            disabled={loading || raiseAmount < minRaise}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-base btn-press hover:bg-blue-500 disabled:opacity-30"
          >
            加注 {raiseAmount || minRaise}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-3 z-50">
      {loading && (
        <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center z-10 rounded-t-xl">
          <div className="flex items-center gap-2 text-yellow-400">
            <span className="animate-spin w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full" />
            <span className="text-sm font-bold">操作中...</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 mb-2">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              countdown <= 5 ? 'bg-red-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${(countdown / (turnOptions.timeout || 40)) * 100}%` }}
          />
        </div>
        <span className={`text-sm font-bold min-w-[28px] text-center ${countdown <= 5 ? 'text-red-400' : 'text-yellow-400'}`}>
          {countdown}s
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => handleAction('fold')}
          disabled={loading}
          className="py-3 rounded-xl bg-red-700 text-white font-bold text-sm hover:bg-red-600 btn-press transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          弃牌
        </button>

        {turnOptions.canCheck ? (
          <button
            onClick={() => handleAction('check')}
            disabled={loading}
            className="py-3 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-600 btn-press transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            过牌
          </button>
        ) : turnOptions.canCall ? (
          <button
            onClick={() => handleAction('call')}
            disabled={loading}
            className="py-3 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-600 btn-press transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            跟注 {turnOptions.callAmount}
          </button>
        ) : (
          <div className="py-3 rounded-xl bg-gray-800 text-gray-500 font-bold text-sm text-center">-</div>
        )}

        <button
          onClick={() => setShowRaisePanel(true)}
          disabled={loading || minRaise <= 0 || maxRaise <= 0}
          className="py-3 rounded-xl bg-blue-700 text-white font-bold text-sm hover:bg-blue-600 btn-press transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          加注
        </button>

        <button
          onClick={() => handleAction('allin')}
          disabled={loading || !turnOptions.canAllIn}
          className="py-3 rounded-xl bg-yellow-600 text-black font-bold text-sm hover:bg-yellow-500 btn-press transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          All-in
        </button>
      </div>
    </div>
  );
}
