import { Card as CardType } from '../types/game';

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SUIT_COLORS: Record<string, string> = {
  spades: 'text-gray-900',
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-gray-900',
};

const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  small?: boolean;
  highlight?: boolean;
  /** 是否播放发牌动画（从上方落下）*/
  deal?: boolean;
  /** 置灰显示（如自己已弃牌）*/
  dimmed?: boolean;
}

export default function CardView({ card, faceDown, small, highlight, deal, dimmed }: CardProps) {
  const animClass = deal ? 'card-deal' : 'card-enter';
  const dimClass = dimmed ? 'opacity-40 grayscale' : '';
  if (faceDown || !card) {
    return (
      <div
        className={`
          inline-flex items-center justify-center rounded-lg font-bold shadow-lg
          bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-blue-500
          ${small ? 'w-8 h-12 text-xs' : 'w-12 h-16 sm:w-14 sm:h-20 text-sm sm:text-base'}
          ${animClass} ${dimClass}
        `}
      >
        <div className="w-5/6 h-5/6 rounded border border-blue-400 flex items-center justify-center">
          <span className="text-blue-300">🂠</span>
        </div>
      </div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit] || '?';
  const colorClass = SUIT_COLORS[card.suit] || 'text-gray-900';
  const rankLabel = RANK_LABELS[card.rank] || String(card.rank);

  return (
    <div
      className={`
        inline-flex flex-col items-center justify-center rounded-lg font-bold shadow-lg bg-white border-2
        ${highlight ? 'border-yellow-400 ring-2 ring-yellow-300' : 'border-gray-300'}
        ${small ? 'w-8 h-12 text-xs' : 'w-12 h-16 sm:w-14 sm:h-20 text-sm sm:text-base'}
        ${animClass} ${dimClass}
      `}
    >
      <span className={`${colorClass} leading-none`}>{rankLabel}</span>
      <span className={`${colorClass} leading-none ${small ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
        {suitSymbol}
      </span>
    </div>
  );
}

export function EmptyCardSlot({ small }: { small?: boolean }) {
  return (
    <div
      className={`
        inline-flex items-center justify-center rounded-lg border-2 border-dashed border-gray-600
        ${small ? 'w-8 h-12' : 'w-12 h-16 sm:w-14 sm:h-20'}
      `}
    >
      <span className="text-gray-600 text-xs">?</span>
    </div>
  );
}
