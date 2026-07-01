import { useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { useSocket } from '../hooks/useSocket';
import CardView from '../components/CardView';
import PlayerSeat from '../components/PlayerSeat';
import CommunityCards from '../components/CommunityCards';
import ActionBar from '../components/ActionBar';
import HandResultView from '../components/HandResultView';
import PlayerDetailPanel from '../components/PlayerDetailPanel';
import RoundTransitionOverlay from '../components/RoundTransitionOverlay';
import FinalSettlementModal from '../components/FinalSettlementModal';
import DanmakuBar from '../components/DanmakuBar';
import type { RoomListItem, Player, GamePlayer, BetRecord } from '../types/game';

/**
 * 根据玩家人数自适应座位位置。
 * posIndex 0 = 自己（底部中间），posIndex 1..n = 其他玩家从自己左手边顺时针均匀分布。
 * 使用极坐标（椭圆），角度从底部 270° 开始，步长 = 360°/totalPlayers。
 * 椭圆收紧并下移，避免与顶部 header 和底部 ActionBar 重叠。
 */
function getPlayerSeatPosition(posIndex: number, totalPlayers: number): { x: number; y: number } {
  if (totalPlayers <= 1) return { x: 50, y: 72 };
  const step = 360 / totalPlayers;
  const angleDeg = 270 + posIndex * step;
  const angleRad = (angleDeg * Math.PI) / 180;
  const rx = 37;
  const ry = 24;
  const centerX = 50;
  const centerY = 46;
  return {
    x: centerX + rx * Math.cos(angleRad),
    y: centerY - ry * Math.sin(angleRad),
  };
}

/** 自己的座位位置（底部中间） */
const MY_SEAT_POSITION = { x: 50, y: 76 };

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getSocket } = useSocket();
  const [fetching, setFetching] = useState(true);

  const inGame = useGameStore(s => s.inGame);
  const room = useGameStore(s => s.room);
  const playerId = useGameStore(s => s.playerId);
  const myCards = useGameStore(s => s.myCards);
  const communityCards = useGameStore(s => s.communityCards);
  const gamePhase = useGameStore(s => s.gamePhase);
  const pot = useGameStore(s => s.pot);
  const lastAction = useGameStore(s => s.lastAction);
  const handResult = useGameStore(s => s.handResult);
  const borrowRequest = useGameStore(s => s.borrowRequest);
  const finalSettlement = useGameStore(s => s.finalSettlement);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const connected = useGameStore(s => s.connected);
  const serverUrl = useGameStore(s => s.serverUrl);

  useEffect(() => {
    if (inGame && room) {
      setFetching(false);
      return;
    }
    if (!roomId || !serverUrl) return;

    const httpBase = serverUrl.replace(/\/+$/, '');
    fetch(`${httpBase}/api/room/${roomId}`)
      .then(r => r.json())
      .then(data => {
        const st = useGameStore.getState();
        if (data.room) {
          st.setRoom(data.room as RoomListItem);
          if (data.room.game && data.room.game.phase !== 'waiting') {
            st.setInGame(true);
            st.setGamePhase(data.room.game.phase);
            st.setPot(data.room.game.pot);
          }
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [roomId, serverUrl]);

  useEffect(() => {
    if (!fetching && !inGame && !connected) {
      const t = setTimeout(() => navigate('/'), 3000);
      return () => clearTimeout(t);
    }
  }, [fetching, inGame, connected, navigate]);

  // 操作提示气泡自动消失
  useEffect(() => {
    if (!lastAction) return;
    const t = setTimeout(() => {
      useGameStore.getState().setLastAction(null);
    }, 2500);
    return () => clearTimeout(t);
  }, [lastAction]);

  const players = room?.players || [];
  const myIndex = players.findIndex(p => p.id === playerId);
  const dealerIndex = room?.game?.dealerIndex ?? 0;
  const currentPlayerId = useGameStore(s => s.currentPlayerId);
  // 游戏中的玩家状态（含本轮下注等）
  const gamePlayers = room?.game?.players || [];

  const seatMap = useMemo(() => {
    if (players.length === 0) return [];
    const idx = players.findIndex(p => p.id === playerId);
    if (idx === -1) return players.map((p, i) => ({ ...p, seatIndex: i, posIndex: i }));
    return players.map((p, i) => {
      const offset = (i - idx + players.length) % players.length;
      return { ...p, seatIndex: i, posIndex: offset };
    });
  }, [players, playerId]);

  // 计算玩家位置标识：2人时 dealer=SB，另一人=BB；3+人时 dealer+1=SB, dealer+2=BB
  const getPositionLabel = (seatIndex: number): 'D' | 'SB' | 'BB' | null => {
    const n = players.length;
    if (n < 2) return null;
    if (n === 2) {
      if (seatIndex === dealerIndex) return 'D'; // heads-up 庄家即小盲
      if (seatIndex === (dealerIndex + 1) % n) return 'BB';
      return null;
    }
    if (seatIndex === dealerIndex) return 'D';
    if (seatIndex === (dealerIndex + 1) % n) return 'SB';
    if (seatIndex === (dealerIndex + 2) % n) return 'BB';
    return null;
  };

  // 取某玩家本手累计下注（totalBet 跨轮次累计，每手牌开始时重置）
  const getPlayerBet = (pid: string): number => {
    const gp = gamePlayers.find(g => g.playerId === pid);
    return gp?.totalBet ?? 0;
  };

  // 取某玩家是否已弃牌
  const isPlayerFolded = (pid: string): boolean => {
    const gp = gamePlayers.find(g => g.playerId === pid);
    return gp?.isFolded ?? false;
  };

  // 获取任意玩家的屏幕位置（用于操作气泡定位）
  const getPlayerScreenPosition = (pid: string): { x: number; y: number } | null => {
    if (pid === playerId) return MY_SEAT_POSITION;
    const seat = seatMap.find(s => s.id === pid);
    if (!seat) return null;
    return getPlayerSeatPosition(seat.posIndex, players.length);
  };

  // 自己的筹码和借入次数
  const myPlayer = players.find(p => p.id === playerId);
  const myPlayerChips = myPlayer?.chips ?? 0;
  const myBorrowCount = myPlayer?.borrowCount ?? 1;

  // 借入筹码决策
  const handleBorrow = useCallback((borrow: boolean) => {
    const ws = getSocket();
    if (!ws?.connected || !roomId) return;
    ws.emit('borrow_chips', { roomCode: roomId, borrow }, (res: any) => {
      if (res.success) {
        useGameStore.getState().setBorrowRequest(null);
      } else {
        alert(res.error || '操作失败');
      }
    });
  }, [getSocket, roomId]);

  const phaseLabels: Record<string, string> = {
    preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌',
  };

  const handleLeave = useCallback(() => {
    const ws = getSocket();
    if (ws) ws.emit('leave_room');
    useGameStore.getState().reset();
    navigate('/');
  }, [getSocket, navigate]);

  if (!inGame) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-poker-dark to-poker-felt flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">正在进入游戏...</p>
          {!connected && !fetching && (
            <button onClick={() => navigate('/')} className="mt-4 text-yellow-400 underline text-sm">返回首页</button>
          )}
        </div>
      </div>
    );
  }

  // 操作气泡文本
  const actionBubbleText = lastAction
    ? lastAction.action === 'fold' ? '弃牌'
      : lastAction.action === 'check' ? '过牌'
      : lastAction.action === 'call' ? `跟注 ${lastAction.amount}`
      : lastAction.action === 'raise' ? `加注 ${lastAction.amount}`
      : 'All-in'
    : '';

  const actionBubbleColor = lastAction
    ? lastAction.action === 'fold' ? 'bg-red-600'
      : lastAction.action === 'raise' ? 'bg-blue-600'
      : lastAction.action === 'allin' ? 'bg-yellow-600 text-black'
      : 'bg-green-600'
    : 'bg-gray-700';

  return (
    <div className="min-h-screen bg-gradient-to-b from-poker-dark via-poker-felt to-poker-dark overflow-hidden relative">
      {/* 顶部信息栏 */}
      <div className="absolute top-0 left-0 right-0 bg-black/30 backdrop-blur-sm px-3 py-2 flex items-center justify-between z-40">
        <button onClick={handleLeave} className="text-gray-400 hover:text-white text-sm px-2 py-1">← 离开</button>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">第 <span className="text-white font-bold">{room?.game?.round || 1}</span> 局</span>
          <span className="text-gray-400">{phaseLabels[gamePhase] || '等待'}</span>
          <span key={pot} className="text-yellow-400 font-bold pot-pulse inline-block">底池 {pot}</span>
        </div>
        <div className="w-10" />
      </div>

      {/* 牌桌区域 */}
      <div className="relative w-full h-screen pt-14 pb-28">
        {/* 椭圆桌面 */}
        <div className="absolute top-[14%] left-[4%] right-[4%] bottom-[26%] rounded-[40%] bg-gradient-to-b from-green-800 to-green-900 border-4 border-yellow-900/30 shadow-inner" />
        {/* 社区牌 */}
        <div className="absolute top-[34%] left-1/2 -translate-x-1/2 z-20"><CommunityCards /></div>

        {/* 操作气泡：浮在对应玩家卡片上方 */}
        {lastAction && (() => {
          const pos = getPlayerScreenPosition(lastAction.playerId);
          if (!pos) return null;
          return (
            <div
              key={`${lastAction.playerId}-${lastAction.action}-${lastAction.amount}`}
              className="absolute z-30 action-bubble"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -130%)',
              }}
            >
              <div className={`rounded-full px-3 py-1.5 text-white text-xs sm:text-sm font-bold shadow-lg whitespace-nowrap ${actionBubbleColor}`}>
                {actionBubbleText}
              </div>
              {/* 小三角指向玩家 */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0"
                style={{
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: `5px solid ${lastAction.action === 'allin' ? '#ca8a04' : lastAction.action === 'fold' ? '#dc2626' : lastAction.action === 'raise' ? '#2563eb' : '#16a34a'}`,
                }}
              />
            </div>
          );
        })()}

        {/* 其他玩家座位 */}
        {seatMap.map((player) => {
          if (player.id === playerId) return null; // 自己渲染在底部
          const pos = getPlayerSeatPosition(player.posIndex, players.length);
          const isMyTurn = currentPlayerId === player.id;
          return (
            <div key={player.id} onClick={() => setSelectedPlayer(player)} className="cursor-pointer">
              <PlayerSeat
                player={player}
                isCurrentPlayer={false}
                isDealer={player.seatIndex === dealerIndex}
                positionLabel={getPositionLabel(player.seatIndex)}
                isActiveTurn={isMyTurn}
                currentBet={getPlayerBet(player.id)}
                isFolded={isPlayerFolded(player.id)}
                position={pos}
              />
            </div>
          );
        })}

        {/* 自己的座位 + 手牌（底部）+ 流转箭头 */}
        {myCards.length > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              {/* 左侧箭头：指示下一个行动方向（顺时针 → 左手边） */}
              <div className="flex flex-col items-center text-yellow-500/70">
                <span className="text-[9px] whitespace-nowrap">下一手</span>
                <span className="text-base sm:text-lg">←</span>
              </div>
              <div className="flex gap-1.5 sm:gap-2">{myCards.map((c, i) => <CardView key={i} card={c} highlight />)}</div>
              {/* 右侧箭头：指示庄家方向（上一手） */}
              <div className="flex flex-col items-center text-blue-400/60">
                <span className="text-[9px] whitespace-nowrap">上一手</span>
                <span className="text-base sm:text-lg">→</span>
              </div>
            </div>
            <div className={`rounded-lg px-3 sm:px-4 py-1.5 text-center backdrop-blur border-2 ${currentPlayerId === playerId ? 'bg-yellow-500/30 border-yellow-400' : 'bg-gray-800/80 border-gray-600'}`}>
              <div className="flex items-center gap-2 justify-center">
                <span className="text-white text-xs sm:text-sm font-semibold">{players[myIndex]?.nickname || '你'}</span>
                {getPositionLabel(players[myIndex]?.seatIndex ?? -1) && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    getPositionLabel(players[myIndex]?.seatIndex ?? -1) === 'D' ? 'bg-white text-gray-900' :
                    getPositionLabel(players[myIndex]?.seatIndex ?? -1) === 'SB' ? 'bg-blue-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    {getPositionLabel(players[myIndex]?.seatIndex ?? -1)}
                  </span>
                )}
                {currentPlayerId === playerId && (
                  <span className="text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded-full animate-pulse">行动中</span>
                )}
              </div>
              <div className="mt-0.5">
                <span className="text-yellow-400 text-xs sm:text-sm font-bold">{players[myIndex]?.chips || 0}</span>
                {getPlayerBet(playerId) > 0 && (
                  <span className="text-[10px] text-yellow-300 bg-yellow-900/40 px-1.5 py-0.5 rounded ml-2">
                    下注 {getPlayerBet(playerId)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 借入弹框：仅在一局结束、下局开始前收到 borrow_request 时显示 */}
      {borrowRequest && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 border border-yellow-600/50 text-center">
            <div className="text-4xl mb-3">💸</div>
            <h2 className="text-xl font-bold text-white mb-2">筹码已用完</h2>
            <p className="text-gray-400 text-sm mb-4">
              当前已借入：{borrowRequest.borrowCount} 手<br />
              可再借入一手（{borrowRequest.initialChips} 筹码）<br />
              <span className="text-yellow-400">等待所有玩家决策后开始下一局</span>
            </p>
            <button
              onClick={() => handleBorrow(true)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold mb-2"
            >
              借入筹码
            </button>
            <button
              onClick={() => handleBorrow(false)}
              className="w-full py-2 rounded-xl bg-gray-700 text-gray-300 text-sm"
            >
              不借入（旁观下局）
            </button>
          </div>
        </div>
      )}

      {/* 玩家详情面板 */}
      {selectedPlayer && (
        <PlayerDetailPanel
          player={selectedPlayer}
          gamePlayers={gamePlayers}
          betHistory={room?.game?.betHistory || []}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      <ActionBar />
      <DanmakuBar />
      {handResult && <HandResultView result={handResult} onClose={() => useGameStore.getState().setHandResult(null)} />}
      {finalSettlement && (
        <FinalSettlementModal
          data={finalSettlement}
          isHost={room?.hostId === playerId}
          onClose={() => useGameStore.getState().setFinalSettlement(null)}
        />
      )}
      <RoundTransitionOverlay />
    </div>
  );
}
