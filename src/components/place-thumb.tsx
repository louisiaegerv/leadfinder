"use client";

import { useState } from "react";
import { hueFor, initials, thumbSrc } from "@/lib/images";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
};

/**
 * Business photo with a coloured initials tile when there is no usable image
 * (none stored, Street View only, or the Google URL fails to load).
 */
export function PlaceThumb({ title, imageUrl, thumbnailUrl, logoUrl, size = 48, className }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const src = thumbSrc({ imageUrl, thumbnailUrl }, size * 2); // 2x for sharp screens
  const hue = hueFor(title);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {src && !photoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Google-hosted URLs, deliberately not proxied
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setPhotoFailed(true)}
          className="size-full rounded-lg object-cover ring-1 ring-black/5"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-full items-center justify-center rounded-lg text-sm font-semibold ring-1 ring-black/5"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${(hue + 40) % 360} 70% 84%))`,
            color: `hsl(${hue} 45% 28%)`,
            fontSize: Math.max(11, size * 0.32),
          }}
        >
          {initials(title)}
        </div>
      )}
      {logoUrl && !logoFailed && size >= 40 && (
        // eslint-disable-next-line @next/next/no-img-element -- Google-hosted URLs, deliberately not proxied
        <img
          src={logoUrl}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setLogoFailed(true)}
          className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full bg-white object-cover ring-2 ring-white"
        />
      )}
    </div>
  );
}
