CREATE TABLE `auth_challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`payload` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_claims` (
	`registration` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_claims_user_id_unique` ON `auth_claims` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `verified_at` text;
--> statement-breakpoint
-- Preserve genuinely verified legacy students; preloaded profiles remain unclaimed.
UPDATE users SET verified_at = COALESCE((SELECT json_extract(data,'$.verifiedAt') FROM records WHERE id='profile:'||users.id), datetime('now'))
WHERE role='student' AND identity IS NOT NULL AND EXISTS(SELECT 1 FROM records WHERE id='profile:'||users.id AND json_extract(data,'$.emailVerified')=1);
--> statement-breakpoint
INSERT INTO auth_claims(registration,user_id)
SELECT upper(trim(json_extract(r.data,'$.registration'))),u.id FROM users u JOIN records r ON r.id='profile:'||u.id
WHERE u.verified_at IS NOT NULL AND trim(COALESCE(json_extract(r.data,'$.registration'),''))!='';

