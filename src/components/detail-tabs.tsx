"use client";

import { useState } from "react";
import { Gauge, Info, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseTab, type DetailTab } from "@/lib/detail-tab";

/**
 * Splits the business page by job: working the lead, understanding the score, reference facts.
 * The panels arrive as server-rendered children; the active tab is mirrored into ?tab= so a
 * refresh or a shared link lands on the same one.
 */
export function DetailTabs({
  initial,
  callCount,
  outreach,
  score,
  details,
}: {
  initial: DetailTab;
  callCount: number;
  outreach: React.ReactNode;
  score: React.ReactNode;
  details: React.ReactNode;
}) {
  const [tab, setTab] = useState<DetailTab>(initial);

  function change(value: unknown) {
    const next = parseTab(String(value));
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "outreach") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={change} className="gap-4">
      <TabsList variant="line" className="h-10 w-full justify-start gap-6 rounded-none border-b px-0 pb-0">
        <TabsTrigger value="outreach" className="h-10 flex-none px-1 after:bottom-[-1px]">
          <Phone /> Outreach
          {callCount > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{callCount}</span>}
        </TabsTrigger>
        <TabsTrigger value="score" className="h-10 flex-none px-1 after:bottom-[-1px]">
          <Gauge /> Score &amp; offers
        </TabsTrigger>
        <TabsTrigger value="details" className="h-10 flex-none px-1 after:bottom-[-1px]">
          <Info /> Details
        </TabsTrigger>
      </TabsList>

      {/* Kept mounted so a half-written call note survives a trip to another tab. */}
      <TabsContent value="outreach" keepMounted>{outreach}</TabsContent>
      {/* Not kept mounted: the score bars animate in each time you open this tab. */}
      <TabsContent value="score">{score}</TabsContent>
      <TabsContent value="details">{details}</TabsContent>
    </Tabs>
  );
}
