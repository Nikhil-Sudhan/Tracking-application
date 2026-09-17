CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`team` text NOT NULL,
	`color` text NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy` real,
	`battery` integer,
	`last_seen` integer,
	`shift_start` integer,
	`device` text,
	`token_hash` text
);
--> statement-breakpoint
CREATE INDEX `employees_owner` ON `employees` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_token` ON `employees` (`token_hash`);--> statement-breakpoint
CREATE TABLE `points` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`shift_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`accuracy` real NOT NULL,
	`captured` integer NOT NULL,
	`battery` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `points_employee_time` ON `points` (`employee_id`,`captured`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`started` integer NOT NULL,
	`ended` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shifts_employee` ON `shifts` (`employee_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`address` text NOT NULL,
	`due` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_employee` ON `tasks` (`employee_id`);