// Loaded only in the browser (next/dynamic, ssr: false): pdf.js needs the DOM.
// Pattern adapted from assistant-ui/open-prism (MIT): continuous pages, fit to
// width on load, Ctrl/Cmd + wheel to zoom, click on text to find it in the source.
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Served from our own build, not a CDN: works offline and under a strict CSP.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  data: Uint8Array;
  scale: number | null; // null = fit width
  onScale: (scale: number) => void;
  onPages: (pages: number) => void;
  onPageInView: (page: number) => void;
  onTextClick: (text: string) => void;
};

export default function PdfViewer({
  data,
  scale,
  onScale,
  onPages,
  onPageInView,
  onTextClick,
}: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [visiblePage, setVisiblePage] = useState(1);
  const [pageWidth, setPageWidth] = useState(612);
  const [boxWidth, setBoxWidth] = useState(0);
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const file = useMemo(() => ({ data: data.slice() }), [data]);
  const effective = scale ?? (boxWidth > 0 ? Math.min(2, (boxWidth - 48) / pageWidth) : 1);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      onScale(Math.max(0.4, Math.min(3, effective - e.deltaY * 0.002)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [effective, onScale]);

  // Report the page nearest the top of the viewport.
  useEffect(() => {
    const el = box.current;
    if (!el || pages === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) {
          const n = Number((top.target as HTMLElement).dataset.page);
          setVisiblePage(n);
          onPageInView(n);
        }
      },
      { root: el, threshold: 0.3 },
    );
    el.querySelectorAll("[data-page]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pages, onPageInView]);

  return (
    <div
      ref={box}
      className="h-full overflow-auto bg-[var(--pdf-desk)]"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SPAN" && t.closest(".react-pdf__Page__textContent")) {
          const text = t.textContent?.trim();
          if (text && text.length > 3 && !window.getSelection()?.toString()) onTextClick(text);
        }
      }}
    >
      <Document
        // Not suspense: a suspended first mount would drop the memoised copy of the
        // bytes and reload forever (react-pdf README, "Suspense").
        suspense={false}
        file={file}
        onLoadSuccess={({ numPages }) => {
          setPages(numPages);
          onPages(numPages);
        }}
        loading={<p className="p-6 text-sm text-muted">{t("pdf.opening")}</p>}
        error={<p className="p-6 text-sm text-danger">{t("pdf.error")}</p>}
        className="flex flex-col items-center gap-4 p-6"
      >
        {Array.from({ length: pages }, (_, i) => {
          const n = i + 1;
          // Only mount canvases near the visible page: a 300-page thesis at
          // once would exhaust memory. The rest keep their measured size.
          const mounted = Math.abs(n - visiblePage) <= 2 || pages <= 3;
          return (
            <div key={i} data-page={n} id={`pdf-page-${n}`} className="bg-white">
              {mounted ? (
                <Page
                  pageNumber={n}
                  scale={effective}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(p) => n === 1 && setPageWidth(p.originalWidth)}
                />
              ) : (
                <div
                  aria-hidden
                  style={{ width: pageWidth * effective, height: pageWidth * effective * 1.294 }}
                  className="bg-white"
                />
              )}
            </div>
          );
        })}
      </Document>
    </div>
  );
}
