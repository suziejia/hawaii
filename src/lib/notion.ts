import { Client } from '@notionhq/client';

/* ================= Notion → 課程同步管線 =================
 * 1. fetchAllBlocksRecursive：樹狀遞歸展開（toggle/callout/column_list 等
 *    has_children 塊全部下鑽，synced_block 回溯原始塊），處理分頁，
 *    340ms 限速保持在 Notion 3 req/s 以內。
 * 2. segmentLessons：以「💡 callout」為錨點切片為 Lesson[]。
 * 3. 題目按中文邊界分行（嚴禁把英文複製給 questionCn）；
 *    英文段落的加粗 rich_text 保留為 passageSegments（原位摳空的位置依據），
 *    標點清洗後入 targetChunks；中文段落（CJK>50%）只入 passageCn。
 * 4. 鎖定文章前 3 個語塊為默寫目標（splitCore 剝離冠詞/介詞），
 *    與詞彙表模糊綁定取得 Tips。10 分鐘內存緩存，失敗返回空由前端降級。
 */

export type PassageSegment = { text: string; bold: boolean };
export type VocabEntry = { lemma: string; definition: string; tip: string; category: string };
export type Lesson = {
  id: string;
  questionEn: string; // 可為空字符串（純中文課）
  questionCn: string;
  passageSegments: PassageSegment[]; // 僅英文文章片段（中文一律不入，見 sanitizeLesson）
  cnSegments: PassageSegment[]; // 中文譯文片段（保留 bold，渲染為綠色高亮，不做填空）
  passageEn: string;
  passageCn: string;
  targetChunks: string[];
  vocab: VocabEntry[];
  month: string; // 歸屬月份分組（九月/十月/…），由頂層月份 toggle 追蹤
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Block = any;

const notion = process.env.NOTION_TOKEN ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
const PAGE_ID = process.env.NOTION_PAGE_ID ?? '';
const TTL = 10 * 60 * 1000;
const THROTTLE_MS = 340;
let cache: { at: number; lessons: Lesson[]; todayIndex: number; year: string } | null = null;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function clearLessonCache() {
  cache = null;
}

/* ---------- 1. 樹狀區塊遞歸遍歷（含分頁與限速） ---------- */

async function fetchAllBlocksRecursive(blockId: string, depth = 0): Promise<Block[]> {
  if (!notion || depth > 6) return [];
  const flat: Block[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results as Block[]) {
      flat.push(b);
      if (!b.has_children) continue;
      await sleep(THROTTLE_MS);
      try {
        if (b.type === 'synced_block') {
          const from = b.synced_block?.synced_from;
          flat.push(...(await fetchAllBlocksRecursive(from?.block_id ?? b.id, depth + 1)));
        } else {
          flat.push(...(await fetchAllBlocksRecursive(b.id, depth + 1)));
        }
      } catch { /* 單個子樹失敗不影響整體 */ }
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    if (cursor) await sleep(THROTTLE_MS);
  } while (cursor);
  return flat;
}

/* ---------- 文本工具 ---------- */

function plainText(block: Block): string {
  const key = block?.type ?? '';
  const body = block?.[key];
  if (!body?.rich_text) return '';
  return body.rich_text.map((rt: any) => rt.plain_text ?? '').join('');
}

/* 純英文語塊判定：僅字母/數字/空格/連字符/撇號/斜槓，且至少含一個英文字母 */
function isLatinChunk(text: string): boolean {
  return /^[A-Za-z0-9'’\-/\. ]+$/.test(text) && /[A-Za-z]/.test(text) && text.trim().length > 1;
}

function cjkCount(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
}

function isMostlyChinese(text: string): boolean {
  const sample = text.slice(0, 400);
  return sample.length > 0 && cjkCount(sample) / sample.length > 0.5;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\([^)]*\)/g, '')
    .replace(/\.\.\..*$/, '')
    .replace(/\s*\/\s*.*$/, '')
    .replace(/^(a|an|the)\s+/, '')
    .replace(/\s+(of|to|on|at|for|in)$/, '')
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MATCH_STOPWORDS = new Set(["one's", 'ones', 'my', 'your', 'his', 'her', 'their', 'our', 'sb', 'sth', 'something', 'someone', 'it']);

function isBound(chunkNorm: string, lemmaNorm: string): boolean {
  if (!chunkNorm || !lemmaNorm) return false;
  if (chunkNorm === lemmaNorm) return true;
  if (lemmaNorm.includes(chunkNorm) || chunkNorm.includes(lemmaNorm)) return true;
  const cw = chunkNorm.split(' ').filter(w => w && !MATCH_STOPWORDS.has(w));
  const lw = lemmaNorm.split(' ').filter(w => w && !MATCH_STOPWORDS.has(w));
  if (!cw.length || !lw.length) return false;
  const set = new Set(cw);
  return lw.filter(w => set.has(w)).length >= Math.min(2, lw.length);
}

function cleanQuestionText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^(問題|问题)\s*[:：]\s*/u, '');
  t = t.replace(/^[\s*"“”=\-—·•]+/, '').replace(/[\s*"“”=\-—·•]+$/, '');
  return t.trim();
}

