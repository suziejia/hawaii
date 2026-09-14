'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, PassageSegment, VocabEntry } from '@/lib/notion';

/* ---------------- 內聯動效 ---------------- */

const inlineStyles = `
  @keyframes duo-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
  .animate-duo-shake { animation: duo-shake 0.35s ease-in-out; }

  @keyframes duo-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  .animate-duo-fade-up { animation: duo-fade-up 0.3s ease-out both; }

  @keyframes duo-pop {
    0% { transform: scale(0.4); opacity: 0; }
    60% { transform: scale(1.15); }
    100% { transform: scale(1); opacity: 1; }
  }
  .animate-duo-pop { animation: duo-pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; }

  @keyframes duo-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  .animate-duo-breathe { animation: duo-breathe 1.6s ease-in-out infinite; }

  @keyframes duo-ripple {
    from { transform: scale(1); opacity: 0.65; }
    to { transform: scale(2.3); opacity: 0; }
  }
  .duo-ripple { animation: duo-ripple 0.8s ease-out both; }

  @keyframes duo-cell-fill {
    0% { background-color: transparent; color: #FF9600; }
    100% { background-color: #FF9600; color: #fff; }
  }
  .duo-cell-fill { animation: duo-cell-fill 0.7s ease-out 1.15s both; }

  @keyframes duo-check-in {
    from { opacity: 0; transform: scale(0.3); }
    to { opacity: 1; transform: scale(1); }
  }
  .duo-check-in { animation: duo-check-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) 1.35s both; }

  .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }
`;

const btnGreen =
  'bg-[#58CC02] hover:bg-[#52be02] text-white font-extrabold text-base py-3.5 px-8 rounded-2xl border-b-4 border-[#46A302] active:border-b-0 active:translate-y-1 transition-all shadow-sm cursor-pointer select-none text-center';
const btnGray =
  'bg-stone-200 text-stone-400 font-bold py-3.5 px-8 rounded-2xl border-b-4 border-stone-300 cursor-not-allowed text-center';

/* ---------------- 內置兜底數據（Notion 不可用時無縫降級） ---------------- */

const FULL_ANSWER = `Man, I felt this in my soul. A year ago, my life felt like a chore. Every single day was mapped out to the minute, and I had a laundry list of problems at work. The toxic corporate politics felt like a daily moral injury, but I stayed quiet because I felt like I had no one to turn to.

Eventually, I realized staying in that environment was a lost cause. So I changed my mindset: the moment I clock out, work is dead to me.

Now, on weekends, instead of dragging myself to some mediocre social events, I’ve learned to truly enjoy my own company. On Saturdays, I sleep in, leisurely do stuff around the house, or just sit by the window to unwind and navigate my emotions.

Last weekend, I picked up an old sci-fi novel written 30 years ago. It was so ahead of its time that the story still holds up beautifully today. The characters were so fleshed out that I literally couldn’t put it down and finished it in one sitting.

Giving up the meaningless hustle and reclaiming my quiet weekends is, hands down, the best decision I’ve ever made for my own peace of mind. Take a deep breath. You don’t have to prove anything to anyone.`;

