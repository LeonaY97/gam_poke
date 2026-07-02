import type { Player, GamePlayer, BetRecord, GamePhase } from '../types/game';

interface PlayerDetailPanelProps {
  player: Player;
  gamePlayers: GamePlayer[];
  betHistory: BetRecord[];
  onClose: () => void;
}

const phaseLabels: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌', waiting: '等待',
};

const actionLabels: Record<string, string> = {
  fold: '弃牌', check: '过牌', call: '跟注', raise: '加注', allin: '全押', blind: '盲注',
};

export default function PlayerDetailPanel({ player, gamePlayers, betHistory, onClose }: PlayerDetailPanelProps) {
  const gp = gamePlayers.find(g => g.playerId === player.id);
  const myBet = gp?.totalBet ?? 0;

  // 按 phase 分组行动记录
  const phases: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const recordsByPhase = phases.map(phase => ({
    phase,
    records: betHistory.filter(b => b.playerId === player.id && b.phase === phase),
  })).filter(g => g.records.length > 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl p-5 max-w-sm w-full border border-gray-600 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center text-white font-bold">
              {player.nickname.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-white font-bold">{player.nickname}</h3>
              {player.id.startsWith('bot_') && <span className="text-xs text-purple-400">🤖 AI玩家</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* 基本信息 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-gray-400 text-[10px]">当前积分</div>
            <div className="text-yellow-400 font-bold text-sm">{player.chips}</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-gray-400 text-[10px]">借入手数</div>
            <div className="text-blue-400 font-bold text-sm">{player.borrowCount ?? 1}</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-2 text-center">
            <div className="text-gray-400 text-[10px]">当局下注</div>
            <div className="text-red-400 font-bold text-sm">{myBet}</div>
          </div>
        </div>

        {/* 行动记录 */}
        <div>
          <h4 className="text-gray-300 text-sm font-semibold mb-2">当局行动记录</h4>
          {recordsByPhase.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-4">暂无行动记录</p>
          ) : (
            <div className="space-y-2">
              {recordsByPhase.map(({ phase, records }) => (
                <div key={phase} className="bg-gray-700/30 rounded-lg p-2">
                  <div className="text-gray-400 text-[10px] mb-1">{phaseLabels[phase] || phase}</div>
                  <div className="space-y-1">
                    {records.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-white">{actionLabels[r.action] || r.action}</span>
                        {r.amount > 0 && <span className="text-yellow-400">{r.amount}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
