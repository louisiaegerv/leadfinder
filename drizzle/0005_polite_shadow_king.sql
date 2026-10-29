ALTER TABLE `enrichment_runs` ADD `kind` text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE `enrichment_runs` ADD `meta` text;