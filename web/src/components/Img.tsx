import { useEffect, useRef, useState } from "react";
import { localImg } from "../lib/data";
import type { Photo } from "../lib/types";
import { Icon } from "./Icon";

// Licence credit: every Wikimedia photo shows its author and licence on hover or tap.
export function Credit({ photo, down = false }: { photo: Photo; down?: boolean }) {
  const text = (photo.credit ?? "Wikimedia Commons").replace(/\s+/g, " ").trim();
  return (
    <span className={`credit${down ? " down" : ""}`}>
      <button type="button" aria-label={`Photo credit: ${text}`}><Icon name="camera" size={14} /></button>
      <span className="credit-pop" role="tooltip">
        {text}
        {photo.page && <> · <a href={photo.page} target="_blank" rel="noreferrer">source</a></>}
      </span>
    </span>
  );
}

// Loads the photo from the VPS cache first; if that is missing, falls back to Wikimedia; if that fails, shows a tidy placeholder.
export function Img({ photo, size = 800, alt, priority = false, showCredit = true }: {
  photo: Photo; size?: 800 | 1600; alt: string; priority?: boolean; showCredit?: boolean;
}) {
  const [src, setSrc] = useState(() => localImg(photo, size));
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => { setSrc(localImg(photo, size)); setState("loading"); }, [photo.id, size]);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth > 0) setState("loaded");
  }, [src]);

  const onError = () => (src !== photo.src ? setSrc(photo.src) : setState("failed"));

  return (
    <div className={`ph ${state}`}>
      {state !== "failed" && (
        <img ref={ref} src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async"
          onLoad={() => setState("loaded")} onError={onError} />
      )}
      {state === "failed" && <div className="ph-fallback" aria-hidden="true">{alt.slice(0, 1)}</div>}
      {showCredit && state === "loaded" && <Credit photo={photo} />}
    </div>
  );
}
