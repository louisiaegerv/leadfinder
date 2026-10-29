CREATE TABLE `areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`niche_id` integer NOT NULL,
	`name` text NOT NULL,
	`shape` text NOT NULL,
	`center_lat` real,
	`center_lng` real,
	`radius_km` real,
	`polygon` text,
	`grid_spacing_km` real DEFAULT 8 NOT NULL,
	`queries` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`niche_id`) REFERENCES `niches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`niche_id` integer NOT NULL,
	`area_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`signed_at` integer NOT NULL,
	FOREIGN KEY (`niche_id`) REFERENCES `niches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contact_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`place_id` text NOT NULL,
	`niche_id` integer,
	`outcome` text NOT NULL,
	`notes` text,
	`objection` text,
	`offer` text,
	`follow_up` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`niche_id`) REFERENCES `niches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`place_id` text PRIMARY KEY NOT NULL,
	`owner_name` text,
	`phone` text,
	`source` text,
	`confidence` real,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `enrichment` (
	`place_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`place_id`, `kind`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `facebook_profiles` (
	`place_id` text PRIMARY KEY NOT NULL,
	`page_url` text,
	`match_source` text,
	`match_confidence` real,
	`user_override` integer DEFAULT false NOT NULL,
	`state` text,
	`ad_library` text,
	`checked_at` integer,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `llm_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`response` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `niche_places` (
	`niche_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`area_id` integer,
	`relevance` text,
	`relevance_reason` text,
	`relevance_source` text,
	`score` real,
	`offer_scores` text,
	`lead_offer` text,
	`runner_up_offer` text,
	`stage` text DEFAULT 'new' NOT NULL,
	`tags` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`niche_id`, `place_id`),
	FOREIGN KEY (`niche_id`) REFERENCES `niches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `niche_places_area_idx` ON `niche_places` (`area_id`);--> statement-breakpoint
CREATE TABLE `niches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`preset_key` text,
	`target` text DEFAULT '' NOT NULL,
	`playbook` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `place_runs` (
	`place_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`query` text NOT NULL,
	`search_grid_index` integer,
	`search_lat` real,
	`search_lng` real,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`place_id`, `run_id`, `query`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `places` (
	`place_id` text PRIMARY KEY NOT NULL,
	`cid` text,
	`title` text NOT NULL,
	`categories` text NOT NULL,
	`address` text,
	`street` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`country_code` text,
	`phone` text,
	`website` text,
	`domain` text,
	`total_score` real,
	`reviews_count` integer,
	`permanently_closed` integer,
	`temporarily_closed` integer,
	`lat` real,
	`lng` real,
	`opening_hours` text,
	`booking_links` text,
	`scraped_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `places_domain_idx` ON `places` (`domain`);--> statement-breakpoint
CREATE INDEX `places_cid_idx` ON `places` (`cid`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area_id` integer NOT NULL,
	`kind` text DEFAULT 'full' NOT NULL,
	`apify_run_id` text,
	`dataset_id` text,
	`inputs` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`estimated_cost_usd` real,
	`estimated_points` integer,
	`cost_usd` real,
	`result_count` integer,
	`new_place_count` integer,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
