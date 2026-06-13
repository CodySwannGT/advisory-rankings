import { api, refreshMe, logout, search } from "./app.js";
import {
  mountThreeColumnPage,
  EmptyCard,
  SkeletonCard,
  clear,
} from "./design-system/index.js";
import { showDelayedRouteLoadingFeedback } from "./route-loading.js";
import {
  readBranchFilters,
  resourcePath,
  type BranchFilters,
} from "./branches-url.js";
import { renderBranchExplorer } from "./branches-view.js";
import type {
  BranchDirectoryRow,
  DirectoryPage,
} from "../harper/resource-directory-types.js";

/**
 *
 */
export type BranchPage = DirectoryPage<BranchDirectoryRow>;

/**
 *
 */
export interface BranchExplorerState {
  readonly filters: BranchFilters;
  readonly items: ReadonlyArray<BranchDirectoryRow>;
  readonly total: number;
  readonly nextCursor: string | null;
}

const popstateState: Readonly<
  Record<"installed", boolean> & Record<"reload", (() => void) | null>
> = {
  installed: false,
  reload: null,
};

const installPopstateReload = (reload: () => void): void => {
  Object.assign(popstateState, { reload });
  if (popstateState.installed) return;
  window.addEventListener("popstate", () => popstateState.reload?.());
  Object.assign(popstateState, { installed: true });
};

const loadBranches = (center: HTMLElement, right: HTMLElement): void => {
  const filters = readBranchFilters();
  const stopLoadingFeedback = showDelayedRouteLoadingFeedback({
    container: center,
    title: "Loading branches",
    body: "Still fetching public branch rows. Retry if this takes longer than expected.",
    onRetry: () => loadBranches(center, right),
  });
  api<BranchPage>(resourcePath(filters))
    .then(page => {
      stopLoadingFeedback();
      renderLoadedState(
        {
          filters,
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
        },
        center,
        right
      );
    })
    .catch((error: unknown) => {
      stopLoadingFeedback();
      renderError(error, center, right);
    });
};

const loadMore = (
  state: BranchExplorerState,
  center: HTMLElement,
  right: HTMLElement
): void => {
  if (!state.nextCursor) return;
  api<BranchPage>(resourcePath(state.filters, state.nextCursor)).then(page => {
    renderLoadedState(
      {
        filters: state.filters,
        items: [...state.items, ...page.items],
        total: page.total,
        nextCursor: page.nextCursor,
      },
      center,
      right
    );
  });
};

const renderLoadedState = (
  state: BranchExplorerState,
  center: HTMLElement,
  right: HTMLElement
): void => {
  renderBranchExplorer({
    state,
    center,
    right,
    reload: () => loadBranches(center, right),
    loadMore: () => loadMore(state, center, right),
  });
};

const renderError = (
  error: unknown,
  center: HTMLElement,
  right: HTMLElement
): void => {
  clear(center);
  clear(right);
  center.appendChild(
    EmptyCard({
      title: "Could not load branches",
      body: errorMessage(error),
    })
  );
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
};

mountThreeColumnPage({
  active: "branches",
  refreshMe,
  logout,
  search,
  pageTitle: "Branch explorer",
  build({ center, right }) {
    installPopstateReload(() => loadBranches(center, right));
    center.append(SkeletonCard(), SkeletonCard());
    loadBranches(center, right);
  },
});
