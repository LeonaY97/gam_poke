import CardView, { EmptyCardSlot } from './CardView';
import { useGameStore } from '../stores/gameStore';

export default function CommunityCards() {
  const communityCards = useGameStore(s => s.communityCards);
  const gamePhase = useGameStore(s => s.gamePhase);

  const revealedCount = communityCards.length;

  return (
    <div className="flex gap-1 sm:gap-2 justify-center my-2">
      {[0, 1, 2, 3, 4].map((i) => {
        if (i < revealedCount) {
          // flop 阶段前3张一起发，turn/river 只新发1张
          const isNewCard =
            (gamePhase === 'flop' && i >= 0 && i < 3 && revealedCount === 3) ||
            (gamePhase === 'turn' && i === 3) ||
            (gamePhase === 'river' && i === 4);
          return (
            <CardView
              key={i}
              card={communityCards[i]}
              highlight={i >= revealedCount - 1 && gamePhase !== 'showdown'}
              deal={isNewCard}
            />
          );
        }
        return <EmptyCardSlot key={i} />;
      })}
    </div>
  );
}
