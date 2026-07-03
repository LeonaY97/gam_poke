import { memo, useEffect, useState } from 'react';
import type { Player, Card } from '../types/game';
import CardView from './CardView';

interface PlayerSeatProps {
  player: Player;
  isCurrentPlayer: boolean;
  isDealer: boolean;
  /** 该玩家的位置标识：BTN/SB/BB/UTG/UTG+1/UTG+2/MP/HJ/CO，null=无（旁观/未参与） */
  positionLabel: string | null;
  /** 当前是否轮到该玩家行动 */
  isActiveTurn: boolean;
  /** 是否为 AI 正在思考中 */
  isThinking?: boolean;
  /** 该玩家本轮的下注金额 */
  currentBet?: number;
  /** 该玩家是否已弃牌 */
  isFolded?: boolean;
  /** 离线倒计时总秒数（仅在该玩家处于离线等待时传入） */
  offlineCountdownSeconds?: number | null;
  position: { x: number; y: number };
  /** 旁观者视角下显示的手牌（仅旁观者模式传入） */
  cards?: Card[];
}

function PlayerSeat({
  player,
  isCurrentPlayer,
  isDealer,
  positionLabel,
  isActiveTurn,
  isThinking = false,
  currentBet = 0,
  isFolded = false,
  offlineCountdownSeconds = null,
  position,
  cards,
}: PlayerSeatProps) {
  // 本地倒计时：从总秒数开始每秒递减，到 0 清除
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (offlineCountdownSeconds && offlineCountdownSeconds > 0) {
      setCountdown(offlineCountdownSeconds);
      const start = Date.now();
      const total = offlineCountdownSeconds * 1000;
      const timer = setInterval(() => {
        const elapsed = Date.now() - start;
        const remain = Math.max(0, Math.ceil((total - elapsed) / 1000));
        setCountdown(remain);
        if (remain <= 0) clearInterval(timer);
      }, 250);
      return () => clearInterval(timer);
    } else {
      setCountdown(null);
    }
  }, [offlineCountdownSeconds]);

  const isOfflineWaiting = countdown !== null && countdown > 0;

  // 弃牌玩家：明显置灰；离线等待倒计时：橙色边框高亮提示
  const bgColor = isFolded
    ? 'bg-gray-900/60 border-gray-700 opacity-45'
    : isOfflineWaiting
      ? 'bg-orange-600/40 border-orange-400 shadow-lg shadow-orange-500/40 turn-glow'
      : player.isConnected
        ? isActiveTurn || isThinking
          ? 'bg-yellow-500/30 border-yellow-400 shadow-lg shadow-yellow-500/30 turn-glow'
          : isCurrentPlayer
            ? 'bg-green-500/20 border-green-400'
            : 'bg-gray-800/80 border-gray-600'
        : 'bg-gray-700/50 border-gray-500 opacity-60';

  const statusBadge = (() => {
    if (isFolded) return { text: '已弃牌', color: 'bg-gray-600' };
    if (isOfflineWaiting) return { text: `离线 ${countdown}s`, color: 'bg-orange-500 animate-pulse' };
    if (!player.isConnected) return { text: '离线', color: 'bg-gray-500' };
    if (isThinking) return { text: '思考中', color: 'bg-blue-500' };
    if (isActiveTurn) return { text: '行动中', color: 'bg-yellow-500 animate-pulse' };
    if (isCurrentPlayer) return { text: '你', color: 'bg-green-500' };
    return null;
  })();

  // 位置标识颜色：按位置重要性分色
  // BTN=白底黑字（庄家）、SB=蓝、BB=红、UTG系列=紫、MP=青、HJ=橙、CO=绿
  const positionBadge = (() => {
    if (!positionLabel) return null;
    const colorMap: Record<string, string> = {
      'BTN':  'bg-white text-gray-900',
      'SB':   'bg-blue-600 text-white',
      'BB':   'bg-red-600 text-white',
      'UTG':  'bg-purple-600 text-white',
      'UTG+1':'bg-purple-500 text-white',
      'UTG+2':'bg-purple-400 text-white',
      'MP':   'bg-cyan-600 text-white',
      'HJ':   'bg-orange-600 text-white',
      'CO':   'bg-green-600 text-white',
    };
    return { text: positionLabel, color: colorMap[positionLabel] || 'bg-gray-600 text-white' };
  })();

  return (
    <div
      className={`absolute rounded-xl border-2 p-1.5 sm:p-2 flex flex-col items-center min-w-[64px] sm:min-w-[88px] transition-all duration-300 ${bgColor}`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* 位置标识（左上角） */}
      {positionBadge && !isFolded && (
        <div className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-md ${positionBadge.color}`}>
          {positionBadge.text}
        </div>
      )}

      {/* 行动中/思考中标识（右上角脉冲点，手机端静态） */}
      {(isActiveTurn || isThinking) && !isFolded && (
        <div className={`absolute -top-2 -right-2 w-3 h-3 rounded-full md:animate-ping ${isThinking ? 'bg-blue-400' : 'bg-yellow-400'}`} />
      )}

      <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center text-white font-bold text-[10px] sm:text-sm mb-0.5">
        {player.nickname.charAt(0).toUpperCase()}
      </div>

      <span className="text-white font-semibold text-[10px] sm:text-sm truncate max-w-[70px] text-center">
        {player.nickname}
      </span>

      <span className={`font-bold text-[10px] sm:text-sm ${isFolded ? 'text-gray-500' : 'text-yellow-400'}`}>
        {player.chips}
      </span>

      {/* 本轮下注金额 */}
      {currentBet > 0 && !isFolded && (
        <span className="text-[9px] sm:text-[10px] text-yellow-300 bg-yellow-900/40 px-1.5 py-0.5 rounded mt-0.5">
          下注 {currentBet}
        </span>
      )}

      {statusBadge && (
        <span className={`text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full text-white ${statusBadge.color} mt-0.5`}>
          {statusBadge.text}
        </span>
      )}

      {/* 旁观者视角：显示该玩家手牌 */}
      {cards && cards.length > 0 && !isFolded && (
        <div className="flex gap-0.5 mt-1">
          {cards.map((c, i) => <CardView key={i} card={c} small />)}
        </div>
      )}
    </div>
  );
}

// memo 包装：props 不变时不重渲染（GamePage 18 个 store 订阅任一变化都会重渲染，memo 避免无变化座位跟着重建）
// 自定义 areEqual：因为 GamePage 中 seatMap 是 {...p, seatIndex, posIndex} 创建的新对象，
// 默认浅比较 player 引用每次都变，memo 会失效。这里按字段值比较。
function areEqual(prev: PlayerSeatProps, next: PlayerSeatProps) {
  // player 字段（仅比较影响渲染的字段）
  const p1 = prev.player;
  const p2 = next.player;
  if (p1.id !== p2.id) return false;
  if (p1.nickname !== p2.nickname) return false;
  if (p1.chips !== p2.chips) return false;
  if (p1.isConnected !== p2.isConnected) return false;

  // 其他 props 基本类型直接比较
  if (prev.isCurrentPlayer !== next.isCurrentPlayer) return false;
  if (prev.isDealer !== next.isDealer) return false;
  if (prev.positionLabel !== next.positionLabel) return false;
  if (prev.isActiveTurn !== next.isActiveTurn) return false;
  if (prev.isThinking !== next.isThinking) return false;
  if (prev.currentBet !== next.currentBet) return false;
  if (prev.isFolded !== next.isFolded) return false;
  if (prev.offlineCountdownSeconds !== next.offlineCountdownSeconds) return false;

  // position 对象：每次都是新引用，但值不变即相等
  if (prev.position.x !== next.position.x || prev.position.y !== next.position.y) return false;

  // cards 数组：引用相同或长度相同且内容相同才相等
  const c1 = prev.cards;
  const c2 = next.cards;
  if (c1 === c2) return true;
  if (!c1 || !c2) return false;
  if (c1.length !== c2.length) return false;
  for (let i = 0; i < c1.length; i++) {
    if (c1[i].rank !== c2[i].rank || c1[i].suit !== c2[i].suit) return false;
  }
  return true;
}

export default memo(PlayerSeat, areEqual);
