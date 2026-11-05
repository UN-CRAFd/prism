import type { ReactNode } from "react";

// Renders an admin-editable instruction string as React nodes, supporting only
//   **bold**            → <strong>
//   [label](https://…)  → <a target="_blank"> (http:, https: and mailto: only)
// Everything else — including links with any other scheme — stays plain text.
// Nodes are built directly (no dangerouslySetInnerHTML), so the text can never
// inject markup, and line breaks in the string are left untouched.
const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isAllowedUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function formatInstruction(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>);
    } else if (isAllowedUrl(m[3])) {
      nodes.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
        >
          {m[2]}
        </a>
      );
    } else {
      nodes.push(m[0]);
    }
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