/* 題目中英文：含中文的行 → questionCn；純英文且長度>15 的行 → questionEn */
function splitCallout(raw: string): { questionEn: string; questionCn: string } {
  let questionEn = '';
  let questionCn = '';
  for (const line of raw.split('\n')) {
    const clean = cleanQuestionText(line);
    if (!clean) continue;
    const cjk = cjkCount(clean);
    if (cjk >= 2) questionCn = questionCn ? `${questionCn} ${clean}` : clean;
    else if (/[a-zA-Z]/.test(clean) && clean.length > 15) questionEn = questionEn ? `${questionEn} ${clean}` : clean;
    // 過短的英文片段（如被換行截斷的殘句）直接忽略
  }
  return { questionEn, questionCn };
}

function parseVocabEntry(text: string): { lemma: string; definition: string; tip: string } | null {
  const idxCn = text.indexOf('：');
  const idxEn = text.indexOf(': ');
  const sep = idxCn >= 0 && (idxEn < 0 || idxCn < idxEn) ? idxCn : idxEn;
  if (sep < 0) return null;
  const lemma = text.slice(0, sep).replace(/\*\*/g, '').replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const definition = text.slice(sep + 1).trim();
  if (!lemma || !definition) return null;
  const tipMatch = definition.match(/[（(]([^（）()]+)[）)]/);
  return { lemma, definition, tip: tipMatch ? tipMatch[1].trim() : '' };
}

