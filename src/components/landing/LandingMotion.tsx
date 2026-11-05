"use client";

import { useEffect } from "react";

// Entrances: each [data-reveal] rises once as it enters the viewport, staggered
// by its --i. Content is visible without script; the .js-reveal class (which
// hides it until its turn) is only added once this effect runs.
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (!("IntersectionObserver" in window)) return;
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("js-reveal");
    };
  }, []);

  // Scroll-linked drift for [data-parallax="px"]: the value is the maximum px
  // shift at the viewport edges, transform only, one rAF. The parent (never
  // transformed) is measured, so the loop cannot feed back into itself.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".lp [data-parallax]")];
    if (!els.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of els) {
        const anchor = (el.parentElement ?? el).getBoundingClientRect();
        const p = Math.max(-1, Math.min(1, (anchor.top + anchor.height / 2 - vh / 2) / vh));
        el.style.transform = `translateY(${(p * Number(el.dataset.parallax)).toFixed(1)}px)`;
      }
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (raf) cancelAnimationFrame(raf);
      els.forEach((el) => (el.style.transform = ""));
    };
  }, []);

  return null;
}
