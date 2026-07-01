import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../stores/gameStore';
import CardView from './CardView';
import type { HandResult } from '../types/game';

interface HandResultViewProps {
  result: HandResult;
  onClose: () => void;
}

export default function HandResultView({ result, onClose }: HandResultViewProps) {
  const { getSocket } = useSocket();
  const playerId = useGameStore(s => s.playerId);
  const room = useGameStore(s => s.room);
  const isHost = room?.hostId === playerId;

  // 判断是否为"所有人都弃牌只剩一人"的单赢场景
  const isSingleWinnerByFold = result.winners.length === 1
    && result.winners[0]?.handDescription === '对手弃牌';
  const foldedCount = result.allHands.filter(h => h.isFolded).length;

  const handleClose = () => {
    // 通知服务器本玩家已关闭结算画面
    const ws = getSocket();
    ws?.emit('ack_hand_result');
    onClose();
  };

  const handleFinalSettlement = () => {
    const ws = getSocket();
    if (!ws?.connected) return;
    ws.emit('request_final_settlement');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700 slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-center text-yellow-400 mb-4">
          {isSingleWinnerByFold
            ? `${result.winners[0]?.nickname} 获胜!`
            : result.winners.length > 1
              ? (result.isSplitPot ? '平局!' : '多人分池')
              : `${result.winners[0]?.nickname} 获胜!`}
        </h2>

        {isSingleWinnerByFold && (
          <div className="text-center mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
            <p className="text-red-300 text-sm font-semibold">
              其他 {foldedCount} 位玩家已弃牌
            </p>
            <p className="text-gray-400 text-xs mt-1">
              赢家无需摊牌即可赢得底池
            </p>
          </div>
        )}

        {result.winners.length > 1 && !result.isSplitPot && (
          <p className="text-center text-gray-400 text-xs mb-3">
            不同玩家分别赢得不同底池层
          </p>
        )}

        {result.winners.map((w, i) => (
          <div key={i} className="bg-yellow-500/10 rounded-xl p-4 mb-4 border border-yellow-500/30">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-bold">{w.nickname}</span>
              <span className="text-yellow-400 font-bold text-lg">+{w.chipsWon}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{w.handDescription}</span>
              <div className="flex gap-1">
                {w.cards.map((c, j) => (
                  <CardView key={j} card={c} small />
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="border-t border-gray-700 pt-4 mt-2">
          <h3 className="text-sm text-gray-400 mb-3">
            {isSingleWinnerByFold ? '本局参与者' : '所有玩家手牌'}
          </h3>
          <div className="space-y-3">
            {result.allHands.map((h, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${h.isFolded ? 'text-gray-500' : 'text-white'}`}>
                    {h.nickname}
                    {h.isFolded ? ' (已弃牌)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!h.isFolded && <span className="text-gray-400 text-xs">{h.handDescription}</span>}
                  <div className="flex gap-0.5">
                    {h.cards.map((c, j) => (
                      <CardView key={j} card={c} small faceDown={h.isFolded} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleClose}
          className="w-full mt-5 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold text-base hover:from-yellow-400 hover:to-yellow-500 transition-all active:scale-95"
        >
          确认关闭
        </button>

        {isHost && (
          <button
            onClick={handleFinalSettlement}
            className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold text-sm hover:from-purple-500 hover:to-purple-600 transition-all active:scale-95"
          >
            📊 最终清算
          </button>
        )}

        <p className="text-center text-gray-500 text-xs mt-2">
          所有人关闭后开始下一局
        </p>
      </div>
    </div>
  );
}