const BUILTIN_CHUNKS = [
  'felt like a chore', 'mapped out to the minute', 'a laundry list of', 'moral injury',
  'had no one to turn to', 'a lost cause', 'clock out', 'mediocre',
  'enjoy my own company', 'sleep in', 'do stuff around the house', 'unwind',
  'navigate my emotions', 'peace of mind',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function segmentsFromText(text: string, chunks: string[]): PassageSegment[] {
  const sorted = [...chunks].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRe).join('|')})`, 'gi');
  const segs: PassageSegment[] = [];
  const paras = text.split('\n\n');
  paras.forEach((p, pi) => {
    for (const part of p.split(re)) {
      if (part) segs.push({ text: part, bold: sorted.some(c => c.toLowerCase() === part.toLowerCase()) });
    }
    if (pi < paras.length - 1) segs.push({ text: '\n\n', bold: false });
  });
  return segs;
}

const BUILTIN_LESSON: Lesson = {
  id: 'builtin-work-life',
  questionEn: 'How do you find a balance between work and personal life?',
  questionCn: '你該如何找到工作和生活的平衡？',
  passageSegments: segmentsFromText(FULL_ANSWER, BUILTIN_CHUNKS),
  passageEn: FULL_ANSWER,
  passageCn: '',
  targetChunks: BUILTIN_CHUNKS,
  vocab: [
    { lemma: "Enjoy one's own company", definition: '享受独处（替换 be alone）。', tip: '替换 be alone', category: '社交与心理类' },
    { lemma: 'Have no one to turn to', definition: '找不到可以倾诉/求助的人。', tip: '', category: '社交与心理类' },
    { lemma: 'Navigate emotions', definition: '梳理、应对复杂的情绪。', tip: '', category: '社交与心理类' },
    { lemma: 'Moral injury', definition: '道德创伤（因被迫做违背良心的事导致的心理崩溃）。', tip: '因被迫做违背良心的事导致的心理崩溃', category: '社交与心理类' },
    { lemma: 'A laundry list of...', definition: '一长串清单（如 a laundry list of problems）。', tip: '如 a laundry list of problems', category: '社交与心理类' },
    { lemma: 'Peace of mind', definition: '内心的踏实与心安（如 for my own peace of mind）。', tip: '如 for my own peace of mind', category: '社交与心理类' },
    { lemma: 'Unwind', definition: '放松、释放疲惫压力。', tip: '比 relax 更有“卸下发条”的画面感', category: '日常生活与习惯类' },
    { lemma: 'Clock out / Clock in', definition: '打卡下班 / 上班。', tip: '', category: '日常生活与习惯类' },
    { lemma: 'Mapped out to the minute', definition: '精确规划到每一分钟。', tip: '', category: '日常生活与习惯类' },
    { lemma: 'Do stuff around the house', definition: '在家里瞎忙活/打理家务。', tip: '比 do housework 生活化十倍', category: '日常生活与习惯类' },
    { lemma: 'Sleep in', definition: '睡懒觉。', tip: '自愿多睡，不是睡过头 oversleep', category: '日常生活与习惯类' },
    { lemma: 'A lost cause', definition: '注定失败的事 / 彻底没救了。', tip: '如 It’s a lost cause', category: '日常生活与习惯类' },
    { lemma: 'Feel like a chore', definition: '感觉像在应付苦差事。', tip: '', category: '日常生活与习惯类' },
    { lemma: 'Mediocre', definition: '平庸的、中规中矩的。', tip: '千万别只会说 so-so', category: '评价事物与艺术类' },
    { lemma: "Can't put it down", definition: '让人爱不释手、根本放不下。', tip: '形容书/游戏', category: '评价事物与艺术类' },
    { lemma: 'Fleshed out', definition: '丰满立体的、有血有肉的。', tip: '形容人物塑造', category: '评价事物与艺术类' },
    { lemma: 'Hold up', definition: '经得起时间的检验。', tip: '如 The movie still holds up today', category: '评价事物与艺术类' },
    { lemma: 'Hands down', definition: '毫无疑问地。', tip: '替换 definitely', category: '评价事物与艺术类' },
    { lemma: "Ahead of one's time", definition: '超越/领先于他所处的时代。', tip: '', category: '评价事物与艺术类' },
  ],
};

const US_STATES = [
  { en: 'Alabama', cn: '阿拉巴馬州' }, { en: 'Alaska', cn: '阿拉斯加州' }, { en: 'Arizona', cn: '亞利桑那州' },
  { en: 'Arkansas', cn: '阿肯色州' }, { en: 'California', cn: '加利福尼亞州' }, { en: 'Colorado', cn: '科羅拉多州' },
  { en: 'Connecticut', cn: '康乃狄克州' }, { en: 'Delaware', cn: '德拉瓦州' }, { en: 'Florida', cn: '佛羅里達州' },
  { en: 'Georgia', cn: '喬治亞州' }, { en: 'Hawaii', cn: '夏威夷州' }, { en: 'Idaho', cn: '愛達荷州' },
  { en: 'Illinois', cn: '伊利諾州' }, { en: 'Indiana', cn: '印第安納州' }, { en: 'Iowa', cn: '愛荷華州' },
  { en: 'Kansas', cn: '堪薩斯州' }, { en: 'Kentucky', cn: '肯塔基州' }, { en: 'Louisiana', cn: '路易斯安那州' },
  { en: 'Maine', cn: '緬因州' }, { en: 'Maryland', cn: '馬里蘭州' }, { en: 'Massachusetts', cn: '麻薩諸塞州' },
  { en: 'Michigan', cn: '密西根州' }, { en: 'Minnesota', cn: '明尼蘇達州' }, { en: 'Mississippi', cn: '密西西比州' },
  { en: 'Missouri', cn: '密蘇里州' }, { en: 'Montana', cn: '蒙大拿州' }, { en: 'Nebraska', cn: '內布拉斯加州' },
  { en: 'Nevada', cn: '內華達州' }, { en: 'New Hampshire', cn: '新罕布夏州' }, { en: 'New Jersey', cn: '紐澤西州' },
  { en: 'New Mexico', cn: '新墨西哥州' }, { en: 'New York', cn: '紐約州' }, { en: 'North Carolina', cn: '北卡羅來納州' },
  { en: 'North Dakota', cn: '北達科他州' }, { en: 'Ohio', cn: '俄亥俄州' }, { en: 'Oklahoma', cn: '奧克拉荷馬州' },
  { en: 'Oregon', cn: '奧勒岡州' }, { en: 'Pennsylvania', cn: '賓夕法尼亞州' }, { en: 'Rhode Island', cn: '羅德島州' },
  { en: 'South Carolina', cn: '南卡羅來納州' }, { en: 'South Dakota', cn: '南達科他州' }, { en: 'Tennessee', cn: '田納西州' },
  { en: 'Texas', cn: '德克薩斯州' }, { en: 'Utah', cn: '猶他州' }, { en: 'Vermont', cn: '佛羅蒙特州' },
  { en: 'Virginia', cn: '維吉尼亞州' }, { en: 'Washington', cn: '華盛頓州' }, { en: 'West Virginia', cn: '西維吉尼亞州' },
  { en: 'Wisconsin', cn: '威斯康辛州' }, { en: 'Wyoming', cn: '懷俄明州' },
];

const SHORT_TITLES = ['找回生活熱情', '擺爛四件套', '熬夜投簡歷', '職場裸辭', '寵物溝通', '文字內耗', '凌晨三點', '地鐵手機屏障', 'AI 職業焦慮', '科技與民生'];

/* 目錄短標題：優先用人工策展名，否則從課程題目自動生成 */
function lessonTitleOf(L: Lesson, i: number): string {
  if (SHORT_TITLES[i]) return SHORT_TITLES[i];
  const cn = (L.questionCn || '').split(/[，？?！!。.;；]/)[0].trim();
  if (cn && cn.length >= 2) return cn.slice(0, 12);
  const en = (L.questionEn || '').trim();
  if (en) {
    const words = en.replace(/["“”*?]/g, '').split(/\s+/).slice(0, 6).join(' ');
    return words || `第 ${i + 1} 課`;
  }
  return `第 ${i + 1} 課`;
}
const GROUP_SIZE = 7;
const SRS_INTERVALS = [1, 3, 7, 15, 60];

/* ---------------- 純 SVG 向量圖標（零 Emoji） ---------------- */

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 8.5 12 2" />
    </svg>
  );
}

function Flame3D() {
  return (
    <div className="relative mx-auto h-28 w-40" aria-hidden="true">
      <FlameIcon className="animate-duo-breathe absolute left-1/2 top-3 h-24 w-24 -translate-x-1/2 text-[#FF6600] drop-shadow-[0_8px_20px_rgba(122,60,0,0.5)]" style={{ animationDuration: '1.8s' }} />
      <FlameIcon className="animate-duo-breathe absolute left-1/2 top-1 h-20 w-20 -translate-x-1/2 text-[#FF9600]" style={{ animationDuration: '1.4s' }} />
      <FlameIcon className="animate-duo-breathe absolute left-1/2 top-4 h-12 w-12 -translate-x-1/2 text-[#FFC800]" style={{ animationDuration: '1.1s' }} />
      <span className="absolute left-8 top-8 h-1.5 w-1.5 animate-duo-breathe rounded-full bg-white/80" style={{ animationDuration: '0.9s' }} />
      <span className="absolute right-9 top-12 h-1 w-1 animate-duo-breathe rounded-full bg-white/70" style={{ animationDuration: '1.2s' }} />
      <span className="absolute left-16 top-6 h-1 w-1 animate-duo-breathe rounded-full bg-white/60" style={{ animationDuration: '1.5s' }} />
    </div>
  );
}

function FlameIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.4 3.6-1.3 5.6-3 7.6-1.5 1.7-2.7 3.4-2.7 5.6a5.7 5.7 0 0 0 11.4 0c0-2.2-1.2-3.9-2.7-5.6-1.7-2-3.4-4-3-7.6Z" />
      <path d="M12 10.5c-.9 1.9-2.2 3-2.2 4.9a2.2 2.2 0 1 0 4.4 0c0-1.9-1.3-3-2.2-4.9Z" fill="#FF9600" fillOpacity=".4" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
    </svg>
  );
}

function BulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4.5 4.5L19 7" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="5.5" r="2.5" />
      <circle cx="17" cy="18.5" r="2.5" />
      <path d="M8.3 10.8l6.4-3.9M8.3 13.2l6.4 3.9" />
    </svg>
  );
}

function IceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="#A5E6FF" stroke="#38BDF8" strokeWidth="1.5" />
      <path d="M8.5 9.5c1.5-1.5 3-2 5-2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.8 7.4l3 8M16.2 7.4l-3 8M8.2 6h7.6" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </svg>
  );
}

function PanelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </svg>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M6 4l10 3-10 3z" fill="currentColor" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function Barcode() {
  const bars = [3, 1, 2, 1, 1, 4, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1];
  let x = 0;
  const width = bars.reduce((a, b) => a + b + 2, 0);
  return (
    <svg viewBox={`0 0 ${width} 32`} className="h-8 w-32 text-stone-800" aria-hidden="true">
      {bars.map((w, i) => {
        const rect = <rect key={i} x={x} y={0} width={w} height={32} fill="currentColor" />;
        x += w + 2;
        return rect;
      })}
    </svg>
  );
}

/* 答對音效：Web Audio 合成 0.1s 冰塊碰撞雙音（1200Hz + 1600Hz 正弦波） */
function playIceClink() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    ([[1200, 0.1, 0], [1600, 0.06, 0.012]] as const).forEach(([freq, vol, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + delay;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    });
    window.setTimeout(() => { void ctx.close(); }, 400);
  } catch { /* 自動播放限制或音頻不可用時靜默 */ }
}

/* ---------------- 持久化（localStorage） ---------------- */

const STREAK_KEY = 'outputmaster-streak';
const SRS_KEY = 'outputmaster-srs';
const PREFS_KEY = 'outputmaster-prefs';
const LOG_KEY = 'outputmaster-daily';

type Streak = { count: number; last: string | null };
type SrsEntry = { level: number; next: string };
type Prefs = { quota: number; accent: 'UK' | 'US'; srsMode: 'all' | 'wrong' };
type DailyLog = Record<string, { groups: number; chunks: string[]; state: string; counted: string[] }>;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const parsed = raw ? (JSON.parse(raw) as Streak) : null;
    if (parsed && typeof parsed.count === 'number') return parsed;
  } catch { /* ignore */ }
  return { count: 1, last: null };
}
function loadSrs(): Record<string, SrsEntry> {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SrsEntry>) : {};
  } catch { return {}; }
}
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Prefs>) : null;
    if (parsed && [6, 12, 24].includes(parsed.quota ?? 0)) {
      return { quota: parsed.quota as number, accent: parsed.accent === 'US' ? 'US' : 'UK', srsMode: parsed.srsMode === 'all' ? 'all' : 'wrong' };
    }
  } catch { /* ignore */ }
  return { quota: 12, accent: 'UK', srsMode: 'wrong' };
}
function loadLog(): DailyLog {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as DailyLog) : {};
  } catch { return {}; }
}

/* 客戶端輕量歸一化與綁定（與服務端同規則） */
const STOP = new Set(["one's", 'ones', 'my', 'your', 'his', 'her', 'their', 'our', 'sb', 'sth', 'something', 'someone', 'it']);
function normTerm(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/\([^)]*\)/g, '').replace(/\.\.\..*$/, '')
    .replace(/\s*\/\s*.*$/, '').replace(/^(a|an|the)\s+/, '').replace(/\s+(of|to|on|at|for|in)$/, '')
    .replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
}
function isBoundSmall(chunkNorm: string, lemmaNorm: string): boolean {
  if (!chunkNorm || !lemmaNorm) return false;
  if (chunkNorm === lemmaNorm) return true;
  if (lemmaNorm.includes(chunkNorm) || chunkNorm.includes(lemmaNorm)) return true;
  const cw = chunkNorm.split(' ').filter(w => w && !STOP.has(w));
  const lw = lemmaNorm.split(' ').filter(w => w && !STOP.has(w));
  if (!cw.length || !lw.length) return false;
  const set = new Set(cw);
  return lw.filter(w => set.has(w)).length >= Math.min(2, lw.length);
}
/* 釋義顯示去重：tip 單獨展示時，從釋義中移除首個括號內容避免視覺重複 */
function displayDef(def: { definition: string; tip: string }): string {
  if (!def.tip) return def.definition;
  const stripped = def.definition.replace(/[（(][^（）()]*[）)]/, '').replace(/\s{2,}/g, ' ').replace(/^[、。,.;\s]+|[、。,.;\s]+$/g, '');
  return stripped.length >= 2 ? stripped : def.definition;
}

function normAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}

/* ---------------- 全局組件 ---------------- */

type Stage = 'resting' | 'streak_celebration';

export default function HomePage() {
  /* 數據 */
  const [lessons, setLessons] = useState<Lesson[]>([BUILTIN_LESSON]);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sideView, setSideView] = useState<'none' | 'search' | 'review' | 'vault'>('none');
  const [searchQuery, setSearchQuery] = useState('');

  /* 佈局 */
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);

  /* 偏好 */
  const [quota, setQuota] = useState(12);
  const [accent, setAccent] = useState<'UK' | 'US'>('UK');
  const [srsMode, setSrsMode] = useState<'all' | 'wrong'>('wrong');

  /* 打卡 */
  const [streakCount, setStreakCount] = useState(1);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [doneGroups, setDoneGroups] = useState(0);

  /* 做題 */
  const [currentStage, setCurrentStage] = useState<Stage>('resting');
  const [isDrillMode, setDrillMode] = useState(false);
  const [batchIdx, setBatchIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, 'typing' | 'correct' | 'wrong'>>({});
  const [wrongCounts, setWrongCounts] = useState<Record<number, number>>({});
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const [tipsIdx, setTipsIdx] = useState<number | null>(null);
  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [showEssay, setShowEssay] = useState(false);

  /* SRS / 日誌 */
  const [srs, setSrs] = useState<Record<string, SrsEntry>>({});
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(9);
  const [inspectDate, setInspectDate] = useState<string | null>(null);

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaRef = useRef(12);
  const doneRef = useRef(0);

  const now = new Date();
  const todayStr = dayKey(now);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWeekdayOfView = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonthOfView = new Date(viewYear, viewMonth, 0).getDate();
  const stateBadge = US_STATES[Math.floor((Date.now() - now.getTimezoneOffset() * 60_000) / 86_400_000) % US_STATES.length];

  const D: Lesson = lessons[lessonIdx] ?? lessons[0] ?? BUILTIN_LESSON;
  const lessonTitle = lessonTitleOf(D, lessonIdx);
  const totalBatches = Math.max(1, Math.ceil(D.targetChunks.length / GROUP_SIZE));
  const essayOpen = showEssay || isDrillMode;
  const daysToGold = Math.max(0, 30 - streakCount);
  const chestOffset = daysToGold; // 第 30 天里程碑（天）
  const flagOffset = ((7 - (streakCount % 7)) % 7) || 7; // 下一個 7 天里程碑（天）
  const milestoneNodes = [1, 7, 14, 30];
  const chunks = D.targetChunks;

  /* 加粗片段序號 → 語塊序號（首次出現才有輸入框；重複出現 -1） */
  const segIdxOrderMap = useMemo(() => {
    const map: Record<number, number> = {};
    const used = new Set<number>();
    D.passageSegments.forEach((seg, i) => {
      if (!seg.bold) return;
      const cleaned = seg.text.trim().replace(/^[\s,.;:"'!?()（）]+|[\s,.;:"'!?()（）]+$/g, '');
      let idx = chunks.findIndex(c => normTerm(c) === normTerm(cleaned));
      if (idx < 0) idx = chunks.findIndex(c => isBoundSmall(normTerm(cleaned), normTerm(c)));
      if (idx >= 0 && !used.has(idx)) {
        map[i] = idx;
        used.add(idx);
      } else {
        map[i] = -1;
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D]);

  function backToHome() {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    setDrillMode(false);
    setCurrentStage('resting');
    setShowEssay(false);
    setRoundBanner(null);
  }

  /* 初始化：佈局 / 偏好 / 打卡 / SRS / Notion */
  useEffect(() => {
    setSidebarOpen(window.innerWidth >= 1024);
    const prefs = loadPrefs();
    setQuota(prefs.quota); setAccent(prefs.accent); setSrsMode(prefs.srsMode);
    quotaRef.current = prefs.quota;
    const stored = loadStreak();
    setStreakCount(stored.count);
    setIsCompletedToday(stored.last === todayStr);
    setSrs(loadSrs());
    const log = loadLog();
    setDoneGroups(log[todayStr]?.groups ?? 0);
    doneRef.current = log[todayStr]?.groups ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetch('/api/lesson').then(r => r.json()).then(d => {
      if (d?.ok && Array.isArray(d.lessons) && d.lessons.length) {
        setLessons(d.lessons as Lesson[]);
        setLessonIdx(typeof d.todayIndex === 'number' ? d.todayIndex % d.lessons.length : 0);
      }
    }).catch(() => { /* 靜默降級內置數據 */ });
  }, []);
  useEffect(() => () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  }, []);

  // Cmd/Ctrl + K 呼出全局檢索
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSideView('search');
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  useEffect(() => {
    if (isDrillMode) {
      const first = batchIdx * GROUP_SIZE;
      const t = setTimeout(() => {
        inputRefs.current[first]?.focus();
        inputRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrillMode, batchIdx]);

  /* 派生 */
  const batchCount = Math.max(1, Math.ceil(chunks.length / GROUP_SIZE));
  const activeIdxs = Array.from({ length: GROUP_SIZE }, (_, k) => batchIdx * GROUP_SIZE + k).filter(idx => idx < chunks.length);
  const donePct = Math.min(100, Math.round((doneGroups / quota) * 100));
  const dueCount = Object.values(srs).filter(e => e.next <= todayStr).length;
  const dueLemmas = Object.entries(srs).filter(([, e]) => e.next <= todayStr).map(([lemma]) => lemma);

  /* 同步 */
  async function syncFromNotion() {
    if (syncing) return;
    setSyncing(true);
    try {
      const [res] = await Promise.all([
        fetch('/api/lesson/refresh', { method: 'POST' }).then(r => r.json()),
        new Promise(resolve => setTimeout(resolve, 1200)),
      ]);
      if (res?.ok && Array.isArray(res.lessons) && res.lessons.length) {
        setLessons(res.lessons as Lesson[]);
        setLessonIdx(typeof res.todayIndex === 'number' ? res.todayIndex % res.lessons.length : 0);
        setBatchIdx(0); exitDrill();
      }
    } catch { /* 靜默 */ }
    setSyncing(false);
  }

  /* 做題 */
  function resetDrill() {
    setAnswers({}); setResults({}); setWrongCounts({});
    setShakeIdx(null); setTipsIdx(null); setRoundBanner(null); setBatchIdx(0);
    setCompleted(false);
    inputRefs.current = {};
  }
  function startDrill() {
    resetDrill();
    setShowEssay(true);
    setDrillMode(true);
  }
  function exitDrill() {
    setDrillMode(false);
    setShowEssay(false);
  }
  function switchLesson(delta: number) {
    const next = (lessonIdx + delta + lessons.length) % lessons.length;
    setLessonIdx(next);
    exitDrill();
    setSelectedChunk(null);
    setShowReview(false);
  }
  function updateAnswer(orderIdx: number, value: string) {
    setAnswers(prev => ({ ...prev, [orderIdx]: value }));
    if (results[orderIdx] === 'wrong') setResults(prev => ({ ...prev, [orderIdx]: 'typing' }));
  }
  function judge(orderIdx: number) {
    if (results[orderIdx] === 'correct') return;
    const answer = normAnswer(answers[orderIdx] ?? '');
    const target = normAnswer(chunks[orderIdx] ?? '');
    if (answer && answer === target) {
      playIceClink();
      setResults(prev => ({ ...prev, [orderIdx]: 'correct' }));
      const posInBatch = activeIdxs.indexOf(orderIdx);
      if (posInBatch < activeIdxs.length - 1) {
        const nextIdx = activeIdxs[posInBatch + 1];
        focusTimer.current = setTimeout(() => {
          inputRefs.current[nextIdx]?.focus();
          inputRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      } else {
        completeGroup(orderIdx);
      }
    } else {
      const wc = (wrongCounts[orderIdx] ?? 0) + 1;
      setWrongCounts(prev => ({ ...prev, [orderIdx]: wc }));
      setResults(prev => ({ ...prev, [orderIdx]: 'wrong' }));
      setShakeIdx(orderIdx);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakeIdx(null), 500);
      if (wc >= 2) setTipsIdx(orderIdx);
    }
  }

  /* 組完成：SRS 更新 + 配額推進 */
  function completeGroup(lastOrderIdx: number) {
    const groupKey = `${lessonIdx}:${batchIdx}`;
    const log = loadLog();
    const entry = log[todayStr] ?? { groups: 0, chunks: [], state: stateBadge.en, counted: [] };
    const isNew = !entry.counted.includes(groupKey);
    if (isNew) entry.counted.push(groupKey);
    const batchChunks = activeIdxs.map(idx => chunks[idx]);
    for (const c of batchChunks) if (!entry.chunks.includes(c)) entry.chunks.push(c);
    entry.groups = entry.counted.length;
    log[todayStr] = entry;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }

    // 艾賓浩斯：錯 >=2 降 1 級，否則升 1 級並按新等級排下次複習
    const nextSrs = { ...srs };
    for (const c of batchChunks) {
      const lemma = D.vocab.find(v => isBoundSmall(normTerm(c), normTerm(v.lemma)))?.lemma ?? c;
      const wrong = wrongCounts[activeIdxs[batchChunks.indexOf(c)]] ?? 0;
      const curEntry = nextSrs[lemma] ?? { level: 0, next: '' };
      let level = curEntry.level;
      if (wrong >= 2) level = Math.max(0, level - 1);
      else level = Math.min(4, level + 1);
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + SRS_INTERVALS[level]);
      nextSrs[lemma] = { level, next: dayKey(nextDate) };
    }
    setSrs(nextSrs);
    try { localStorage.setItem(SRS_KEY, JSON.stringify(nextSrs)); } catch { /* ignore */ }

    const newDone = isNew ? doneRef.current + 1 : doneRef.current;
    doneRef.current = newDone;
    setDoneGroups(newDone);

    if (newDone >= quotaRef.current) {
      // 達標：點燃連勝 + 結算
      const stored = loadStreak();
      if (stored.last !== todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const keeps = stored.last === null || stored.last === dayKey(yesterday);
        const nextStreak: Streak = { count: keeps ? stored.count + 1 : 1, last: todayStr };
        try { localStorage.setItem(STREAK_KEY, JSON.stringify(nextStreak)); } catch { /* ignore */ }
        setStreakCount(nextStreak.count);
      }
      setIsCompletedToday(true);
      finishTimer.current = setTimeout(() => setCurrentStage('streak_celebration'), 600);
      return;
    }

    if (batchIdx < batchCount - 1) {
      setRoundBanner(`第 ${batchIdx + 1} 組完成！累計進度 +1 組`);
      bannerTimer.current = setTimeout(() => {
        setRoundBanner(null);
        setBatchIdx(batchIdx + 1);
      }, 1000);
    } else {
      // 全篇完成：通電爆亮，再收桿
      setCompleted(true);
      setRoundBanner(`本篇 ${batchCount} 組全部完成！今日還差 ${Math.max(0, quotaRef.current - newDone)} 組，點左側下一篇繼續衝刺`);
      bannerTimer.current = setTimeout(() => {
        setRoundBanner(null);
        setCompleted(false);
        exitDrill();
      }, 2200);
    }
  }

  const questionMain = D.questionEn || D.questionCn;
  const questionSub = D.questionEn ? D.questionCn : '';

  /* 全局檢索結果 */
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out: { index: number; snippet: string }[] = [];
    lessons.forEach((L, index) => {
      const hay = (L.questionEn + ' ' + L.questionCn + ' ' + L.passageEn + ' ' + L.targetChunks.join(' ')).toLowerCase();
      const pos = hay.indexOf(q);
      if (pos >= 0) {
        const start = Math.max(0, pos - 24);
        out.push({ index, snippet: (start > 0 ? '…' : '') + hay.slice(start, pos + q.length + 44).trim() + '…' });
      }
    });
    return out;
  })();

  /* 閃電複習待複習列表（含釋義/精髓/等級） */
  const reviewList = Object.entries(srs)
    .filter(([, e]) => e.next <= todayStr)
    .map(([lemma, e]) => {
      let definition = '';
      let tip = '';
      for (const L of lessons) {
        const v = L.vocab.find(x => isBoundSmall(normTerm(lemma), normTerm(x.lemma)));
        if (v) { definition = v.definition; tip = v.tip; break; }
      }
      return { lemma, definition, tip, level: e.level };
    });
  const vaultList = Object.entries(srs).filter(([, e]) => e.level === 4).map(([lemma, e]) => ({ lemma, level: e.level }));

  function markReviewed(lemma: string) {
    setSrs(prev => {
      const next = { ...prev };
      const entry = next[lemma] ?? { level: 0, next: '' };
      const level = Math.min(4, entry.level + 1);
      const d = new Date();
      d.setDate(d.getDate() + SRS_INTERVALS[level]);
      next[lemma] = { level, next: dayKey(d) };
      try { localStorage.setItem(SRS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function openTodayCard() {
    setSideView('none');
    exitDrill();
  }

  return (
    <>
      <style>{inlineStyles}</style>
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FAF9]">
        {/* ---------- 左側可折疊工具欄 ---------- */}
        <aside
          className={
            'flex h-full flex-col justify-between border-r border-stone-200/80 bg-white/80 p-4 backdrop-blur-md transition-all duration-300 ' +
            (isSidebarOpen ? 'w-64' : 'w-16')
          }
        >
          <div>
            <div className={'mb-5 flex items-center ' + (isSidebarOpen ? 'justify-between' : 'justify-center')}>
              {isSidebarOpen && <span className="text-sm font-bold tracking-tight text-stone-700">OutputMaster</span>}
              <button
                type="button"
                onClick={() => setSidebarOpen(!isSidebarOpen)}
                aria-label={isSidebarOpen ? '收起側邊欄' : '展開側邊欄'}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <PanelIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* 操作按鈕清單（定案 5 鍵） */}
            <nav className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setSideView('search')}
                title="全局檢索 (Cmd+K)"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-colors hover:bg-stone-100 hover:text-stone-600 ' +
                  (sideView === 'search' ? 'bg-stone-100 text-stone-700' : 'text-stone-500') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <SearchIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && (
                  <>
                    <span>全局檢索</span>
                    <kbd className="ml-auto rounded-md border border-stone-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-stone-400">⌘K</kbd>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={openTodayCard}
                title="今日特刊"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-colors hover:bg-stone-100 hover:text-stone-600 ' +
                  (sideView === 'none' ? 'bg-stone-100 text-stone-700' : 'text-stone-500') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <BookIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && <span>今日特刊</span>}
              </button>
              <button
                type="button"
                onClick={() => setSideView('review')}
                title="閃電複習"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-colors hover:bg-stone-100 hover:text-stone-600 ' +
                  (sideView === 'review' ? 'bg-stone-100 text-stone-700' : 'text-stone-500') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <ZapIcon className="h-4 w-4 shrink-0 text-[#FF9600]" />
                {isSidebarOpen && (
                  <>
                    <span>閃電複習</span>
                    {dueCount > 0 && (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#FF9600] px-1 text-[10px] font-extrabold text-white">{dueCount}</span>
                    )}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSideView('vault')}
                title="語塊金庫"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-colors hover:bg-stone-100 hover:text-stone-600 ' +
                  (sideView === 'vault' ? 'bg-stone-100 text-stone-700' : 'text-stone-500') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-[13px] leading-none text-[#FFC800]">✦</span>
                {isSidebarOpen && <span>語塊金庫</span>}
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="自定義"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-extrabold text-emerald-700 transition-all hover:bg-emerald-100 ' +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <GearIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && <span>自定義</span>}
              </button>
            </nav>

            {/* 九月特刊目錄 */}
            {isSidebarOpen && (
              <div className="mt-6">
                <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-stone-400">九月特刊目錄</p>
                <div className="flex flex-col gap-0.5">
                  {lessons.map((L, i) => (
                    <button
                      key={L.id}
                      type="button"
                      onClick={() => { setLessonIdx(i); exitDrill(); setSelectedChunk(null); setShowReview(false); }}
                      className={
                        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all duration-200 ' +
                        (i === lessonIdx
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                          : 'text-stone-500 hover:bg-stone-100')
                      }
                    >
                      <span className={'font-mono text-[10px] ' + (i === lessonIdx ? 'text-emerald-600' : 'text-stone-300')}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="truncate">{lessonTitleOf(L, i)}</span>
                      {i === lessonIdx && <CheckIcon className="ml-auto h-3 w-3 text-[#58CC02]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部用戶欄 */}
          <div className={'flex items-center gap-2.5 border-t border-stone-200/80 pt-3.5 ' + (isSidebarOpen ? '' : 'justify-center')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 font-serif text-sm font-bold text-emerald-800">L</span>
            {isSidebarOpen && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-stone-700">Lin <span className="font-medium text-stone-400">(雅思衝刺 7.5)</span></p>
                <span className="mt-0.5 inline-block rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-400">Pro Plan</span>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- 右側主卡片練習區 ---------- */}
        <main className="scrollbar-none h-full flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5 md:px-8">
            {/* 頂部輔助列 */}
            <div className="mb-6 flex items-center justify-between">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="展開側邊欄"
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:text-stone-600"
                >
                  <PanelIcon className="h-4 w-4" />
                </button>
              )}
              {isSidebarOpen && <span />}
              {/* 每日美國 50 州文化印章 */}
              <div className="relative">
                <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3.5 py-1.5" title="今日文化護照戳">
                  <StarIcon className="h-4 w-4 text-stone-700" />
                  <span className="text-xs font-semibold text-stone-800">
                    {stateBadge.en} ({stateBadge.cn})
                  </span>
                </div>
                {isCompletedToday && (
                  <span className="animate-duo-pop absolute -right-1.5 -top-1.5 grid h-5 w-5 rotate-12 place-items-center rounded-full bg-[#58CC02] text-white shadow-md ring-2 ring-white">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>

            {/* 今日配額 HUD */}
            <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-stone-200/80 bg-white px-5 py-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-stone-700">
                  今日進度：<span className="text-[#58CC02]">{doneGroups}</span> / {quota} 組
                  <span className="ml-2 text-xs font-bold text-stone-400">(目標 {donePct}%)</span>
                </p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                  {doneGroups >= quota ? '已達標' : '衝刺中'}
                </span>
              </div>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-stone-200/80">
                <div className="h-full rounded-full bg-[#58CC02] transition-all duration-700 ease-out" style={{ width: `${donePct}%` }} />
              </div>
            </div>

            {/* 主卡片 */}
            <div className="mx-auto max-w-2xl rounded-3xl border border-stone-200/80 bg-white p-7 shadow-xl shadow-stone-200/40 sm:p-9">
              {currentStage === 'resting' && (
                <div key="resting" className="animate-duo-fade-up">
                  <span className="inline-flex items-center rounded-full bg-emerald-800 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.14em] text-emerald-50">
                    IELTS Speaking · Daily Practice
                  </span>

                  {D.questionEn ? (
                    <>
                      <h1 className="my-3 font-serif text-2xl font-normal leading-snug text-stone-900 md:text-3xl">{D.questionEn}</h1>
                      {D.questionCn && <p className="mt-1.5 text-sm text-stone-500">{D.questionCn}</p>}
                    </>
                  ) : (
                    <h1 className="my-3 text-xl font-medium leading-snug text-stone-900">{D.questionCn}</h1>
                  )}

                  {/* 低存在感折疊標籤池 */}
                  <div className="mt-7">
                    <div className="flex flex-wrap items-center gap-2">
                      {(isTagsExpanded ? chunks : chunks.slice(0, 4)).map((chunk, i) => (
                        <button
                          key={chunk}
                          type="button"
                          onClick={() => setSelectedChunk(selectedChunk === chunk ? null : chunk)}
                          className={
                            'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all duration-200 ' +
                            (selectedChunk === chunk
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                              : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(16,185,129,0.18)]')
                          }
                        >
                          <span className="font-mono text-[10px] font-bold tracking-wider text-emerald-500/80">{String(i + 1).padStart(2, '0')}</span>
                          {chunk}
                        </button>
                      ))}
                      {chunks.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                          className="cursor-pointer rounded-lg bg-stone-100 px-2 py-1.5 text-xs text-stone-400 transition-colors duration-200 hover:text-stone-600"
                        >
                          {isTagsExpanded ? '收起 ▴' : `+ 全部 ${chunks.length} 個 ▾`}
                        </button>
                      )}
                    </div>
                    {selectedChunk && (() => {
                      const def = D.vocab.find(v => isBoundSmall(normTerm(selectedChunk), normTerm(v.lemma)));
                      return (
                        <div className="animate-duo-fade-up mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                          <p className="text-sm font-bold text-emerald-800">
                            {selectedChunk}
                            {def?.category && <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">{def.category}</span>}
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-stone-500">
                            <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                            {def ? (def.tip ? `精髓：${def.tip} · ${displayDef(def)}` : def.definition) : '本課暫無釋義記錄'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {!isDrillMode && (
                    <button type="button" onClick={startDrill} className={btnGreen + ' mt-8 w-full'}>
                      <span className="inline-flex items-center justify-center gap-2">
                        <ZapIcon className="h-4 w-4" />
                        開始 3 分鐘原位默寫挑戰
                      </span>
                    </button>
                  )}

                  {/* 範文手風琴（原位摳空發生在這裡，絕不刷新） */}
                  <div
                    className={'grid transition-all duration-500 ease-in-out ' + (essayOpen ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
                    aria-hidden={!essayOpen}
                  >
                    <div className="overflow-hidden">
                      <div
                        className={
                          'rounded-2xl border p-5 transition-all duration-700 ' +
                          (isDrillMode
                            ? 'border-emerald-200/80 bg-white'
                            : 'border-stone-200/80 bg-stone-50')
                        }
                      >
                        {isDrillMode && (
                          <div className="mb-4 flex items-center justify-between">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                              {roundBanner
                                ? roundBanner
                                : `第 ${batchIdx + 1} / ${batchCount} 組 · 本組 ${activeIdxs.length} 詞`}
                            </span>
                            <button type="button" onClick={exitDrill} aria-label="退出默寫" className="text-stone-300 transition-colors duration-200 hover:text-stone-500">
                              <CloseIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        <p className="whitespace-pre-line font-serif text-[15px] leading-[2.3] text-stone-900 transition-all duration-500">
                          {D.passageSegments.map((seg, segIdx) => renderSegment(seg, segIdx))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

          {/* ---------- 全局檢索視圖 ---------- */}
          {currentStage === 'resting' && sideView === 'search' && (
            <div key="search" className="animate-duo-fade-up">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-stone-400">全局檢索</p>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="檢索題目、範文、語塊…"
                aria-label="全局檢索"
                autoFocus
                className="mt-4 w-full rounded-2xl border-2 border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800 outline-none transition-colors focus:border-[#58CC02]"
              />
              <div className="mt-4 flex flex-col gap-2">
                {searchResults.length ? searchResults.map(r => (
                  <button
                    key={r.index}
                    type="button"
                    onClick={() => { setLessonIdx(r.index); setSideView('none'); resetDrill(); }}
                    className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 text-left transition-all duration-200 hover:border-emerald-300"
                  >
                    <p className="text-[10px] font-bold text-stone-400">{lessonTitleOf(lessons[r.index] ?? lessons[0], r.index)}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-stone-800">{r.snippet}</p>
                  </button>
                )) : (
                  <p className="text-xs font-semibold text-stone-400">{searchQuery.trim() ? '沒有匹配的內容，換個關鍵詞試試' : '輸入關鍵詞，檢索全部特刊'}</p>
                )}
              </div>
            </div>
          )}

          {/* ---------- 閃電複習視圖 ---------- */}
          {currentStage === 'resting' && sideView === 'review' && (
            <div key="review" className="animate-duo-fade-up">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-stone-400">閃電複習 · 待複習 {reviewList.length} 個</p>
              <div className="mt-4 flex flex-col gap-2.5">
                {reviewList.length ? reviewList.map(item => (
                  <div key={item.lemma} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-stone-800">✦ {item.lemma}</p>
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-stone-400">Lv.{item.level}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-stone-500">{item.tip ? displayDef({ definition: item.definition, tip: item.tip }) : item.definition}</p>
                    {item.tip && <p className="mt-1 text-[11px] font-semibold text-emerald-700">精髓：{item.tip}</p>}
                    <button
                      type="button"
                      onClick={() => markReviewed(item.lemma)}
                      className="mt-2.5 cursor-pointer rounded-lg bg-[#58CC02] px-3 py-1.5 text-[11px] font-extrabold text-white transition-all hover:bg-[#52be02] active:translate-y-0.5"
                    >
                      記住了 ✓
                    </button>
                  </div>
                )) : (
                  <p className="text-xs font-semibold text-stone-400">目前沒有待複習的語塊，繼續保持！</p>
                )}
              </div>
            </div>
          )}

          {/* ---------- 語塊金庫視圖 ---------- */}
          {currentStage === 'resting' && sideView === 'vault' && (
            <div key="vault" className="animate-duo-fade-up">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-stone-400">語塊金庫 · Mastered</p>
              <div className="mt-4 flex flex-col gap-2.5">
                {vaultList.length ? vaultList.map(item => (
                  <div key={item.lemma} className="flex items-center gap-3 rounded-2xl border border-[#FFC800]/50 bg-[#FFC800]/10 p-4">
                    <span className="text-base text-[#FFC800]">✦</span>
                    <div>
                      <p className="text-sm font-extrabold text-stone-800">{item.lemma}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#C79A00]">Mastered · 60 天內不再出現</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs font-semibold text-stone-400">金庫還空著——把語塊練到 Level 4 就能入庫！</p>
                )}
              </div>
            </div>
          )}
            </div>
          </div>
        </main>

        {/* ---------- 學習偏好抽屜 ---------- */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-40 bg-stone-900/40" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
        )}
        <aside
          className={
            'fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto border-l border-stone-200 bg-white p-6 shadow-2xl transition-transform duration-300 ' +
            (isSettingsOpen ? 'translate-x-0' : 'translate-x-full')
          }
          aria-hidden={!isSettingsOpen}
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-tight text-stone-800">學習偏好</h2>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="關閉設置" className="grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <section className="mb-7">
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-stone-400">學習節奏（每日配額）</p>
            <div className="flex flex-col gap-2">
              {([
                { q: 6, label: '6 組/天', desc: '輕鬆 · 約 3 篇長文 · 42 詞' },
                { q: 12, label: '12 組/天', desc: '標準 · 約 6 篇長文 · 84 詞' },
                { q: 24, label: '24 組/天', desc: '衝刺 · 約 12 篇長文 · 168 詞' },
              ] as const).map(opt => (
                <button
                  key={opt.q}
                  type="button"
                  onClick={() => { setQuota(opt.q); quotaRef.current = opt.q; }}
                  className={
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all duration-200 ' +
                    (quota === opt.q ? 'border-[#58CC02] bg-[#D7FFB8]/40' : 'border-stone-200 bg-white hover:border-stone-300')
                  }
                >
                  <span className={'grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ' + (quota === opt.q ? 'border-[#58CC02] bg-[#58CC02]' : 'border-stone-300')}>
                    {quota === opt.q && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-stone-800">{opt.label}</span>
                    <span className="block text-[11px] font-semibold text-stone-400">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-7">
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-stone-400">發音類型偏好</p>
            <div className="flex gap-2">
              {([['UK', '英式發音 (UK - 雅思推薦)'], ['US', '美式發音 (US)']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAccent(v)}
                  className={
                    'flex-1 cursor-pointer rounded-xl border-2 px-3 py-2.5 text-xs font-bold transition-all duration-200 ' +
                    (accent === v ? 'border-[#58CC02] bg-[#D7FFB8]/40 text-stone-800' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-stone-400">艾賓浩斯複習策略</p>
            <div className="flex flex-col gap-2">
              {([['all', '全部次日複習'], ['wrong', '僅錯詞次日複習 (動態艾賓浩斯)']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSrsMode(v)}
                  className={
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-sm font-bold transition-all duration-200 ' +
                    (srsMode === v ? 'border-[#58CC02] bg-[#D7FFB8]/40 text-stone-800' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300')
                  }
                >
                  <span className={'grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ' + (srsMode === v ? 'border-[#58CC02] bg-[#58CC02]' : 'border-stone-300')}>
                    {srsMode === v && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              try { localStorage.setItem(PREFS_KEY, JSON.stringify({ quota, accent, srsMode })); } catch { /* ignore */ }
              quotaRef.current = quota;
              setSettingsOpen(false);
            }}
            className={btnGreen + ' w-full'}
          >
            保存偏好
          </button>
        </aside>

        {/* ---------- streak_celebration Pure Juicy 2.0 ---------- */}
        {currentStage === 'streak_celebration' && (
          <div className="animate-duo-fade-up fixed inset-0 z-50 overflow-y-auto bg-[#F8FAF9]/95">
            <div className="mx-auto my-6 w-full max-w-md overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-2xl">
              <div className="relative bg-[#FF9600] p-8 text-white">
                <button type="button" onClick={backToHome} aria-label="關閉" className="absolute left-5 top-5 grid h-8 w-8 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/15">
                  <CloseIcon className="h-4 w-4" />
                </button>
                <button type="button" aria-label="分享" className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/15">
                  <ShareIcon className="h-4 w-4" />
                </button>
                <Flame3D />
                <div className="mt-2 text-center">
                  <div className="text-7xl font-black leading-none drop-shadow-[0_3px_0_rgba(122,60,0,0.35)]">{streakCount}</div>
                  <div className="mt-3 text-2xl font-extrabold tracking-tight">{streakCount} 天連勝啦！</div>
                </div>
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/95 p-3.5 text-stone-700 shadow-sm">
                  <IceIcon className="h-9 w-9 shrink-0" />
                  <p className="text-sm font-bold leading-5">恭喜你開啟連勝，送你 4 個連勝激凍！</p>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="上一個月"
                    onClick={() => { const m = viewMonth - 1; if (m < 1) { setViewMonth(12); setViewYear(viewYear - 1); } else setViewMonth(m); }}
                    className="grid h-8 w-8 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100"
                  >
                    <ChevronIcon direction="left" className="h-4 w-4" />
                  </button>
                  <span className="text-base font-extrabold tracking-tight text-stone-800">{viewYear}年{viewMonth}月</span>
                  <button
                    type="button"
                    aria-label="下一個月"
                    onClick={() => { const m = viewMonth + 1; if (m > 12) { setViewMonth(1); setViewYear(viewYear + 1); } else setViewMonth(m); }}
                    className="grid h-8 w-8 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100"
                  >
                    <ChevronIcon direction="right" className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600">
                    <CheckIcon className="h-3 w-3 text-[#58CC02]" />
                    {streakCount} 打卡天數
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600">
                    <IceIcon className="h-3.5 w-3.5" />
                    連勝激凍: 4次可用
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-7 gap-y-2 text-center">
                  {weekDays.map(d => (
                    <span key={d} className="text-[11px] font-extrabold text-stone-400">{d}</span>
                  ))}
                  {Array.from({ length: firstWeekdayOfView }).map((_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonthOfView }).map((_, i) => {
                    const day = i + 1;
                    const cellDate = new Date(viewYear, viewMonth - 1, day);
                    const cellKey = dayKey(cellDate);
                    const isToday = cellDate.toDateString() === now.toDateString();
                    const logEntry = loadLog()[cellKey];
                    const isLogged = !!logEntry && logEntry.groups > 0;
                    const isDone = isToday && isCompletedToday;
                    const interactive = isDone || isLogged;
                    const daysFromToday = Math.round((cellDate.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
                    const showFlag = daysFromToday === flagOffset && flagOffset !== 0;
                    const showChest = daysToGold > 0 && daysFromToday === chestOffset;
                    return (
                      <div key={day} className="relative flex items-center justify-center">
                        {showFlag && <FlagIcon className="absolute -top-1 right-0 h-4 w-4 text-[#FFC800]" />}
                        {showChest && <span className="absolute -top-2 left-0 text-sm text-[#FFC800]" aria-hidden="true">✦</span>}
                        <button
                          type="button"
                          disabled={!interactive}
                          onClick={() => setInspectDate(interactive ? cellKey : null)}
                          className={
                            'relative grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition-all duration-200 ' +
                            (isDone
                              ? 'duo-cell-fill bg-[#FF9600] text-white shadow-[0_0_0_4px_rgba(255,150,0,0.25)]'
                              : isLogged
                                ? 'bg-[#FF9600] text-white'
                                : isToday
                                  ? 'border-2 border-[#FF9600] text-[#FF9600]'
                                  : 'text-stone-500') +
                            (interactive ? ' cursor-pointer hover:scale-110' : ' cursor-default')
                          }
                        >
                          {isDone && isToday ? (
                            <>
                              <span className="duo-ripple absolute inset-0 rounded-full border-2 border-[#FF9600]" />
                              <span className="duo-ripple absolute inset-0 rounded-full border border-[#FFC800]" style={{ animationDelay: '0.35s' }} />
                              <CheckIcon className="duo-check-in h-4 w-4" />
                            </>
                          ) : (
                            day
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Day Inspector 抽屜 */}
                {inspectDate && (() => {
                  const entry = loadLog()[inspectDate];
                  return (
                    <div className="animate-duo-fade-up mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="text-xs font-extrabold text-stone-600">{inspectDate.replace(/-/g, '.')} · 當日戰報</p>
                      {entry ? (
                        <>
                          <p className="mt-1.5 text-sm font-bold text-stone-700">完成 {entry.groups} 組 · {entry.chunks.length} 個語塊</p>
                          <p className="mt-1 text-[11px] font-semibold text-stone-400">文化護照：{entry.state}</p>
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {entry.chunks.map(c => (
                              <li key={c} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">✦ {c}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[11px] font-semibold text-stone-400">該日暫無打卡記錄</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 里程碑路線 */}
              <div className="px-6 pb-2">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-stone-400">里程碑路線</p>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF9600] px-3 py-1 text-xs font-extrabold text-white">
                    <FlameIcon className="h-3.5 w-3.5" />
                    第 {streakCount} 天
                  </span>
                  <span className="text-[11px] font-bold text-stone-400">
                    {daysToGold > 0 ? `再堅持 ${daysToGold} 天開箱` : '黃金寶箱已開！'}
                  </span>
                </div>
              </div>

              {/* 連勝精英俱樂部 */}
              <div className="mx-6 mt-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-200 text-stone-500">
                  <LockIcon className="h-4 w-4" />
                </span>
                <p className="text-xs font-bold leading-5 text-stone-500">
                  連勝達到 7 天，就能加入連勝精英俱樂部，贏取專屬特權！
                </p>
              </div>

              <div className="p-6">
                <button type="button" onClick={backToHome} className={btnGreen + ' w-full'}>
                  收下榮譽，回到卡片
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  /* ---------- 範文片段渲染（原位摳空核心，絕不重繪整篇） ---------- */
  function renderSegment(seg: PassageSegment, segIdx: number) {
    if (!seg.bold) {
      return (
        <span key={segIdx} className={isDrillMode && !completed ? 'opacity-65 transition-opacity duration-500' : 'transition-opacity duration-500'}>
          {seg.text}
        </span>
      );
    }
    // 該加粗塊的語塊序號（首次出現才有輸入框，重複出現渲染為標籤）
    const orderIdx = chunkOrder(segIdx);
    const isBlank = isDrillMode && batchIdx * GROUP_SIZE <= orderIdx && orderIdx < (batchIdx + 1) * GROUP_SIZE;
    const solved = results[orderIdx] === 'correct';
    if (isDrillMode && orderIdx >= 0 && (isBlank || solved)) {
      if (solved || results[orderIdx] === 'correct') {
        return (
          <span key={segIdx} className="mx-0.5 inline-block rounded-lg bg-[#D7FFB8] px-1.5 py-0.5 font-serif text-[15px] font-semibold text-[#46A302]">
            {seg.text}
          </span>
        );
      }
      const st = results[orderIdx] ?? 'typing';
      const isShaking = shakeIdx === orderIdx;
      const showTips = tipsIdx === orderIdx;
      const coreWidth = Math.max(6, (chunks[orderIdx]?.length ?? 8) + 2);
      return (
        <span key={segIdx} className="relative inline-block align-baseline">
          <input
            ref={el => { inputRefs.current[orderIdx] = el; }}
            value={answers[orderIdx] ?? ''}
            onChange={e => updateAnswer(orderIdx, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); judge(orderIdx); } }}
            aria-label={`默寫第 ${orderIdx + 1} 個語塊`}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: `${coreWidth}ch` }}
            className={
              'mx-0.5 inline-block rounded-lg border-2 border-b-4 px-1.5 py-0.5 text-center font-serif text-[15px] outline-none transition-all duration-200 ' +
              (st === 'wrong'
                ? 'border-[#EA2B2B] bg-[#FFDFE0] text-[#EA2B2B]' + (isShaking ? ' animate-duo-shake' : '')
                : 'border-stone-300 border-b-[#58CC02] bg-white text-stone-900 focus:border-b-[#46A302]')
            }
          />
          {showTips && (() => {
            const raw = chunks[orderIdx];
            const def = D.vocab.find(v => isBoundSmall(normTerm(raw), normTerm(v.lemma)));
            const tip = def ? (def.tip ? `精髓：${def.tip}` : def.definition) : '';
            return tip ? (
              <span className="animate-duo-fade-up absolute left-1/2 top-full z-20 mt-2 w-52 -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-left text-[11px] font-semibold leading-4 text-amber-800 shadow-lg">
                <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                {tip}
              </span>
            ) : null;
          })()}
        </span>
      );
    }
    // 譯文裡的中文加粗：渲染為普通文本（非拉丁語塊不進標籤池）
    if (!/^[A-Za-z0-9'’\-/\. ]+$/.test(seg.text.trim()) || !/[A-Za-z]/.test(seg.text)) {
      return <span key={segIdx}>{seg.text}</span>;
    }
    return (
      <mark
        key={segIdx}
        className={
          'rounded bg-emerald-50 px-1 font-semibold text-emerald-800 transition-all duration-500 ' +
          (isDrillMode ? 'opacity-65' : '')
        }
      >
        {seg.text}
      </mark>
    );
  }

  /* 加粗塊 → 語塊序號（首次出現；重複出現返回 -1） */
  function chunkOrder(segIdx: number): number {
    if (!segIdxOrderMap) return -1;
    return segIdxOrderMap[segIdx] ?? -1;
  }
}
