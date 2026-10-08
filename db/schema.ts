import {sql} from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', { id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), role:text('role').notNull(), identity:text('identity').unique(), passwordHash:text('password_hash'), verifiedAt:text('verified_at') },t=>[uniqueIndex('users_email_case_unique').on(sql`lower(${t.email})`)]);
export const records = sqliteTable('records', { id:text('id').primaryKey(), kind:text('kind').notNull(), data:text('data').notNull(), revision:integer('revision').notNull().default(1), created:text('created').notNull() },t=>[index('records_kind').on(t.kind)]);
export const audit = sqliteTable('audit', { id:text('id').primaryKey(), actor:text('actor').notNull(), action:text('action').notNull(), target:text('target').notNull(), before:text('before'), after:text('after'), created:text('created').notNull() });
export const deliveries = sqliteTable('deliveries',{id:text('id').primaryKey(),student:text('student').notNull(),recipient:text('recipient').notNull(),subject:text('subject').notNull(),status:text('status').notNull(),error:text('error'),updated:text('updated').notNull()},t=>[index('deliveries_student').on(t.student)]);

export const authSessions = sqliteTable('auth_sessions', {tokenHash:text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}), expires:integer('expires').notNull()});
export const authChallenges = sqliteTable('auth_challenges', {tokenHash:text('token_hash').primaryKey(),email:text('email').notNull(),purpose:text('purpose').notNull(),payload:text('payload').notNull(),codeHash:text('code_hash').notNull(),expires:integer('expires').notNull(),attempts:integer('attempts').notNull().default(0),used:integer('used').notNull().default(0)});
export const authClaims = sqliteTable('auth_claims', {registration:text('registration').primaryKey(),userId:text('user_id').notNull().unique().references(()=>users.id,{onDelete:'cascade'})});
export const authLimits = sqliteTable('auth_limits', {id:text('id').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});

export const notificationReads = sqliteTable('notification_reads', {userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),notificationId:text('notification_id').notNull().references(()=>records.id,{onDelete:'cascade'}),readRevision:integer('read_revision').notNull()},t=>[primaryKey({columns:[t.userId,t.notificationId]})]);

// SQLite stores UUID/varchar values as TEXT and timestamps as epoch milliseconds.
export const lecturerInvitations = sqliteTable('lecturer_invitations', {
 id: text('id').primaryKey(), email: text('email').notNull().unique(),
 // Only the SHA-256 digest is stored; the email contains the bearer token.
 token: text('token').notNull().unique(), expiresAt: integer('expires_at').notNull(),
 isUsed: integer('is_used', {mode:'boolean'}).notNull().default(false),
});
export const attendanceSessions = sqliteTable('attendance_sessions', {
 id: text('id').primaryKey().references(()=>records.id,{onDelete:'cascade'}),
 lecturerId: text('lecturer_id').notNull().references(()=>users.id),
 activeCode: text('active_code',{length:6}).notNull(), codeExpiresAt: integer('code_expires_at').notNull(),
 isLocked: integer('is_locked',{mode:'boolean'}).notNull().default(false),
 lectureHallLatitude: real('lecture_hall_latitude').notNull(),
 lectureHallLongitude: real('lecture_hall_longitude').notNull(),
});
