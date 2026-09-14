import { NextResponse } from 'next/server';
import { db } from '@/db';
import { entries, appState } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { blankStages, seedEntries } from '@/lib/output';

export async function GET() {
  try {
    await db.transaction(async tx => {
      const initialized = await tx.insert(appState).values({key:'seed-v1'}).onConflictDoNothing().returning();
      if (initialized.length) await tx.insert(entries).values(seedEntries).onConflictDoNothing();
    });
    return NextResponse.json(await db.select().from(entries).orderBy(desc(entries.createdAt)));
  } catch (error) { console.error(error); return NextResponse.json({error:'暂时无法读取，请稍后重试'}, {status:500}); }
}
export async function POST(request:Request) {
  try {
    const body = await request.json();
    if(typeof body.title !== 'string' || !body.title.trim() || typeof body.question !== 'string' || !body.question.trim()) return NextResponse.json({error:'请填写标题和问题'}, {status:400});
    const [entry] = await db.insert(entries).values({id:crypto.randomUUID(),title:body.title.trim().slice(0,160),question:body.question,answer:typeof body.answer==='string'?body.answer:'',kind:body.kind==='english'?'english':'tracking',category:body.category || (body.kind==='english'?'IELTS Speaking':'生活与成长'),stages:blankStages()}).returning();
    return NextResponse.json(entry);
  } catch {return NextResponse.json({error:'保存失败，请重试'}, {status:500});}
}
export async function PATCH(request:Request) {
  try {
    const body = await request.json();
    if(typeof body.id!=='string') return NextResponse.json({error:'缺少记录 ID'}, {status:400});
    const data: Partial<typeof entries.$inferInsert> = {updatedAt:new Date()};
    for(const key of ['title','question','answer','category'] as const) if(typeof body[key]==='string') data[key]=body[key];
    if(typeof body.archived==='boolean') data.archived=body.archived;
    if(body.stages!==undefined) {
      if(!Array.isArray(body.stages)||body.stages.length!==3||body.stages.some((s: {text?:unknown;done?:unknown})=>typeof s.text!=='string'||typeof s.done!=='boolean'||(s.done&&!s.text.trim()))) return NextResponse.json({error:'完成前请先写下你的输出'}, {status:400});
      data.stages=body.stages;
    }
    const [entry]=await db.update(entries).set(data).where(eq(entries.id,body.id)).returning();
    if(!entry) return NextResponse.json({error:'记录不存在'}, {status:404});
    return NextResponse.json(entry);
  } catch {return NextResponse.json({error:'保存失败，请重试'}, {status:500});}
}
export async function DELETE(request:Request) {
  const {id}=await request.json();
  if(typeof id!=='string') return NextResponse.json({error:'缺少记录 ID'}, {status:400});
  await db.delete(entries).where(eq(entries.id,id));
  return NextResponse.json({ok:true});
}
