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
import SettingsModal from '../components/SettingsModal';
import type { RoomListItem, Player, GamePlayer, BetRecord } from '../types/game';

/**
 * 根据玩家人数自适应座位位置。
 * posIndex 0 = 自己（底部中间），posIndex 1..n = 其他玩家从自己左手边开始顺时针均匀分布
 * （与德扑顺时针轮转一致：dealer → SB → BB 即 posIndex 递增方向）。
 * 角度从底部 270° 起递减（屏幕上呈现为左手边 → 顶部 → 右手边 → 回到底部），
 * 即玩家视角的顺时针 = 屏幕上的逆时针。
 * 椭圆收紧并下移，避免与顶部 header 和底部 ActionBar 重叠。
 */
function getPlayerSeatPosition(posIndex: number, totalPlayers: number): { x: number; y: number } {
  if (totalPlayers <= 1) return { x: 50, y: 72 };
  const step = 360 / totalPlayers;
  const angleDeg = 270 - posIndex * step;
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
  const [showSettings, setShowSettings] = useState(false);
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
  const turnOptions = useGameStore(s => s.turnOptions);

  // 是否需要显示"等待其他玩家"：牌局进行中 + 不是自己的回合 + 不在结算
  const isWaitingForOthers = gamePhase !== 'showdown' && gamePhase !== 'waiting'
    && currentPlayerId !== playerId
    && !turnOptions;

  // 当前正在行动/思考的玩家名字
  const currentPlayerName = useMemo(() => {
    if (!currentPlayerId) return '';
    return players.find(p => p.id === currentPlayerId)?.nickname || '';
  }, [currentPlayerId, players]);

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

  // 计算玩家位置标识（标准德扑位置命名）
  // 2人: BTN(SB) / BB
  // 3人: BTN / SB / BB
  // 4人: BTN / SB / BB / UTG
  // 5人: BTN / SB / BB / UTG / HJ
  // 6人: BTN / SB / BB / UTG / HJ / CO
  // 7人: BTN / SB / BB / UTG / UTG+1 / HJ / CO
  // 8人: BTN / SB / BB / UTG / UTG+1 / MP / HJ / CO
  // 9人: BTN / SB / BB / UTG / UTG+1 / UTG+2 / MP / HJ / CO
  const getPositionLabel = (seatIndex: number): string | null => {
    const n = players.length;
    if (n < 2) return null;
    // offset = 该座位相对 dealer 顺时针偏移量
    const offset = (seatIndex - dealerIndex + n) % n;

    // heads-up：庄家即小盲
    if (n === 2) {
      return offset === 0 ? 'BTN' : 'BB';
    }

    // n >= 3：前三个固定 BTN / SB / BB
    if (offset === 0) return 'BTN';
    if (offset === 1) return 'SB';
    if (offset === 2) return 'BB';

    // 4人桌：offset 3 = UTG
    if (n === 4) return 'UTG';
    // 5人桌：offset 3 = UTG, offset 4 = HJ
    if (n === 5) return offset === 3 ? 'UTG' : 'HJ';

    // n >= 6：最后一个 = CO，倒数第二 = HJ
    if (offset === n - 1) return 'CO';
    if (offset === n - 2) return 'HJ';
    // n >= 8：倒数第三 = MP
    if (n >= 8 && offset === n - 3) return 'MP';

    // 剩余前向 UTG 系列（offset 3 起）
    const utgIdx = offset - 3;
    return utgIdx === 0 ? 'UTG' : `UTG+${utgIdx}`;
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
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">第 <span className="text-white font-bold">{room?.game?.round || 1}</span> 局</span>
          <span className="text-gray-400">{phaseLabels[gamePhase] || '等待'}</span>
          <span key={pot} className="text-yellow-400 font-bold pot-pulse inline-block">底池 {pot}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => window.location.reload()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10 hover:border-yellow-500/40 transition-all duration-200 active:scale-90"
            title="刷新页面（重连牌局）"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10 hover:border-yellow-500/40 transition-all duration-200 active:scale-90"
            title="声音设置"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 等待其他玩家提示条 */}
      {isWaitingForOthers && (
        <div className="absolute top-10 left-0 right-0 z-40 flex justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm border border-yellow-500/30 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-lg">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-yellow-300 text-xs font-medium">等待其他玩家行动...</span>
          </div>
        </div>
      )}

      {/* 牌桌区域 */}
      <div className="relative w-full h-screen pt-14 pb-28">
        {/* 椭圆桌面 */}
        <div className="absolute top-[14%] left-[4%] right-[4%] bottom-[26%] rounded-[40%] bg-gradient-to-b from-green-800 to-green-900 border-4 border-yellow-900/30 shadow-inner" />
        {/* 社区牌 */}
        <div className="absolute top-[34%] left-1/2 -translate-x-1/2 z-20"><CommunityCards /></div>

        {/* 操作气泡：浮在对应玩家卡片上方（自己的气泡改到右下，避免遮挡手牌）*/}
        {lastAction && (() => {
          const pos = getPlayerScreenPosition(lastAction.playerId);
          if (!pos) return null;
          const isMine = lastAction.playerId === playerId;
          const bubbleColor = lastAction.action === 'allin' ? '#ca8a04' : lastAction.action === 'fold' ? '#dc2626' : lastAction.action === 'raise' ? '#2563eb' : '#16a34a';
          if (isMine) {
            // 自己的气泡：放到底部左侧，避开右侧的弹幕按钮和手牌
            return (
              <div
                key={`${lastAction.playerId}-${lastAction.action}-${lastAction.amount}`}
                className="absolute z-30 action-bubble"
                style={{
                  left: '12px',
                  bottom: '120px',
                }}
              >
                <div className="relative">
                  <div className={`rounded-lg px-3 py-1.5 text-white text-xs sm:text-sm font-bold shadow-lg whitespace-nowrap ${actionBubbleColor}`}>
                    {actionBubbleText}
                  </div>
                  {/* 右侧小三角指向自己的座位 */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-0 h-0"
                    style={{
                      borderTop: '5px solid transparent',
                      borderBottom: '5px solid transparent',
                      borderLeft: `5px solid ${bubbleColor}`,
                    }}
                  />
                </div>
              </div>
            );
          }
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
                  borderTop: `5px solid ${bubbleColor}`,
                }}
              />
            </div>
          );
        })()}

        {/* 其他玩家座位 */}
        {seatMap.map((player) => {
          if (player.id === playerId) return null;
          const pos = getPlayerSeatPosition(player.posIndex, players.length);
          const isMyTurn = currentPlayerId === player.id;
          const isThinking = isMyTurn && player.id.startsWith('bot_') && !turnOptions;
          return (
            <div key={player.id} onClick={() => setSelectedPlayer(player)} className="cursor-pointer">
              <PlayerSeat
                player={player}
                isCurrentPlayer={false}
                isDealer={player.seatIndex === dealerIndex}
                positionLabel={getPositionLabel(player.seatIndex)}
                isActiveTurn={isMyTurn && !isThinking}
                isThinking={isThinking}
                currentBet={getPlayerBet(player.id)}
                isFolded={isPlayerFolded(player.id)}
                position={pos}
              />
            </div>
          );
        })}

        {/* 自己的座位 + 手牌（底部）+ 本阶段行动顺序提示 */}
        {myIndex !== -1 && (() => {
          // 根据当前阶段计算首位行动者位置标识
          // 翻牌前(preflop)：UTG(dealer+3) 先行动；2人桌 button 先行动
          // 翻牌后(flop/turn/river)：SB(dealer+1) 先行动；2人桌 button 先行动
          const n = players.length;
          let firstOffset: number;
          if (n === 2) {
            firstOffset = 0; // heads-up：button 先动（翻牌前 button=SB 也是先动）
          } else if (gamePhase === 'preflop') {
            firstOffset = 3; // UTG
          } else {
            firstOffset = 1; // SB
          }
          const firstSeat = (dealerIndex + firstOffset) % n;
          const firstLabel = (() => {
            if (n === 2) return firstOffset === 0 ? 'BTN' : 'BB';
            if (firstOffset === 0) return 'BTN';
            if (firstOffset === 1) return 'SB';
            if (firstOffset === 2) return 'BB';
            return 'UTG';
          })();
          // 构造行动顺序链：首位 → 顺时针 → BB/SB 等
          const orderLabels: string[] = [];
          for (let i = 0; i < n; i++) {
            const seat = (firstSeat + i) % n;
            const off = (seat - dealerIndex + n) % n;
            const lbl = (() => {
              if (n === 2) return off === 0 ? 'BTN' : 'BB';
              if (off === 0) return 'BTN';
              if (off === 1) return 'SB';
              if (off === 2) return 'BB';
              if (n === 4) return 'UTG';
              if (n === 5) return off === 3 ? 'UTG' : 'HJ';
              if (off === n - 1) return 'CO';
              if (off === n - 2) return 'HJ';
              if (n >= 8 && off === n - 3) return 'MP';
              const utgIdx = off - 3;
              return utgIdx === 0 ? 'UTG' : `UTG+${utgIdx}`;
            })();
            orderLabels.push(lbl);
          }
          const arrowSvg = (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className="text-amber-400/80 shrink-0">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          );
          return (
            <div
              className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center cursor-pointer"
              onClick={() => {
                const me = players[myIndex];
                if (me) setSelectedPlayer({ ...me });
              }}
            >
              {/* 行动顺序提示：本阶段从谁开始，顺时针轮转 */}
              <div className="flex items-center gap-1 mb-2 px-2.5 py-1 rounded-full bg-black/45 border border-amber-500/35 backdrop-blur-sm shadow-lg max-w-[90vw] overflow-x-auto">
                <span className="text-[8px] text-amber-300/80 tracking-wide shrink-0">本手行动顺序</span>
                {orderLabels.map((lbl, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] font-bold tracking-wide ${
                      lbl === firstLabel ? 'text-yellow-300' :
                      lbl === 'BTN' ? 'text-white' :
                      lbl === 'SB' ? 'text-blue-400' :
                      lbl === 'BB' ? 'text-red-400' : 'text-gray-300'
                    }`}>{lbl}</span>
                    {i < orderLabels.length - 1 && arrowSvg}
                  </span>
                ))}
              </div>
            <div className="flex gap-1.5 sm:gap-2 min-h-[80px] items-center">
              {myCards.length > 0
                ? myCards.map((c, i) => <CardView key={i} card={c} highlight />)
                : <span className="text-gray-500 text-xs">等待发牌…</span>}
            </div>
            <div
              className={`rounded-lg px-3 sm:px-4 py-1.5 text-center backdrop-blur border-2 ${currentPlayerId === playerId ? 'bg-yellow-500/30 border-yellow-400' : 'bg-gray-800/80 border-gray-600'}`}
            >
              <div className="flex items-center gap-2 justify-center">
                <span className="text-white text-xs sm:text-sm font-semibold">{players[myIndex]?.nickname || '你'}</span>
                {(() => {
                  const label = getPositionLabel(players[myIndex]?.seatIndex ?? -1);
                  if (!label) return null;
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
                  return (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colorMap[label] || 'bg-gray-600 text-white'}`}>
                      {label}
                    </span>
                  );
                })()}
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
          );
        })()}
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
      {/* 音效设置弹窗 */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* 操作栏 */}
      {inGame && turnOptions && <ActionBar />}
      <DanmakuBar />
      {handResult && <HandResultView result={handResult} onClose={() => useGameStore.getState().setHandResult(null)} />}
      {finalSettlement && (
        <FinalSettlementModal
          data={finalSettlement}
          isHost={room?.hostId === playerId}
        />
      )}
      <RoundTransitionOverlay />
    </div>
  );
}
