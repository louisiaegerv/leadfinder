"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { setOwnerName } from "@/app/actions";
import { MAX_OWNER_NAME } from "@/lib/owner-limits";

/** The owner, with a way to type or fix the name yourself. A name you type is never replaced by a search or scan. */
export function OwnerEditor({
  placeId,
  ownerName,
  typedByYou,
  isGuess,
  role,
}: {
  placeId: string;
  ownerName: string | null;
  typedByYou: boolean;
  /** Only one source named them, so it is a best guess. */
  isGuess: boolean;
  /** Their title from the website, if known. */
  role: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ownerName ?? "");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const open = () => {
    setValue(ownerName ?? "");
    setEditing(true);
    setTimeout(() => input.current?.select(), 0);
  };
  const save = (name: string | null) =>
    start(async () => {
      try {
        await setOwnerName(placeId, name);
        setEditing(false);
        toast.success(name ? `Owner saved: ${name}` : "Owner cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the owner");
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
        <UserRound className="size-3.5 text-muted-foreground" />
        <input
          ref={input}
          autoFocus
          value={value}
          maxLength={MAX_OWNER_NAME}
          disabled={pending}
          placeholder="Owner's name"
          aria-label="Owner's name"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="h-7 w-52 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button type="submit" disabled={pending} title="Save" aria-label="Save" className="rounded-md p-1 text-emerald-600 hover:bg-muted dark:text-emerald-400">
          <Check className="size-4" />
        </button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} title="Cancel" aria-label="Cancel" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
        {ownerName && (
          <button type="button" disabled={pending} onClick={() => save(null)} title="Clear the owner" aria-label="Clear the owner" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
            <Trash2 className="size-4" />
          </button>
        )}
      </form>
    );
  }

  if (!ownerName) {
    return (
      <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Plus className="size-3.5" /> Add owner
      </button>
    );
  }

  return (
    <span
      className="group inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1"
      title={typedByYou ? "Typed by you: no search or scan will replace it" : isGuess ? "Best guess: a single source named them" : "Owner, confirmed by more than one source"}
    >
      <UserRound className="size-3.5" /> <b>{ownerName}</b>
      {role && <span className="text-muted-foreground">{role}</span>}
      {typedByYou ? <span className="text-xs text-muted-foreground">(typed by you)</span> : isGuess && <span className="text-xs text-muted-foreground">(best guess)</span>}
      <button type="button" onClick={open} title="Edit the owner" aria-label="Edit the owner" className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
        <Pencil className="size-3" />
      </button>
    </span>
  );
}
