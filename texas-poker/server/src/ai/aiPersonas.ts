export type AIStyle =
  | 'tight-aggressive'
  | 'loose-aggressive'
  | 'tight-passive'
  | 'loose-passive'
  | 'maniac'
  | 'rock'
  | 'calling-station'
  | 'bomber'
  | 'tricky'
  | 'short-stack';

export interface AIPersona {
  id: string;
  nickname: string;
  style: AIStyle;
  styleName: string;
  /** 入局率范围 [低, 高] */
  vpipRange: [number, number];
  /** 翻牌前加注率范围 [低, 高] */
  pfrRange: [number, number];
  /** 风格描述 */
  description: string;
}

export const AI_PERSONA_POOL: AIPersona[] = [
  {
    id: 'ai_zhiyuan',
    nickname: '🧠 志远',
    style: 'tight-aggressive',
    styleName: '紧凶教授',
    vpipRange: [0.18, 0.22],
    pfrRange: [0.15, 0.18],
    description: '前职业牌手，打法标准，位置感极强',
  },
  {
    id: 'ai_haoran',
    nickname: '🐺 浩然',
    style: 'loose-aggressive',
    styleName: '松凶野狼',
    vpipRange: [0.35, 0.45],
    pfrRange: [0.25, 0.30],
    description: '线上高额桌玩家，侵略性极强，擅长 bluff',
  },
  {
    id: 'ai_sufen',
    nickname: '👩 素芬',
    style: 'tight-passive',
    styleName: '紧弱阿姨',
    vpipRange: [0.12, 0.16],
    pfrRange: [0.05, 0.08],
    description: '保守型玩家，只玩强牌，入池后跟注为主',
  },
  {
    id: 'ai_dabao',
    nickname: '🎰 大宝',
    style: 'loose-passive',
    styleName: '松弱鱼儿',
    vpipRange: [0.50, 0.65],
    pfrRange: [0.08, 0.12],
    description: '娱乐型玩家，什么牌都想看看翻牌',
  },
  {
    id: 'ai_menglong',
    nickname: '🔥 猛龙',
    style: 'maniac',
    styleName: '疯子玩家',
    vpipRange: [0.70, 0.90],
    pfrRange: [0.40, 0.60],
    description: '脾气火爆，几乎每手都加注，爽就完事了',
  },
  {
    id: 'ai_shouyi',
    nickname: '🪨 守义',
    style: 'rock',
    styleName: '岩石玩家',
    vpipRange: [0.08, 0.12],
    pfrRange: [0.06, 0.10],
    description: '极其严谨，只玩最强牌，极难被 bluff',
  },
  {
    id: 'ai_cailian',
    nickname: '🌸 彩莲',
    style: 'calling-station',
    styleName: '跟注站',
    vpipRange: [0.45, 0.55],
    pfrRange: [0.03, 0.06],
    description: '几乎从不弃牌，什么都想跟注看一眼',
  },
  {
    id: 'ai_dapao',
    nickname: '💣 大炮',
    style: 'bomber',
    styleName: '炸弹型',
    vpipRange: [0.15, 0.20],
    pfrRange: [0.10, 0.15],
    description: '平时很紧，拿到强牌就下重注',
  },
  {
    id: 'ai_xiaohua',
    nickname: '🦊 小滑',
    style: 'tricky',
    styleName: '狡猾型',
    vpipRange: [0.28, 0.35],
    pfrRange: [0.20, 0.25],
    description: '打法变化多端，难以捉摸，擅长变节奏',
  },
  {
    id: 'ai_tietou',
    nickname: '🪖 铁头',
    style: 'short-stack',
    styleName: '短码推土机',
    vpipRange: [0.20, 0.30],
    pfrRange: [0.18, 0.28],
    description: '短码策略专家，要么不玩要么 all-in',
  },
];

/**
 * 风格相似度矩阵（0 ~ 1），值越高越相似。
 * 分配时尽量避免相似度 > 0.7 的组合同屋。
 */
