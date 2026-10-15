'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, PassageSegment, VocabEntry } from '@/lib/notion';

/* ---------------- 內聯動效 ---------------- */

const inlineStyles = `
  @keyframes hi-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
  .animate-hi-shake { animation: hi-shake 0.35s ease-in-out; }

  @keyframes hi-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  .animate-hi-fade-up { animation: hi-fade-up 0.3s ease-out both; }

  @keyframes hi-pop {
    0% { transform: scale(0.4); opacity: 0; }
    60% { transform: scale(1.15); }
    100% { transform: scale(1); opacity: 1; }
  }
  .animate-hi-pop { animation: hi-pop 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; }

  @keyframes hi-rise {
    from { opacity: 0; transform: translateY(16px) scale(0.995); }
    to { opacity: 1; transform: none; }
  }
  .animate-hi-rise { animation: hi-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }

  .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }

  /* 側邊欄特刊目錄用的細捲軸：看得見、可以拖，但收得很細不搶版面 */
  .scrollbar-slim { scrollbar-width: thin; scrollbar-color: #C4CBDC transparent; }
  .scrollbar-slim::-webkit-scrollbar { width: 6px; height: 6px; }
  .scrollbar-slim::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-slim::-webkit-scrollbar-thumb { background: #D5DBE8; border-radius: 999px; }
  .scrollbar-slim::-webkit-scrollbar-thumb:hover { background: #A8B0C2; }

  /* 克萊因藍封面：疊一層細顆粒，避免大面積純色發悶。
     用負 z-index 讓顆粒落在「底色之上、內容之下」，不會蓋到文字。 */
  .hi-grain { position: relative; isolation: isolate; }
  .hi-grain::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0.16;
    mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  }
`;

const btnGreen =
  'group inline-flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-2xl bg-[#0095FF] px-8 py-4 text-[15px] font-extrabold tracking-tight text-white shadow-[0_18px_38px_-16px_rgba(0,149,255,0.95)] transition-all duration-200 hover:bg-[#0085E5] hover:shadow-[0_22px_44px_-16px_rgba(0,149,255,1)] active:scale-[0.985]';
const btnGray =
  'inline-flex w-full cursor-not-allowed select-none items-center justify-center gap-2 rounded-2xl bg-[#EDEFF5] px-8 py-4 text-[15px] font-bold text-[#A8B0C2]';

/* 封面用的英文月份縮寫（純排版用途） */
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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
  month: '九月',
  cnSegments: [],
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
/* 一組最多闖幾關：第 1 關全填，之後只補沒拿下的；第 3 關仍未拿下就收組 */
const MAX_ROUNDS = 3;
const MASTERY_INTERVALS = [1, 3, 7, 60]; // 升到 Lv.1/2/3/4 後的下次複習間隔（天）

/* 英文標點貼合：Notion 原文由多個 rich_text 片段拼回時，片段邊界常留下「terms , which」這種
   標點前多一個空格的痕跡。英文排版鐵律是標點前不留白，這裡統一收掉。 */
function tidyEn(s: string): string {
  return s.replace(/\s+([,.;:!?])/g, '$1');
}

/* 記憶狀態白話標籤：Lv.0/4 是程式內部詞彙，使用者看不懂。
   一律換成「新學 / 初識 / 熟練 / 鞏固 / 已掌握 + 下次複習時機」，前端不得再直接輸出 Lv. */
function memoryLabel(level: number, compact: boolean = false): string {
  const lv = Math.max(0, Math.floor(level));
  if (lv <= 0) return compact ? '新學' : '新學 · 明天複習';
  if (lv === 1) return compact ? '初識' : '初識 · 3天後';
  if (lv === 2) return compact ? '熟練' : '熟練 · 7天後';
  if (lv === 3) return compact ? '鞏固' : '鞏固 · 15天後';
  return compact ? '已掌握' : '已掌握 · 60天後';
}

/* ---------------- 純 SVG 向量圖標（零 Emoji） ---------------- */

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 8.5 12 2" />
    </svg>
  );
}

function FlameIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.4 3.6-1.3 5.6-3 7.6-1.5 1.7-2.7 3.4-2.7 5.6a5.7 5.7 0 0 0 11.4 0c0-2.2-1.2-3.9-2.7-5.6-1.7-2-3.4-4-3-7.6Z" />
      <path d="M12 10.5c-.9 1.9-2.2 3-2.2 4.9a2.2 2.2 0 1 0 4.4 0c0-1.9-1.3-3-2.2-4.9Z" fill="#ffffff" fillOpacity=".45" />
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

function ChevronIcon({ className, direction }: { className?: string; direction: 'left' | 'right' | 'up' | 'down' }) {
  const path = direction === 'left' ? 'M15 5l-7 7 7 7' : direction === 'right' ? 'M9 5l7 7-7 7' : direction === 'up' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7';
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
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

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6.5 8.5H3v7h3.5L11 19V5z" />
      <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17.5 7a7 7 0 0 1 0 10" />
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

const STREAK_KEY = 'hawaii-streak';
const MASTERY_KEY = 'hawaii_word_mastery';
const PREFS_KEY = 'hawaii-prefs';
const LOG_KEY = 'hawaii-daily';
const PROGRESS_KEY = 'hawaii_lesson_progress';

type Streak = { count: number; last: string | null };
type MasteryEntry = { level: number; nextReviewDate: number; word?: string };
type MasteryMap = Record<string, MasteryEntry>;
type Prefs = { quota: number; accent: 'UK' | 'US'; srsMode: 'all' | 'wrong' };
type DailyLog = Record<string, { groups: number; chunks: string[]; state: string; counted: string[] }>;

/* 章節進度：每一課記錄「已通關哪幾組」，用來回答「我到底練過哪些章節」 */
type LessonProgressEntry = { groups: number[]; total: number; clearedAt?: number; lastAt: number };
type LessonProgressMap = Record<string, LessonProgressEntry>;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/* 品牌改名一次性遷移：outputmaster-* → hawaii-*（只在新鍵為空時搬運，永不覆蓋新數據） */
function migrateLegacyKeys() {
  try {
    const pairs: Array<[string, string]> = [
      ['outputmaster-streak', 'hawaii-streak'],
      ['outputmaster_word_mastery', 'hawaii_word_mastery'],
      ['outputmaster-prefs', 'hawaii-prefs'],
      ['outputmaster-daily', 'hawaii-daily'],
      /* 特刊進度：先前版本的遷移表漏列這一項，導致舊使用者的「已練／已通關」記憶整批歸零。
         兩種舊分隔符（- 與 _）都列上，因為歷史上這個鍵換過命名風格。 */
      ['outputmaster_lesson_progress', 'hawaii_lesson_progress'],
      ['outputmaster-lesson-progress', 'hawaii_lesson_progress'],
    ];
    for (const [oldKey, newKey] of pairs) {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
        localStorage.removeItem(oldKey);
      }
    }
  } catch { /* ignore */ }
}

function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const parsed = raw ? (JSON.parse(raw) as Streak) : null;
    if (parsed && typeof parsed.count === 'number') return parsed;
  } catch { /* ignore */ }
  return { count: 1, last: null };
}
function loadMastery(): MasteryMap {
  try {
    const raw = localStorage.getItem(MASTERY_KEY);
    const parsed = raw ? (JSON.parse(raw) as MasteryMap) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* ignore */ }
  return {};
}
function saveMastery(m: MasteryMap) {
  try { localStorage.setItem(MASTERY_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}
function loadLessonProgress(): LessonProgressMap {
  let cur: LessonProgressMap = {};
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as LessonProgressMap) : null;
    if (parsed && typeof parsed === 'object') cur = parsed;
  } catch { /* ignore */ }
  /* 舊鍵救援：若新鍵已存在（改版後練過至少一篇），migrateLegacyKeys 的守衛會跳過搬運，
     這裡再把舊鍵中「新鍵沒有的篇章」補回來，只增不減、不覆蓋新數據。 */
  try {
    const merged: LessonProgressMap = { ...cur };
    let changed = false;
    for (const legacyKey of ['outputmaster_lesson_progress', 'outputmaster-lesson-progress']) {
      const rawOld = localStorage.getItem(legacyKey);
      if (!rawOld) continue;
      const oldMap = JSON.parse(rawOld) as LessonProgressMap;
      if (!oldMap || typeof oldMap !== 'object') continue;
      for (const [lid, entry] of Object.entries(oldMap)) {
        if (!entry || typeof entry !== 'object') continue;
        if (!merged[lid]) { merged[lid] = entry; changed = true; }
      }
      /* 刻意不刪除舊鍵：留作備份，且合併是幂等的，每次載入重跑也無害。 */
    }
    if (changed) {
      cur = merged;
      saveLessonProgress(cur);
    }
  } catch { /* ignore */ }
  return cur;
}
function saveLessonProgress(p: LessonProgressMap) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
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

/* 默寫判卷容錯：標準答案 chunks 取自 Notion 原文，常含冠詞／尾介係詞（如 "a laundry list of"）。
   使用者只寫核心詞（"laundry list"）時字面不相等、語意卻等價，不該判錯。
   規則：先比嚴格歸一化；不中時再比「去冠詞／去尾介係詞」的核心形，且核心形須非空。 */
function drillMatch(input: string, target: string): boolean {
  const a = normAnswer(input);
  if (!a) return false;
  if (a === normAnswer(target)) return true;
  const coreA = normTerm(input);
  const coreT = normTerm(target);
  return coreT.length > 0 && coreA === coreT;
}

