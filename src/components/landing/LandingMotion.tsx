"use client";

import { useEffect } from "react";

// All the page's motion in one place, on one scroll clock:
// - [data-reveal] rises once as it enters (content is visible without script;
//   .js-reveal, which hides it until its turn, is only added here);
// - [data-chapters]: the chapter at the middle of the screen becomes the
//   sticky stage's fragment (and the only stage video playing);
// - [data-turn]: the film's turn clip is scrubbed by the section's progress,
//   and the caption phase follows it;
// - [data-parallax="px"]: a small drift, transform only.
// Under prefers-reduced-motion nothing travels or plays: chapters still swap
// (instantly), the turn rests on its end frame with every caption shown.
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // ---- reveals
    if ("IntersectionObserver" in window && !reduce) {
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
      root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
      cleanups.push(() => {
        io.disconnect();
        root.classList.remove("js-reveal");
      });
    }

    // ---- chapters: whichever item crosses the middle band is active
    for (const sec of root.querySelectorAll<HTMLElement>("[data-chapters]")) {
      const vids = [...sec.querySelectorAll<HTMLVideoElement>("[data-stage]")];
      let inView = false;
      const activate = (i: number) => {
        sec.dataset.active = String(i);
        vids.forEach((v, j) => {
          if (j === i && inView && !reduce && v.offsetParent) {
            if (v.preload === "none") v.preload = "auto";
            void v.play().catch(() => {});
          } else v.pause();
        });
      };
      const items = new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (e.isIntersecting) activate(Number((e.target as HTMLElement).dataset.ch));
        },
        { rootMargin: "-45% 0px -45% 0px" },
      );
      sec.querySelectorAll("[data-ch]").forEach((el) => items.observe(el));
      const whole = new IntersectionObserver(([e]) => {
        inView = e.isIntersecting;
        activate(Number(sec.dataset.active ?? 0));
      });
      whole.observe(sec);
      sec.dataset.active = "0";
      cleanups.push(() => {
        items.disconnect();
        whole.disconnect();
        vids.forEach((v) => v.pause());
      });
    }

    // ---- [data-countup]: the Prism number counts up once, when it enters
    for (const el of root.querySelectorAll<HTMLElement>("[data-countup]")) {
      const target = Number(el.textContent);
      if (!Number.isFinite(target) || reduce) continue;
      const io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          const t0 = performance.now();
          const dur = 1100;
          const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / dur);
            el.textContent = String(Math.round(target * (1 - Math.pow(2, -10 * p))));
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = String(target);
          };
          requestAnimationFrame(tick);
        },
        { threshold: 0.4 },
      );
      io.observe(el);
      cleanups.push(() => io.disconnect());
    }

    // ---- one scroll clock for the turn and the drifts
    const turn = root.querySelector<HTMLElement>("[data-turn]");
    const turnVid = turn?.querySelector<HTMLVideoElement>("video") ?? null;
    const bar = turn?.querySelector<HTMLElement>(".lp-turn-bar span") ?? null;
    const drifts = [...root.querySelectorAll<HTMLElement>("[data-parallax]")];
    if (turn && reduce) turn.dataset.phase = "all";
    if (reduce || (!turn && !drifts.length)) return () => cleanups.forEach((f) => f());

    let raf = 0;
    let lastT = -1;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
      if (turn && turnVid) {
        const r = turn.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
        turn.dataset.phase = String(Math.min(2, Math.floor(p * 3)));
        if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`;
        const d = turnVid.duration;
        if (d && turnVid.readyState >= 1) {
          const t = Math.min(d - 0.05, p * d);
          if (Math.abs(t - lastT) > 1 / 60) {
            turnVid.currentTime = t;
            lastT = t;
          }
        }
      }
      for (const el of drifts) {
        const a = (el.parentElement ?? el).getBoundingClientRect();
        const p = Math.max(-1, Math.min(1, (a.top + a.height / 2 - vh / 2) / vh));
        el.style.translate = `0 ${(p * Number(el.dataset.parallax)).toFixed(1)}px`;
      }
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    turnVid?.addEventListener("loadedmetadata", request);
    cleanups.push(() => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      turnVid?.removeEventListener("loadedmetadata", request);
      if (raf) cancelAnimationFrame(raf);
      drifts.forEach((el) => (el.style.translate = ""));
    });
    return () => cleanups.forEach((f) => f());
  }, []);

  return null;
}
