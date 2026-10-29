ALTER TABLE `areas` ADD `num` integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE `areas` ADD `skip_closed_places` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `areas` ADD `gl` text DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE `areas` ADD `hl` text DEFAULT 'en' NOT NULL;