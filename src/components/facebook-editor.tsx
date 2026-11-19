"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { setFacebookPage } from "@/app/actions";
import { Button } from "@/components/ui/button";

const inputCls = "h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Type in or fix the Facebook page link and page ID. A page you set is never replaced by a search or scan. */
export function FacebookEditor({ placeId, pageUrl, pageId }: { placeId: string; pageUrl: string | null; pageId: string | null }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(pageUrl ?? "");
  const [id, setId] = useState(pageId ?? "");
  const [pending, start] = useTransition();

  const open = () => {
    setUrl(pageUrl ?? "");
    setId(pageId ?? "");
    setEditing(true);
  };
  const save = (nextUrl: string | null, nextId: string | null) =>
    start(async () => {
      try {
        const saved = await setFacebookPage(placeId, nextUrl, nextId);
        setEditing(false);
        toast.success(saved.pageUrl ? "Facebook page saved" : "Facebook page cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the Facebook page");
      }
    });

  if (!editing) {
    return (
      <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        {pageUrl ? <Pencil className="size-3" /> : <Plus className="size-3" />} {pageUrl ? "Edit page" : "Enter page manually"}
      </button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(url.trim() || null, id.trim() || null);
      }}
    >
      <label className="block space-y-1 text-xs text-muted-foreground">
        Page link
        <input autoFocus value={url} disabled={pending} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="facebook.com/AcmeEpoxy" aria-label="Facebook page link" className={inputCls} />
      </label>
      <label className="block space-y-1 text-xs text-muted-foreground">
        Page ID <span className="text-muted-foreground/70">(optional; the Ad Library lookup needs it. With only an ID, the link is made for you.)</span>
        <input value={id} disabled={pending} inputMode="numeric" maxLength={40} onChange={(e) => setId(e.target.value)} placeholder="100063123456789" aria-label="Facebook page ID" className={`${inputCls} font-mono`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
        {pageUrl && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(null, null)} className="ml-auto text-muted-foreground hover:text-destructive">
            Remove page
          </Button>
        )}
      </div>
    </form>
  );
}
