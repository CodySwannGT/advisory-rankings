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

  it("stops when the public restart fails after a successful deploy", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      deployPublicRuntime: vi.fn(async () => 200),
      restartPublicRuntime: vi.fn(async () => 503),
      verifyFeed: vi.fn(async () => {}),
    };

    await expect(recoverPublicRuntime("stale feed", actions)).resolves.toBe(
      false
    );
    expect(actions.deployPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.restartPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.verifyFeed).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports failure when final feed verification still rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      deployPublicRuntime: vi.fn(async () => 200),
      restartPublicRuntime: vi.fn(async () => 200),
      verifyFeed: vi.fn(async () => {
        throw new Error("feed unavailable");
      }),
    };

    await expect(
      recoverPublicRuntime(new Error("stale"), actions)
    ).resolves.toBe(false);
    expect(actions.deployPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.restartPublicRuntime).toHaveBeenCalledOnce();
    expect(actions.verifyFeed).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "public runtime recovery attempt failed:",
      "feed unavailable"
    );
    warn.mockRestore();
  });
});
