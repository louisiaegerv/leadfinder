CREATE TABLE `page_texts` (
	`place_id` text PRIMARY KEY NOT NULL,
	`text` blob NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`place_id`) ON UPDATE no action ON DELETE cascade
);
