CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`lecturer_id` text NOT NULL,
	`active_code` text(6) NOT NULL,
	`code_expires_at` integer NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`lecture_hall_latitude` real NOT NULL,
	`lecture_hall_longitude` real NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lecturer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lecturer_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`is_used` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lecturer_invitations_email_unique` ON `lecturer_invitations` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `lecturer_invitations_token_unique` ON `lecturer_invitations` (`token`);