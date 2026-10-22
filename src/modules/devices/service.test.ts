import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  upsertDevice: vi.fn(),
  listForUser: vi.fn(),
  deleteOwned: vi.fn(),
  deleteById: vi.fn(),
}));

const repo = await import("./repository.js");
const { setPushSender } = await import("../../lib/push.js");
const service = await import("./service.js");

const sub = (n: number) => JSON.stringify({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } });
const send = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  setPushSender({ configured: true, send });
  vi.mocked(repo.listForUser).mockResolvedValue([
    { id: "d1", pushToken: sub(1) },
    { id: "d2", pushToken: sub(2) },
  ] as never);
});

describe("devices — push dispatch (019 FR-006/007)", () => {
  it("pushes to every device with the record's link", async () => {
    send.mockResolvedValue("sent");
    await service.dispatchPush("org", "u1", { type: "LEAVE_DECIDED", message: "Approved", link: "/leave/requests/r1" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://push.example/1" }), expect.objectContaining({ url: "/leave/requests/r1", body: "Approved" }));
  });

  it("prunes expired subscriptions and keeps going after a failure", async () => {
    send.mockResolvedValueOnce("gone").mockRejectedValueOnce(new Error("network"));
    await expect(service.dispatchPush("org", "u1", { type: "X", message: "m" })).resolves.toBeUndefined();
    expect(repo.deleteById).toHaveBeenCalledWith("d1");
    expect(repo.deleteById).toHaveBeenCalledTimes(1);
  });

  it("never returns the subscription keys", async () => {
    vi.mocked(repo.listForUser).mockResolvedValue([{ id: "d1", platform: "android", deviceId: null, registeredAt: new Date(), lastSeenAt: new Date(), pushToken: sub(1), endpoint: "https://push.example/1" }] as never);
    const [d] = await service.myDevices("org", { sub: "u1", role: "EMPLOYEE", employeeId: "e1" });
    expect(d).not.toHaveProperty("pushToken");
    expect(d).not.toHaveProperty("endpoint");
  });
});
