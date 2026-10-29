ALTER TABLE `areas` ADD `reviews` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `areas` ADD `max_reviews` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `places` ADD `review_sample` text;--> statement-breakpoint
ALTER TABLE `places` ADD `reviews_sampled_at` integer;