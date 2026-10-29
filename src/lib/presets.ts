import { playbookSchema, type Playbook } from "./playbook";

export type Preset = {
  key: string;
  name: string;
  target: string;
  playbook: Playbook;
};

const base = (p: Partial<Playbook>): Playbook => playbookSchema.parse(p);

/** Chains that show up in almost every home-service search and are never prospects. */
const BIG_BOX = ["Home Depot", "Lowe's", "Lowes", "Menards", "Ace Hardware", "True Value"];

export const PRESETS: Preset[] = [
  {
    key: "flooring-concrete",
    name: "Epoxy & concrete flooring",
    target:
      "Independent contractors who install epoxy/garage floor coatings, polished or decorative concrete, and concrete staining for homeowners.",
    playbook: base({
      seedQueries: [
        "epoxy flooring",
        "garage floor coating",
        "concrete polishing",
        "decorative concrete",
        "concrete staining",
      ],
      includeCategories: [
        "Flooring contractor",
        "Concrete contractor",
        "Floor refinishing service",
        "Floor sanding and polishing service",
      ],
      excludeCategories: [
        "Hardware store",
        "Home improvement store",
        "Paint store",
        "Ready mix concrete supplier",
        "Flooring store",
        "Tool store",
      ],
      includeKeywords: ["epoxy", "concrete", "polish", "garage floor", "coating", "stain"],
      chainExclusions: [...BIG_BOX, "Floor & Decor", "LL Flooring", "Lumber Liquidators", "Sherwin-Williams", "Stanley Steemer"],
      trade: { ticketSize: "high", salesCycle: "weeks", seasonality: "flat", channelFit: "meta" },
    }),
  },
  {
    key: "painting",
    name: "Painting contractors",
    target: "Independent residential and light-commercial painting contractors.",
    playbook: base({
      seedQueries: ["painting contractor", "house painter", "interior painting", "exterior painting", "cabinet painting"],
      includeCategories: ["Painter", "Painting", "Painting contractor", "House painter", "Cabinet painting service"],
      excludeCategories: ["Paint store", "Hardware store", "Home improvement store", "Wallpaper store", "Art supply store"],
      includeKeywords: ["paint", "painting", "painters"],
      chainExclusions: [...BIG_BOX, "Sherwin-Williams", "Benjamin Moore", "Behr", "CertaPro", "Five Star Painting"],
      trade: { ticketSize: "medium", salesCycle: "weeks", seasonality: "seasonal", channelFit: "both" },
    }),
  },
  {
    key: "fencing",
    name: "Fence contractors",
    target: "Independent fence installation and repair contractors (wood, vinyl, chain link, iron).",
    playbook: base({
      seedQueries: ["fence contractor", "fence installation", "wood fence", "vinyl fence", "chain link fence"],
      includeCategories: ["Fence contractor", "Fence installer", "Gate", "Deck builder"],
      excludeCategories: ["Fence supply store", "Hardware store", "Home improvement store", "Building materials supplier", "Farm equipment supplier"],
      includeKeywords: ["fence", "fencing", "gate"],
      chainExclusions: [...BIG_BOX, "Tractor Supply", "Master Halco"],
      trade: { ticketSize: "high", salesCycle: "weeks", seasonality: "seasonal", channelFit: "both" },
    }),
  },
  {
    key: "movers",
    name: "Moving companies",
    target: "Independent local moving companies serving homeowners (not van-line franchises or truck rental).",
    playbook: base({
      seedQueries: ["movers", "moving company", "local movers", "residential movers"],
      includeCategories: ["Moving company", "Mover", "Moving and storage service", "Moving supply store"],
      excludeCategories: ["Storage facility", "Self-storage facility", "Truck rental", "Equipment rental agency", "Courier service"],
      includeKeywords: ["mover", "moving", "relocation"],
      chainExclusions: ["U-Haul", "Two Men and a Truck", "Budget Truck", "Penske", "Allied", "Mayflower", "United Van Lines", "Atlas Van Lines", "PODS", "Public Storage", "Extra Space"],
      trade: { ticketSize: "medium", salesCycle: "days", seasonality: "seasonal", channelFit: "search" },
    }),
  },
];

export function getPreset(key: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** Deep copy so edits to a niche never touch the preset or other niches. */
export function clonePlaybook(pb: Playbook): Playbook {
  return playbookSchema.parse(structuredClone(pb));
}
