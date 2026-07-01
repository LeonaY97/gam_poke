import { useState, useEffect, useCallback } from 'react';

// 音效类型
export type SoundType = 'fold' | 'check' | 'call' | 'raise' | 'allin' | 'deal' | 'win';

// localStorage 键名
const KEY_SFX = 'poker_sfx_volume';
const KEY_BGM = 'poker_bgm_volume';
const KEY_BGM_ENABLED = 'poker_bgm_enabled';

// 模块级单例：跨组件共享同一份音频状态，避免重复创建 AudioContext
let audioCtx: AudioContext | null = null;
let sfxGain: GainNode | null = null; // 音效总线增益
let bgmGain: GainNode | null = null; // BGM 总线增益
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmStep = 0;

// 音量使用 0-100 范围存储（与滑条一致），播放时换算为 0-1
let sfxVolume = 70;
let bgmVolume = 30;
let bgmEnabled = false;

// 初始化时从 localStorage 读取配置
(function loadConfig() {
  const s = localStorage.getItem(KEY_SFX);
  const b = localStorage.getItem(KEY_BGM);
  const e = localStorage.getItem(KEY_BGM_ENABLED);
  if (s !== null) sfxVolume = Math.max(0, Math.min(100, Number(s) || 0));
  if (b !== null) bgmVolume = Math.max(0, Math.min(100, Number(b) || 0));
  bgmEnabled = e === '1';
})();

// BGM 旋律（C 大调五声音阶，0 表示休止）
const BGM_MELODY = [
  523, 587, 659, 784, 659, 587, 523, 0,
  659, 784, 880, 1047, 880, 784, 659, 0,
];
// BGM 低音线
const BGM_BASS = [
  131, 131, 196, 196, 131, 131, 196, 196,
  131, 131, 196, 196, 131, 131, 196, 196,
];

// 初始化 AudioContext（浏览器策略要求用户交互后才能发声，这里惰性创建）
export function initAudio(): AudioContext | null {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = sfxVolume / 100;
  sfxGain.connect(audioCtx.destination);
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = bgmVolume / 100;
  bgmGain.connect(audioCtx.destination);
  // 若之前已开启 BGM，恢复播放
  if (bgmEnabled) startBgm();
  return audioCtx;
}

// 播放单个音符（相对于当前时间的偏移 start 秒，持续 duration 秒）
function playNote(freq: number, start: number, duration: number, type: OscillatorType = 'sine', peak = 0.3) {
  if (!audioCtx || !sfxGain) return;
  const t = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  // 音量包络：快速起音，指数衰减收尾
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// 播放指定类型音效
export function playSound(type: SoundType) {
  if (!audioCtx) initAudio();
  if (!audioCtx || !sfxGain) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  switch (type) {
    case 'fold': {
      // 低频下降短音
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g); g.connect(sfxGain);
      osc.start(t); osc.stop(t + 0.22);
      break;
    }
    case 'check': {
      // 短促中音
      playNote(600, 0, 0.08, 'triangle', 0.25);
      break;
    }
    case 'call': {
      // 两个快速上升音
      playNote(520, 0, 0.07, 'triangle', 0.25);
      playNote(720, 0.08, 0.09, 'triangle', 0.25);
      break;
    }
    case 'raise': {
      // 上升音
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(1000, t + 0.2);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(sfxGain);
      osc.start(t); osc.stop(t + 0.24);
      break;
    }
    case 'allin': {
      // 急促多音
      playNote(880, 0, 0.06, 'square', 0.22);
      playNote(880, 0.09, 0.06, 'square', 0.22);
      playNote(1100, 0.18, 0.1, 'square', 0.25);
      break;
    }
    case 'deal': {
      // 很短的发牌点击音
      playNote(1200, 0, 0.03, 'triangle', 0.2);
      break;
    }
    case 'win': {
      // 上升胜利旋律
      playNote(523, 0, 0.12, 'triangle', 0.28);
      playNote(659, 0.12, 0.12, 'triangle', 0.28);
      playNote(784, 0.24, 0.12, 'triangle', 0.28);
      playNote(1047, 0.36, 0.25, 'triangle', 0.3);
      break;
    }
  }
}

// BGM 单步：播放旋律与低音
function playBgmNote() {
  if (!audioCtx || !bgmGain) return;
  const t = audioCtx.currentTime;
  const note = BGM_MELODY[bgmStep % BGM_MELODY.length];
  const bass = BGM_BASS[bgmStep % BGM_BASS.length];

  if (note > 0) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(g); g.connect(bgmGain);
    osc.start(t); osc.stop(t + 0.45);
  }
  if (bass > 0) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = bass;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g); g.connect(bgmGain);
    osc.start(t); osc.stop(t + 0.55);
  }
  bgmStep++;
}

function startBgm() {
  if (!audioCtx || !bgmGain) return;
  if (bgmTimer) clearInterval(bgmTimer);
  bgmStep = 0;
  playBgmNote();
  bgmTimer = setInterval(playBgmNote, 450);
}

function stopBgm() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}

// 切换 BGM 开关，返回新的开关状态
export function toggleBgm(): boolean {
  if (!audioCtx) initAudio();
  bgmEnabled = !bgmEnabled;
  localStorage.setItem(KEY_BGM_ENABLED, bgmEnabled ? '1' : '0');
  if (bgmEnabled) startBgm();
  else stopBgm();
  return bgmEnabled;
}

// 设置音效音量（0-100）
export function setSfxVolume(v: number) {
  sfxVolume = Math.max(0, Math.min(100, v));
  localStorage.setItem(KEY_SFX, String(sfxVolume));
  if (sfxGain && audioCtx) sfxGain.gain.value = sfxVolume / 100;
}

// 设置 BGM 音量（0-100）
export function setBgmVolume(v: number) {
  bgmVolume = Math.max(0, Math.min(100, v));
  localStorage.setItem(KEY_BGM, String(bgmVolume));
  if (bgmGain && audioCtx) bgmGain.gain.value = bgmVolume / 100;
}

// 读取当前状态（供非 React 上下文使用）
export function getAudioState() {
  return { bgmEnabled, sfxVolume, bgmVolume };
}

// React hook：暴露音量状态与控制方法，并注册首次交互初始化
export function useAudio() {
  const [enabled, setEnabled] = useState(bgmEnabled);
  const [sv, setSv] = useState(sfxVolume);
  const [bv, setBv] = useState(bgmVolume);

  // 监听首次用户交互以初始化/恢复 AudioContext（浏览器自动播放策略）
  useEffect(() => {
    const handler = () => {
      initAudio();
      setEnabled(bgmEnabled);
    };
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const onToggleBgm = useCallback(() => {
    const e = toggleBgm();
    setEnabled(e);
  }, []);

  const onSetSfx = useCallback((v: number) => {
    setSfxVolume(v);
    setSv(v);
  }, []);

  const onSetBgm = useCallback((v: number) => {
    setBgmVolume(v);
    setBv(v);
  }, []);

  return {
    bgmEnabled: enabled,
    sfxVolume: sv,
    bgmVolume: bv,
    playSound,
    toggleBgm: onToggleBgm,
    setSfxVolume: onSetSfx,
    setBgmVolume: onSetBgm,
  };
}
