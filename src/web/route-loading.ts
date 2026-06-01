import { AsyncStateNotice } from "./design-system/index.js";

/** Default delay before skeleton-only route loading gains explanatory copy. */
const DEFAULT_DELAY_MS = 1200;

/** Options for delayed route loading feedback. */
interface DelayedRouteLoadingOptions {
  readonly container: HTMLElement;
  readonly title: string;
  readonly body: string;
  readonly onRetry: EventListener;
  readonly delayMs?: number;
}

/** Options for a route request guarded by delayed loading feedback. */
interface DelayedRouteRequestOptions<
  TPayload,
> extends DelayedRouteLoadingOptions {
  readonly request: () => Promise<TPayload>;
  readonly onSuccess: (payload: TPayload) => void;
  readonly onError: (error: unknown) => void;
}

/** Narrow callable type for design-system helpers that still opt out of TS. */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

const AsyncStateNoticeComponent =
  AsyncStateNotice as unknown as DesignSystemComponent;

/**
 * Adds route-specific loading copy when a page remains skeleton-only.
 * @param options - Target container, copy, retry handler, and optional delay.
 * @param options.container - Element that receives the delayed notice.
 * @param options.title - Notice title shown after the delay.
 * @param options.body - Notice body shown after the delay.
 * @param options.onRetry - Callback invoked by the retry action.
 * @param options.delayMs - Override for the delay before showing feedback.
 * @returns Cleanup callback that cancels or removes the delayed notice.
 */
export function showDelayedRouteLoadingFeedback({
  container,
  title,
  body,
  onRetry,
  delayMs = DEFAULT_DELAY_MS,
}: DelayedRouteLoadingOptions): () => void {
  const notice = AsyncStateNoticeComponent({
    kind: "loading",
    title,
    body,
    actionLabel: "Retry",
    onAction: onRetry,
    attrs: { class: "route-loading-feedback" },
  });
  const timer = window.setTimeout(() => {
    container.prepend(notice);
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
    notice.remove();
  };
}

/**
 * Runs a route request and ignores stale responses after a retry.
 * @param options - Loading feedback copy, request, and completion handlers.
 * @param options.container - Route container that receives the stale marker.
 * @param options.title - Notice title shown after the delay.
 * @param options.body - Notice body shown after the delay.
 * @param options.onRetry - Callback invoked by the retry action.
 * @param options.delayMs - Override for the delay before showing feedback.
 * @param options.request - Route data request.
 * @param options.onSuccess - Handler for the current successful request.
 * @param options.onError - Handler for the current failed request.
 */
export function runDelayedRouteRequest<TPayload>(
  options: DelayedRouteRequestOptions<TPayload>
): void {
  const marker = document.createComment("route-load");
  const stopLoadingFeedback = showDelayedRouteLoadingFeedback(options);
  options.container.prepend(marker);

  options
    .request()
    .then((payload: TPayload) => {
      if (!marker.isConnected) return;
      stopLoadingFeedback();
      options.onSuccess(payload);
    })
    .catch((error: unknown) => {
      if (!marker.isConnected) return;
      stopLoadingFeedback();
      options.onError(error);
    });
}
