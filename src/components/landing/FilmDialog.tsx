"use client";

import { useRef } from "react";

// "Watch the film": a native modal <dialog> (focus trap, Esc, inert page for
// free) with the 57 s film and its sound. The video only loads when opened
// and stops when the dialog closes, however it closes.
export function FilmDialog({
  src,
  poster,
  open,
  len,
  title,
  close,
}: {
  src: string;
  poster: string;
  open: string;
  len: string;
  title: string;
  close: string;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  return (
    <>
      <button
        type="button"
        className="lp-btn lp-btn-ghost"
        onClick={() => {
          dlg.current?.showModal();
          void vid.current?.play().catch(() => {});
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden focusable="false" className="lp-play">
          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
        {open}
        <span className="lp-btn-meta">{len}</span>
      </button>
      <dialog
        ref={dlg}
        className="lp-film"
        aria-label={title}
        onClose={() => vid.current?.pause()}
        onClick={(e) => {
          // A click on the backdrop (the dialog box itself, outside the frame) closes it.
          if (e.target === dlg.current) dlg.current.close();
        }}
      >
        <div className="lp-film-frame">
          <video
            ref={vid}
            controls
            playsInline
            preload="none"
            poster={poster}
            width={1920}
            height={1080}
          >
            <source src={src} type="video/mp4" />
          </video>
          <button type="button" className="lp-film-x" onClick={() => dlg.current?.close()}>
            {close}
          </button>
        </div>
      </dialog>
    </>
  );
}