const STYLE_SIMILARITY: Record<string, Record<string, number>> = {
  'tight-aggressive': {
    'loose-aggressive': 0.45,
    'tight-passive': 0.50,
    'loose-passive': 0.20,
    'maniac': 0.30,
    'rock': 0.55,
    'calling-station': 0.15,
    'bomber': 0.55,
    'tricky': 0.50,
    'short-stack': 0.35,
  },
  'loose-aggressive': {
    'tight-aggressive': 0.45,
    'tight-passive': 0.15,
    'loose-passive': 0.50,
    'maniac': 0.75,
    'rock': 0.10,
    'calling-station': 0.40,
    'bomber': 0.30,
    'tricky': 0.70,
    'short-stack': 0.50,
  },
  'tight-passive': {
    'tight-aggressive': 0.50,
    'loose-aggressive': 0.15,
    'loose-passive': 0.55,
    'maniac': 0.05,
    'rock': 0.80,
    'calling-station': 0.50,
    'bomber': 0.60,
    'tricky': 0.20,
    'short-stack': 0.15,
  },
  'loose-passive': {
    'tight-aggressive': 0.20,
    'loose-aggressive': 0.50,
    'tight-passive': 0.55,
    'maniac': 0.55,
    'rock': 0.15,
    'calling-station': 0.85,
    'bomber': 0.25,
    'tricky': 0.40,
    'short-stack': 0.30,
  },
  'maniac': {
    'tight-aggressive': 0.30,
    'loose-aggressive': 0.75,
    'tight-passive': 0.05,
    'loose-passive': 0.55,
    'rock': 0.05,
    'calling-station': 0.50,
    'bomber': 0.20,
    'tricky': 0.55,
    'short-stack': 0.60,
  },
  'rock': {
    'tight-aggressive': 0.55,
    'loose-aggressive': 0.10,
    'tight-passive': 0.80,
    'loose-passive': 0.15,
    'maniac': 0.05,
    'calling-station': 0.20,
    'bomber': 0.65,
    'tricky': 0.15,
    'short-stack': 0.10,
  },
  'calling-station': {
    'tight-aggressive': 0.15,
    'loose-aggressive': 0.40,
    'tight-passive': 0.50,
    'loose-passive': 0.85,
    'maniac': 0.50,
    'rock': 0.20,
    'bomber': 0.20,
    'tricky': 0.35,
    'short-stack': 0.25,
  },
  'bomber': {
    'tight-aggressive': 0.55,
    'loose-aggressive': 0.30,
    'tight-passive': 0.60,
    'loose-passive': 0.25,
    'maniac': 0.20,
    'rock': 0.65,
    'calling-station': 0.20,
    'tricky': 0.45,
    'short-stack': 0.30,
  },
  'tricky': {
    'tight-aggressive': 0.50,
    'loose-aggressive': 0.70,
    'tight-passive': 0.20,
    'loose-passive': 0.40,
    'maniac': 0.55,
    'rock': 0.15,
    'calling-station': 0.35,
    'bomber': 0.45,
    'short-stack': 0.40,
  },
  'short-stack': {
    'tight-aggressive': 0.35,
    'loose-aggressive': 0.50,
    'tight-passive': 0.15,
    'loose-passive': 0.30,
    'maniac': 0.60,
    'rock': 0.10,
    'calling-station': 0.25,
    'bomber': 0.30,
    'tricky': 0.40,
  },
};

export function getStyleSimilarity(a: AIStyle, b: AIStyle): number {
  if (a === b) return 1.0;
  return STYLE_SIMILARITY[a]?.[b] ?? 0.3;
}

/**
 * 计算一组 AI 人设的最大风格相似度（任意两两之间的最大值）。
 * 值越低说明组合越多样化。
 */
function maxSimilarity(personas: AIPersona[]): number {
  let max = 0;
  for (let i = 0; i < personas.length; i++) {
    for (let j = i + 1; j < personas.length; j++) {
      const sim = getStyleSimilarity(personas[i].style, personas[j].style);
      if (sim > max) max = sim;
    }
  }
  return max;
}

