import { useSocket } from '../hooks/useSocket';
import { useGameStore } from '../stores/gameStore';
import CardView from './CardView';
import type { Card } from '../types/game';
import type { HandResult, WinnerInfo } from '../types/game';

interface HandResultViewProps {
  result: HandResult;
  onClose: () => void;
}

/** 判断卡牌是否在最佳 5 张牌中（rank + suit 完全匹配） */
function isInBestCards(card: Card, bestCards: Card[]): boolean {
  return bestCards.some(b => b.rank === card.rank && b.suit === card.suit);
}

/** 带星标的牌面：参与组成牌型的牌加金色光晕 */
function CardWithBadge({ card, highlight, faceDown }: { card?: Card; highlight: boolean; faceDown?: boolean }) {
  return (
    <div className="relative">
      <CardView card={card} small highlight={highlight} faceDown={faceDown} />
      {highlight && !faceDown && (
        <span className="absolute -top-1.5 -right-1.5 text-yellow-400 text-xs drop-shadow-[0_0_3px_rgba(0,0,0,0.9)] z-10">★</span>
      )}
    </div>
  );
}

export default function HandResultView({ result, onClose }: HandResultViewProps) {
  const { getSocket } = useSocket();
  const playerId = useGameStore(s => s.playerId);
  const room = useGameStore(s => s.room);
  const communityCards = useGameStore(s => s.communityCards);
  const isHost = room?.hostId === playerId;

  // 判断是否为"所有人都弃牌只剩一人"的单赢场景
  const isSingleWinnerByFold = result.winners.length === 1
    && result.winners[0]?.handDescription === '对手弃牌';
  const foldedCount = result.allHands.filter(h => h.isFolded).length;

  const handleClose = () => {
    const ws = getSocket();
    ws?.emit('ack_hand_result');
    onClose();
  };

  const handleFinalSettlement = () => {
    const ws = getSocket();
    if (!ws?.connected) return;
    ws.emit('request_final_settlement');
  };

  // 标题文案
  const titleText = isSingleWinnerByFold
    ? `${result.winners[0]?.nickname} 获胜!`
    : result.winners.length > 1
      ? (result.isSplitPot ? '平局 · 多家平分' : '多人分池')
      : `${result.winners[0]?.nickname} 获胜!`;

  // 收集所有赢家的最佳牌（用于高亮公共牌）
  const allWinnerBestCards = result.winners.flatMap(w => w.cards);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-3"
      onClick={handleClose}
    >
      <div
        className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-5 w-full max-w-md border border-yellow-600/30 slide-up max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        onClick={e => e.stopPropagation()}
      >
        {/* ===== 标题区 ===== */}
        <div className="text-center mb-5">
          <div className="text-2xl mb-1">
            {result.winners.length > 1 ? '🤝' : '🏆'}
          </div>
          <h2 className="text-xl font-bold text-yellow-400 tracking-wide">
            {titleText}
          </h2>
          {!isSingleWinnerByFold && result.winners.length === 1 && (
            <p className="text-gray-400 text-xs mt-1">
              牌型：<span className="text-yellow-300 font-semibold">{result.winners[0]?.handDescription}</span>
            </p>
          )}
        </div>

        {/* ===== 弃牌胜出提示 ===== */}
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

        {/* ===== 公共牌区（主舞台）===== */}
        {!isSingleWinnerByFold && communityCards.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] text-gray-500 tracking-widest uppercase mb-2 text-center">
              公共牌
            </div>
            <div className="flex justify-center gap-1.5 py-2">
              {communityCards.map((c, i) => {
                const isPartOfWin = isInBestCards(c, allWinnerBestCards);
                return <CardWithBadge key={i} card={c} highlight={isPartOfWin} />;
              })}
            </div>
          </div>
        )}

        {/* ===== 赢家展示区 ===== */}
        {!isSingleWinnerByFold && result.winners.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] text-yellow-500/70 tracking-widest uppercase mb-2">
              {result.winners.length > 1 ? '赢家（按分池）' : '赢家'}
            </div>
            <div className="space-y-2.5">
              {result.winners.map((w, i) => {
                // 在 allHands 中找到该赢家的底牌
                const winnerHandInfo = result.allHands.find(h => h.playerId === w.playerId);
                const winnerHoleCards = winnerHandInfo?.cards || [];
                // 多赢家时显示分池序号
                const showLayerTag = result.winners.length > 1;
                return (
                  <WinnerRow
                    key={i}
                    winner={w}
                    holeCards={winnerHoleCards}
                    showLayerTag={showLayerTag}
                    layerIndex={i + 1}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 多人分池说明 ===== */}
        {result.winners.length > 1 && !result.isSplitPot && (
          <div className="text-center mb-4 text-gray-400 text-xs bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2">
            不同玩家分别赢得不同底池层
          </div>
        )}

        {/* ===== 其他玩家手牌 ===== */}
        <div className="border-t border-gray-700/50 pt-4">
          <div className="text-[10px] text-gray-500 tracking-widest uppercase mb-3">
            {isSingleWinnerByFold ? '本局参与者' : '所有玩家'}
          </div>
          <div className="space-y-2">
            {result.allHands.map((h, i) => {
              const isWinner = result.winners.some(w => w.playerId === h.playerId);
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                    isWinner ? 'bg-yellow-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-xs truncate ${
                      isWinner ? 'text-yellow-300 font-semibold' :
                      h.isFolded ? 'text-gray-500' : 'text-gray-300'
                    }`}>
                      {h.nickname}
                      {isWinner && <span className="ml-1">🏆</span>}
                      {h.isFolded && <span className="ml-1 text-gray-600">(弃牌)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!h.isFolded && !isWinner && (
                      <span className="text-gray-500 text-[10px]">{h.handDescription}</span>
                    )}
                    <div className="flex gap-0.5">
                      {h.cards.map((c, j) => {
                        // 赢家在这里也显示底牌（已在赢家区显示，此处弱化）
                        const winnerBestCards = isWinner
                          ? result.winners.find(w => w.playerId === h.playerId)?.cards || []
                          : [];
                        const highlight = isWinner && isInBestCards(c, winnerBestCards);
                        return (
                          <CardView
                            key={j}
                            card={c}
                            small
                            faceDown={h.isFolded}
                            highlight={highlight}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== 操作按钮 ===== */}
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

        <p className="text-center text-gray-600 text-xs mt-2">
          所有人关闭后开始下一局
        </p>
      </div>
    </div>
  );
}

/** 赢家行：展示手牌 + 牌型 + 赢得筹码 */
function WinnerRow({
  winner,
  holeCards,
  showLayerTag,
  layerIndex,
}: {
  winner: WinnerInfo;
  holeCards: Card[];
  showLayerTag: boolean;
  layerIndex: number;
}) {
  return (
    <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/5 rounded-xl p-3 border border-yellow-500/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {showLayerTag && (
            <span className="text-[9px] text-yellow-400 bg-yellow-500/20 px-1.5 py-0.5 rounded-full border border-yellow-500/40 shrink-0">
              底池{layerIndex}
            </span>
          )}
          <span className="text-white font-bold text-sm truncate">{winner.nickname}</span>
        </div>
        <span className="text-yellow-400 font-bold text-lg shrink-0">
          +{winner.chipsWon}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* 赢家手牌：参与组成牌型的牌金色高亮 */}
        <div className="flex gap-0.5">
          {holeCards.map((c, i) => {
            const highlight = isInBestCards(c, winner.cards);
            return <CardWithBadge key={i} card={c} highlight={highlight} />;
          })}
        </div>
        <div className="flex-1 text-right">
          <span className="text-yellow-300 text-xs font-semibold px-2 py-1 bg-yellow-500/10 rounded border border-yellow-500/20">
            {winner.handDescription}
          </span>
        </div>
      </div>
    </div>
  );
}
