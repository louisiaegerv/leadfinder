"use client";

import { useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { ImagePlus, Palette, Trash2, Upload, X } from "lucide-react";
import { useAppearance } from "@/components/appearance-provider";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ACCEPTED_TYPES,
  BLUR_MAX,
  MAX_UPLOAD_BYTES,
  OVERLAY_MAX,
  PRESETS,
  REGIONS,
  REGION_LABEL,
  presetThumbUrl,
  presetUrl,
  type Region,
} from "@/lib/appearance-config";
import { cn } from "@/lib/utils";

/** Palette icon for the sidebar header. Phones open the same dialog from the More drawer. */
export function AppearanceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Backgrounds"
        aria-label="Backgrounds"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Palette className="size-4" />
      </button>
      <AppearanceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Not modal and no dimmed backdrop on purpose: you are choosing how the page looks, so the page has to stay visible,
 * and live, behind it. On phones it docks to the bottom of the screen.
 */
export function AppearanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false} disablePointerDismissal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-popover/50 shadow-lg backdrop-blur-md backdrop-saturate-150 p-4 text-sm text-popover-foreground shadow-lg  outline-none duration-150",
            "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[70dvh] max-md:rounded-t-2xl max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]",
            "md:top-4 md:right-4 md:max-h-[calc(100dvh-2rem)] md:w-96 md:rounded-xl",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogPrimitive.Title className="font-heading text-base font-medium">Backgrounds</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                Add a picture behind the sidebar, the main area, or both. A wash of the theme colour sits on top, so text stays readable in light and dark mode.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          {REGIONS.map((region) => (
            <RegionSettings key={region} region={region} />
          ))}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RegionSettings({ region }: { region: Region }) {
  const { appearance, preview, save, upload, choosePreset, remove } = useAppearance();
  const { imageUrl, blur, overlay } = appearance[region];
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (job: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    const r = await job();
    setBusy(false);
    if (!r.ok) toast.error(r.error);
  };

  const onFile = (file: File | undefined) => {
    // Clear the input so choosing the same file again still counts as a change.
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return void toast.error("Use a JPG, PNG, WebP or AVIF image");
    if (file.size > MAX_UPLOAD_BYTES) return void toast.error(`That image is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    void run(() => upload(region, file));
  };

  return (
    // Phones have a tab bar and no sidebar, so there is nothing to style there.
    <section className={cn("space-y-3", region === "sidebar" && "max-md:hidden")}>
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{REGION_LABEL[region]}</h3>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label={`Upload a picture for the ${REGION_LABEL[region].toLowerCase()}`}
          className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted bg-cover bg-center text-muted-foreground transition-colors hover:border-foreground/30 disabled:opacity-50"
          style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
        >
          {!imageUrl && <ImagePlus className="size-5" />}
        </button>
        <input ref={fileInput} type="file" accept={ACCEPTED_TYPES.join(",")} hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload /> {busy ? "Working…" : imageUrl ? "Replace" : "Upload"}
        </Button>
        {imageUrl && (
          <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => run(() => remove(region))} aria-label="Remove background" title="Remove background">
            <Trash2 className="text-destructive" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Or start from a preset</p>
        <div className="grid grid-cols-5 gap-1.5">
          {PRESETS.map((p) => {
            const active = imageUrl === presetUrl(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => choosePreset(region, p.id))}
                aria-pressed={active}
                aria-label={p.label}
                title={p.label}
                className={cn(
                  "aspect-video rounded-md bg-muted bg-cover bg-center ring-offset-1 ring-offset-popover transition-shadow hover:ring-2 hover:ring-foreground/30 disabled:opacity-50",
                  active && "ring-2 ring-primary hover:ring-primary",
                )}
                style={{ backgroundImage: `url("${presetThumbUrl(p.id)}")` }}
              />
            );
          })}
        </div>
      </div>

      <SliderRow label="Blur" unit="px" value={blur} max={BLUR_MAX} disabled={!imageUrl} onPreview={(v) => preview(region, { blur: v })} onCommit={(v) => save(region, { blur: v })} />
      <SliderRow label="Overlay opacity" unit="%" value={overlay} max={OVERLAY_MAX} disabled={!imageUrl} onPreview={(v) => preview(region, { overlay: v })} onCommit={(v) => save(region, { overlay: v })} />
    </section>
  );
}

/** Dragging only changes what you see. Letting go saves it, so the server is not hit on every pixel of movement. */
function SliderRow({
  label,
  unit,
  value,
  max,
  disabled,
  onPreview,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  max: number;
  disabled: boolean;
  onPreview: (v: number) => void;
  onCommit: (v: number) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60")}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={0}
        max={max}
        step={1}
        disabled={disabled}
        onValueChange={(v) => onPreview(v as number)}
        onValueCommitted={async (v) => {
          const r = await onCommit(v as number);
          if (!r.ok) toast.error(r.error);
        }}
      />
    </div>
  );
}
