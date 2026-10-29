"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { setDailyGoal } from "@/app/actions";
import { MAX_DAILY_GOAL } from "@/lib/call-queue";

/** Calls made today, against an optional target you set yourself. */
export function DailyGoal({ dials, goal }: { dials: number; goal: number | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goal ? String(goal) : "");
  const [pending, start] = useTransition();

  const save = (next: number | null) =>
    start(async () => {
      try {
        await setDailyGoal(next);
        setEditing(false);
        toast.success(next ? `Daily goal: ${next} calls` : "Daily goal cleared");
      } catch {
        toast.error(`Pick a whole number from 1 to ${MAX_DAILY_GOAL}`);
      }
    });

  const pct = goal ? Math.min(100, Math.round((dials / goal) * 100)) : 0;

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Today: <b className="tabular-nums">{dials}</b>
          {goal ? <span className="text-muted-foreground"> / {goal}</span> : null} {dials === 1 && !goal ? "call" : "calls"}
          {goal && dials >= goal ? <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">goal reached</span> : null}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValue(goal ? String(goal) : "");
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <Pencil className="size-3" /> {goal ? "Change goal" : "Set a daily goal"}
          </button>
        )}
      </div>

      {editing && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = value.trim() === "" ? null : Number(value);
            save(n);
          }}
        >
          <input
            autoFocus
            type="number"
            min={1}
            max={MAX_DAILY_GOAL}
            inputMode="numeric"
            value={value}
            disabled={pending}
            placeholder="Calls a day"
            aria-label="Daily call goal"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            className="h-7 w-28 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button type="submit" disabled={pending} title="Save" aria-label="Save goal" className="rounded-md p-1 text-emerald-600 hover:bg-muted dark:text-emerald-400">
            <Check className="size-4" />
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)} title="Cancel" aria-label="Cancel" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
          <span className="text-xs text-muted-foreground">Leave empty for no goal.</span>
        </form>
      )}

      {goal ? (
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={dials} aria-valuemin={0} aria-valuemax={goal} aria-label="Calls today against your goal">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
