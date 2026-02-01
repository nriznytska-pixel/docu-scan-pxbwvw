import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  language: text('language', { enum: ['uk', 'ru', 'en', 'pl', 'tr', 'de', 'fr', 'es', 'ar'] }).default('uk'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
