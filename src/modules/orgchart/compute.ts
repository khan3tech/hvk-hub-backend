// Pure reporting-line graph functions for the org chart (specs/016-org-chart-visualization).
// Each employee has at most one manager, so the graph is a set of trees plus (only through bad
// data) cycles. Every walk is bounded, so a cycle can never loop forever (FR-007, SC-003).

export interface Person {
  id: string;
  managerId: string | null;
}

export interface Forest<T extends Person> {
  byId: Map<string, T>;
  children: Map<string, T[]>;
  // Roots: no manager, or a manager who isn't an active employee (offboarded/unknown).
  roots: T[];
  // Members of reporting-line cycles (unreachable from any root).
  cycles: string[][];
}

export function buildForest<T extends Person>(people: T[], sortKey: (p: T) => string = (p) => p.id): Forest<T> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const p of people) {
    if (p.managerId && byId.has(p.managerId) && p.managerId !== p.id) {
      children.set(p.managerId, [...(children.get(p.managerId) ?? []), p]);
    } else if (!p.managerId || !byId.has(p.managerId)) {
      roots.push(p);
    }
  }
  for (const list of children.values()) list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  roots.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  // Everything reachable from a root is a proper tree; whatever is left sits in (or hangs off) a cycle.
  const reached = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const p = stack.pop()!;
    if (reached.has(p.id)) continue;
    reached.add(p.id);
    stack.push(...(children.get(p.id) ?? []));
  }
  const cycles: string[][] = [];
  const inCycle = new Set<string>();
  for (const p of people) {
    if (reached.has(p.id) || inCycle.has(p.id)) continue;
    // Walk up until a node repeats: that repeat starts the cycle.
    const seen: string[] = [];
    let cur: T | undefined = p;
    while (cur && !seen.includes(cur.id) && !inCycle.has(cur.id)) {
      seen.push(cur.id);
      cur = cur.managerId ? byId.get(cur.managerId) : undefined;
    }
    if (cur && seen.includes(cur.id)) {
      const cycle = seen.slice(seen.indexOf(cur.id));
      cycle.forEach((id) => inCycle.add(id));
      cycles.push(cycle);
    }
  }
  return { byId, children, roots, cycles };
}

// Ancestor chain from a root down to `id` (for search auto-expand, FR-004). Null when `id` is in
// or below a cycle (it has no root to expand from).
export function pathTo<T extends Person>(forest: Forest<T>, id: string): string[] | null {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur = forest.byId.get(id);
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    path.unshift(cur.id);
    if (!cur.managerId || !forest.byId.has(cur.managerId)) return path;
    cur = forest.byId.get(cur.managerId);
  }
  return null;
}
