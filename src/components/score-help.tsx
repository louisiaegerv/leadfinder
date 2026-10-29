import { InfoTip } from "@/components/info-tip";

// Wording mirrors the points in scorePlace() in src/lib/scoring.ts; update both together.

function Rules({ lead, rows, foot }: { lead: string; rows: [string, string][]; foot: string }) {
  return (
    <>
      <p>{lead}</p>
      <ul className="space-y-0.5">
        {rows.map(([what, pts]) => (
          <li key={what} className="flex justify-between gap-3">
            <span>{what}</span>
            <span className="shrink-0 tabular-nums opacity-80">{pts}</span>
          </li>
        ))}
      </ul>
      <p className="opacity-80">{foot}</p>
    </>
  );
}

export function FitGateTip() {
  return (
    <InfoTip label="the fit gate">
      <Rules
        lead="Multiplies everything else: is this the kind of business you sell to?"
        rows={[
          ["Target", "×1"],
          ["Undecided", "×0.6"],
          ["Adjacent", "×0.5"],
          ["Noise or closed", "×0"],
        ]}
        foot="Change it with the Target / Adjacent / Noise buttons."
      />
    </InfoTip>
  );
}

export function CapacityTip() {
  return (
    <InfoTip label="capacity">
      <Rules
        lead="Can they afford and sustain a retainer? Proof of a real, busy business."
        rows={[
          ["Review count (200+ is full marks)", "up to 25"],
          ["Rating 4.5+ / 4.0+", "8 / 6"],
          ["Own website", "3"],
          ["Opening hours listed", "2"],
          ["Two or more categories", "2"],
        ]}
        foot="Max 40. High capacity means they can pay."
      />
    </InfoTip>
  );
}

export function GapsTip() {
  return (
    <InfoTip label="gaps">
      <Rules
        lead="Visible weaknesses you can fix, so the pitch has something concrete to point at."
        rows={[
          ["No website / only a social, builder or directory page", "10 / 7"],
          ["Under 10 photos on Google", "6"],
          ["Under half the area's median reviews", "10"],
          ["No opening hours", "4"],
          ["No booking link", "3"],
          ["Rating between 3.0 and 4.3", "2"],
        ]}
        foot="Max 35. High gaps means they need the help."
      />
    </InfoTip>
  );
}

export function ReachabilityTip() {
  return (
    <InfoTip label="reachability">
      <Rules
        lead="How easily you can contact them."
        rows={[
          ["Phone number listed", "15"],
          ["Website listed", "10"],
        ]}
        foot="Max 25. A business you can't call or look up is hard to pitch."
      />
    </InfoTip>
  );
}
