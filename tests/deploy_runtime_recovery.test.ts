import { describe, expect, it, vi } from "vitest";

import { recoverPublicRuntime } from "../src/lib/deploy-runtime-recovery.js";

describe("recoverPublicRuntime", () => {
  it("deploys, restarts, and verifies the public runtime", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      deployPublicRuntime: vi.fn(async () => 200),
      restartPublicRuntime: vi.fn(async () => 200),
      verifyFeed: vi.fn(async () => {}),
    };

    await expect(
      recoverPublicRuntime(new Error("stale bundle"), actions)
    ).resolves.toBe(true);
    expect(actions.deployPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.restartPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.verifyFeed).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("stops when the direct public deploy fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      deployPublicRuntime: vi.fn(async () => 500),
      restartPublicRuntime: vi.fn(async () => 200),
      verifyFeed: vi.fn(async () => {}),
    };

    await expect(recoverPublicRuntime("unreachable", actions)).resolves.toBe(
      false
    );
    expect(actions.restartPublicRuntime).not.toHaveBeenCalled();
    expect(actions.verifyFeed).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
