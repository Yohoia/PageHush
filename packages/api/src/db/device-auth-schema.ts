import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const deviceAuthorizationStatus = pgEnum('device_authorization_status', [
  'pending',
  'approved',
  'denied',
  'consumed',
]);

export const deviceAuthorizations = pgTable(
  'device_authorizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceCodeHash: text('device_code_hash').notNull().unique(),
    userCodeHash: text('user_code_hash').notNull().unique(),
    name: text('name').notNull(),
    status: deviceAuthorizationStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    nextPollAt: timestamp('next_poll_at', { withTimezone: true }).notNull(),
    intervalSeconds: integer('interval_seconds').notNull().default(5),
  },
  (table) => [
    index('device_authorizations_expires_at_idx').on(table.expiresAt),
    check('device_poll_interval_positive', sql`${table.intervalSeconds} > 0`),
  ],
);

export const deviceSessions = pgTable(
  'device_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('device_sessions_expires_at_idx').on(table.expiresAt)],
);
