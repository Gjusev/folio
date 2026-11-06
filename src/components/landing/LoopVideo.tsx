"use client";

import { useEffect, useRef } from "react";

// A muted loop: it only plays while on screen and stays on its poster frame
// under prefers-reduced-motion. With a label it describes itself; without one
// it is aria-hidden chrome. `eager` (the hero) preloads the whole clip.
export function LoopVideo({
  src,
  mime,
  poster,
  width,
  height,
  label,
  eager = false,
}: {
  src: string;
  mime: string;
  poster?: string;
  width: number;
  height: number;
  label?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload={eager ? "auto" : "metadata"}
      poster={poster}
      width={width}
      height={height}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={-1}
    >
      <source src={src} type={mime} />
    </video>
  );
}
