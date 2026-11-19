"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, StickyNote } from "lucide-react";
import { setNote } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTE } from "@/lib/note-limits";

/** Your own notes on a business: research before the first call, things to remember after. Saving is not a call. */
export function NoteCard({ placeId, note }: { placeId: string; note: string | null }) {
  const [saved, setSaved] = useState(note ?? "");
  const [value, setValue] = useState(note ?? "");
  const [pending, start] = useTransition();
  const dirty = value.trim() !== saved.trim();

  // Show a note changed elsewhere (another tab, the queue) once this box has nothing unsaved.
  const incoming = note ?? "";
  if (!dirty && incoming !== saved) {
    setSaved(incoming);
    setValue(incoming);
  }

  function save() {
    start(async () => {
      try {
        const r = await setNote(placeId, value.trim() || null);
        setSaved(r.note ?? "");
        setValue(r.note ?? "");
        toast.success(r.note ? "Note saved" : "Note cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the note");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><StickyNote className="size-4" /> Notes</CardTitle>
        <CardDescription>Yours to keep, before or after a call. Saving a note does not log a call or change the stage. Shared across niches.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          maxLength={MAX_NOTE}
          rows={3}
          disabled={pending}
          placeholder="e.g. Owner posts on Facebook daily, no booking link, mention the 4.9 rating…"
          aria-label="Notes about this business"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && dirty && !pending) save();
          }}
        />
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending && <Loader2 className="animate-spin" />} Save note
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setValue(saved)} disabled={pending}>Undo changes</Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{value.length}/{MAX_NOTE}</span>
        </div>
      </CardContent>
    </Card>
  );
}