/**
 * Fisher-Yates 洗牌
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 从 AI 池中随机选择 count 个人设，尽量保证风格多样性。
 * 最多尝试 10 次，取最大相似度最低的组合。
 */
export function selectAIPersonas(count: number): AIPersona[] {
  if (count <= 0) return [];
  if (count >= AI_PERSONA_POOL.length) return shuffle(AI_PERSONA_POOL);

  let best: AIPersona[] = [];
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 10; attempt++) {
    const selected = shuffle(AI_PERSONA_POOL).slice(0, count);
    const score = maxSimilarity(selected);
    if (score < bestScore) {
      bestScore = score;
      best = selected;
    }
    // 最大相似度 <= 0.6 就很满意了，直接返回
    if (bestScore <= 0.6) break;
  }

  return best;
}

/**
 * 根据人设风格调整 bot 的手牌强度评估和行动倾向。
 * 返回调整后的"有效手牌强度"，用于 AI 决策。
 */
export function adjustHandStrengthByPersona(
  baseStrength: number,
  persona: AIPersona,
  phase: 'preflop' | 'flop' | 'turn' | 'river',
): number {
  switch (persona.style) {
    case 'loose-aggressive':
    case 'tricky':
      return Math.min(1, baseStrength + 0.1);
    case 'loose-passive':
    case 'calling-station':
      return Math.min(1, baseStrength + 0.05);
    case 'maniac':
      return Math.min(1, baseStrength + 0.2);
    case 'tight-passive':
    case 'rock':
      return Math.max(0, baseStrength - 0.1);
    case 'bomber':
      // 炸弹型：弱牌更紧，强牌更凶
      if (baseStrength > 0.6) return Math.min(1, baseStrength + 0.15);
      return Math.max(0, baseStrength - 0.1);
    case 'short-stack':
      // 短码型：中强牌更激进
      if (baseStrength > 0.4) return Math.min(1, baseStrength + 0.1);
      return baseStrength;
    default:
      return baseStrength;
  }
}

/**
 * 根据人设获取风格化的行动倾向系数。
 * 返回 { raiseBias, callBias, foldBias, bluffBias }，均为乘数。
 */
export function getPersonaActionBias(persona: AIPersona): {
  raiseBias: number;
  callBias: number;
  foldBias: number;
  bluffBias: number;
} {
  switch (persona.style) {
    case 'tight-aggressive':
      return { raiseBias: 1.2, callBias: 0.9, foldBias: 1.1, bluffBias: 1.1 };
    case 'loose-aggressive':
      return { raiseBias: 1.5, callBias: 1.1, foldBias: 0.6, bluffBias: 1.8 };
    case 'tight-passive':
      return { raiseBias: 0.5, callBias: 1.1, foldBias: 1.2, bluffBias: 0.3 };
    case 'loose-passive':
      return { raiseBias: 0.4, callBias: 1.4, foldBias: 0.5, bluffBias: 0.2 };
    case 'maniac':
      return { raiseBias: 2.0, callBias: 1.2, foldBias: 0.3, bluffBias: 2.5 };
    case 'rock':
      return { raiseBias: 0.7, callBias: 1.0, foldBias: 1.4, bluffBias: 0.1 };
    case 'calling-station':
      return { raiseBias: 0.2, callBias: 1.8, foldBias: 0.2, bluffBias: 0.1 };
    case 'bomber':
      return { raiseBias: 1.3, callBias: 0.8, foldBias: 1.1, bluffBias: 0.5 };
    case 'tricky':
      return { raiseBias: 1.4, callBias: 1.0, foldBias: 0.8, bluffBias: 2.0 };
    case 'short-stack':
      return { raiseBias: 1.6, callBias: 0.9, foldBias: 1.0, bluffBias: 1.2 };
    default:
      return { raiseBias: 1.0, callBias: 1.0, foldBias: 1.0, bluffBias: 1.0 };
  }
}
