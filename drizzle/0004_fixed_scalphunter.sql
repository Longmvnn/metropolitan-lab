CREATE TABLE `notification_reads` (
	`user_id` text NOT NULL,
	`notification_id` text NOT NULL,
	`read_revision` integer NOT NULL,
	PRIMARY KEY(`user_id`, `notification_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notification_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