/* 短日期格式化（防 undefined/Invalid Date 崩潰） */
/* 純標點殘留過濾：空標點碎片直接丟棄，禁止渲染 */
const PUNCT_GARBAGE = /^[。，、？！；：…\s\.,;:!\?\(\)（）"'“”’‘]+$/;
function isPunctGarbage(text: string): boolean {
  return PUNCT_GARBAGE.test(text.trim()) && text.trim().length > 0;
}
/* 中文為主段落判定（渲染端攔截詞彙表洩漏） */
function isCjkHeavy(text: string): boolean {
  const sample = text.slice(0, 200);
  if (!sample) return false;
  const cjk = (sample.match(/[\u4e00-\u9fa5]/g) || []).length;
  return cjk / sample.length > 0.5;
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
  const [vaultQuery, setVaultQuery] = useState('');
  /* 詞庫熟練度篩選：全部 / 待複習 / 熟練中 / 已精通 */
  const [vaultLevel, setVaultLevel] = useState<'all' | 'due' | 'learning' | 'mastered'>('all');
  const [year, setYear] = useState('');
  const [yearOpen, setYearOpen] = useState(true);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  /* 佈局 */
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  /* 偏好 */
  const [quota, setQuota] = useState(12);
  const [accent, setAccent] = useState<'UK' | 'US'>('UK');
  const [srsMode, setSrsMode] = useState<'all' | 'wrong'>('wrong');

  /* 打卡 */
  const [streakCount, setStreakCount] = useState(1);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [doneGroups, setDoneGroups] = useState(0);
  /* 打卡日誌：一次載入，避免日曆每次 render 逐格讀 localStorage */
  const [dailyLog, setDailyLog] = useState<DailyLog>({});

  /* 章節進度：一次載入，目錄每一列直接查表，不必逐列讀 localStorage */
  const [lessonProgress, setLessonProgress] = useState<LessonProgressMap>({});
  /* 本輪默寫實際新增的組數（重練已通關的組不會重複計） */
  const [sessionNewGroups, setSessionNewGroups] = useState(0);
  /* 目錄篩選：全部 / 未練 / 已通關 */
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'todo' | 'done'>('all');

  /* 做題 */
  const [currentStage, setCurrentStage] = useState<Stage>('resting');
  const [isDrillMode, setDrillMode] = useState(false);
  const [batchIdx, setBatchIdx] = useState(0);
  /* 闖關：同一組（7 詞）內的多輪收斂 —— 第 1 關填全部，之後只填還沒拿下的 */
  const [roundIdx, setRoundIdx] = useState(0);
  const [roundWrong, setRoundWrong] = useState<number[]>([]);
  const [roundResolved, setRoundResolved] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, 'typing' | 'correct' | 'wrong' | 'revealed'>>({});
  const [wrongCounts, setWrongCounts] = useState<Record<number, number>>({});
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const [tipsIdx, setTipsIdx] = useState<number | null>(null);
  /* 看答案後的「停留格」：先把正解擺在眼前，等使用者按下「知道了」才真的前進 */
  const [revealHold, setRevealHold] = useState<number | null>(null);
  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [showEssay, setShowEssay] = useState(false);
  /* 打卡頁分享回饋：複製成功 / 失敗的短提示 */
  const [shareFlash, setShareFlash] = useState<string | null>(null);
  /* 從搜索進來時的命中詞：綁定 lessonIdx，切換篇章自動失效，不必額外清狀態 */
  const [highlight, setHighlight] = useState<{ lessonIdx: number; term: string } | null>(null);

  /* SRS / 日誌 */
  const [mastery, setMastery] = useState<MasteryMap>({});
  const [reviewInput, setReviewInput] = useState('');
  const [reviewWrong, setReviewWrong] = useState(0);
  const [reviewShake, setReviewShake] = useState(false);
  const [reviewActive, setReviewActive] = useState(false);
  /* 複習輪次分層：這一輪總共幾個、已經過了幾個、升/降各幾次 */
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPromoted, setReviewPromoted] = useState(0);
  const [reviewDemoted, setReviewDemoted] = useState(0);
  const [reviewFlash, setReviewFlash] = useState<string | null>(null);
  /* 直接看答案（不必先故意答錯）與跳過（不降級，留在待複習隊列） */
  const [reviewPeek, setReviewPeek] = useState(false);
  const [reviewSkipped, setReviewSkipped] = useState<string[]>([]);
  /* 兩步揭曉閉環：點「看答案」只負責把正解填進輸入框並發音，停在原地；
     必須再敲 Enter 或點同一顆按鈕才切下一題。嚴禁一看答案就自動跳走。 */
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewInputRef = useRef<HTMLInputElement>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [readingAloud, setReadingAloud] = useState(false);
  const speakerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 朗讀失敗／降級提示：先前所有語音錯誤都被 catch 靜默吞掉，使用者只覺得「點了沒反應」。
     現在把原因浮出來，至少知道是「沒裝英語語音」而不是按鈕壞了。 */
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);
  /* 日曆檢視月份：預設跟隨當下日期，不再硬編 */
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  /* 日曆選取日：預設跟隨今天，點日期可回看當天的紀錄 */
  const [selectedDayKey, setSelectedDayKey] = useState('');

  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaRef = useRef(12);
  const doneRef = useRef(0);
  /* 本組累計「沒一次拿下」的格：過關時當作錯 ≥2 送進 SRS，明天再見 */
  const missedRef = useRef<number[]>([]);

  const now = new Date();
  /* 時鐘快照：整輪 render 共用一個值，避免各處重複讀 Date.now() 造成畫面不一致 */
  const nowMs = now.getTime();
  const todayStr = dayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWeekdayOfView = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonthOfView = new Date(viewYear, viewMonth, 0).getDate();
  const stateBadge = US_STATES[Math.floor((Date.now() - now.getTimezoneOffset() * 60_000) / 86_400_000) % US_STATES.length];

  const D: Lesson = lessons[lessonIdx] ?? lessons[0] ?? BUILTIN_LESSON;
  const lessonTitle = lessonTitleOf(D, lessonIdx);

  /* 目錄分組：按 month 歸組（九月/十月/…），保持出現順序 */
  const monthGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { month: string; items: { L: Lesson; gi: number }[] }>();
    lessons.forEach((L, gi) => {
      const m = L.month || '未分組';
      if (!map.has(m)) { map.set(m, { month: m, items: [] }); order.push(m); }
      map.get(m)!.items.push({ L, gi });
    });
    return order.map(m => map.get(m)!);
  }, [lessons]);

  const totalBatches = Math.max(1, Math.ceil(D.targetChunks.length / GROUP_SIZE));
  const essayOpen = showEssay || isDrillMode;
  /* 命中詞只在同一篇內生效，換篇即自動失效 */
  const activeHighlight = highlight && highlight.lessonIdx === lessonIdx ? highlight.term : null;
  const daysToGold = Math.max(0, 30 - streakCount);
  const milestoneNodes = [1, 7, 14, 30];
  const nextMilestone = milestoneNodes.find(m => m > streakCount) ?? null;
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
    migrateLegacyKeys();
    setSidebarOpen(window.innerWidth >= 1024);
    const prefs = loadPrefs();
    setQuota(prefs.quota); setAccent(prefs.accent); setSrsMode(prefs.srsMode);
    quotaRef.current = prefs.quota;
    const stored = loadStreak();
    setStreakCount(stored.count);
    setIsCompletedToday(stored.last === todayStr);
    setMastery(loadMastery());
    const log = loadLog();
    setDailyLog(log);
    setDoneGroups(log[todayStr]?.groups ?? 0);
    doneRef.current = log[todayStr]?.groups ?? 0;
    setLessonProgress(loadLessonProgress());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetch('/api/lesson').then(r => r.json()).then(d => {
      if (d?.ok && Array.isArray(d.lessons) && d.lessons.length) {
        setLessons(d.lessons as Lesson[]);
        setLessonIdx(typeof d.todayIndex === 'number' ? d.todayIndex % d.lessons.length : 0);
        if (typeof d.year === 'string' && d.year) setYear(d.year);
      }
    }).catch(() => { /* 靜默降級內置數據 */ });
  }, []);
  useEffect(() => () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  }, []);

  // 音色清單預熱：刷新頁面後第一時間把系統可用音色灌進瀏覽器快取。
  // ★不再指名特定音色（Emma / Ryan 是 Edge 專屬，Chrome 或沒裝英語語音包的機器根本沒有）。
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => { window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // 朗讀提示（找不到英語語音等）自動淡出，避免長期佔住版面
  useEffect(() => {
    if (!ttsNotice) return;
    const t = setTimeout(() => setTtsNotice(null), 4500);
    return () => clearTimeout(t);
  }, [ttsNotice]);

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
     
  }, [isDrillMode, batchIdx]);

  /* 派生 */
  const batchCount = Math.max(1, Math.ceil(chunks.length / GROUP_SIZE));
  const activeIdxs = Array.from({ length: GROUP_SIZE }, (_, k) => batchIdx * GROUP_SIZE + k).filter(idx => idx < chunks.length);
  /* 本關還要填的格子：一次答對或已看答案的都不再是填空（下一關會直接顯示） */
  const editableIdxs = activeIdxs.filter(i => results[i] !== 'correct' && results[i] !== 'revealed');
  /* 本組已解決的格數（用來畫狀態點陣） */
  const groupSolvedCount = activeIdxs.length - editableIdxs.length;
  /* 本篇章節進度 */
  const curLessonProgress = lessonProgress[D.id];
  const lessonDoneGroups = curLessonProgress?.groups.length ?? 0;
  const lessonCleared = lessonDoneGroups >= batchCount;
  /* 下一個還沒通關的組（續練的起點；全通關時回到 0） */
  const nextTodoGroup = Array.from({ length: batchCount }, (_, i) => i)
    .find(i => !(curLessonProgress?.groups ?? []).includes(i)) ?? 0;

  /* 目錄總覽：每一篇「幾組 / 通了幾組 / 是否全通 / 續練起點」，一次算好給側邊欄查表 */
  const catalogStats = useMemo(() => {
    const map: Record<string, { total: number; done: number; cleared: boolean; next: number }> = {};
    lessons.forEach(L => {
      const total = Math.max(1, Math.ceil(L.targetChunks.length / GROUP_SIZE));
      const p = lessonProgress[L.id];
      const done = p ? Math.min(p.groups.length, total) : 0;
      /* 續練起點：第一個還沒通關的組；全通關時回到第 1 組（再跑一次） */
      const next = Array.from({ length: total }, (_, i) => i)
        .find(i => !(p?.groups ?? []).includes(i)) ?? 0;
      map[L.id] = { total, done, cleared: done >= total, next };
    });
    return map;
  }, [lessons, lessonProgress]);
  const clearedCount = lessons.reduce((n, L) => n + (catalogStats[L.id]?.cleared ? 1 : 0), 0);
  const overallPct = lessons.length ? Math.round((clearedCount / lessons.length) * 100) : 0;
  /* 全站「組」層進度：跟「今日目標 N 組」「本篇進度 N 組」同一把尺，避免跟「篇」混淆 */
  const totalGroupsAll = Object.values(catalogStats).reduce((n, s) => n + s.total, 0);
  const clearedGroupsAll = Object.values(catalogStats).reduce((n, s) => n + s.done, 0);
  /* 今日是否已達標。與「已打卡」脫鉤：打卡只要求有練，達標另外算。 */
  const quotaReached = doneGroups >= quota;
  /* 目錄月份分組，附該月通關統計（側邊欄已去 CRM 化，不再提供「未通關 / 已通關」篩選） */
  const catalogMonthGroups = useMemo(() => monthGroups.map(g => {
    const total = g.items.length;
    const done = g.items.reduce((n, { L }) => n + (catalogStats[L.id]?.cleared ? 1 : 0), 0);
    return { month: g.month, items: g.items, total, done };
  }), [monthGroups, catalogStats]);

  const donePct = Math.min(100, Math.round((doneGroups / quota) * 100));
  /* 艾賓浩斯到期隊列（nextReviewDate ≤ 現在） */
  const dueEntries = useMemo(() => Object.entries(mastery)
    .filter(([, e]) => e.nextReviewDate <= nowMs)
    .sort((a, b) => a[1].nextReviewDate - b[1].nextReviewDate)
    .map(([key, e]) => ({ key, level: e.level, word: e.word ?? key })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [mastery]);
  const dueCount = dueEntries.length;
  /* 下一個到期日：今日清空時，主頁要能說出「幾天後再見」，而不是只顯示 0 */
  const nextDueInDays = useMemo(() => {
    const future = Object.values(mastery)
      .map(e => e.nextReviewDate)
      .filter(t => t > nowMs)
      .sort((a, b) => a - b)[0];
    if (future == null) return null;
    return Math.max(1, Math.ceil((future - nowMs) / 86400000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mastery]);

  /* 這一輪真正要答的隊列：跳過的不再擋在前面，但仍留在「待複習」（mastery 不動），下次進來還會遇到 */
  const reviewQueue = useMemo(
    () => dueEntries.filter(e => !reviewSkipped.includes(e.key)),
    [dueEntries, reviewSkipped],
  );
  /* 明天到期數：複習完成頁要能說出「明天有 N 個詞到期」，不能只說清空 */
  const dueTomorrowCount = useMemo(() => {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + 86400000;
    return Object.values(mastery)
      .filter(e => e.nextReviewDate > nowMs && e.nextReviewDate < dayStart + 86400000)
      .length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mastery]);

  /* 範文按段落分組（'\n\n' 分隔片段為邊界），保留扁平索引供原位摳空 */
  const passageParas = useMemo(() => {
    const paras: { segs: { seg: PassageSegment; fi: number }[]; text: string }[] = [];
    let curSegs: { seg: PassageSegment; fi: number }[] = [];
    let curText = '';
    D.passageSegments.forEach((seg, fi) => {
      if (!seg.bold && /^\s*\n\n\s*$/.test(seg.text)) {
        if (curSegs.length) { paras.push({ segs: curSegs, text: curText.trim() }); curSegs = []; curText = ''; }
        return;
      }
      curSegs.push({ seg, fi });
      curText += seg.text;
    });
    if (curSegs.length) paras.push({ segs: curSegs, text: curText.trim() });
    return paras.filter(pl => {
      if (!pl.segs.some(x => x.seg.text.trim())) return false;
      if (isPunctGarbage(pl.text)) return false;      // 純標點段丟棄
      if (isCjkHeavy(pl.text)) return false;          // 詞彙表洩漏的中段落攔截
      return true;
    });
     
  }, [D]);

  /* 中文譯文按行分隔符（'\n'）分組為自然段落 */
  const cnParaGroups = useMemo(() => {
    const paras: { segs: { seg: PassageSegment; ti: number }[] }[] = [];
    let cur: { seg: PassageSegment; ti: number }[] = [];
    D.cnSegments.forEach((seg, ti) => {
      if (!seg.bold && /^\s*\n\s*$/.test(seg.text)) {
        if (cur.length) { paras.push({ segs: cur }); cur = []; }
        return;
      }
      cur.push({ seg, ti });
    });
    if (cur.length) paras.push({ segs: cur });
    return paras.filter(pl => {
      if (!pl.segs.some(x => x.seg.text.trim())) return false;
      const text = pl.segs.map(x => x.seg.text).join('');
      if (isPunctGarbage(text)) return false;
      return true;
    });
     
  }, [D]);
  // 極速複習刷完 → 0.9 秒自動切回主卡片
  useEffect(() => {
    if (sideView === 'review' && reviewActive && dueEntries.length === 0) {
      const t = setTimeout(() => { setSideView('none'); setReviewActive(false); }, 900);
      return () => clearTimeout(t);
    }
     
  }, [sideView, reviewActive, dueEntries.length]);

  /* 為語塊找例句上下文（複習/詞庫共用）· 附來源篇章與組別，讓複習時知道這詞從哪來 */
  function findWordContext(key: string): { chunk: string; prefix: string; suffix: string; tip: string; definition: string; lessonTitle: string; lessonIdx: number; groupIdx: number } | null {
    for (let li = 0; li < lessons.length; li++) {
      const L = lessons[li];
      const ci = L.targetChunks.findIndex(c => isBoundSmall(key, normTerm(c)));
      if (ci < 0) continue;
      const chunk = L.targetChunks[ci];
      /* ★修正（2026-09-23）：畫面顯示的空格是由 coreWords 建 regex 摳出來的，
         normTerm 會自動去掉冠詞（a/an/the）與尾介係詞（of/to/on/at/for/in），
         所以畫面看起來只留 2 個詞；但回傳的 chunk 原本是完整原始語塊（如 "a lost cause"），
         判卷卻拿它做完全字串比對 → 使用者照著畫面打 2 個詞必然被判錯。
         這裡改為回傳「regex 實際匹配到的字串」，讓顯示的空＝判卷標準。 */
      let matched = chunk;
      const coreWords = normTerm(chunk).split(' ').filter(w => w && !STOP.has(w));
      let prefix = '';
      let suffix = '';
      if (coreWords.length) {
        const re = new RegExp(coreWords.map(escapeRe).join('(?:\\s+\\w+){0,2}\\s+'), 'i');
        const sentences = L.passageEn.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/);
        const hit = sentences.find(sn => re.test(sn)) ?? '';
        const m = re.exec(hit);
        if (m && m.index !== undefined) {
          prefix = hit.slice(0, m.index).trim();
          suffix = hit.slice(m.index + m[0].length).trim();
          if (m[0].trim()) matched = m[0].trim();
        } else {
          prefix = hit.trim();
        }
      }
      const v = L.vocab.find(x => isBoundSmall(normTerm(chunk), normTerm(x.lemma)));
      return {
        chunk: matched,
        prefix,
        suffix,
        tip: v?.tip ?? '',
        definition: v?.definition ?? '',
        lessonTitle: lessonTitleOf(L, li),
        lessonIdx: li,
        groupIdx: Math.floor(ci / GROUP_SIZE),
      };
    }
    return null;
  }

  /* 統一語音朗讀（Web Speech API · 防禦型）
     ★修正（2026-09-22）：不再硬綁微軟 Ryan(英)/Emma(美) 這兩款 Edge 專屬自然音色。
     找不到指定音色時逐級後退（指定口音 → 任何英語 → 系統預設），確保一定發得出聲。
     另外 Chromium 有已知競態：cancel() 之後立刻 speak() 會被靜默丟棄，所以延遲一拍再播。 */
  function pickEnglishVoice(voices: SpeechSynthesisVoice[], prefer: 'UK' | 'US'): SpeechSynthesisVoice | null {
    const en = voices.filter(v => !!v.lang && v.lang.toLowerCase().indexOf('en') === 0);
    if (!en.length) return null;
    const want = prefer === 'US' ? 'en-us' : 'en-gb';
    const exact = en.find(v => v.lang.toLowerCase().replace('_', '-').indexOf(want) === 0);
    if (exact) return exact;
    /* 口音對不上時，任何英語音色都比「無聲」好 */
    return en[0];
  }

  function playSpeech(text: string, isSlow: boolean = false, key?: string, onDone?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      const cleanText = text.replace(/[\n\r]+/g, ' ').trim();
      if (!cleanText) return;
      /* 防禦性讀取口音偏好（兼容 accent / pronunciation 鍵名） */
      let currentPref: 'UK' | 'US' = accent;
      try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
          const j = JSON.parse(raw) as { accent?: string; pronunciation?: string };
          const v = j?.accent || j?.pronunciation;
          if (v === 'US' || v === 'UK') currentPref = v;
        }
      } catch { /* ignore */ }

      const doSpeak = (voices: SpeechSynthesisVoice[]) => {
        const u = new SpeechSynthesisUtterance(cleanText);
        const target = pickEnglishVoice(voices, currentPref);
        if (target) {
          u.voice = target;
          u.lang = target.lang;
          setTtsNotice(null);
        } else {
          /* 系統一個英語音色都沒有：不指定 voice，讓瀏覽器用它自己的預設音色。
             過去這裡硬設 en-GB，遇到只有中文語音的機器就完全無聲、且毫無提示。 */
          setTtsNotice('系統找不到英語語音，已改用預設音色；可在 Windows 設定中新增英語語音包。');
        }
        u.rate = isSlow ? 0.8 : 1.0;
        if (key) {
          setSpeakingKey(key);
          u.onend = () => { setSpeakingKey(k => (k === key ? null : k)); onDone?.(); };
          u.onerror = () => { setSpeakingKey(k => (k === key ? null : k)); onDone?.(); };
        }
        if (key === 'full') setReadingAloud(true);
        synth.speak(u);
      };

      const voices = synth.getVoices();
      if (voices.length > 0) {
        /* 等一拍再播：Chromium 在 cancel() 之後立即 speak() 會靜默失敗 */
        setTimeout(() => { try { doSpeak(synth.getVoices()); } catch { /* ignore */ } }, 60);
      } else {
        /* 音色清單尚未載入（Chrome 首次進入很常見）：等 voiceschanged 再播，最多等 1.5 秒 */
        let fired = false;
        const fire = () => {
          if (fired) return;
          fired = true;
          synth.removeEventListener('voiceschanged', fire);
          try { doSpeak(synth.getVoices()); } catch { /* ignore */ }
        };
        synth.addEventListener('voiceschanged', fire);
        setTimeout(fire, 1500);
      }
    } catch { /* 靜默 */ }
  }
  /* 聽全文：播放 / 暫停 */
  function toggleReadAloud() {
    if (readingAloud) {
      window.speechSynthesis.cancel();
      setReadingAloud(false);
      setSpeakingKey(null);
      return;
    }
    playSpeech(D.passageEn || D.passageSegments.map(x => x.text).join(''), false, 'full', () => setReadingAloud(false));
  }

  /* 語塊膠囊點擊：展開釋義氣泡 + 自動朗讀（眼看釋義、耳聽發音） */
  function handlePillClick(chunk: string) {
    setSelectedChunk(cur => (cur === chunk ? null : chunk));
    playSpeech(chunk, false, 'pill:' + chunk);
  }
  /* 喇叭單擊/雙擊分發（260ms 內二次點擊視為雙擊） */
  function speakerClick(text: string, key: string) {
    if (speakerClickTimer.current) { clearTimeout(speakerClickTimer.current); speakerClickTimer.current = null; return; }
    speakerClickTimer.current = setTimeout(() => { speakerClickTimer.current = null; playSpeech(text, false, key); }, 260);
  }
  function speakerDouble(text: string, key: string) {
    if (speakerClickTimer.current) { clearTimeout(speakerClickTimer.current); speakerClickTimer.current = null; }
    playSpeech(text, true, key);
  }

  /* 升級（複習正確）：Lv.0→1 +1天，1→2 +3天，2→3 +7天，3→4 Mastered +60天 */
  function promoteWord(key: string) {
    setMastery(prev => {
      const e = prev[key] ?? { level: 0, nextReviewDate: 0 };
      const level = Math.min(4, e.level + 1);
      const days = level >= 1 ? MASTERY_INTERVALS[level - 1] : 1;
      const next = { ...prev, [key]: { ...e, level, nextReviewDate: Date.now() + days * 86_400_000 } };
      saveMastery(next);
      return next;
    });
  }
  /* 降級（錯 ≥2 / 看答案）：level-1，明天再見 */
  function demoteWord(key: string) {
    setMastery(prev => {
      const e = prev[key] ?? { level: 0, nextReviewDate: 0 };
      const level = Math.max(0, e.level - 1);
      const next = { ...prev, [key]: { ...e, level, nextReviewDate: Date.now() + 86_400_000 } };
      saveMastery(next);
      return next;
    });
  }

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
        if (typeof res.year === 'string' && res.year) setYear(res.year);
        setBatchIdx(0); exitDrill();
      }
    } catch { /* 靜默 */ }
    setSyncing(false);
  }

  /* 做題 */
  function resetDrill() {
    setAnswers({}); setResults({}); setWrongCounts({});
    setShakeIdx(null); setTipsIdx(null); setRevealHold(null); setRoundBanner(null); setBatchIdx(0);
    setRoundIdx(0); setRoundWrong([]); setRoundResolved(false);
    missedRef.current = [];
    setSessionNewGroups(0);
    setCompleted(false);
    inputRefs.current = {};
  }
  function startDrill() {
    resetDrill();
    /* 續練：直接跳到本篇第一個還沒通關的組，不必從頭再填一遍（全通關則從頭再跑） */
    if (nextTodoGroup > 0) setBatchIdx(nextTodoGroup);
    setShowEssay(true);
    setDrillMode(true);
  }
  function exitDrill() {
    setDrillMode(false);
    setShowEssay(false);
    setCompleted(false);
    setRoundBanner(null);
    setRoundResolved(false);
    setRevealHold(null);
  }
  function updateAnswer(orderIdx: number, value: string) {
    if (roundResolved) return;
    setAnswers(prev => ({ ...prev, [orderIdx]: value }));
    if (results[orderIdx] === 'wrong') setResults(prev => ({ ...prev, [orderIdx]: 'typing' }));
  }
  function judge(orderIdx: number) {
    if (roundResolved) return;
    if (results[orderIdx] === 'correct' || results[orderIdx] === 'revealed') return;
    const answer = answers[orderIdx] ?? '';
    /* 用 drillMatch 判卷：容忍標準答案的冠詞／尾介係詞（見函式上方說明） */
    if (drillMatch(answer, chunks[orderIdx] ?? '')) {
      playIceClink();
      setResults(prev => ({ ...prev, [orderIdx]: 'correct' }));
      /* 下一格只在本關「還要填」的格子裡找——已經拿下的直接跳過 */
      const pending = activeIdxs.filter(i => i !== orderIdx && results[i] !== 'correct' && results[i] !== 'revealed');
      if (pending.length) {
        const nextIdx = pending[0];
        focusTimer.current = setTimeout(() => {
          inputRefs.current[nextIdx]?.focus();
          inputRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      } else {
        finishRound(orderIdx);
      }
    } else {
      const wc = (wrongCounts[orderIdx] ?? 0) + 1;
      setWrongCounts(prev => ({ ...prev, [orderIdx]: wc }));
      setResults(prev => ({ ...prev, [orderIdx]: 'wrong' }));
      setShakeIdx(orderIdx);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakeIdx(null), 500);
      if (wc >= 1) setTipsIdx(orderIdx);
    }
  }

  /* 看答案：先揭示正解並「停在這一格」，等使用者看完按下確認，才前進下一題。
     該語塊以「錯 ≥2」計入 SRS 降級（wrongCounts ≥ 2 → 明天再見）。 */
  function revealAnswer(orderIdx: number) {
    if (roundResolved) return;
    if (results[orderIdx] === 'correct' || results[orderIdx] === 'revealed') return;
    setAnswers(prev => ({ ...prev, [orderIdx]: chunks[orderIdx] ?? '' }));
    setResults(prev => ({ ...prev, [orderIdx]: 'revealed' }));
    setWrongCounts(prev => ({ ...prev, [orderIdx]: Math.max(2, prev[orderIdx] ?? 0) }));
    setTipsIdx(null);
    setShakeIdx(null);
    /* 停在這一格展示正解，不自動跳題——這是使用者明確要求的「中間步驟」 */
    setRevealHold(orderIdx);
  }

  /* 使用者確認看完正解後，才真的前進（找下一格，或本關結算） */
  function advanceAfterReveal(orderIdx: number) {
    setRevealHold(null);
    const pending = activeIdxs.filter(i => i !== orderIdx && results[i] !== 'correct' && results[i] !== 'revealed');
    if (pending.length) {
      const nextIdx = pending[0];
      focusTimer.current = setTimeout(() => {
        inputRefs.current[nextIdx]?.focus();
        inputRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 160);
    } else {
      finishRound(orderIdx);
    }
  }

  /* ── 闖關：一組 7 詞內的多輪收斂 ─────────────────────────────
     第 1 關全部填空；一次拿下的詞之後直接顯示，只留「沒拿下」的繼續填。
     passedIdx：這一關最後一格（已判定 correct 或 revealed，state 尚未刷新）。 */
  function finishRound(passedIdx: number) {
    const missed = activeIdxs.filter(i => i !== passedIdx && results[i] !== 'correct');
    if (missed.length === 0) {
      completeGroup(passedIdx, missedRef.current);
      return;
    }
    missed.forEach(i => { if (!missedRef.current.includes(i)) missedRef.current.push(i); });
    setRoundWrong(missed);
    setRoundResolved(true);
  }

  /* 進入下一關：把「沒拿下」的格子重新清空，已拿下的保持顯示 */
  function nextRound() {
    const missed = roundWrong.filter(i => results[i] !== 'correct');
    setRoundResolved(false);
    if (missed.length === 0) {
      completeGroup(activeIdxs[activeIdxs.length - 1] ?? 0, missedRef.current);
      return;
    }
    const last = activeIdxs[activeIdxs.length - 1] ?? 0;
    if (roundIdx + 1 >= MAX_ROUNDS) {
      /* 第三關仍未拿下：不再無限循環，直接收組並送 SRS 降級 */
      missed.forEach(i => { if (!missedRef.current.includes(i)) missedRef.current.push(i); });
      completeGroup(last, missedRef.current);
      return;
    }
    setRoundIdx(roundIdx + 1);
    setResults(prev => { const n = { ...prev }; missed.forEach(i => { n[i] = 'typing'; }); return n; });
    setAnswers(prev => { const n = { ...prev }; missed.forEach(i => { delete n[i]; }); return n; });
    setTipsIdx(null); setShakeIdx(null);
    const first = missed[0];
    focusTimer.current = setTimeout(() => {
      inputRefs.current[first]?.focus();
      inputRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 260);
  }

  /* 組完成：SRS 更新 + 配額推進 */
  function completeGroup(lastOrderIdx: number, extraWrong: number[] = []) {
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
    setDailyLog(log);

    // 艾賓浩斯（hawaii_word_mastery）：新學 Lv.0 · 明日複習；錯 ≥2（含「看答案」）降 1 級
    // 「全部次日複習」模式：每個完成的詞都排明天；「僅錯詞」模式：對的詞保留原節奏
    const nextMastery = { ...mastery };
    for (let k = 0; k < batchChunks.length; k++) {
      const chunk = batchChunks[k];
      const key = normTerm(chunk);
      if (!key) continue;
      const slot = activeIdxs[k];
      const wrong = Math.max(wrongCounts[slot] ?? 0, extraWrong.includes(slot) ? 2 : 0);
      const curE = nextMastery[key] ?? { level: 0, nextReviewDate: 0, word: chunk };
      let level = curE.level;
      let nextReviewDate = curE.nextReviewDate;
      if (wrong >= 2) {
        level = Math.max(0, level - 1);
        nextReviewDate = Date.now() + 86_400_000;
      } else if (srsMode === 'all' || curE.nextReviewDate <= Date.now()) {
        nextReviewDate = Date.now() + 86_400_000;
      }
      nextMastery[key] = { level, nextReviewDate, word: chunk };
    }
    setMastery(nextMastery);
    saveMastery(nextMastery);

    /* 章節進度：把「這一組通關了」記下來，目錄才回答得出「我練過哪些章節」 */
    const prog: LessonProgressMap = { ...lessonProgress };
    const prevP = prog[D.id] ?? { groups: [], total: batchCount, lastAt: 0 };
    const groups = prevP.groups.includes(batchIdx)
      ? prevP.groups
      : [...prevP.groups, batchIdx].sort((a, b) => a - b);
    prog[D.id] = {
      groups,
      total: batchCount,
      clearedAt: groups.length >= batchCount ? (prevP.clearedAt ?? Date.now()) : prevP.clearedAt,
      lastAt: Date.now(),
    };
    setLessonProgress(prog);
    saveLessonProgress(prog);

    const newDone = isNew ? doneRef.current + 1 : doneRef.current;
    doneRef.current = newDone;
    setDoneGroups(newDone);
    if (isNew) setSessionNewGroups(n => n + 1);

    /* 打卡與達標脫鉤：
       - 「打卡」只要求今天有練（≥1 組）就成立 → 連勝機制對輕度使用者也要活著，
         否則預設配額 12 組等於把打卡頁與連勝全部鎖死。
       - 「達標」是額外的金色成就，跨過配額的那一組單獨喊一次。 */
    const prevDone = isNew ? newDone - 1 : newDone;
    const reachedQuotaNow = isNew && prevDone < quotaRef.current && newDone >= quotaRef.current;
    let justCheckedIn = false;
    if (newDone >= 1 && !isCompletedToday) {
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
      justCheckedIn = true;
    }
    /* 橫幅優先序：今日達標 > 今日打卡 > 一般通關 */
    const justHitQuota = justCheckedIn ? newDone >= quotaRef.current : reachedQuotaNow;

    if (batchIdx < batchCount - 1) {
      setRoundBanner(
        justHitQuota
          ? '今日目標達成 · 連勝 +1 · 繼續練'
          : justCheckedIn
            ? '今日已打卡 · 連勝 +1 · 繼續練'
            : batchIdx === 0
              ? '前半段通關！進度 +1 組'
              : `第 ${batchIdx + 1} 組通關！進度 +1 組`,
      );
      bannerTimer.current = setTimeout(() => {
        setRoundBanner(null);
        setBatchIdx(batchIdx + 1);
        /* 換新的一組：關卡從第 1 關重新開始 */
        setRoundIdx(0); setRoundWrong([]); setRoundResolved(false);
        missedRef.current = [];
      }, justCheckedIn || justHitQuota ? 1600 : 1000);
    } else {
      // 全篇通關：底部出現「聽全文 / 下一篇」傳送帶（打卡按鈕一直都有，不再綁達標）
      setCompleted(true);
      setRoundResolved(false);
      setRoundBanner(
        justHitQuota ? '本篇通關！今日目標達成' : justCheckedIn ? '本篇通關！今日已打卡' : '本篇通關！',
      );
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

  function openTodayCard() {
    setSideView('none');
    exitDrill();
  }

  /* 打卡頁分享：優先用系統分享面板（手機），不支援就複製文字到剪貼簿。
     這顆按鈕以前是死的（只有圖示沒有 onClick），這裡把它接上。 */
  async function shareToday() {
    const entry = dailyLog[todayStr];
    const headline = quotaReached ? '今日目標達成' : '今日已打卡';
    const text = [
      'HAWAII · 雅思口語每日特刊',
      `${stateBadge.en} · 連續 ${streakCount} 天`,
      `${headline} · ${doneGroups}/${quota} 組 · ${entry?.chunks.length ?? 0} 個語塊`,
      `全站已練 ${clearedGroupsAll}/${totalGroupsAll} 組`,
    ].join('\n');
    const title = `HAWAII · 連續 ${streakCount} 天`;
    const flash = (msg: string) => {
      setShareFlash(msg);
      setTimeout(() => setShareFlash(null), 2000);
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        /* 使用者按取消不算失敗，也不該退回剪貼簿 */
        if ((err as DOMException | undefined)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${text}`);
      flash('已複製成績到剪貼簿');
    } catch {
      flash('這個瀏覽器不支援分享，請直接截圖');
    }
  }

  /* 從搜索結果跳到那一篇：展開範文、標出命中詞、捲到範文位置 */
  function goToSearchResult(index: number, term: string) {
    exitDrill();                 // 確保離開默寫狀態（不動 inputRefs，避免 render 期寫 ref）
    setLessonIdx(index);
    setSideView('none');
    setShowEssay(true);
    setHighlight({ lessonIdx: index, term });
    setTimeout(() => {
      document.querySelector('[data-essay-anchor]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 280);
  }

  /* 開啟一輪複習：把當下到期數快照下來，這輪的進度條才有分母 */
  function startReview() {
    setSideView('review');
    setReviewActive(true);
    setReviewInput('');
    setReviewWrong(0);
    setReviewTotal(dueEntries.length);
    setReviewPromoted(0);
    setReviewDemoted(0);
    setReviewFlash(null);
    setReviewPeek(false);
    setReviewSkipped([]);
    setTimeout(() => reviewInputRef.current?.focus(), 300);
  }

  /* 複習即時回饋：升到幾級、下次幾天後再見 */
  function flashReview(msg: string) {
    setReviewFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setReviewFlash(null), 1500);
  }

  /* 跳過：不升不降，只把這詞挪到本輪最後；仍在「待複習」，下次進來還會遇到 */
  function skipReviewWord(key: string) {
    setReviewSkipped(prev => (prev.includes(key) ? prev : [...prev, key]));
    setReviewInput('');
    setReviewWrong(0);
    setReviewPeek(false);
    setReviewRevealed(false);
    flashReview('已跳過 · 稍後再練');
    setTimeout(() => reviewInputRef.current?.focus(), 80);
  }

  /* ★兩步揭曉（第一步）：把正解當場填進輸入框、念出來，但停在原地不跳題。
     這裡刻意「不做」promote／demote：揭曉只是看一眼，升降級留給使用者自己決定
     （按 Enter 前進＝明天再見，或答對才會升級）。 */
  function revealReviewAnswer(target: string) {
    setReviewInput(target);
    setReviewWrong(0);
    setReviewRevealed(true);
    playIceClink();
    playSpeech(target, false, 'review-reveal');
    setTimeout(() => reviewInputRef.current?.focus(), 40);
  }

  /* ★兩步揭曉（第二步）：看清楚了才前進——排入明天複習、收起揭曉態、換下一題 */
  function advanceReview(key: string) {
    demoteWord(key);
    setReviewDemoted(n => n + 1);
    flashReview('明天再見 · 這個詞已排入明日複習');
    setReviewInput('');
    setReviewWrong(0);
    setReviewPeek(false);
    setReviewRevealed(false);
    setTimeout(() => reviewInputRef.current?.focus(), 80);
  }

  /* 偏好即時落盤：改動當下就寫入 localStorage，關掉抽屜不會丟 */
  function persistPrefs(next: Partial<Prefs>) {
    const merged: Prefs = { quota, accent, srsMode, ...next };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  }

  /* 傳送帶：按當前月份目錄推進到下一課（(當前索引+1) % 當月課數），自動續跑原位默寫 */
  function goToNextLessonInMonth() {
    const month = D.month || '未分組';
    const idxs = monthGroups.find(g => g.month === month)?.items.map(it => it.gi) ?? [];
    const pos = idxs.indexOf(lessonIdx);
    const next = idxs.length ? idxs[(pos + 1) % idxs.length] : (lessonIdx + 1) % lessons.length;
    setLessonIdx(next);
    setSideView('none');
    exitDrill();
    setTimeout(() => startDrill(), 80);
  }

  return (
    <>
      <style>{inlineStyles}</style>
      <div className="flex h-screen w-full overflow-hidden bg-[#F7F8FC]">
        {/* ---------- 朗讀降級提示（只有找不到英語語音時才會浮出來） ---------- */}
        {ttsNotice && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-[#EAEDF5] bg-white/95 px-4 py-2 text-[12px] font-medium text-[#6B7691] shadow-[0_10px_30px_-12px_rgba(10,15,31,0.35)] backdrop-blur">
            {ttsNotice}
          </div>
        )}
        {/* ---------- 左側可折疊工具欄 ---------- */}
        <aside
          className={
            'flex h-full flex-col justify-between border-r border-[#EAEDF5] bg-white/75 p-4 backdrop-blur-xl transition-all duration-300 ' +
            (isSidebarOpen ? 'w-64' : 'w-16')
          }
        >
          {/* 中段可滾動區：logo + 導航 + 特刊目錄，超高時出現細捲軸，底部用戶欄固定不被推走 */}
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
            <div className={'mb-5 flex items-center ' + (isSidebarOpen ? 'justify-between' : 'justify-center')}>
              {isSidebarOpen && (
                <div className="flex items-center gap-2.5">
                  <img src="/logo.png" alt="Hawaii" width={30} height={30} className="rounded-[9px] shadow-[0_6px_14px_-6px_rgba(0,149,255,0.6)]" />
                  <div className="leading-none">
                    <p className="text-[13px] font-black tracking-[-0.03em] text-[#0A0F1F]">HAWAII</p>
                    <p className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#A8B0C2]">IELTS Studio</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSidebarOpen(!isSidebarOpen)}
                aria-label={isSidebarOpen ? '收起側邊欄' : '展開側邊欄'}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#98A2B8] transition-colors hover:bg-[#EFF7FF] hover:text-[#5A6478]"
              >
                <PanelIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* 操作按鈕清單（定案 5 鍵） */}
            <nav className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setSideView('search')}
                title="搜索 (Cmd+K)"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ' +
                  (sideView === 'search'
                    ? 'bg-[#0095FF] text-white shadow-[0_10px_24px_-10px_rgba(0,149,255,0.85)]'
                    : 'text-[#6B7691] hover:bg-[#EDF7FF] hover:text-[#0095FF]') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <SearchIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && (
                  <>
                    <span>搜索</span>
                    <kbd
                      className={
                        'ml-auto rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold ' +
                        (sideView === 'search'
                          ? 'bg-white/20 text-white/85'
                          : 'border border-[#E4E8F2] bg-white text-[#98A2B8]')
                      }
                    >
                      ⌘K
                    </kbd>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={openTodayCard}
                title="學習"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ' +
                  (sideView === 'none'
                    ? 'bg-[#0095FF] text-white shadow-[0_10px_24px_-10px_rgba(0,149,255,0.85)]'
                    : 'text-[#6B7691] hover:bg-[#EDF7FF] hover:text-[#0095FF]') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <BookIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && <span>學習</span>}
              </button>
              <button
                type="button"
                onClick={startReview}
                title="複習"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ' +
                  (sideView === 'review'
                    ? 'bg-[#0095FF] text-white shadow-[0_10px_24px_-10px_rgba(0,149,255,0.85)]'
                    : 'text-[#6B7691] hover:bg-[#EDF7FF] hover:text-[#0095FF]') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <ZapIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && (
                  <>
                    <span>複習</span>
                    {dueCount > 0 && (
                      <span
                        className={
                          'ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-extrabold ' +
                          (sideView === 'review' ? 'bg-white text-[#0095FF]' : 'bg-[#0095FF] text-white')
                        }
                      >
                        {dueCount}
                      </span>
                    )}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSideView('vault')}
                title="詞庫"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ' +
                  (sideView === 'vault'
                    ? 'bg-[#0095FF] text-white shadow-[0_10px_24px_-10px_rgba(0,149,255,0.85)]'
                    : 'text-[#6B7691] hover:bg-[#EDF7FF] hover:text-[#0095FF]') +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-[13px] leading-none">✦</span>
                {isSidebarOpen && <span>詞庫</span>}
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="設置"
                className={
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-[#6B7691] transition-all duration-200 hover:bg-[#EDF7FF] hover:text-[#0095FF] ' +
                  (isSidebarOpen ? '' : ' justify-center')
                }
              >
                <GearIcon className="h-4 w-4 shrink-0" />
                {isSidebarOpen && <span>設置</span>}
              </button>
            </nav>

            {/* B2：收合時「全站通關／續練起點」不能整塊消失——這裡留一條極簡版，
                展開只是為了看目錄細節，不是為了「才看得到進度」。 */}
            {!isSidebarOpen && (
              <div className="mt-6 flex flex-col items-center gap-2.5">
                <div
                  title={`全站通關 ${clearedCount}/${lessons.length} 篇 · 已練 ${clearedGroupsAll}/${totalGroupsAll} 組`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(#0095FF ${overallPct * 3.6}deg, #E4E8F2 0deg)` }}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white font-mono text-[8px] font-black text-[#0095FF]">
                    {overallPct}%
                  </span>
                </div>
                <span className="font-mono text-[8px] font-black uppercase tracking-[0.06em] text-[#98A2B8]">
                  {clearedCount}/{lessons.length}篇
                </span>
                <button
                  type="button"
                  onClick={() => { setSideView('none'); startDrill(); }}
                  title={`續練 · 從第 ${nextTodoGroup + 1} 組開始`}
                  aria-label={`續練，從第 ${nextTodoGroup + 1} 組開始`}
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-[#0095FF] text-white shadow-[0_8px_18px_-10px_rgba(0,149,255,0.9)] transition-all hover:bg-[#0085E5]"
                >
                  <ZapIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  title="展開側邊欄 · 特刊目錄 / 續練起點 / 篩選"
                  className="cursor-pointer font-mono text-[8px] font-black uppercase tracking-[0.08em] text-[#98A2B8] transition-colors hover:text-[#0095FF]"
                >
                  目錄
                </button>
              </div>
            )}

            {/* 特刊目錄：通關總覽 → 年份 → 月份分組（可折疊）→ 課程狀態 */}
            {isSidebarOpen && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setYearOpen(!yearOpen)}
                  className="mb-2 flex w-full cursor-pointer items-center justify-between px-1"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#98A2B8]">{year ? `${year} 特刊目錄` : '特刊目錄'}</p>
                  <ChevronIcon direction={yearOpen ? 'up' : 'down'} className="h-3 w-3 text-[#98A2B8]" />
                </button>
                {yearOpen && catalogMonthGroups.length === 0 && (
                  <p className="px-1.5 py-3 text-[11px] font-semibold text-[#A8B0C2]">還沒有可練習的篇章。</p>
                )}
                {yearOpen && catalogMonthGroups.map(g => (
                  <div key={g.month} className="mb-1.5">
                    <button
                      type="button"
                      onClick={() => setOpenMonths(prev => ({ ...prev, [g.month]: !(prev[g.month] ?? true) }))}
                      className={
                        'flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-[11px] font-extrabold transition-colors duration-200 hover:bg-[#EFF7FF] ' +
                        ((openMonths[g.month] ?? true) ? 'text-[#3D4658]' : 'text-[#6B7691]')
                      }
                    >
                      <ChevronIcon direction={(openMonths[g.month] ?? true) ? 'down' : 'right'} className="h-3 w-3 shrink-0 text-[#98A2B8]" />
                      {g.month}特刊
                      <span className="ml-auto font-mono text-[9px] font-bold text-[#C4CBDC]">
                        <span className={g.done > 0 ? 'text-[#0095FF]' : ''}>{g.done}</span>/{g.total}
                      </span>
                    </button>
                    {(openMonths[g.month] ?? true) && (
                      <div className="mt-0.5 flex flex-col gap-0.5 pl-3">
                        {g.items.map(({ L, gi }) => {
                          const s = catalogStats[L.id] ?? { total: 1, done: 0, cleared: false, next: 0 };
                          const active = gi === lessonIdx;
                          return (
                            <button
                              key={L.id}
                              type="button"
                              onClick={() => { setLessonIdx(gi); exitDrill(); setSelectedChunk(null); setSideView('none'); }}
                              title={
                                s.cleared
                                  ? '已全篇通關 · 可再跑一次'
                                  : s.done > 0
                                    ? `已通關 ${s.done}/${s.total} 組 · 續練從第 ${s.next + 1} 組開始`
                                    : '還沒練過'
                              }
                              className={
                                'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all duration-200 ' +
                                (active
                                  ? 'bg-[#EDF7FF] text-[#0085E5] ring-1 ring-[#B5DEFF]'
                                  : 'text-[#6B7691] hover:bg-[#EFF7FF]')
                              }
                            >
                              <span className={'font-mono text-[10px] ' + (active ? 'text-[#0095FF]' : 'text-[#C4CBDC]')}>{String(gi + 1).padStart(2, '0')}</span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate">{lessonTitleOf(L, gi)}</span>
                                {/* 分層：進行中的篇章直接說出續練起點，不必點進去才知道練到哪 */}
                                {!s.cleared && s.done > 0 && (
                                  <span className="mt-0.5 truncate font-mono text-[9px] font-bold tracking-[0.06em] text-[#8FCBFF]">
                                    續練起點 · 第 {s.next + 1} 組
                                  </span>
                                )}
                              </span>
                              {s.cleared ? (
                                <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-[#0095FF] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                                  <CheckIcon className="h-2.5 w-2.5" />
                                  已通關
                                </span>
                              ) : s.done > 0 ? (
                                <span className="ml-auto shrink-0 rounded-md bg-[#EDF7FF] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#0095FF]">
                                  {s.done}/{s.total}
                                </span>
                              ) : (
                                <span className="ml-auto shrink-0 rounded-md border border-[#E4E8F2] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#C4CBDC]">
                                  未練
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部用戶欄 */}
          <div className={'flex shrink-0 items-center gap-2.5 border-t border-[#EAEDF5] pt-3.5 ' + (isSidebarOpen ? '' : 'justify-center')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0095FF] to-[#5BB8FF] font-mono text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(0,149,255,0.9)]">
              L
            </span>
            {isSidebarOpen && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[#0A0F1F]">
                  Lin <span className="font-medium text-[#A8B0C2]">雅思衝刺 7.5</span>
                </p>
                <span className="mt-1 inline-block rounded-md bg-[#EDF7FF] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#0095FF]">
                  Pro
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- 右側主卡片練習區 ---------- */}
        <main className="scrollbar-none h-full flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5 md:px-8">
            {/* 頂部識別列：品牌字標 + 日期 + 護照戳 */}
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {!isSidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="展開側邊欄"
                    className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-[#E7EAF3] bg-white text-[#98A2B8] transition-colors hover:border-[#8FCBFF] hover:text-[#0095FF]"
                  >
                    <PanelIcon className="h-4 w-4" />
                  </button>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-black leading-none tracking-[-0.04em] text-[#0A0F1F]">HAWAII</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0095FF]" />
                  </div>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">
                    雅思口語 · 每日特刊
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <span className="hidden font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#98A2B8] sm:inline">
                  {MONTHS_EN[now.getMonth()]} {String(now.getDate()).padStart(2, '0')} · 週{weekDays[now.getDay()]}
                </span>
                {/* 每日美國 50 州文化印章 · 打卡頁入口
                    打卡頁是「紀錄頁」（月曆／里程碑／今日練過），任何時候都該進得去，
                    不再用 disabled 把它鎖在配額後面。 */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCurrentStage('streak_celebration')}
                    title={
                      quotaReached
                        ? '今日目標達成 · 查看打卡記錄'
                        : isCompletedToday
                          ? '今日已打卡 · 查看打卡記錄'
                          : '查看打卡記錄（今天還沒練）'
                    }
                    className={
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200/60 bg-stone-100/80 px-3 py-1 text-xs font-medium text-stone-700 backdrop-blur-sm transition-all duration-200 ' +
                      (quotaReached
                        ? 'hover:border-[#0095FF]/40 hover:text-[#0095FF]'
                        : isCompletedToday
                          ? 'hover:border-emerald-300 hover:text-emerald-700'
                          : 'hover:border-stone-300 hover:text-stone-900')
                    }
                  >
                    <StarIcon className="h-3.5 w-3.5" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]">{stateBadge.en}</span>
                  </button>
                  {isCompletedToday && (
                    <span
                      className={
                        'animate-hi-pop pointer-events-none absolute -right-1 -top-1 grid h-4 w-4 rotate-12 place-items-center rounded-full ring-2 ring-white ' +
                        (quotaReached ? 'bg-[#0095FF] text-white' : 'bg-emerald-500 text-white')
                      }
                    >
                      <CheckIcon className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 主卡片：只有「學習」視圖佔用它，其餘視圖各自獨佔 */}
            <div className="mx-auto w-full max-w-2xl rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm transition-all md:p-8">
              {currentStage === 'resting' && sideView === 'none' && (
                <div key="resting" className="animate-hi-fade-up">
                  {/* ── 畫廊純白題面：克萊因藍僅用於進度高光／主按鈕／選中標記 ── */}
                  <section className="animate-hi-rise relative">

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                        IELTS Speaking · {MONTHS_EN[now.getMonth()]} {String(now.getDate()).padStart(2, '0')}
                      </span>
                      <span className="shrink-0 rounded-full border border-stone-200/70 bg-stone-100 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.08em] text-stone-600">
                        {doneGroups} / {quota} 組
                      </span>
                    </div>

                    <h1 className={'font-serif font-medium tracking-[-0.01em] text-stone-900 ' + (isDrillMode ? 'mt-3 text-[17px] leading-snug' : 'mt-4 text-2xl leading-snug md:text-3xl')}>
                      {D.questionEn || D.questionCn}
                      <button
                        type="button"
                        onClick={() => speakerClick(D.questionEn || D.questionCn, 'q')}
                        onDoubleClick={() => speakerDouble(D.questionEn || D.questionCn, 'q')}
                        aria-label="朗讀題目（雙擊慢速）"
                        title="單擊朗讀 · 雙擊慢速"
                        className="ml-2.5 inline-grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-stone-200/70 bg-stone-100 align-middle text-stone-500 transition-colors hover:bg-stone-200"
                      >
                        <SpeakerIcon className={'h-4 w-4 ' + (speakingKey === 'q' ? 'animate-pulse text-[#0095FF]' : 'text-stone-500')} />
                      </button>
                    </h1>

                    {!isDrillMode && D.questionEn && D.questionCn && (
                      <>
                        <span className="mt-4 block h-px w-10 bg-stone-200" />
                        <p className="mt-2 text-sm leading-relaxed text-stone-500">{D.questionCn}</p>
                      </>
                    )}

                    {/* 今日目標（配額）＋ 連勝 */}
                    <div
                      className={'flex items-center gap-3 ' + (isDrillMode ? 'mt-4' : 'mt-6')}
                      title={`今日目標 ${donePct}%`}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={quota}
                      aria-valuenow={doneGroups}
                    >
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200/60 bg-stone-100/80 px-2.5 py-1.5">
                        <FlameIcon className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-mono text-[11px] font-bold tracking-tight text-stone-700">連續 {streakCount} 天</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-stone-400">
                          今日目標 {doneGroups}/{quota} 組
                        </span>
                        <span className="flex items-center gap-1">
                          {Array.from({ length: Math.max(quota, doneGroups) }, (_, i) => (
                            <span
                              key={i}
                              className={
                                'h-1.5 flex-1 rounded-full transition-all duration-500 ' +
                                (i < doneGroups ? 'bg-[#0095FF]' : 'bg-stone-200')
                              }
                            />
                          ))}
                        </span>
                      </span>
                    </div>

                    {/* 本篇進度：練過哪幾組、還剩幾組（跟上面的「今日目標」是兩把不同的尺） */}
                    {!isDrillMode && (
                      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-stone-200/60 bg-stone-50 px-3.5 py-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-stone-200/70 bg-white font-mono text-[11px] font-black text-[#0095FF]">
                          {lessonDoneGroups}/{batchCount}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-stone-600">
                            {lessonCleared
                              ? '本篇已全通關 · 隨時可以再跑一次'
                              : `本篇進度 · 已通關 ${lessonDoneGroups} 組，續練從第 ${nextTodoGroup + 1} 組開始`}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1">
                            {Array.from({ length: batchCount }, (_, i) => (
                              <span
                                key={i}
                                title={`第 ${i + 1} 組${curLessonProgress?.groups.includes(i) ? '（已通關）' : ''}`}
                                className={'h-1.5 flex-1 rounded-full transition-all duration-500 ' + (curLessonProgress?.groups.includes(i) ? 'bg-[#0095FF]' : 'bg-stone-200')}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 重點語塊 */}
                  <div className="mt-7">
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">重點語塊</p>
                      <span className="font-mono text-[10px] font-bold text-[#C4CBDC]">{String(chunks.length).padStart(2, '0')}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(isTagsExpanded ? chunks : chunks.slice(0, 4)).map((chunk, i) => (
                        <button
                          key={chunk}
                          type="button"
                          onClick={() => handlePillClick(chunk)}
                          className={
                            'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-all duration-200 ' +
                            (selectedChunk === chunk
                              ? 'border-[#0095FF] bg-[#0095FF] text-white shadow-[0_12px_26px_-12px_rgba(0,149,255,0.95)]'
                              : 'border-[#E4E8F2] bg-white text-[#0A0F1F] hover:-translate-y-0.5 hover:border-[#8FCBFF] hover:shadow-[0_10px_22px_-14px_rgba(0,149,255,0.75)]')
                          }
                        >
                          <span
                            className={
                              'font-mono text-[10px] font-bold tracking-wider ' +
                              (selectedChunk === chunk ? 'text-white/70' : 'text-[#98A2B8]')
                            }
                          >
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          {chunk}
                        </button>
                      ))}
                      {chunks.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                          className="cursor-pointer rounded-xl border border-dashed border-[#C4CBDC] px-3 py-2 text-[12px] font-bold text-[#6B7691] transition-colors duration-200 hover:border-[#8FCBFF] hover:text-[#0095FF]"
                        >
                          {isTagsExpanded ? '收起 ▴' : `+ 全部 ${chunks.length} 個 ▾`}
                        </button>
                      )}
                    </div>
                    {selectedChunk && (() => {
                      const def = D.vocab.find(v => isBoundSmall(normTerm(selectedChunk), normTerm(v.lemma)));
                      return (
                        <div className="animate-hi-fade-up mt-3 rounded-2xl border border-[#D8EEFF] bg-[#F2FAFF] p-4">
                          <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#0085E5]">
                            {selectedChunk}
                            {def?.category && (
                              <span className="rounded-md bg-[#D8EEFF] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#0095FF]">
                                {def.category}
                              </span>
                            )}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#5A6478]">
                            <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-[#0095FF]" />
                            {def ? (def.tip ? `精髓：${def.tip} · ${displayDef(def)}` : def.definition) : '本課暫無釋義記錄'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {!isDrillMode && (
                    <>
                      <button type="button" onClick={startDrill} className={btnGreen + ' mt-7'}>
                        <ZapIcon className="h-4 w-4" />
                        {lessonCleared
                          ? '再跑一次 3 分鐘原位默寫'
                          : lessonDoneGroups > 0
                            ? `續練 · 從第 ${nextTodoGroup + 1} 組開始`
                            : '開始 3 分鐘原位默寫'}
                        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </button>
                      <p className="mt-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#A8B0C2]">
                        共 {batchCount} 組 · 7 詞一組 · Enter 判定 · 一組最多 3 關
                      </p>

                      {/* 範文開關：靜止狀態也要能讀範文，不然「看範文」根本不存在 */}
                      <button
                        type="button"
                        onClick={() => setShowEssay(!showEssay)}
                        aria-expanded={showEssay}
                        className="mt-4 flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#EAEDF5] bg-white px-4 py-3.5 text-left transition-all duration-200 hover:border-[#8FCBFF] hover:shadow-[0_12px_26px_-18px_rgba(0,149,255,0.9)]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#EDF7FF] text-[#0095FF]">
                            <BookIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-extrabold text-[#0A0F1F]">{showEssay ? '收起範文' : '看範文全文'}</span>
                            <span className="mt-0.5 block font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#A8B0C2]">
                              {chunks.length} 個重點語塊已標色
                            </span>
                          </span>
                        </span>
                        <ChevronIcon direction={showEssay ? 'up' : 'down'} className="h-4 w-4 shrink-0 text-[#98A2B8]" />
                      </button>
                    </>
                  )}

                  {/* 範文手風琴（原位摳空發生在這裡，絕不刷新） */}
                  <div
                    data-essay-anchor
                    className={'grid scroll-mt-5 transition-all duration-500 ease-in-out ' + (essayOpen ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
                    aria-hidden={!essayOpen}
                  >
                    {/* ★修正（2026-09-23）：展開時不可再 overflow-hidden，否則釋義氣泡（absolute top-full）
                        會被這個容器硬切掉下半部與左右緣。收合時仍需要它讓 grid-rows-[0fr] 正確塌陷。 */}
                    <div className={essayOpen ? '' : 'overflow-hidden'}>
                      <div
                        className={
                          'rounded-[18px] border p-5 transition-all duration-700 ' +
                          (isDrillMode
                            ? 'border-[#C9E7FF] bg-white shadow-[0_2px_20px_-12px_rgba(0,149,255,0.4)]'
                            : 'border-[#EAEDF5] bg-[#FAFBFE]')
                        }
                      >
                        {isDrillMode && (
                          <div className="mb-4">
                            {/* 三層定位：篇章 › 第幾組 › 第幾關 */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                                <span className="max-w-[8.5rem] truncate text-[#A8B0C2]">{lessonTitle}</span>
                                <span className="shrink-0 text-[#C4CBDC]">›</span>
                                <span className="shrink-0 text-[#0095FF]">第 {batchIdx + 1}/{batchCount} 組</span>
                                <span className="shrink-0 text-[#C4CBDC]">›</span>
                                <span className="shrink-0 rounded-md bg-[#EDF7FF] px-1.5 py-0.5 text-[#0095FF]">第 {roundIdx + 1} 關</span>
                              </div>
                              <button
                                type="button"
                                onClick={exitDrill}
                                aria-label="退出默寫"
                                className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-[#A8B0C2] transition-colors duration-200 hover:bg-[#EFF7FF] hover:text-[#0095FF]"
                              >
                                <CloseIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {/* 本組格子狀態點陣 + 本關待填數 */}
                            {roundBanner ? (
                              <p className="mt-2.5 rounded-lg bg-[#EDF7FF] px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#0095FF]">
                                {roundBanner}
                              </p>
                            ) : (
                              <div className="mt-2.5 flex items-center gap-2.5">
                                <div className="flex flex-1 items-center gap-1">
                                  {activeIdxs.map(i => {
                                    const st = results[i];
                                    return (
                                      <span
                                        key={i}
                                        title={st === 'correct' ? '已拿下' : st === 'revealed' ? '看過答案' : st === 'wrong' ? '寫錯' : '待填'}
                                        className={
                                          'h-1.5 flex-1 rounded-full transition-all duration-300 ' +
                                          (st === 'correct'
                                            ? 'bg-[#0095FF]'
                                            : st === 'revealed'
                                              ? 'bg-[#F5B942]'
                                              : st === 'wrong'
                                                ? 'bg-[#E5484D]/55'
                                                : 'bg-[#E4E8F2]')
                                        }
                                      />
                                    );
                                  })}
                                </div>
                                <span className="shrink-0 font-mono text-[10px] font-bold text-[#6B7691]">
                                  {roundResolved ? '本關已結束' : `本關 ${editableIdxs.length} 格待填`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 關卡結算：這一關走完，只留沒拿下的進下一關 */}
                        {isDrillMode && roundResolved && !completed && (
                          <div className="animate-hi-fade-up mb-4 rounded-2xl border border-[#C9E7FF] bg-gradient-to-br from-[#F2FAFF] to-[#EDF7FF] p-4">
                            <div className="flex items-start gap-2.5">
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0095FF] font-mono text-[11px] font-black text-white">
                                {roundIdx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-black text-[#0085E5]">第 {roundIdx + 1} 關完成</p>
                                <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A94AC]">
                                  {roundIdx === 0
                                    ? `一次拿下 ${groupSolvedCount} 個 · 要再練 ${roundWrong.length} 個`
                                    : `累計拿下 ${groupSolvedCount}/${activeIdxs.length} · 還要再練 ${roundWrong.length} 個`}
                                </p>
                              </div>
                            </div>
                            {/* 下一關的填空範圍預覽：只露首字母，不劇透拼法 */}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {roundWrong.map(i => {
                                const w = chunks[i] ?? '';
                                const head = w.charAt(0);
                                return (
                                  <span
                                    key={i}
                                    className="rounded-lg border border-dashed border-[#C4CBDC] bg-white px-2 py-1 font-mono text-[11px] font-bold tracking-[0.08em] text-[#6B7691]"
                                  >
                                    {head}
                                    <span className="text-[#C4CBDC]">{'·'.repeat(Math.max(1, Math.min(8, w.length - 1)))}</span>
                                  </span>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={nextRound}
                              className="group mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0095FF] px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_12px_26px_-12px_rgba(0,149,255,0.95)] transition-all duration-200 hover:bg-[#0085E5]"
                            >
                              {roundIdx + 1 >= MAX_ROUNDS ? (
                                <>收下這一組 · 這幾個明天再見</>
                              ) : (
                                <>
                                  進入第 {roundIdx + 2} 關
                                  <span className="font-mono text-[10px] font-bold text-white/70">只填 {roundWrong.length} 格</span>
                                </>
                              )}
                              <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {/* 搜索命中提示：告訴使用者為什麼這一段被標黃 */}
                        {!isDrillMode && activeHighlight && (
                          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-[#FFFDF3] px-3 py-2">
                            <p className="min-w-0 truncate text-[11px] font-bold text-[#8A6A00]">
                              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#FFC800] align-middle" aria-hidden="true" />
                              命中「{activeHighlight}」
                            </p>
                            <button
                              type="button"
                              onClick={() => setHighlight(null)}
                              className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#A88A3C] transition-colors duration-200 hover:bg-[#FFF3D6]"
                            >
                              清除 ✕
                            </button>
                          </div>
                        )}
                        {/* 英文文章（自然段落文本流：段落內文字、標點與輸入框同行連續排布） */}
                        <div className={'english-article space-y-4 transition-all duration-500 ' + (isDrillMode && !completed && !roundResolved ? 'opacity-65' : '')}>
                          {passageParas.map((para, pi) => (
                            <p key={pi} className="mb-4 font-serif text-[15px] leading-[2.1] text-[#0A0F1F]">
                              {para.segs.map(({ seg, fi }) => renderSegment(seg, fi))}
                              {!isDrillMode && para.text && (
                                <button
                                  type="button"
                                  onClick={() => speakerClick(para.text, 'p' + pi)}
                                  onDoubleClick={() => speakerDouble(para.text, 'p' + pi)}
                                  aria-label="朗讀本段（雙擊慢速）"
                                  title="單擊朗讀 · 雙擊慢速"
                                  className={
                                    'ml-1 inline-grid h-6 w-6 cursor-pointer place-items-center rounded-full align-baseline transition-colors duration-200 ' +
                                    (speakingKey === 'p' + pi ? 'text-[#0095FF] animate-pulse' : 'text-[#C4CBDC] hover:text-[#6B7691]')
                                  }
                                >
                                  <SpeakerIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </p>
                          ))}
                        </div>

                        {/* 中英分區：空一行 + 極淡分割線 + 小標題 */}
                        {D.cnSegments && D.cnSegments.length > 0 && (
                          <div className="my-8 pt-6 border-t border-[#EAEDF5]">
                            <span className="mb-3 block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8B0C2]">中文翻譯</span>
                          </div>
                        )}

                        {/* 中文翻譯（自然段落 + 行內綠色高亮加粗，不做填空） */}
                        {D.cnSegments && D.cnSegments.length > 0 && (
                          <div className={'chinese-translation space-y-3 transition-all duration-500 ' + (isDrillMode && !completed ? 'opacity-65' : '')}>
                            {cnParaGroups.map((para, ci) => (
                              <p key={ci} className="mb-3 text-sm leading-[2] text-[#5A6478]">
                                {para.segs.map(({ seg, ti }) =>
                                  isPunctGarbage(seg.text) ? null : seg.bold ? (
                                    <span key={ti} className="mx-0.5 rounded-md bg-[#EDF7FF] px-1.5 py-0.5 font-bold text-[#0085E5]">{seg.text}</span>
                                  ) : (
                                    <span key={ti}>{seg.text}</span>
                                  ),
                                )}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {isDrillMode && completed && (
                    <div className="hi-grain animate-hi-pop relative mt-6 overflow-hidden rounded-[20px] bg-[#0095FF] px-6 py-8 text-center shadow-[0_26px_54px_-26px_rgba(0,149,255,0.9)]">
                      <span className="pointer-events-none absolute -right-14 -top-16 -z-10 h-44 w-44 rounded-full bg-[#5BB8FF]/40 blur-3xl" />
                      <span className="pointer-events-none absolute -bottom-20 -left-10 -z-10 h-40 w-40 rounded-full bg-[#0085E5]/35 blur-3xl" />
                      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                        <CheckIcon className="h-6 w-6" />
                      </span>
                      <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-white/60">Lesson Cleared</p>
                      <p className="mt-2 text-[26px] font-black leading-tight tracking-[-0.025em] text-white">本篇通關</p>
                      <p className="mt-2 text-[13px] font-medium text-white/65">
                        {sessionNewGroups > 0 ? `已掌握全部高分語塊 · 今日進度 +${sessionNewGroups} 組` : '已掌握全部高分語塊 · 複習不重複計入進度'}
                      </p>
                      <div className="mt-6 grid grid-cols-3 gap-2">
                        {([
                          ['本篇語塊', String(chunks.length)],
                          ['本篇組數', String(batchCount)],
                          ['全站通關 · 篇', `${clearedCount}/${lessons.length}`],
                        ] as const).map(([k, v]) => (
                          <div key={k} className="rounded-2xl bg-white/12 px-2.5 py-3 backdrop-blur-sm">
                            <p className="font-mono text-[17px] font-black leading-none tracking-tight text-white">{v}</p>
                            <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">{k}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={toggleReadAloud}
                          className={
                            'flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition-all active:scale-[0.985] ' +
                            (readingAloud
                              ? 'bg-white text-[#0095FF]'
                              : 'bg-white/15 text-white backdrop-blur-sm hover:bg-white/25')
                          }
                        >
                          <SpeakerIcon className="h-4 w-4" />
                          {readingAloud ? '播放中' : '聽全文'}
                        </button>
                        <button
                          type="button"
                          onClick={goToNextLessonInMonth}
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-extrabold text-[#0095FF] transition-all hover:bg-[#EDF7FF] active:scale-[0.985]"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                          下一篇
                        </button>
                      </div>
                      {/* 打卡按鈕不再綁達標：只要今天有練就給。達標時才換成金色。 */}
                      <button
                        type="button"
                        onClick={() => setCurrentStage('streak_celebration')}
                        className={
                          'mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition-all active:scale-[0.985] ' +
                          (quotaReached
                            ? 'bg-[#FFC800] text-[#6B4E00] shadow-[0_14px_30px_-14px_rgba(255,200,0,0.95)] hover:bg-[#F2BC00]'
                            : 'bg-white/15 text-white backdrop-blur-sm hover:bg-white/25')
                        }
                      >
                        <FlameIcon className="h-4 w-4" />
                        {quotaReached ? '今日目標達成 · 去打卡' : '去打卡 · 看今日紀錄'}
                      </button>
                    </div>
                  )}
                </div>
              )}

          {/* ---------- 全局檢索視圖 ---------- */}
          {currentStage === 'resting' && sideView === 'search' && (
            <div key="search" className="animate-hi-fade-up">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">搜索全庫</p>
                <span className="font-mono text-[10px] font-bold text-[#C4CBDC]">
                  {searchQuery.trim() ? String(searchResults.length).padStart(2, '0') : String(lessons.length).padStart(2, '0')}
                </span>
              </div>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8B0C2]" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="檢索題目、範文、語塊…"
                  aria-label="全局檢索"
                  autoFocus
                  className="w-full rounded-2xl border border-[#E4E8F2] bg-white py-3 pl-11 pr-4 text-sm font-semibold text-[#0A0F1F] outline-none transition-all placeholder:font-medium placeholder:text-[#A8B0C2] focus:border-[#0095FF] focus:ring-4 focus:ring-[#0095FF]/10"
                />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {searchResults.length ? searchResults.map((r, i) => (
                  <button
                    key={r.index}
                    type="button"
                    onClick={() => goToSearchResult(r.index, searchQuery.trim())}
                    className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-[#EAEDF5] bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8FCBFF] hover:shadow-[0_12px_26px_-18px_rgba(0,149,255,0.9)]"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-[#C4CBDC] transition-colors group-hover:text-[#0095FF]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#98A2B8]">
                        {lessonTitleOf(lessons[r.index] ?? lessons[0], r.index)}
                      </span>
                      <span className="mt-1 block truncate text-[14px] font-bold text-[#0A0F1F]">{r.snippet}</span>
                    </span>
                    <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-[#D2D8E6] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#0095FF]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                )) : (
                  <p className="rounded-2xl border border-dashed border-[#E4E8F2] bg-white/60 px-4 py-6 text-center text-xs font-semibold text-[#A8B0C2]">
                    {searchQuery.trim() ? '沒有匹配的內容，換個關鍵詞試試' : '輸入關鍵詞，檢索全部特刊'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------- 極速複習視圖（單卡 · 原句摳空 · 自動推進） ---------- */}
          {currentStage === 'resting' && sideView === 'review' && (() => {
            const cur = reviewQueue[0];
            const ctx = cur ? findWordContext(cur.key) : null;
            const finished = reviewActive && !cur;
            /* 這一輪的進度：分母是開始時的到期數快照，分子是已清掉的（跳過的不算清掉） */
            const reviewDone = reviewTotal > 0 ? Math.min(reviewTotal, reviewTotal - dueEntries.length) : 0;
            const curDays = cur ? (cur.level >= 1 ? MASTERY_INTERVALS[cur.level - 1] : 1) : 1;
            const nextLevel = cur ? Math.min(4, cur.level + 1) : 0;
            const nextDays = nextLevel >= 1 ? MASTERY_INTERVALS[nextLevel - 1] : 1;
            return (
              <div key="review" className="animate-hi-fade-up">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">
                    <span>極速複習 · 剩 {reviewQueue.length} 個</span>
                    {reviewSkipped.length > 0 && (
                      <span className="rounded-full bg-[#EEF1F8] px-2 py-0.5 text-[9px] tracking-[0.1em] text-[#6B7691]">
                        已跳過 {reviewSkipped.length}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSideView('none'); setReviewActive(false); }}
                    title="結束本輪 · 已升級／降級的進度都會保留"
                    className="cursor-pointer rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8B0C2] transition-colors hover:bg-[#EDF7FF] hover:text-[#0095FF]"
                  >
                    結束 ✕
                  </button>
                </div>

                {/* 本輪進度：一根 3px 平滑軌道（原本 N 顆 flex-1 方塊在到期數多時會糊成一片） */}
                {reviewTotal > 0 && !finished && (
                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-stone-200">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-[#0095FF] transition-all duration-500"
                        style={{ width: `${Math.round((reviewDone / Math.max(1, reviewTotal)) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[10px] font-medium text-stone-500">{reviewDone}/{reviewTotal}</span>
                  </div>
                )}

                {finished && (
                  <div className="animate-hi-pop mt-6 rounded-[18px] border border-[#C9E7FF] bg-[#F2FAFF] px-6 py-8 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#0095FF] text-white shadow-[0_14px_28px_-12px_rgba(0,149,255,0.9)]">
                      <CheckIcon className="h-6 w-6" />
                    </span>
                    <p className="mt-4 text-lg font-black tracking-tight text-[#0A0F1F]">本輪複習完成</p>
                    <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#98A2B8]">
                      {reviewSkipped.length > 0 ? `已跳過 ${reviewSkipped.length} 個 · 仍留在待複習` : '全部到期語塊已清空'}
                    </p>
                    {/* B1：清空之後要說得出下一步，不能只說「完成」 */}
                    <p className="mx-auto mt-3 max-w-[280px] rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold leading-5 text-[#0085E5]">
                      {dueTomorrowCount > 0
                        ? `明天有 ${dueTomorrowCount} 個詞到期 · 記得回來`
                        : nextDueInDays == null
                          ? '目前沒有排定複習 · 先去練新的一組'
                          : `下一批在 ${nextDueInDays} 天後 · 明天沒有到期的詞`}
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2.5">
                      <div className="rounded-2xl border border-[#D8EEFF] bg-white px-3 py-3">
                        <p className="font-mono text-[18px] font-black leading-none text-[#0095FF]">{reviewPromoted}</p>
                        <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#98A2B8]">升級成功</p>
                      </div>
                      <div className="rounded-2xl border border-[#FFE7A3] bg-[#FFFDF3] px-3 py-3">
                        <p className="font-mono text-[18px] font-black leading-none text-[#8A6A00]">{reviewDemoted}</p>
                        <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#A88A3C]">明天再見</p>
                      </div>
                    </div>
                    {reviewSkipped.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setReviewSkipped([]); setTimeout(() => reviewInputRef.current?.focus(), 80); }}
                        className="mt-4 w-full cursor-pointer rounded-2xl border border-[#C9E7FF] bg-white py-3 text-[13px] font-extrabold text-[#0095FF] transition-all hover:border-[#8FCBFF]"
                      >
                        再練一次跳過的 {reviewSkipped.length} 個
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openTodayCard}
                      className="mt-4 w-full cursor-pointer rounded-2xl bg-[#0095FF] py-3 text-[13px] font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(0,149,255,0.95)] transition-all hover:bg-[#0085E5]"
                    >
                      回到今日練習
                    </button>
                  </div>
                )}
                {!finished && (!cur || !ctx) && (
                  <p className="mt-6 rounded-2xl border border-dashed border-[#E4E8F2] bg-white/60 px-4 py-6 text-center text-xs font-semibold text-[#A8B0C2]">
                    目前沒有待複習的語塊，繼續保持！
                  </p>
                )}
                {cur && ctx && (
                  <div className="mt-4 rounded-[18px] border border-[#C9E7FF] bg-white p-5 shadow-[0_2px_20px_-12px_rgba(0,149,255,0.4)]">
                    {/* 這一張卡的層級：記憶狀態（白話）+ 下次間隔 */}
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-end gap-0.5">
                          {[0, 1, 2, 3, 4].map(i => (
                            <span
                              key={i}
                              className={'rounded-full transition-all duration-300 ' + (i <= cur.level ? 'bg-[#0095FF] ' + (i === 4 ? 'h-4 w-1.5' : 'h-3 w-1.5') : 'h-3 w-1.5 bg-stone-200')}
                            />
                          ))}
                        </span>
                        <span className="text-[11px] font-medium text-[#0085E5]">{memoryLabel(cur.level)}</span>
                        {cur.level >= 4 && (
                          <span className="rounded-md bg-[#FFC800] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#6B4E00]">MASTERED</span>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-stone-400">Enter 判定</span>
                    </div>

                    {/* 來源：這詞是哪一篇哪一組的 */}
                    <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#A8B0C2]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0095FF]" />
                      來自 {ctx.lessonTitle} · 第 {ctx.groupIdx + 1} 組
                    </p>

                    <p className="font-serif text-[15px] leading-[2.2] text-[#0A0F1F]">
                      {ctx.prefix}{' '}
                      <input
                        ref={reviewInputRef}
                        value={reviewInput}
                        onChange={e => { setReviewInput(e.target.value); }}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          /* 已揭曉：這一按是「記住了，下一題」，直接前進 */
                          if (reviewRevealed) { advanceReview(cur.key); return; }
                          const norm = (x: string) => x.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
                          if (norm(reviewInput) === norm(ctx.chunk)) {
                            playIceClink();
                            promoteWord(cur.key);
                            setReviewPromoted(n => n + 1);
                            flashReview(nextLevel >= 4 ? '已掌握 · 60 天後再見' : `${memoryLabel(nextLevel)} · 下次 ${nextDays} 天後`);
                            setReviewInput(''); setReviewWrong(0); setReviewPeek(false);
                            setTimeout(() => reviewInputRef.current?.focus(), 60);
                          } else {
                            setReviewWrong(w => w + 1);
                            setReviewShake(true);
                            setTimeout(() => setReviewShake(false), 500);
                          }
                        }}
                        readOnly={reviewRevealed}
                        autoFocus
                        aria-label="複習填空"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        style={{ width: `${Math.max(6, ctx.chunk.length + 2)}ch` }}
                        className={
                          'mx-0.5 inline-block rounded-lg border-b-2 px-1.5 py-0.5 text-center font-serif text-[15px] align-baseline -translate-y-[1px] outline-none transition-all duration-200 ' +
                          (reviewRevealed
                            ? 'border-amber-500 bg-amber-50 font-bold text-amber-800'
                            : reviewShake
                              ? 'animate-hi-shake border-[#EA2B2B] bg-[#FFF1F1] text-[#B91C1C]'
                              : 'border-[#B5DEFF] bg-[#F2FAFF] text-[#0085E5] focus:border-[#0095FF] focus:bg-white')
                        }
                      />
                      {' '}{ctx.suffix}
                    </p>

                    {/* 答對的即時回饋：升到幾級、下次幾天後 */}
                    {reviewFlash && (
                      <p className="animate-hi-fade-up mt-3 rounded-xl bg-[#EDF7FF] px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#0095FF]">
                        {reviewFlash}
                      </p>
                    )}

                    {/* B3：提示與跳過不必先答錯才有；看答案也不再需要「故意寫錯」才解鎖 */}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewPeek(p => !p)}
                        aria-expanded={reviewPeek}
                        className="flex-1 cursor-pointer rounded-xl border border-[#EAEDF5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#6B7691] transition-all hover:border-[#8FCBFF] hover:text-[#0095FF]"
                      >
                        {reviewPeek ? '收起提示' : '顯示提示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => skipReviewWord(cur.key)}
                        className="flex-1 cursor-pointer rounded-xl border border-[#EAEDF5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#6B7691] transition-all hover:border-[#8FCBFF] hover:text-[#0095FF]"
                      >
                        跳過 ➔
                      </button>
                    </div>

                    {(reviewWrong >= 1 || reviewPeek) && (
                      <div className="animate-hi-fade-up mt-4 rounded-2xl border border-amber-200/80 bg-[#FBF9F5] p-4 text-sm text-stone-700">
                        {ctx.tip && (
                          <p className="text-sm font-medium text-stone-700">
                            <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-amber-600" />
                            精髓：{ctx.tip}
                          </p>
                        )}
                        {ctx.definition && (
                          <p className="mt-1.5 text-sm leading-6 text-stone-600">
                            {displayDef({ definition: ctx.definition, tip: ctx.tip })}
                          </p>
                        )}
                        {!reviewRevealed && (
                          <button
                            type="button"
                            onClick={() => revealReviewAnswer(ctx.chunk)}
                            className="mt-3 w-full cursor-pointer rounded-xl border border-amber-200/80 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-[#0095FF] hover:text-[#0095FF]"
                          >
                            看答案 · 先看一眼再決定 ➔
                          </button>
                        )}
                      </div>
                    )}

                    {/* ★兩步揭曉（第二步）：揭曉後才出現的確認前進鍵，不按就不走 */}
                    {reviewRevealed && (
                      <button
                        type="button"
                        onClick={() => advanceReview(cur.key)}
                        className="animate-hi-fade-up mt-3 w-full cursor-pointer rounded-2xl bg-[#0095FF] px-4 py-3 text-sm font-bold text-white shadow-sm shadow-[#0095FF]/30 transition-colors hover:bg-[#0085E5] active:scale-[0.985]"
                      >
                        記住了，下一題 ➔ (按 Enter)
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ---------- 詞庫視圖（全語塊字典 · 可搜尋 · Mastered 高光卡） ---------- */}
          {currentStage === 'resting' && sideView === 'vault' && (() => {
            const all = Object.entries(mastery)
              .map(([key, e]) => ({ key, level: e.level, nextReviewDate: e.nextReviewDate, word: e.word ?? key }))
              .sort((a, b) => b.level - a.level || a.word.localeCompare(b.word));
            const q = vaultQuery.trim().toLowerCase();
            const byLevel = all.filter(x => {
              if (vaultLevel === 'due') return x.nextReviewDate <= nowMs;
              if (vaultLevel === 'mastered') return x.level >= 4;
              if (vaultLevel === 'learning') return x.level < 4 && x.nextReviewDate > nowMs;
              return true;
            });
            const list = q ? byLevel.filter(x => x.word.toLowerCase().includes(q)) : byLevel;
            const masteredCount = all.filter(x => x.level >= 4).length;
            const dueTotal = all.filter(x => x.nextReviewDate <= nowMs).length;
            return (
              <div key="vault" className="animate-hi-fade-up">
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">詞庫</p>
                  <span className="font-mono text-[10px] font-bold text-[#C4CBDC]">{String(all.length).padStart(2, '0')}</span>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {([['總收錄', all.length], ['已掌握', masteredCount], ['待複習', dueTotal]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-2xl border border-[#EAEDF5] bg-white px-3 py-2.5">
                      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#A8B0C2]">{k}</p>
                      <p className="mt-1 text-xl font-black leading-none tracking-tight text-[#0A0F1F]">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-3 flex gap-1.5">
                  {([
                    ['all', '全部', all.length],
                    ['due', '待複習', dueTotal],
                    ['learning', '熟練中', all.filter(x => x.level < 4 && x.nextReviewDate > nowMs).length],
                    ['mastered', '已精通', masteredCount],
                  ] as const).map(([k, label, n]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setVaultLevel(k)}
                      className={
                        'flex-1 cursor-pointer rounded-xl px-1.5 py-2 text-[10px] font-extrabold transition-all duration-200 ' +
                        (vaultLevel === k
                          ? 'bg-[#0095FF] text-white shadow-[0_8px_18px_-10px_rgba(0,149,255,0.9)]'
                          : 'border border-[#EAEDF5] bg-white text-[#6B7691] hover:border-[#8FCBFF] hover:text-[#0095FF]')
                      }
                    >
                      {label}
                      <span className={'ml-1 font-mono text-[9px] ' + (vaultLevel === k ? 'text-white/70' : 'text-[#C4CBDC]')}>{n}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8B0C2]" />
                  <input
                    value={vaultQuery}
                    onChange={e => setVaultQuery(e.target.value)}
                    placeholder="搜尋語塊…"
                    aria-label="搜尋詞庫"
                    className="w-full rounded-2xl border border-[#E4E8F2] bg-white py-3 pl-11 pr-4 text-sm font-semibold text-[#0A0F1F] outline-none transition-all placeholder:font-medium placeholder:text-[#A8B0C2] focus:border-[#0095FF] focus:ring-4 focus:ring-[#0095FF]/10"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2.5">
                  {list.length ? list.map(({ key, level, nextReviewDate, word }) => {
                    const ctx = findWordContext(key);
                    const mastered = level >= 4;
                    const due = nextReviewDate <= nowMs;
                    return (
                      <div key={key} className={'rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 ' + (mastered ? 'border-[#FFC800]/50 bg-[#FFFDF3]' : 'border-[#EAEDF5] bg-white hover:border-[#8FCBFF] hover:shadow-[0_12px_26px_-18px_rgba(0,149,255,0.9)]')}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-extrabold text-[#0A0F1F]">
                            {mastered && <span className="mr-1 text-[#D9A400]">✦</span>}{word}
                          </p>
                          <span className="flex shrink-0 items-center gap-1" title={`記憶狀態：${memoryLabel(level)}`} aria-label={`記憶狀態：${memoryLabel(level)}`}>
                            {[0, 1, 2, 3].map(l => (
                              <span
                                key={l}
                                className={'h-1 w-2 rounded-full transition-colors duration-300 ' + (l < level ? (mastered ? 'bg-[#D9A400]' : 'bg-[#0095FF]') : 'bg-stone-200')}
                              />
                            ))}
                          </span>
                          <button
                            type="button"
                            onClick={() => playSpeech(word, false, 'v:' + key)}
                            onDoubleClick={() => playSpeech(word, true, 'v:' + key)}
                            aria-label={`朗讀 ${word}（雙擊慢速）`}
                            className={
                              'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:text-[#0095FF] ' +
                              (mastered ? 'bg-white ' : 'bg-[#F2FAFF] ') +
                              (speakingKey === 'v:' + key ? 'text-[#0095FF] animate-pulse' : 'text-[#6B7691]')
                            }
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 5 6.5 8.5H3v7h3.5L11 19V5z" />
                              <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />
                              <path d="M17.5 7a7 7 0 0 1 0 10" />
                            </svg>
                          </button>
                        </div>
                        {ctx?.tip && <p className="mt-2 text-[11px] font-bold text-[#0095FF]">精髓：{ctx.tip}</p>}
                        {ctx?.definition && <p className="mt-1 text-xs leading-5 text-[#5A6478]">{displayDef({ definition: ctx.definition, tip: ctx.tip ?? '' })}</p>}
                        {ctx && ctx.prefix && (
                          <p className={'mt-2.5 border-t border-dashed pt-2.5 font-serif text-[12px] leading-6 text-[#6B7691] ' + (mastered ? 'border-[#FFC800]/40' : 'border-[#E4E8F2]')}>
                            {ctx.prefix}{' '}
                            <mark className={'rounded px-1 font-semibold ' + (mastered ? 'bg-[#FFC800]/25 text-[#8A6A00]' : 'bg-[#EDF7FF] text-[#0085E5]')}>
                              {ctx.chunk}
                            </mark>{' '}
                            {ctx.suffix}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <p className={'min-w-0 truncate font-mono text-[9px] font-medium uppercase tracking-[0.14em] ' + (mastered ? 'text-[#C79A00]' : 'text-[#A8B0C2]')}>
                            {mastered
                              ? '已掌握 · 金色鋼印 · 60 天後再回流'
                              : due
                                ? `${memoryLabel(level)} · 今日待複習`
                                : `${memoryLabel(level)} · 下次 ${new Date(nextReviewDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`}
                          </p>
                          {ctx && (
                            <button
                              type="button"
                              onClick={() => { setLessonIdx(ctx.lessonIdx); exitDrill(); setSelectedChunk(null); setSideView('none'); }}
                              title="回到這一篇"
                              className="shrink-0 cursor-pointer rounded-md bg-[#F5F7FC] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#6B7691] transition-colors duration-200 hover:bg-[#EDF7FF] hover:text-[#0095FF]"
                            >
                              {ctx.lessonTitle} · 第 {ctx.groupIdx + 1} 組
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="rounded-2xl border border-dashed border-[#E4E8F2] bg-white/60 px-4 py-6 text-center text-xs font-semibold text-[#A8B0C2]">
                      {q ? '沒有符合的語塊，換個關鍵詞試試' : '詞庫還空著——完成一次默寫就會開始累積'}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

            </div>
          </div>
        </main>

        {/* ---------- 學習偏好抽屜 ---------- */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-40 bg-stone-900/40" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
        )}
        <aside
          className={
            'fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto border-l border-[#EAEDF5] bg-white p-6 shadow-2xl transition-transform duration-300 ' +
            (isSettingsOpen ? 'translate-x-0' : 'translate-x-full')
          }
          aria-hidden={!isSettingsOpen}
        >
          <div className="mb-7 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#98A2B8]">Settings</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-[#0A0F1F]">學習偏好</h2>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="關閉設置"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-[#98A2B8] transition-colors hover:bg-[#EFF7FF] hover:text-[#0095FF]"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <section className="mb-7">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8B0C2]">每日配額</p>
            <div className="grid grid-cols-3 gap-2">
              {([6, 12, 24] as const).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuota(q); quotaRef.current = q; persistPrefs({ quota: q }); }}
                  className={
                    'cursor-pointer rounded-2xl border px-2 py-3 text-center transition-all duration-200 ' +
                    (quota === q
                      ? 'border-[#0095FF] bg-[#0095FF] text-white shadow-[0_14px_28px_-14px_rgba(0,149,255,0.95)]'
                      : 'border-[#E4E8F2] bg-white text-[#0A0F1F] hover:-translate-y-0.5 hover:border-[#8FCBFF]')
                  }
                >
                  <span className="block text-[22px] font-black leading-none tracking-tight">{q}</span>
                  <span className={'mt-1.5 block font-mono text-[9px] font-bold uppercase tracking-[0.12em] ' + (quota === q ? 'text-white/70' : 'text-[#A8B0C2]')}>
                    組 / 天
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-center text-[11px] font-semibold leading-5 text-[#A8B0C2]">
              {quota === 6 ? '輕鬆 · 約 3 篇長文 · 42 詞' : quota === 12 ? '標準 · 約 6 篇長文 · 84 詞' : '衝刺 · 約 12 篇長文 · 168 詞'}
            </p>
          </section>

          <section className="mb-7">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8B0C2]">發音類型</p>
            <div className="flex rounded-2xl border border-[#E4E8F2] bg-white p-1">
              {([['UK', '英式'], ['US', '美式']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setAccent(v); persistPrefs({ accent: v }); }}
                  className={
                    'flex-1 cursor-pointer rounded-xl px-3 py-2.5 text-xs font-extrabold transition-all duration-200 ' +
                    (accent === v
                      ? 'bg-[#0095FF] text-white shadow-[0_10px_22px_-12px_rgba(0,149,255,0.9)]'
                      : 'text-[#6B7691] hover:text-[#0095FF]')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-center text-[11px] font-semibold leading-5 text-[#A8B0C2]">
              {accent === 'UK' ? '英式發音 · 雅思考官偏好' : '美式發音 · 通用口音'}
            </p>
          </section>

          <section className="mb-7">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#A8B0C2]">複習策略</p>
            <div className="flex flex-col gap-2">
              {([
                ['all', '全部次日複習', '所有語塊隔天回流一次'],
                ['wrong', '僅錯詞次日複習', '動態艾賓浩斯，只補你不熟的'],
              ] as const).map(([v, label, desc]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setSrsMode(v); persistPrefs({ srsMode: v }); }}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ' +
                    (srsMode === v ? 'border-[#0095FF] bg-[#F2FAFF]' : 'border-[#E4E8F2] bg-white hover:border-[#8FCBFF]')
                  }
                >
                  <span className={'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ' + (srsMode === v ? 'border-[#0095FF] bg-[#0095FF] text-white' : 'border-[#D2D8E6]')}>
                    {srsMode === v && <CheckIcon className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={'block text-[13px] font-extrabold ' + (srsMode === v ? 'text-[#0085E5]' : 'text-[#0A0F1F]')}>{label}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-[#98A2B8]">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="rounded-2xl border border-[#E4E8F2] bg-[#FAFBFE] px-4 py-3">
            <p className="text-[11px] font-semibold leading-5 text-[#6B7691]">
              <CheckIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-[#0095FF]" />
              以上改動即時儲存，關掉抽屜也保留。
            </p>
          </div>
          <button
            type="button"
            onClick={() => { quotaRef.current = quota; setSettingsOpen(false); }}
            className={btnGreen + ' mt-3'}
          >
            完成
          </button>
        </aside>

        {/* ---------- 打卡結算：畫廊級克萊因藍 · 90% 純白 + 10% 強調 ---------- */}
        {currentStage === 'streak_celebration' && (
          <div className="animate-hi-fade-up fixed inset-0 z-50 overflow-y-auto bg-[#F7F8FC]">
            <div className="mx-auto w-full max-w-md overflow-hidden bg-white md:my-8 md:rounded-[34px] md:shadow-[0_24px_60px_-32px_rgba(10,15,31,0.28)]">
              {/* Hero：單一電光克萊因藍，全頁唯一的藍色錨點（10% 強調色） */}
              <div
                className="hi-grain relative overflow-hidden px-7 pb-14 pt-6"
                style={{ background: 'linear-gradient(160deg,#0085E5 0%,#0095FF 100%)' }}
              >

                <div className="relative flex items-center justify-between">
                  <button
                    type="button"
                    onClick={backToHome}
                    aria-label="關閉"
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={shareToday}
                    aria-label="分享今日成績"
                    title="分享今日成績"
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
                  >
                    <ShareIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative mt-8 text-center text-white">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-white/60">
                    {stateBadge.en} · Current Streak
                  </p>
                  <div className="mt-3 flex items-end justify-center gap-2.5">
                    <span className="text-[92px] font-bold leading-[0.8] tracking-[-0.06em] drop-shadow-[0_4px_16px_rgba(0,10,40,0.22)]">{streakCount}</span>
                    <span className="pb-3.5 text-base font-semibold tracking-tight text-white/80">天</span>
                  </div>
                  {/* 今日狀態：把「打卡」與「達標」兩件事在這一頁講清楚 */}
                  <p className="mt-4 text-[13px] font-medium text-white/70">
                    {doneGroups === 0
                      ? '今天還沒開始 · 練 1 組就算打卡'
                      : quotaReached
                        ? '今日目標達成，節奏正在成形'
                        : `今日已打卡 · ${doneGroups}/${quota} 組 · 再 ${quota - doneGroups} 組達標`}
                  </p>
                </div>

                <div className="relative mt-7 flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3.5 backdrop-blur-md">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0095FF]">
                    <StarIcon className="h-4 w-4" />
                  </span>
                  <p className="text-[12px] font-medium leading-5 text-white/90">
                    {daysToGold > 0 ? `再 ${daysToGold} 天，解鎖 30 天金色成就` : '30 天成就已到手'}
                  </p>
                </div>

                <svg className="absolute inset-x-0 -bottom-px h-8 w-full" viewBox="0 0 400 32" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 32V18C64 6 138 1 200 1s136 5 200 17v14z" fill="#ffffff" />
                </svg>
              </div>

              <div className="px-6 pb-7 pt-2 md:px-7">
                {/* 月份切換 */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="上一個月"
                    onClick={() => { const m = viewMonth - 1; if (m < 1) { setViewMonth(12); setViewYear(viewYear - 1); } else setViewMonth(m); }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[#6B7691] transition-colors hover:bg-[#EDF7FF] hover:text-[#0095FF]"
                  >
                    <ChevronIcon direction="left" className="h-4 w-4" />
                  </button>
                  <span className="text-[15px] font-black tracking-tight text-[#0A0F1F]">{viewYear} 年 {viewMonth} 月</span>
                  <button
                    type="button"
                    aria-label="下一個月"
                    onClick={() => { const m = viewMonth + 1; if (m > 12) { setViewMonth(1); setViewYear(viewYear + 1); } else setViewMonth(m); }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[#6B7691] transition-colors hover:bg-[#EDF7FF] hover:text-[#0095FF]"
                  >
                    <ChevronIcon direction="right" className="h-4 w-4" />
                  </button>
                </div>

                {/* 圖例：降噪到兩態——● 已打卡 / ○ 待打卡 */}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-stone-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#0095FF]" aria-hidden="true" />
                    已打卡
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full border border-stone-300 bg-white" aria-hidden="true" />
                    待打卡
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] tracking-wider text-stone-400">
                    點日期看當天紀錄
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-7 gap-y-2.5 text-center">
                  {weekDays.map(d => (
                    <span key={d} className="text-[11px] font-extrabold text-[#98A2B8]">{d}</span>
                  ))}
                  {Array.from({ length: firstWeekdayOfView }).map((_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonthOfView }).map((_, i) => {
                    const day = i + 1;
                    const cellDate = new Date(viewYear, viewMonth - 1, day);
                    const cellKey = dayKey(cellDate);
                    const cellTime = cellDate.getTime();
                    const isToday = cellDate.toDateString() === now.toDateString();
                    const isLogged = (dailyLog[cellKey]?.groups ?? 0) > 0;
                    const done = isLogged || (isToday && isCompletedToday);
                    const isMissed = !done && !isToday && cellTime < startOfToday;
                    const daysFromToday = Math.round((cellTime - startOfToday) / 86_400_000);
                    const showMilestone = nextMilestone !== null && daysFromToday === nextMilestone - streakCount;
                    return (
                      <div
                        key={day}
                        className={
                          'relative flex items-center justify-center rounded-full transition-colors duration-200 ' +
                          (cellKey === (selectedDayKey || todayStr) ? 'bg-[#EAF6FF]' : '')
                        }
                      >
                        {showMilestone && (
                          <span className="absolute -top-1 h-1 w-1 rounded-full bg-[#0095FF]" aria-hidden="true" />
                        )}
                        {/* B4：日曆每一格都可以點——dailyLog 已經有當天的組數與語塊，不該只當裝飾 */}
                        <button
                          type="button"
                          onClick={() => setSelectedDayKey(cellKey)}
                          aria-pressed={cellKey === (selectedDayKey || todayStr)}
                          aria-label={`${viewMonth} 月 ${day} 日${done ? '，已打卡' : isMissed ? '，漏打卡' : isToday ? '，今天' : ''}，看當天紀錄`}
                          title={
                            (dailyLog[cellKey]?.groups ?? 0) > 0
                              ? `${viewMonth}/${day} · ${dailyLog[cellKey].groups} 組 · ${dailyLog[cellKey].chunks.length} 詞`
                              : `${viewMonth}/${day} · 沒有紀錄`
                          }
                          className={
                            'grid cursor-pointer place-items-center rounded-full transition-colors duration-200 ' +
                            (isToday
                              ? done
                                ? 'h-9 w-9 bg-[#0095FF] text-sm font-bold text-white shadow-sm shadow-[#0095FF]/30'
                                : 'h-9 w-9 border border-[#0095FF] bg-white text-sm font-bold text-[#0095FF]'
                              : done
                                ? 'h-8 w-8 bg-[#0095FF] text-xs font-bold text-white'
                                : 'h-9 w-9 text-sm font-normal text-stone-300 hover:bg-[#EAF6FF]')
                          }
                        >
                          {day}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* B4/B5：月曆點哪天就看哪天——打卡頁是「結算」的地方，
                    要說得出「這天練了哪些篇章、哪些組、哪些詞」，不能只有三個數字 */}
                {(() => {
                  const dayKeySel = selectedDayKey || todayStr;
                  const isTodaySel = dayKeySel === todayStr;
                  const [, selM, selD] = dayKeySel.split('-');
                  const selLabel = isTodaySel ? '今日練過' : `${selM} 月 ${selD} 日練過`;
                  const entry = dailyLog[dayKeySel];
                  if (!entry || entry.groups === 0) {
                    /* 今天還沒練就整塊不出現（維持原本乾淨版面）；點到沒紀錄的日子則明說 */
                    if (isTodaySel) return null;
                    return (
                      <div className="mt-7 rounded-2xl border border-dashed border-stone-200 bg-white p-4">
                        <p className="text-xs font-medium tracking-wider text-stone-500">{selLabel}</p>
                        <p className="mt-2 text-[11px] font-normal text-stone-400">這天沒有練過任何組。</p>
                      </div>
                    );
                  }
                  /* counted 的鍵是 `${lessonIdx}:${batchIdx}`，按篇章歸組 */
                  const perLesson = new Map<number, number[]>();
                  for (const k of entry.counted ?? []) {
                    const [liStr, biStr] = String(k).split(':');
                    const li = Number(liStr);
                    const bi = Number(biStr);
                    if (!Number.isInteger(li) || !Number.isInteger(bi)) continue;
                    if (!lessons[li]) continue;
                    if (!perLesson.has(li)) perLesson.set(li, []);
                    perLesson.get(li)!.push(bi);
                  }
                  /* 舊資料沒有 counted：退回用今日語塊反推篇章 */
                  if (perLesson.size === 0) {
                    lessons.forEach((L, li) => {
                      if (L.targetChunks.some(c => entry.chunks.includes(c))) perLesson.set(li, []);
                    });
                  }
                  if (perLesson.size === 0) return null;
                  const rows = [...perLesson.entries()].sort((a, b) => b[1].length - a[1].length);
                  return (
                    <div className="mt-7 rounded-2xl border border-stone-200/60 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium tracking-wider text-stone-500">
                          {selLabel} · {rows.length} 篇 · {entry.groups} 組 · {entry.chunks.length} 詞
                        </p>
                        {!isTodaySel && (
                          <button
                            type="button"
                            onClick={() => setSelectedDayKey('')}
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-medium tracking-wider text-[#0095FF] transition-colors hover:border-[#0095FF]"
                          >
                            回到今天
                          </button>
                        )}
                      </div>
                      <div className="mt-3.5 flex flex-col gap-3">
                        {rows.map(([li, batches]) => {
                          const L = lessons[li];
                          const total = Math.max(1, Math.ceil(L.targetChunks.length / GROUP_SIZE));
                          const cleared = Math.min(lessonProgress[L.id]?.groups.length ?? 0, total);
                          const full = cleared >= total;
                          return (
                            <div key={li}>
                              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1">
                                <span className="shrink-0 font-mono text-[11px] font-medium text-[#0095FF]">
                                  {String(li + 1).padStart(2, '0')}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#0A0F1F]">{lessonTitleOf(L, li)}</span>
                                {full ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#0095FF]">
                                    已通關
                                    <CheckIcon className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="shrink-0 font-mono text-[11px] font-normal text-stone-400">{cleared}/{total} 組</span>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1">
                                {Array.from({ length: total }, (_, i) => {
                                  const done = lessonProgress[L.id]?.groups.includes(i);
                                  const today = batches.includes(i);
                                  return (
                                    <span
                                      key={i}
                                      title={`第 ${i + 1} 組${done ? '（已通關）' : today ? '（今天練的）' : ''}`}
                                      className={'h-1.5 flex-1 rounded-full transition-colors duration-500 ' + (done ? 'bg-[#0095FF]' : today ? 'bg-[#7FC4FF]' : 'bg-stone-200')}
                                    />
                                  );
                                })}
                              </div>
                              {/* B5：只有「N 篇 · N 組 · N 詞」不夠——把這天真的練過的詞列出來 */}
                              {(() => {
                                const words = L.targetChunks.filter(c => entry.chunks.includes(c));
                                if (words.length === 0) return null;
                                return (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {words.map(c => (
                                      <span
                                        key={c}
                                        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:border-[#0095FF] hover:text-[#0095FF]"
                                      >
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 里程碑軌道 */}
                <div className="mt-7 rounded-2xl border border-stone-200/60 bg-white p-4">
                  <p className="text-xs font-medium tracking-wider text-stone-500">里程碑</p>
                  <div className="mt-3.5 flex items-center">
                    {milestoneNodes.map((m, i) => {
                      const reached = streakCount >= m;
                      return (
                        <Fragment key={m}>
                          {i > 0 && (
                            <span className={'h-[3px] flex-1 rounded-full transition-colors duration-500 ' + (reached ? 'bg-[#0095FF]' : 'bg-stone-200')} />
                          )}
                          <span
                            className={
                              'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors duration-500 ' +
                              (reached ? 'bg-[#0095FF] text-white' : 'bg-white text-stone-400 ring-1 ring-stone-200')
                            }
                          >
                            {m}
                          </span>
                        </Fragment>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs font-normal text-stone-500">
                    {nextMilestone ? `距離第 ${nextMilestone} 天還差 ${nextMilestone - streakCount} 天` : '全部里程碑都已走完'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={backToHome}
                  className="mt-6 w-full cursor-pointer rounded-2xl bg-[#0095FF] py-4 text-sm font-bold text-white shadow-sm shadow-[#0095FF]/30 transition-colors hover:bg-[#0085E5] active:scale-[0.985]"
                >
                  收下這一天，回到卡片
                </button>
              </div>
            </div>

            {/* 分享回饋：固定在視窗底部的短提示 */}
            {shareFlash && (
              <div
                role="status"
                className="animate-hi-fade-up pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-[#0A0F1F]/90 px-4 py-2 font-mono text-[11px] font-bold tracking-[0.08em] text-white shadow-[0_16px_34px_-14px_rgba(10,15,31,0.9)] backdrop-blur-sm"
              >
                {shareFlash}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  /* ---------- 範文片段渲染（原位摳空核心，絕不重繪整篇） ---------- */
  /* EN token 渲染：全程 inline 流（text / blank / highlight），嚴禁塊級包裹——標點緊貼單詞與輸入框 */
  function renderSegment(seg: PassageSegment, segIdx: number) {
    if (isPunctGarbage(seg.text)) return null; // 純標點碎片直接丟棄
    if (!seg.bold) {
      /* 搜索命中詞高亮（只在非默寫狀態、且這一篇就是命中篇時生效） */
      const term = isDrillMode ? null : activeHighlight;
      if (term) {
        const at = seg.text.toLowerCase().indexOf(term.toLowerCase());
        if (at >= 0) {
          return (
            <span key={segIdx}>
              {tidyEn(seg.text.slice(0, at))}
              <mark className="rounded bg-[#FFE7A3] px-0.5 font-semibold text-[#8A6A00]">{seg.text.slice(at, at + term.length)}</mark>
              {tidyEn(seg.text.slice(at + term.length))}
            </span>
          );
        }
      }
      return <span key={segIdx}>{tidyEn(seg.text)}</span>;
    }
    if (isPunctGarbage(seg.text)) return null;
    // 該加粗塊的語塊序號（首次出現才有輸入框，重複出現渲染為標籤）
    const orderIdx = chunkOrder(segIdx);
    const isBlank = isDrillMode && batchIdx * GROUP_SIZE <= orderIdx && orderIdx < (batchIdx + 1) * GROUP_SIZE;
    const solved = results[orderIdx] === 'correct';
    const revealed = results[orderIdx] === 'revealed';
    if (isDrillMode && orderIdx >= 0 && (isBlank || solved || revealed)) {
      if (solved) {
        return (
          <span key={segIdx} className="inline-block rounded-md bg-[#E1F2FF] px-1.5 py-0.5 font-bold text-[#0085E5] shadow-[inset_0_0_0_1px_rgba(0,149,255,0.14)]">
            {seg.text}
          </span>
        );
      }
      // 已看答案：揭示正解，不再可編輯；若是剛看的那一格，掛一張「確認後才前進」的氣泡
      if (revealed) {
        const holding = revealHold === orderIdx;
        return (
          <span key={segIdx} className="relative inline-block align-baseline">
            <span
              title="已看答案，這個語塊明天會再出現"
              className="inline-block rounded-md border-b-2 border-dashed border-[#F5B942] bg-[#FFFDF3] px-1.5 py-0.5 font-bold text-[#8A6A00]"
            >
              {seg.text}
            </span>
            {holding && (
              <span className="animate-hi-fade-up absolute left-1/2 -ml-32 top-full z-20 mt-2.5 w-64 rounded-2xl border border-[#FFE7A3] bg-[#FFFDF3] p-3 text-left text-[11px] font-semibold leading-4 text-[#8A6A00] shadow-[0_18px_40px_-18px_rgba(138,106,0,0.55)]">
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-[#FFE7A3] bg-[#FFFDF3]" aria-hidden="true" />
                <span className="block">
                  <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-[#D9A400]" />
                  正確答案就是上面金色虛線框裡的字。看清後再進下一題。
                </span>
                <button
                  type="button"
                  onClick={() => advanceAfterReveal(orderIdx)}
                  className="mt-2.5 w-full cursor-pointer rounded-lg bg-[#FFC800] px-2 py-2 text-[11px] font-extrabold text-[#6B4E00] transition-colors hover:bg-[#F2BC00]"
                >
                  知道了，下一題 ➔
                </button>
              </span>
            )}
          </span>
        );
      }
      const st = results[orderIdx] ?? 'typing';
      const isShaking = shakeIdx === orderIdx;
      const showTips = tipsIdx === orderIdx;
      const word = chunks[orderIdx] ?? '';
      return (
        <span key={segIdx} className="relative inline-block align-baseline">
          <input
            ref={el => { inputRefs.current[orderIdx] = el; }}
            value={answers[orderIdx] ?? ''}
            onChange={e => updateAnswer(orderIdx, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); judge(orderIdx); } }}
            readOnly={roundResolved}
            aria-label={`默寫第 ${orderIdx + 1} 個語塊`}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: `${Math.max(word.length * 10, 60)}px` }}
            className={
              'mx-1 inline-block rounded-t-md border-b-2 px-2 py-0.5 text-center font-semibold outline-none transition-all duration-200 ' +
              (st === 'wrong'
                ? 'border-[#E5484D] bg-[#FDE8E8] text-[#E5484D]' + (isShaking ? ' animate-hi-shake' : '')
                : 'border-[#8FCBFF] bg-[#F2FAFF] text-[#0A0F1F] focus:border-[#0095FF] focus:bg-white focus:shadow-[0_3px_0_-1px_rgba(0,149,255,0.3)]')
            }
          />
          {showTips && (() => {
            const raw = chunks[orderIdx];
            const def = D.vocab.find(v => isBoundSmall(normTerm(raw), normTerm(v.lemma)));
            const tip = def ? (def.tip ? `精髓：${def.tip}` : def.definition) : '';
            // ★修正（2026-09-23）：原本用 -translate-x-1/2 置中，但 animate-hi-fade-up 的終態
            // transform: none 會把 translate 覆蓋掉，導致氣泡以 left-1/2 為起點往右爆出、被外框裁切。
            // 改用 margin 置中（-ml-32 = 半個 w-64），不依賴 transform，動畫不再破壞定位。
            return (
              <span className="animate-hi-fade-up absolute left-1/2 -ml-32 top-full z-20 mt-2.5 w-64 rounded-2xl border border-[#FFE7A3] bg-[#FFFDF3] p-3 text-left text-[11px] font-semibold leading-4 text-[#8A6A00] shadow-[0_18px_40px_-18px_rgba(138,106,0,0.55)]">
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-[#FFE7A3] bg-[#FFFDF3]" aria-hidden="true" />
                {tip && (
                  <span className="block">
                    <BulbIcon className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-[#D9A400]" />
                    {tip}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => revealAnswer(orderIdx)}
                  className="mt-2.5 w-full cursor-pointer rounded-lg bg-[#FFC800] px-2 py-2 text-[11px] font-extrabold text-[#6B4E00] transition-colors hover:bg-[#F2BC00]"
                >
                  看答案，下一題 ➔
                </button>
              </span>
            );
          })()}
        </span>
      );
    }
    // 英文段落裡偶發的中文片段（如詞彙遷移）：渲染為普通文本
    if (!/^[A-Za-z0-9'’\-/\. ]+$/.test(seg.text.trim()) || !/[A-Za-z]/.test(seg.text)) {
      return <span key={segIdx}>{seg.text}</span>;
    }
    /* 命中詞剛好是重點語塊本身：改用琥珀色標出來 */
    const boldHit = !isDrillMode && activeHighlight && seg.text.toLowerCase().includes(activeHighlight.toLowerCase());
    return (
      <mark
        key={segIdx}
        className={
          'rounded-md px-1.5 font-semibold transition-all duration-500 ' +
          (boldHit ? 'bg-[#FFE7A3] text-[#8A6A00]' : 'bg-[#EDF7FF] text-[#0085E5]')
        }
      >
        {tidyEn(seg.text)}
      </mark>
    );
  }

  /* 加粗塊 → 語塊序號（首次出現；重複出現返回 -1） */
  function chunkOrder(segIdx: number): number {
    if (!segIdxOrderMap) return -1;
    return segIdxOrderMap[segIdx] ?? -1;
  }
}
