"use client";

import { useEffect } from "react";

// Keeps the `scroll-fade` edge masks (globals.css) off the scrollbars.
//
// The left/right fade is a mask on the scroll box, and browsers paint the
// box's scrollbars inside the masked area — so without help the ends of the
// scrollbar fade along with the table. CSS can't measure scrollbar size, so
// this sets two custom properties on every `.scroll-fade` element:
//   --sf-sbh  height of the horizontal scrollbar (0 when there is none)
//   --sf-sbw  width of the vertical scrollbar
// and the mask's fade layer is sized to stop short of them.
//
// Mounted once in the root layout. New boxes (tab switches, client navigation)
// are picked up by a MutationObserver; size changes (window resize, rows
// added, a scrollbar appearing) by a ResizeObserver on the box and its table.
export function ScrollFadeObserver() {
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    const seen = new WeakSet<HTMLElement>();

    const measure = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const bx = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const by = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const sbw = Math.max(0, el.offsetWidth - el.clientWidth - bx);
      const sbh = Math.max(0, el.offsetHeight - el.clientHeight - by);
      el.style.setProperty("--sf-sbw", `${sbw}px`);
      el.style.setProperty("--sf-sbh", `${sbh}px`);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const t = entry.target as HTMLElement;
        const box = t.classList.contains("scroll-fade") ? t : t.closest<HTMLElement>(".scroll-fade");
        if (box) measure(box);
      }
    });

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".scroll-fade").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        resizeObserver.observe(el);
        // The table's size decides whether scrollbars exist at all.
        if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);
        measure(el);
      });
    };

    let frame = 0;
    const mutationObserver = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; scan(); });
    });

    scan();
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return null;
}
