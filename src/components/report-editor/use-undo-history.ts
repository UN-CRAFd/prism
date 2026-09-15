import { useEffect, useRef, useState } from "react";
import { type HistoryCommand } from "@/components/report-editor/types";

export function useUndoHistory({
  resetKeys,
  onAfterApply,
}: {
  resetKeys: unknown[];
  onAfterApply?: () => void;
}) {
  const [undoStack, setUndoStack] = useState<HistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryCommand[]>([]);

  function pushCommand(cmd: HistoryCommand) {
    setUndoStack((s) => [...s, cmd].slice(-100));
    setRedoStack([]);
  }

  function undo() {
    if (!undoStack.length) return;
    const cmd = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, cmd]);
    cmd.undo();
    onAfterApply?.();
  }

  function redo() {
    if (!redoStack.length) return;
    const cmd = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s, cmd]);
    cmd.redo();
    onAfterApply?.();
  }

  // History is scoped to the current section visit — reset it when the section
  // or report changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setUndoStack([]); setRedoStack([]); }, resetKeys);

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => { undoRef.current = undo; redoRef.current = redo; });
  useEffect(() => {
    const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password"]);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        if (t.tagName === "TEXTAREA") return;
        if (t.tagName === "INPUT") {
          const type = (t as HTMLInputElement).type.toLowerCase();
          if (!type || TEXT_INPUT_TYPES.has(type)) return;
        }
        if ((t as HTMLElement).isContentEditable) return;
      }
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redoRef.current(); else undoRef.current(); }
      else if (k === "y") { e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { pushCommand, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
