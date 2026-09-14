import { NextResponse } from 'next/server';
import { getLessonBundle } from '@/lib/notion';

/* 動態課程接口：返回全部課程 + 今日默認索引；失敗時前端降級內置數據 */
export async function GET() {
  try {
    const bundle = await getLessonBundle();
    if (!bundle) return NextResponse.json({ ok: false, reason: 'not-configured-or-empty' });
    return NextResponse.json({ ok: true, lessons: bundle.lessons, todayIndex: bundle.todayIndex });
  } catch {
    return NextResponse.json({ ok: false, reason: 'fetch-failed' });
  }
}
