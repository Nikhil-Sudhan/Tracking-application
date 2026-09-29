CREATE TABLE `admin_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`expires` integer NOT NULL,
	`created` integer NOT NULL,
	`revoked` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_devices_token_hash_unique` ON `admin_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_devices_owner` ON `admin_devices` (`owner`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_owner_time` ON `audit_events` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `geofences` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	CONSTRAINT "geofences_radius" CHECK("geofences"."radius" BETWEEN 50 AND 10000)
);
--> statement-breakpoint
CREATE INDEX `geofences_owner` ON `geofences` (`owner`);--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`reviewed` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leave_employee` ON `leave_requests` (`employee_id`,`start_date`);--> statement-breakpoint
ALTER TABLE `shifts` ADD `site_name` text;--> statement-breakpoint
ALTER TABLE `shifts` ADD `checkin_lat` real;--> statement-breakpoint
ALTER TABLE `shifts` ADD `checkin_lng` real;--> statement-breakpoint
ALTER TABLE `shifts` ADD `checkin_accuracy` real;