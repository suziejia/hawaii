import { NextResponse } from 'next/server';
import { clearLessonCache, getLessonBundle } from '@/lib/notion';

/* 手動同步：清掉服務端缓存並立刻重新拉取 Notion 最新內容 */
export async function POST() {
  try {
    clearLessonCache();
    const bundle = await getLessonBundle();
    if (!bundle) return NextResponse.json({ ok: false, lessons: [], todayIndex: 0 });
    return NextResponse.json({ ok: true, lessons: bundle.lessons, todayIndex: bundle.todayIndex });
  } catch {
    return NextResponse.json({ ok: false, lessons: [], todayIndex: 0 });
  }
}
