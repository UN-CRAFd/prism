"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// PDF viewer with highlights and zoom, for the Report Import review.
//
// Each page is drawn with pdf.js: a canvas (the page image) plus an invisible
// text layer on top. Each highlight is a list of text snippets expected on a
// given page; the snippets are located in the page's text layer and those text
// runs are marked: yellow for everything extracted, orange for the item being
// reviewed.
//
// Matching ignores case, spacing and punctuation, because the extraction fixes
// PDF line-wrapping and hyphenation. Long snippets are also matched piece by
// piece, so a value that differs in a few words is still mostly marked.
//
// Zoom: 100% = page width fits the panel. Text layers are built for every page
// (cheap, and needed for the highlights); page images are only drawn for pages
// near the visible area, so high zoom levels do not use hundreds of MB.
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfHighlight {
  id: string;
  /** Page the item came from (1-based); null = search every page. */
  page: number | null;
  texts: string[];
  /** Dropdown values: the document may show them cut off ("News medi…"), so
   *  they also match by their beginning. */
  prefixTexts?: string[];
}

type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

interface PageText {
  /** Normalised page text (letters and digits only). */
  norm: string;
  /** For each character of `norm`, the index of the text run it belongs to. */
  owner: number[];
  divs: HTMLElement[];
}

/** Snippets shorter than this (normalised) are ignored. */
const MIN_SNIPPET = 4;
/** Below this, a snippet must match exactly (no piecewise matching). */
const MIN_PIECEWISE = 16;
const CHUNK = 30;
const MIN_PIECE = 8;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? z;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? z;
}

