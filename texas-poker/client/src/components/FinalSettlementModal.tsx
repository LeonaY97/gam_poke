import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useSocket } from '../hooks/useSocket';
import type { FinalSettlementData } from '../types/game';

interface FinalSettlementModalProps {
  data: FinalSettlementData;
  isHost: boolean;
}

export default function FinalSettlementModal({ data, isHost }: FinalSettlementModalProps) {
  const [showHistory, setShowHistory] = useState(false);
  const { getSocket } = useSocket();
  const playerId = useGameStore(s => s.playerId);

  // 按净收益降序排列
  const sortedPlayers = [...data.players].sort((a, b) => b.netProfit - a.netProfit);

  // 房主：继续牌局（保持积分和借入手数，直接开新局）
  const handleContinue = () => {
    const ws = getSocket();
    if (!ws?.connected) return;
    ws.emit('continue_game');
    // 服务端 startNewHand 会广播 game_started，前端收到后自动关闭本面板
  };

  // 房主：重新开始（沿用配置，重置筹码和借入手数）
  const handleRestart = () => {
    const ws = getSocket();
    if (!ws?.connected) return;
    ws.emit('restart_game');
    // 服务端 startNewHand 会广播 game_started，前端收到后自动关闭本面板
  };

  // 房主：新开房间（解散当前房间，所有玩家返回首页）
  const handleNewRoom = () => {
    const ws = getSocket();
    if (!ws?.connected) return;
    // 通知服务端解散房间，服务端会广播 room_disbanded 给所有玩家
    ws.emit('disband_room');
    useGameStore.getState().reset();
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-3">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-yellow-600/50 slide-up flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-700">
          <h2 className="text-xl font-bold text-center text-yellow-400">📊 最终清算</h2>
          <p className="text-center text-gray-400 text-xs mt-1">共 {data.totalHands} 局 · 初始筹码 {data.roomSettings.initialChips}</p>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 积分对比 */}
          <div className="space-y-2 mb-4">
            {sortedPlayers.map((p, idx) => {
              const isMe = p.playerId === playerId;
              return (
                <div
                  key={p.playerId}
                  className={`rounded-xl p-3 border-2 ${
                    idx === 0
                      ? 'bg-yellow-500/10 border-yellow-500/40'
                      : p.isUnderwater
                        ? 'bg-red-900/20 border-red-800/40'
                        : 'bg-gray-700/40 border-gray-600/40'
                  } ${isMe ? 'ring-1 ring-green-400/50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                        idx === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-white'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="text-white font-semibold text-sm">
                        {p.nickname}
                        {isMe && <span className="text-green-400 text-xs ml-1">(你)</span>}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-sm ${p.isUnderwater ? 'text-red-400' : 'text-green-400'}`}>
                        {p.netProfit >= 0 ? '+' : ''}{p.netProfit}
                      </div>
                      <div className="text-gray-500 text-[10px]">净收益</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    <span className="text-gray-400">
                      最终: <span className="text-white font-semibold">{p.finalChips}</span>
                    </span>
                    <span className="text-gray-400">
                      借入: <span className="text-yellow-400 font-semibold">{p.borrowCount} 手</span>
                    </span>
                    <span className={`font-semibold ${p.isUnderwater ? 'text-red-400' : 'text-green-400'}`}>
                      {p.isUnderwater ? '🔒 水下' : '📈 水上'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 每局历史表格（可展开/收起） */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <span>📋 每局输赢汇总</span>
            <span className="text-xs">{showHistory ? '收起 ▲' : '展开 ▼'}</span>
          </button>

          {showHistory && (
            <div className="mt-2 bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
              {/* 固定高度滚动 */}
              <div className="max-h-[240px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-800">
                    <tr className="text-gray-400">
                      <th className="px-2 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">赢家</th>
                      <th className="px-2 py-2 text-right font-medium">赢取</th>
                      <th className="px-2 py-2 text-left font-medium">牌型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.handHistory.map((h, i) => (
                      <tr key={i} className="border-t border-gray-700/30">
                        <td className="px-2 py-1.5 text-gray-500">{h.round}</td>
                        <td className="px-2 py-1.5 text-white">
                          {h.winners.map(w => w.nickname).join(', ')}
                        </td>
                        <td className="px-2 py-1.5 text-right text-yellow-400 font-semibold">
                          {h.winners.reduce((s, w) => s + w.chipsWon, 0)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-400">
                          {h.winners.map(w => w.handDescription).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作区：房主可见三个按钮，非房主显示等待提示且不可关闭 */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-700">
          {isHost ? (
            <div className="space-y-2">
              <button
                onClick={handleContinue}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-bold text-sm hover:from-green-500 hover:to-green-600 transition-all active:scale-95 btn-press"
              >
                ▶ 继续牌局（保留积分）
              </button>
              <button
                onClick={handleRestart}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-700 text-white font-bold text-sm hover:from-yellow-500 hover:to-yellow-600 transition-all active:scale-95 btn-press"
              >
                🔄 重新开始（重置积分）
              </button>
              <button
                onClick={handleNewRoom}
                className="w-full py-2.5 rounded-xl bg-gray-700 text-gray-300 font-semibold text-sm hover:bg-gray-600 transition-colors btn-press"
              >
                🏠 新开房间
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <span>等待房主操作中...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
