import { useState } from 'react';
import SettingsModal from './SettingsModal';

/**
 * 全局音效设置按钮，固定在右上角，所有页面均可点击。
 * z-index 设为 50，低于结算/借入弹框（z-50+）但高于普通游戏 UI。
 */
export default function AudioSettingsButton({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(false);

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className={`fixed top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 border border-gray-700 text-gray-300 hover:text-yellow-400 hover:border-yellow-500 transition-colors z-[55] btn-press ${className}`}
        title="声音设置"
      >
        <span className="text-xl">⚙️</span>
      </button>
      {show && <SettingsModal onClose={() => setShow(false)} />}
    </>
  );
}
