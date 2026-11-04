"use client";

import { useEffect, useRef } from "react";

// A muted decorative loop: it only plays while on screen and stays on its
// poster frame under prefers-reduced-motion.
export function LoopVideo({
  webm,
  poster,
  width,
  height,
}: {
  webm: string;
  poster: string;
  width: number;
  height: number;
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
      preload="metadata"
      poster={poster}
      width={width}
      height={height}
      aria-hidden
      tabIndex={-1}
    >
      <source src={webm} type="video/webm" />
    </video>
  );
}
