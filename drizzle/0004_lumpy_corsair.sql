CREATE TABLE `enrichment_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`apify_run_id` text,
	`dataset_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`targets` text NOT NULL,
	`enriched_count` integer,
	`owner_count` integer,
	`cost_usd` real,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
