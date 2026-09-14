import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const appState = pgTable('output_app_state', { key: text('key').primaryKey() });

export type Stage = { text: string; done: boolean; completedAt?: string };
export const entries = pgTable('output_entries', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull().default(''),
  category: text('category').notNull().default('生活与成长'),
  kind: text('kind').notNull().default('tracking'),
  stages: jsonb('stages').$type<Stage[]>().notNull(),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
