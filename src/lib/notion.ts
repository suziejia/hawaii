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
  passageSegments: PassageSegment[];
  passageEn: string;
  passageCn: string;
  targetChunks: string[];
  vocab: VocabEntry[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Block = any;

const notion = process.env.NOTION_TOKEN ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
const PAGE_ID = process.env.NOTION_PAGE_ID ?? '';
const TTL = 10 * 60 * 1000;
const THROTTLE_MS = 340;
let cache: { at: number; lessons: Lesson[]; todayIndex: number } | null = null;

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
  cnParts: string[];
  chunks: string[];
  vocab: VocabEntry[];
  category: string;
};

function finishLesson(raw: RawLesson): Lesson | null {
  const passageSegments = raw.segs;
  const passageEn = passageSegments.map(s => s.text).join('').replace(/\s+\n/g, '\n').trim();
  const passageCn = raw.cnParts.join('\n\n').trim();

  const chunks = Array.from(new Set(
    passageSegments
      .filter(s => s.bold)
      .map(s => s.text.trim().replace(/^[\s,.;:"'!?()（）]+|[\s,.;:"'!?()（）]+$/g, ''))
      .filter(t => t.length > 1),
  ));
  if (!passageEn || !chunks.length) return null;

  return {
    id: raw.id,
    questionEn: raw.qEn,
    questionCn: raw.qCn,
    passageSegments,
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
  };
}

/* ---------- 2. 多課時切片引擎（💡 callout 為錨點） ---------- */

function segmentLessons(flat: Block[]): Lesson[] {
  const lessons: Lesson[] = [];
  let cur: RawLesson | null = null;

  for (const b of flat) {
    const type = b?.type ?? '';
    if (type === 'callout') {
      const icon = b.callout?.icon;
      const isAnchor = icon?.type === 'emoji' && icon.emoji === '💡';
      if (isAnchor) {
        if (cur) {
          const done = finishLesson(cur);
          if (done) lessons.push(done);
        }
        const { questionEn, questionCn } = splitCallout(plainText(b));
        cur = { id: b.id, qEn: questionEn, qCn: questionCn, quoteUsed: false, segs: [], cnParts: [], chunks: [], vocab: [], category: '' };
        continue;
      }
      // 非 💡 callout：暫不作為錨點，內容忽略
    }
    if (!cur) continue;

    if (type === 'paragraph') {
      const text = plainText(b);
      if (!text.trim()) continue;
      // 段落按行切分逐行路由（處理 EN+CN 混排在同一段落塊的情況）
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (isMostlyChinese(line)) cur.cnParts.push(line);
        else cur.enParts.push(line);
      }
      // 展示片段保留原樣（渲染端過濾非拉丁加粗）；語塊只收純英文加粗，杜絕中文污染
      cur.segs.push(...segmentsOf(b));
      cur.segs.push({ text: '\n\n', bold: false });
      for (const c of boldChunksOf(b)) {
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

export async function getLessonBundle(): Promise<{ lessons: Lesson[]; todayIndex: number } | null> {
  if (!notion || !PAGE_ID) return null;
  if (cache && Date.now() - cache.at < TTL) {
    return cache.lessons.length ? { lessons: cache.lessons, todayIndex: cache.todayIndex } : null;
  }
  try {
    const flat = await fetchAllBlocksRecursive(PAGE_ID);
    const lessons = segmentLessons(flat);
    if (!lessons.length) return cache ? { lessons: cache.lessons, todayIndex: cache.todayIndex } : null;
    const todayIndex = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000) % lessons.length;
    cache = { at: Date.now(), lessons, todayIndex };
    return { lessons, todayIndex };
  } catch {
    return cache ? { lessons: cache.lessons, todayIndex: cache.todayIndex } : null;
  }
}
