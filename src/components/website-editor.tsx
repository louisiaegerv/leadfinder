"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { setWebsite } from "@/app/actions";
import { MAX_WEBSITE } from "@/lib/website-manual";

/** The business's website, with a way to type or fix it yourself. A site you type is kept when Maps is searched again. */
export function WebsiteEditor({ placeId, website, domain, typedByYou }: { placeId: string; website: string | null; domain: string | null; typedByYou: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(website ?? "");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const open = () => {
    setValue(website ?? "");
    setEditing(true);
    setTimeout(() => input.current?.select(), 0);
  };
  const save = (next: string | null) =>
    start(async () => {
      try {
        const saved = await setWebsite(placeId, next);
        setEditing(false);
        toast.success(saved.website ? `Website saved: ${saved.domain}` : "Website cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the website");
      }
    });

  if (editing) {
    return (
      <form
        className="inline-flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save(value.trim() || null);
        }}
      >
        <ExternalLink className="size-3.5 text-muted-foreground" />
        <input
          ref={input}
          autoFocus
          value={value}
          maxLength={MAX_WEBSITE}
          disabled={pending}
          placeholder="acmeepoxy.com"
          aria-label="Website"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="h-7 w-60 max-w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button type="submit" disabled={pending} title="Save" aria-label="Save" className="rounded-md p-1 text-emerald-600 hover:bg-muted dark:text-emerald-400">
          <Check className="size-4" />
        </button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} title="Cancel" aria-label="Cancel" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
        {website && (
          <button type="button" disabled={pending} onClick={() => save(null)} title="Remove the website" aria-label="Remove the website" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
            <Trash2 className="size-4" />
          </button>
        )}
      </form>
    );
  }

  if (!website) {
    return (
      <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Plus className="size-3.5" /> Add website
      </button>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md border hover:bg-muted/50" title={typedByYou ? "Typed by you: a new Maps search will not replace it" : undefined}>
      <a className="inline-flex items-center gap-1 rounded-l-md px-2.5 py-1 hover:bg-muted" href={website} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-3.5" /> {domain ?? "Website"}
        {typedByYou && <span className="text-xs text-muted-foreground">(typed by you)</span>}
      </a>
      <button type="button" onClick={open} title="Edit the website" aria-label="Edit the website" className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
        <Pencil className="size-3" />
      </button>
    </span>
  );
}
