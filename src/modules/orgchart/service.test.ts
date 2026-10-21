import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../employee/service.js", () => ({
  getEmployeeSummary: vi.fn(),
  listActiveEmployeeSummaries: vi.fn(),
  listDepartments: vi.fn(),
  listDesignations: vi.fn(),
}));
vi.mock("../organizations/service.js", () => ({ getTopEmployeeId: vi.fn(), setTopEmployeeId: vi.fn() }));

const employees = await import("../employee/service.js");
const orgs = await import("../organizations/service.js");
const { buildForest, pathTo } = await import("./compute.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "ceo" };
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "dev2" };
const p = (id: string, managerId: string | null, o: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), email: `${id}@x.dev`, departmentId: "eng", designationId: "swe", managerId, dateOfJoining: new Date(), ...o });

// ceo -> cto -> (dev1, dev2); ceo -> cfo; stray (no manager); loopA <-> loopB (bad data)
const PEOPLE = [p("ceo", null), p("cto", "ceo"), p("dev1", "cto"), p("dev2", "cto"), p("cfo", "ceo"), p("stray", null), p("loopa", "loopb"), p("loopb", "loopa")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.listActiveEmployeeSummaries).mockResolvedValue(PEOPLE as never);
  vi.mocked(employees.listDepartments).mockResolvedValue([{ id: "eng", name: "Engineering", headEmployeeId: "cto" }, { id: "ops", name: "Ops", headEmployeeId: null }] as never);
  vi.mocked(employees.listDesignations).mockResolvedValue([{ id: "swe", title: "Engineer" }] as never);
  vi.mocked(orgs.getTopEmployeeId).mockResolvedValue("ceo");
});

describe("org chart graph (FR-007, SC-003)", () => {
  it("separates trees from cycles without looping", () => {
    const f = buildForest(PEOPLE);
    expect(f.roots.map((r) => r.id).sort()).toEqual(["ceo", "stray"]);
    expect(f.cycles).toEqual([["loopa", "loopb"]]);
    expect(pathTo(f, "dev2")).toEqual(["ceo", "cto", "dev2"]);
    expect(pathTo(f, "loopa")).toBeNull();
  });

  it("treats a self-managed record as a one-node cycle", () => {
    const f = buildForest([p("self", "self")]);
    expect(f.roots).toEqual([]);
    expect(f.cycles).toEqual([["self"]]);
  });
});

describe("org chart service", () => {
  it("expands only to the requested depth and marks leaves (FR-006, edge case)", async () => {
    const chart = await service.getChart(ORG, EMP, 1);
    const ceo = chart.roots[0]!;
    expect(ceo.id).toBe("ceo"); // designated top first
    const cto = ceo.children!.find((c) => c.id === "cto")!;
    expect(cto.hasChildren).toBe(true);
    expect(cto.children).toBeUndefined(); // beyond depth: lazy
    expect(ceo.children!.find((c) => c.id === "cfo")!.hasChildren).toBe(false);
    expect(chart.myPath).toEqual(["ceo", "cto", "dev2"]);
  });

  it("shows employees directory fields only and no HR overlay (FR-003, US3.3)", async () => {
    const chart = await service.getChart(ORG, EMP, 3);
    const cfo = chart.roots[0]!.children!.find((c) => c.id === "cfo")!;
    expect(cfo).toMatchObject({ name: "CFO", title: "Engineer", department: "Engineering" });
    expect(cfo).not.toHaveProperty("email");
    expect(cfo).not.toHaveProperty("orphan");
    expect(chart).not.toHaveProperty("cycleCount");
  });

  it("search returns the path to expand, and [] for no match (FR-004)", async () => {
    const r = await service.search(ORG, "dev", EMP);
    expect(r.map((x) => x.path)).toEqual([["ceo", "cto", "dev1"], ["ceo", "cto", "dev2"]]);
    expect(await service.search(ORG, "nobody", EMP)).toEqual([]);
  });

  it("flags every orphan, headless department and cycle for HR (FR-008, SC-004)", async () => {
    const g = await service.structuralGaps(ORG);
    expect(g.orphans.map((o) => o.id)).toEqual(["stray"]); // the designated top isn't an orphan
    expect(g.headlessDepartments.map((d) => d.id)).toEqual(["ops"]);
    expect(g.cycles).toHaveLength(1);
  });

  it("initial load size is bounded by depth, not company size (SC-002)", async () => {
    const big = [p("root", null)];
    for (let i = 0; i < 50; i++) {
      big.push(p(`m${i}`, "root"));
      for (let j = 0; j < 100; j++) big.push(p(`e${i}_${j}`, `m${i}`));
    }
    vi.mocked(employees.listActiveEmployeeSummaries).mockResolvedValue(big as never);
    const t0 = Date.now();
    const chart = await service.getChart(ORG, HR, 1);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(chart.totalEmployees).toBe(5051);
    expect(JSON.stringify(chart).length).toBeLessThan(20_000); // root + 50 managers, not 5,000 nodes
  });
});
