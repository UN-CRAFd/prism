// Build a manager → reports hierarchy from a flat list of contacts.
// Cycle-safe: a manager loop (A→B→A) can never produce infinite recursion —
// looping nodes surface as roots instead of being lost.

export interface HasManager {
  id: number;
  manager_id: number | null;
}

export interface TreeNode<T> {
  node: T;
  children: TreeNode<T>[];
}

export function buildContactTree<T extends HasManager>(items: T[]): TreeNode<T>[] {
  const byId = new Map<number, T>(items.map((i) => [i.id, i]));
  const childrenOf = new Map<number | null, T[]>();

  for (const it of items) {
    // A valid parent must exist and not be the node itself.
    const parent =
      it.manager_id != null && it.manager_id !== it.id && byId.has(it.manager_id)
        ? it.manager_id
        : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(it);
    childrenOf.set(parent, list);
  }

  const visited = new Set<number>();
  const build = (parentId: number | null): TreeNode<T>[] => {
    const kids = childrenOf.get(parentId) ?? [];
    const out: TreeNode<T>[] = [];
    for (const k of kids) {
      if (visited.has(k.id)) continue; // guards against manager cycles
      visited.add(k.id);
      out.push({ node: k, children: build(k.id) });
    }
    return out;
  };

  const roots = build(null);
  // Anything trapped in a cycle was never reached from a root — surface it flat
  // so no contact silently disappears.
  const orphans = items
    .filter((i) => !visited.has(i.id))
    .map((i) => ({ node: i, children: [] as TreeNode<T>[] }));
  return [...roots, ...orphans];
}

// Depth-first flattening for a "list with indented reports" rendering.
export function flattenTree<T>(roots: TreeNode<T>[]): { node: T; depth: number }[] {
  const out: { node: T; depth: number }[] = [];
  const walk = (nodes: TreeNode<T>[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n.node, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

// All contacts below `id` (its reports, their reports, …). Used to keep the
// manager picker from creating a cycle.
export function descendantIds<T extends HasManager>(items: T[], id: number): Set<number> {
  const childrenOf = new Map<number, T[]>();
  for (const it of items) {
    if (it.manager_id != null) {
      const list = childrenOf.get(it.manager_id) ?? [];
      list.push(it);
      childrenOf.set(it.manager_id, list);
    }
  }
  const out = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf.get(cur) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return out;
}