function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildPageText(strs: string[], divs: HTMLElement[]): PageText {
  let norm = "";
  const owner: number[] = [];
  strs.forEach((s, i) => {
    const n = normalise(s);
    norm += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  return { norm, owner, divs };
}

/** Several pages' text joined, so a passage running over a page break matches. */
interface Corpus {
  norm: string;
  page: number[]; // page index of each character
  item: number[]; // text-run index (within that page) of each character
}

function buildCorpus(pages: PageText[], order: number[]): Corpus {
  let norm = "";
  const page: number[] = [];
  const item: number[] = [];
  for (const pi of order) {
    const p = pages[pi];
    norm += p.norm;
    for (let k = 0; k < p.norm.length; k++) {
      page.push(pi);
      item.push(p.owner[k]);
    }
  }
  return { norm, page, item };
}

/**
 * Text runs covered by `snippet`, as "pageIndex:runIndex" keys, plus how many
 * of the snippet's characters were found (for testing coverage).
 */
function locate(corpus: Corpus, snippet: string): { runs: Set<string>; matched: number; total: number } {
  const runs = new Set<string>();
  const target = normalise(snippet);
  if (target.length < MIN_SNIPPET) return { runs, matched: 0, total: 0 };
  let matched = 0;

  const mark = (start: number, len: number) => {
    for (let k = start; k < start + len; k++) runs.add(`${corpus.page[k]}:${corpus.item[k]}`);
    matched += len;
  };

  const whole = corpus.norm.indexOf(target);
  if (whole >= 0) {
    mark(whole, target.length);
    return { runs, matched, total: target.length };
  }
  if (target.length < MIN_PIECEWISE) return { runs, matched, total: target.length };

  // Piecewise, in reading order. A piece that is not found (one character
  // differs, e.g. a fixed typo) is retried as two halves, so a single
  // difference leaves only a small gap.
  let from = 0;
  const find = (piece: string) => {
    if (piece.length < MIN_PIECE) return false;
    const at = corpus.norm.indexOf(piece, from);
    if (at < 0) return false;
    mark(at, piece.length);
    from = at + piece.length;
    return true;
  };
  for (let c = 0; c < target.length; c += CHUNK) {
    const piece = target.slice(c, c + CHUNK);
    if (find(piece)) continue;
    const half = Math.ceil(piece.length / 2);
    find(piece.slice(0, half));
    find(piece.slice(half));
  }
  return { runs, matched, total: target.length };
}

/** For dropdown values shown cut off in the document: the longest beginning
 *  of the value (at least 6 characters) that appears in the text. */
function locatePrefix(corpus: Corpus, snippet: string): Set<string> {
  const runs = new Set<string>();
  const target = normalise(snippet);
  for (let len = target.length; len >= 6; len--) {
    const at = corpus.norm.indexOf(target.slice(0, len));
    if (at < 0) continue;
    for (let k = at; k < at + len; k++) runs.add(`${corpus.page[k]}:${corpus.item[k]}`);
    break;
  }
  return runs;
}

/** Pages to search for an item said to be on `page` (1-based): that page and
 *  the next first (passages run over page breaks), then the previous one
 *  (in case the page number is one too high). */
function searchOrder(page: number | null, count: number): number[] | null {
  if (!page || page > count) return null;
  return [page - 1, page, page - 2].filter((i) => i >= 0 && i < count);
}

export function PdfHighlightViewer({
  file,
  highlights,
  activeId,
  onSelect,
  className,
}: {
  file: File;
  highlights: PdfHighlight[];
  activeId: string | null;
  /** Called with the item id when a highlighted passage is clicked. */
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [loaded, setLoaded] = useState<{ pdfjs: PdfJs; doc: PdfDoc } | null>(null);
  const [pages, setPages] = useState<PageText[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);

  // ── Load the document (once per file) ──
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;

    (async () => {
      try {
        const pdfjs: PdfJs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const doc = await task.promise;
        if (!cancelled) setLoaded({ pdfjs, doc });
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorText(e instanceof Error ? e.message : "The PDF could not be displayed.");
      }
    })();

    return () => {
      cancelled = true;
      setLoaded(null);
      setPages([]);
      setStatus("loading");
      setZoom(1);
      scrolledFor.current = null;
      // Frees the worker and the document once the file changes or the viewer goes away.
      void task?.destroy();
    };
  }, [file]);

  // ── Track the panel width (what "fit width" means), debounced ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setFitWidth(Math.max(320, el.clientWidth - 32));
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // ── Clicking a highlighted passage selects its item on the left ──
  useEffect(() => {
    const host = pagesRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      // Selecting text with the mouse should not count as a click.
      if (window.getSelection()?.toString()) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-hl-id]");
      const id = el?.dataset.hlId;
      if (!id) return;
      scrolledFor.current = id; // the passage is already in view; do not scroll the PDF
      onSelectRef.current?.(id);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, []);

  // ── Ctrl / ⌘ + mouse wheel (and trackpad pinch) zooms ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); // keep the browser from zooming the whole page
      const now = Date.now();
      if (now - last < 150) return;
      last = now;
      setZoom((z) => stepZoom(z, e.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Lay out the pages at the current zoom ──
  useEffect(() => {
    const host = pagesRef.current;
    const scroller = scrollRef.current;
    if (!loaded || !fitWidth || !host || !scroller) return;
    let cancelled = false;

    // Keep the point at the centre of the view where it is when zooming.
    const centreY = scroller.scrollHeight > scroller.clientHeight
      ? (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight
      : 0;
    const centreX = scroller.scrollWidth > scroller.clientWidth
      ? (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth
      : 0.5;

    const dpr = window.devicePixelRatio || 1;
    const draws = new Map<Element, () => void>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const draw = draws.get(entry.target);
          if (!draw) continue;
          draws.delete(entry.target);
          io.unobserve(entry.target);
          draw();
        }
      },
      { root: scroller, rootMargin: "1000px 200px" }
    );

    (async () => {
      try {
        const { pdfjs, doc } = loaded;
        const fresh = document.createElement("div");
        const laidOut: {
          page: Awaited<ReturnType<PdfDoc["getPage"]>>;
          viewport: ReturnType<Awaited<ReturnType<PdfDoc["getPage"]>>["getViewport"]>;
          wrap: HTMLDivElement;
          textDiv: HTMLDivElement;
        }[] = [];

        // 1. Page frames at their final size, so the scroll position can be kept.
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (fitWidth / base.width) * zoom;
          const viewport = page.getViewport({ scale });

          const wrap = document.createElement("div");
          wrap.className = "pdf-page relative mx-auto mb-4 bg-white shadow-sm ring-1 ring-black/10";
          wrap.dataset.page = String(n);
          wrap.style.width = `${viewport.width}px`;
          wrap.style.height = `${viewport.height}px`;
          wrap.style.setProperty("--total-scale-factor", String(scale));
          wrap.style.setProperty("--scale-round-x", "1px");
          wrap.style.setProperty("--scale-round-y", "1px");
          const textDiv = document.createElement("div");
          textDiv.className = "textLayer";
          wrap.appendChild(textDiv);
          fresh.appendChild(wrap);
          laidOut.push({ page, viewport, wrap, textDiv });
        }
        if (cancelled) return;
        host.replaceChildren(...Array.from(fresh.children));
        scroller.scrollTop = centreY * scroller.scrollHeight - scroller.clientHeight / 2;
        scroller.scrollLeft = centreX * scroller.scrollWidth - scroller.clientWidth / 2;

        // 2. Page images, drawn when a page comes near the visible area.
        for (const { page, viewport, wrap } of laidOut) {
          draws.set(wrap, () => {
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            canvas.className = "block";
            wrap.prepend(canvas);
            page
              .render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
              .promise.catch(() => {});
          });
          io.observe(wrap);
        }

        // 3. Text layers for every page (for the highlights).
        const out: PageText[] = [];
        for (const { page, viewport, textDiv } of laidOut) {
          const textLayer = new pdfjs.TextLayer({
            textContentSource: await page.getTextContent(),
            container: textDiv,
            viewport,
          });
          await textLayer.render();
          if (cancelled) return;
          out.push(buildPageText(textLayer.textContentItemsStr, textLayer.textDivs));
        }
        setPages(out);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorText(e instanceof Error ? e.message : "The PDF could not be displayed.");
      }
    })();

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [loaded, zoom, fitWidth]);

  // ── Apply highlights ──
  useEffect(() => {
    if (!pages.length) return;
    for (const p of pages) {
      for (const d of p.divs) {
        d.classList.remove("pdf-hl", "pdf-hl-active");
        d.removeAttribute("data-hl-id");
      }
    }

    const corpora = new Map<string, Corpus>();
    const corpusFor = (order: number[]) => {
      const key = order.join(",");
      let c = corpora.get(key);
      if (!c) corpora.set(key, (c = buildCorpus(pages, order)));
      return c;
    };
    const everyPage = pages.map((_, i) => i);

    let firstActive: HTMLElement | null = null;
    // The active item is applied last so it wins where items overlap.
    const ordered = [...highlights].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId));
    for (const h of ordered) {
      const active = h.id === activeId;
      const near = searchOrder(h.page, pages.length);
      const found: Set<string>[] = [];
      for (const text of h.texts) {
        let { runs } = locate(corpusFor(near ?? everyPage), text);
        // Not near the stated page: look everywhere, but only for text long
        // enough not to match by chance.
        if (!runs.size && near && normalise(text).length >= 24) runs = locate(corpusFor(everyPage), text).runs;
        found.push(runs);
      }
      for (const text of h.prefixTexts ?? []) {
        // Only near the item's own page: short prefixes would match by chance elsewhere.
        if (near) found.push(locatePrefix(corpusFor(near), text));
      }
      for (const runs of found) {
        for (const key of runs) {
          const [pi, ri] = key.split(":").map(Number);
          const div = pages[pi]?.divs[ri];
          if (!div) continue;
          div.classList.remove("pdf-hl", "pdf-hl-active");
          div.classList.add(active ? "pdf-hl-active" : "pdf-hl");
          div.setAttribute("data-hl-id", h.id);
          if (active && !firstActive) firstActive = div;
        }
      }
    }

    // Scroll the viewer (only the viewer, never the page around it) to the item
    // being reviewed — once per item, not again on every re-layout.
    const scroller = scrollRef.current;
    if (activeId && scroller && scrolledFor.current !== activeId) {
      const target =
        firstActive ??
        (() => {
          const page = highlights.find((h) => h.id === activeId)?.page;
          return page ? pagesRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`) ?? null : null;
        })();
      if (target) {
        const t = target.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        scroller.scrollBy({
          top: t.top - s.top - s.height / 3,
          left: zoom > 1 ? t.left - s.left - s.width / 4 : 0,
          behavior: "smooth",
        });
        scrolledFor.current = activeId;
      }
    }
  }, [pages, highlights, activeId, zoom]);

  return (
    <div className={cn("relative flex flex-col rounded-xl border bg-neutral-100 overflow-hidden", className)}>
      <div className="flex items-center gap-1 border-b bg-white px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setZoom((z) => stepZoom(z, -1))}
          disabled={zoom <= ZOOM_STEPS[0]}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setZoom((z) => stepZoom(z, 1))}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setZoom(1)} disabled={zoom === 1}>
          Fit width
        </Button>
        <span className="ml-auto pr-1 text-[11px] text-muted-foreground">Ctrl + scroll to zoom</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
        <div ref={pagesRef} />
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading PDF…
          </div>
        )}
        {status === "error" && (
          <p className="py-6 text-center text-sm text-destructive">{errorText}</p>
        )}
      </div>
    </div>
  );
}
