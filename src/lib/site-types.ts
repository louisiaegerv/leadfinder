/** How a website scan ended. Anything but "ok" says why the quick parser could not read the page. */
export type ScanOutcome =
  | "ok" //       readable HTML
  | "blank" //    loaded but empty without JavaScript: needs a browser (the paid reader)
  | "blocked" //  403/429/503 or a bot-challenge page
  | "dead" //     domain does not exist, or the front page is gone (404/410)
  | "error" //    timeout, connection reset, server error
  | "refused" //  points at a private or local address, never fetched
  | "not_html"; // front page is a download or an image

/** What the page source says about the business's web presence. Facts about the page; what they imply is inferred in scoring. */
export type SiteSignals = {
  outcome: ScanOutcome;
  https: boolean;
  /** Has a mobile viewport tag. Missing usually means the site is not mobile-friendly. */
  viewport: boolean;
  hasForm: boolean;
  hasBooking: boolean;
  /** Name of a live-chat or messaging widget, if one is installed. */
  chat: string | null;
  fbPixel: boolean;
  analytics: boolean;
  builder: string | null;
  /** Latest year in a copyright line, a rough "last updated". */
  copyrightYear: number | null;
  facebookUrl: string | null;
};