/* 加粗語塊的核心形式：剝離前導冠詞與尾部介詞（a laundry list of → laundry list） */
function splitCore(raw: string): { before: string; core: string; after: string } {
  const trimmed = raw.trim();
  const lead = trimmed.match(/^[“"']*(a|an|the)\s+/i);
  let rest = trimmed;
  let before = '';
  if (lead) {
    before = lead[0];
    rest = trimmed.slice(lead[0].length);
  }
  const trail = rest.match(/\s+(of|to|on|at|for|in)$/i);
  let core = rest;
  let after = '';
  if (trail) {
    core = rest.slice(0, trail.index);
    after = rest.slice(trail.index);
  }
  return { before, core, after };
}

/* 英文段落的 rich_text → 保留加粗位置的片段序列 */
function segmentsOf(block: Block): PassageSegment[] {
  const key = block?.type ?? '';
  const body = block?.[key];
  if (!body?.rich_text) return [];
  const segs: PassageSegment[] = [];
  for (const rt of body.rich_text) {
    if (!rt.plain_text) continue;
    segs.push({ text: rt.plain_text, bold: !!rt.annotations?.bold });
  }
  return segs;
}

/* 按行拆分 rich_text 並雙語路由：EN 行片段入 enSegs，CN 行片段入 cnSegs（保留 bold 供綠色高亮）。
 * 關鍵：只有在真實換行（rt 內 li>0）時才插入段落分隔符——格式 run 之間絕不插入（否則文章碎成瀑布流）；
 * EN 行保留原文空格（run 之間的空格不能丟，否則單詞粘連）。 */
function splitSegmentsByLanguage(block: Block) {
  const key = block?.type ?? '';
  const body = block?.[key];
  const enSegs: PassageSegment[] = [];
  const cnSegs: PassageSegment[] = [];
  const enLines: string[] = [];
  const cnLines: string[] = [];
  const chunks: string[] = [];
  let prevWasEn = false;
  if (body?.rich_text) {
    for (const rt of body.rich_text) {
      const bold = !!rt.annotations?.bold;
      const lines = (rt.plain_text ?? '').split('\n');
      lines.forEach((line: string, li: number) => {
        if (li > 0) {
          // 真實換行 = 段落邊界（防重複插入）
          if (enSegs.length && enSegs[enSegs.length - 1].text !== '\n\n') enSegs.push({ text: '\n\n', bold: false });
          if (cnSegs.length && cnSegs[cnSegs.length - 1].text !== '\n') cnSegs.push({ text: '\n', bold: false });
          prevWasEn = false;
        }
        const trimmed = line.trim();
        if (!trimmed) return;
        if (/^[。，、？！；：…\s\.,;:!?\(\)（）"'“”’‘]+$/.test(trimmed)) return; // 純標點碎片直接丟棄
        if (isMostlyChinese(trimmed)) {
          cnLines.push(trimmed);
          cnSegs.push({ text: trimmed, bold });
        } else if (/[\u4e00-\u9fa5]/.test(trimmed)) {
          // 中英各半的句子碎片（如「近视600度」「，是防止 AI 產生」）：完整內容都在詞彙表/譯文區，正文殘渣直接丟棄
          prevWasEn = false;
        } else {
          enLines.push(trimmed);
          enSegs.push({ text: line, bold }); // 保留原文空格
          if (bold) {
            const cleaned = trimmed.replace(/^[\s,.;:"'!?()（）]+|[\s,.;:"'!?()（）]+$/g, '');
            if (cleaned.length > 1) chunks.push(cleaned);
          }
          prevWasEn = true;
        }
      });
    }
  }
  return { enSegs, cnSegs, enLines, cnLines, chunks };
}

/* 加粗片段 → 標點清洗 → 目標語塊列表 */
function boldChunksOf(block: Block): string[] {
  const key = block?.type ?? '';
  const body = block?.[key];
  if (!body?.rich_text) return [];
  const runs: string[] = [];
  let buf = '';
  for (const rt of body.rich_text) {
    if (rt.annotations?.bold && rt.plain_text) buf += rt.plain_text;
    else if (buf) { runs.push(buf); buf = ''; }
  }
  if (buf) runs.push(buf);
  return runs
    .map(raw => raw.trim().replace(/^[\s,.;:"'!?()（）]+|[\s,.;:"'!?()（）]+$/g, ''))
    .filter(t => t.length > 1);
}

/* ---------- 單課組裝 ---------- */

type RawLesson = {
  id: string;
  qEn: string;
  qCn: string;
  quoteUsed: boolean;
  segs: PassageSegment[];
  cnSegs: PassageSegment[];
  enParts: string[];
  cnParts: string[];
  chunks: string[];
  vocab: VocabEntry[];
  category: string;
  month: string;
};

function finishLesson(raw: RawLesson): Lesson | null {
  const passageSegments = raw.segs;
  const passageEn = raw.enParts.join('\n\n').trim();
  const passageCn = raw.cnParts.join('\n\n').trim();

  // 語塊池 = 段落採集時已過濾的純拉丁加粗（isLatinChunk），按出現順序去重
  const chunks = Array.from(new Set(raw.chunks));
  if (!passageEn || !chunks.length) return null;

  return {
    id: raw.id,
    questionEn: raw.qEn,
    questionCn: raw.qCn,
    passageSegments,
    cnSegments: raw.cnSegs,
    passageEn,
    passageCn,
    targetChunks: chunks,
    vocab: (() => {
      const seen = new Set<string>();
      const out: VocabEntry[] = [];
      for (const v of raw.vocab) {
        const k = normalizeTerm(v.lemma) || v.lemma;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
      }
      return out;
    })(),
    month: raw.month,
  };
}

/* ---------- 出口消毒關卡（硬保證）：無論上游解析如何變化，③ 項歷史問題絕不復發 ----------
 * 1. 語塊池：必須是純拉丁字符（中文/日文等一律剔除）；
 * 2. 詞條：lemma 必須含英文字母；按歸一化形式去重；
 * 3. 題目：中文佔比 > 50% 的 questionEn 自動降級併入 questionCn。
 */
function sanitizeLesson(L: Lesson): Lesson {
  const latin = (s: string) => isLatinChunk(s);
  const cjkRatio = (s: string) => {
    const sample = s.slice(0, 300);
    return sample.length ? (sample.match(/[\u4e00-\u9fa5]/g)?.length ?? 0) / sample.length : 0;
  };
  let questionEn = L.questionEn;
  let questionCn = L.questionCn;
  if (questionEn && cjkRatio(questionEn) > 0.5) {
    questionCn = questionCn ? `${questionCn} ${questionEn}` : questionEn;
    questionEn = '';
  }
  // 硬保證 ④：英文文章段落裡不得殘留中文片段，一律強制移入中文譯文區
  // 硬保證 ④（加強版）：英文區含任何 CJK 字符的片段一律清除（完整內容均在詞彙表/譯文區）
  const enOnly = L.passageSegments.filter(sg => !/[\u4e00-\u9fa5]/.test(sg.text));
  return {
    ...L,
    questionEn,
    questionCn,
    passageSegments: enOnly,
    cnSegments: L.cnSegments,
    targetChunks: L.targetChunks.filter(latin),
    vocab: L.vocab.filter(v => /[A-Za-z]/.test(v.lemma)),
  };
}

/* ---------- 2. 多課時切片引擎（💡 callout 為錨點，月份 toggle 歸組） ---------- */

/* 月份名識別：九月/十月/十一月/十二月…（頂層 toggle 命名） */
const MONTH_RE = /^[一二三四五六七八九十]{1,3}月$/;

function segmentLessons(flat: Block[]): Lesson[] {
  const lessons: Lesson[] = [];
  let cur: RawLesson | null = null;
  let curMonth = '';

  for (const b of flat) {
    const type = b?.type ?? '';
    if (type === 'toggle') {
      const name = plainText(b).trim();
      if (MONTH_RE.test(name)) curMonth = name; // 進入新月分組（depth-first 扁平序列中後續塊均屬於它）
    }
    if (type === 'callout') {
      const icon = b.callout?.icon;
      const isAnchor = icon?.type === 'emoji' && icon.emoji === '💡';
      if (isAnchor) {
        if (cur) {
          const done = finishLesson(cur);
          if (done) lessons.push(done);
        }
        const { questionEn, questionCn } = splitCallout(plainText(b));
        cur = { id: b.id, qEn: questionEn, qCn: questionCn, quoteUsed: false, segs: [], cnSegs: [], enParts: [], cnParts: [], chunks: [], vocab: [], category: '', month: curMonth };
        continue;
      }
      // 非 💡 callout：暫不作為錨點，內容忽略
    }
    if (!cur) continue;

    if (type === 'paragraph') {
      const text = plainText(b);
      if (!text.trim()) continue;
      // 按行拆分並雙語路由：EN 片段與 CN 片段徹底分離（結構性保證 EN/CN 排版永遠不亂）
      const routed = splitSegmentsByLanguage(b);
      for (const line of routed.enLines) cur.enParts.push(line);
      for (const line of routed.cnLines) cur.cnParts.push(line);
      if (routed.enSegs.length) {
        cur.segs.push(...routed.enSegs);
        cur.segs.push({ text: '\n\n', bold: false });
      }
      cur.cnSegs.push(...routed.cnSegs);
      for (const c of routed.chunks) {
        if (isLatinChunk(c)) cur.chunks.push(c);
      }
      continue;
    }
    if (type === 'quote' && !cur.quoteUsed) {
      // 緊隨 callout 的 quote = 中文翻譯（規範：Callout + Quote 嚴格配對）
      const qt = plainText(b).trim();
      if (qt && cjkCount(qt) >= 2) {
        cur.qCn = cleanQuestionText(qt);
        cur.quoteUsed = true;
      }
      continue;
    }
    if (type === 'heading_3') {
      cur.category = plainText(b).replace(/^\d+\s*[.、．]\s*/, '').trim();
      continue;
    }
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const entry = parseVocabEntry(plainText(b));
      if (entry) cur.vocab.push({ lemma: entry.lemma, definition: entry.definition, tip: entry.tip, category: cur.category });
      continue;
    }
  }
  if (cur) {
    const done = finishLesson(cur);
    if (done) lessons.push(done);
  }
  return lessons;
}

/* ---------- 4. 緩存與對外接口（10 分鐘 TTL） ---------- */

export async function getLessonBundle(): Promise<{ lessons: Lesson[]; todayIndex: number; year: string } | null> {
  if (!notion || !PAGE_ID) return null;
  if (cache && Date.now() - cache.at < TTL) {
    return cache.lessons.length ? { lessons: cache.lessons, todayIndex: cache.todayIndex, year: cache.year } : null;
  }
  try {
    const flat = await fetchAllBlocksRecursive(PAGE_ID);
    const lessons = segmentLessons(flat).map(sanitizeLesson); // 出口消毒：硬保證語塊/詞彙純淨
    if (!lessons.length) return cache ? { lessons: cache.lessons, todayIndex: cache.todayIndex, year: cache.year } : null;
    const todayIndex = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000) % lessons.length;
    // 年份 = Notion 頁面標題（如「2026」）
    let year = '';
    try {
      const page = await notion.pages.retrieve({ page_id: PAGE_ID });
      const props = (page as { properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> }).properties ?? {};
      const titleProp = Object.values(props).find(p => p.type === 'title');
      year = (titleProp?.title ?? []).map(t => t.plain_text ?? '').join('').trim();
    } catch { /* 年份讀取失敗不影響內容 */ }
    cache = { at: Date.now(), lessons, todayIndex, year };
    return { lessons, todayIndex, year };
  } catch {
    return cache ? { lessons: cache.lessons, todayIndex: cache.todayIndex, year: cache.year } : null;
  }
}
