import { describe, expect, it } from "vitest";

import {
  ASYNC_STATE_FALLBACKS,
  AsyncStateNotice,
  LoadingState,
  resolveAsyncStateFallback,
} from "../src/web/design-system/index";

describe("design-system async state patterns", () => {
  it("exports reusable async state helpers through the public barrel", () => {
    expect(typeof LoadingState).toBe("function");
    expect(typeof AsyncStateNotice).toBe("function");
    expect(typeof resolveAsyncStateFallback).toBe("function");
  });

  it("preserves the PRD fallback behavior table", () => {
    expect(ASYNC_STATE_FALLBACKS).toMatchObject({
      error: {
        messageIntent: "We couldn't load this right now.",
        primaryAction: "Retry the failed request",
        retryRule: "required",
      },
      empty: {
        messageIntent: "No results are available yet.",
        primaryAction: "Refresh or adjust search/filter if one exists",
        retryRule: "optional-refresh",
      },
      notFound: {
        messageIntent: "This item could not be found.",
        primaryAction: "Return to the feed or previous navigable surface",
        retryRule: "never",
      },
      permission: {
        messageIntent:
          "You don't have access to this content. Sign in again to continue.",
        primaryAction: "Sign in again or return to a safe surface",
        retryRule: "no-automatic-retry",
      },
      partial: {
        messageIntent: "Some details couldn't be loaded.",
        primaryAction: "Retry the affected section when practical",
        retryRule: "section-only",
      },
    });
  });

  it("allows local copy refinement without changing the canonical behavior", () => {
    const fallback = resolveAsyncStateFallback("error", {
      title: "Could not load feed",
      actionLabel: "Try again",
    });

    expect(fallback).toMatchObject({
      kind: "error",
      title: "Could not load feed",
      actionLabel: "Try again",
      messageIntent: "We couldn't load this right now.",
      retryRule: "required",
    });
    expect(ASYNC_STATE_FALLBACKS.error.title).toBe("Could not load");
  });
});
