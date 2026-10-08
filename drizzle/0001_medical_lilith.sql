CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`student` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_student` ON `deliveries` (`student`);