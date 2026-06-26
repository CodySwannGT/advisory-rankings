import { describe, expect, it } from "vitest";
import { isFreshnessCheckableDirectDeployFailure } from "../src/lib/deploy-result.js";

describe("isFreshnessCheckableDirectDeployFailure", () => {
  it("continues verification when direct deploy lands but replication fails", () => {
    expect(
      isFreshnessCheckableDirectDeployFailure(500, {
        error:
          "Component 'advisor-app' was deployed on the origin node but failed to replicate to 1 of 1 peer node(s)",
      })
    ).toBe(true);
  });

  it("does not mask unrelated direct deploy failures", () => {
    expect(
      isFreshnessCheckableDirectDeployFailure(500, {
        error: "ClientError: invalid deployment payload",
      })
    ).toBe(false);
  });
});
