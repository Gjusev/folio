"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// The launch film laid over the static AI fragment: the fragment is the whole
// visual on the server, without JS and under prefers-reduced-motion; with
// motion allowed the muted loop covers it once mounted, so nothing flashes.
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

export function AiFilm({ src, label }: { src: string; label: string }) {
  const motionOk = useSyncExternalStore(
    subscribe,
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!motionOk) return;
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [motionOk]);

  if (!motionOk) return null;

  return (
    <video
      ref={ref}
      className="lp-ai-video"
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label}
      tabIndex={-1}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
