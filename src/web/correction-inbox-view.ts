import { fmtDate, humanize, postJson } from "./app.js";
import {
  AsyncStateCard,
  Button,
  DetailsCard,
  SectionCard,
  Tag,
  clear,
  el,
} from "./design-system/index.js";
import type {
  AdvisorCorrectionRequestQueueItem,
  AdvisorCorrectionRequestQueueResponse,
} from "../harper/resource-advisor-correction-queue.js";

const EMPTY_VALUE = "Not provided";

/** Render callback that reloads the inbox resource. */
interface InboxActions {
  readonly reload: () => void;
}

/**
 * Renders the inbox state for signed-out, unauthorized, empty, and pending queues.
 * @param payload Queue payload.
 * @param center Main page column.
 * @param right Right rail column.
 * @param actions Page callbacks.
 */
export function renderInbox(
  payload: AdvisorCorrectionRequestQueueResponse,
  center: HTMLElement,
  right: HTMLElement,
  actions: InboxActions
): void {
  clear(center);
  clear(right);
  if (!payload.authenticated) {
    center.appendChild(signInCard());
    return;
  }
  if (!payload.authorized) {
    center.appendChild(
      AsyncStateCard({
        kind: "permission",
        title: "Analyst role required",
        body: "Correction request review is limited to analyst sessions.",
      })
    );
    return;
  }
  center.appendChild(summaryCard(payload));
  center.append(
    ...(payload.items.length
      ? payload.items.map(item => requestCard(item, actions))
      : [
          AsyncStateCard({
            kind: "empty",
            title: "No pending correction requests",
            body: "Reviewed and submitted requests will appear here when they need analyst disposition.",
          }),
        ])
  );
  right.appendChild(statusCard(payload));
}

/**
 * Renders a recoverable load error.
 * @param error Failed request.
 * @param center Main page column.
 * @param right Right rail column.
 * @param actions Page callbacks.
 */
export function renderInboxError(
  error: unknown,
  center: HTMLElement,
  right: HTMLElement,
  actions: InboxActions
): void {
  console.error("Correction request inbox failed to load", error);
  clear(center);
  clear(right);
  center.appendChild(
    AsyncStateCard({
      kind: "transient",
      title: "Could not load correction requests",
      body: "Retry the request to refresh pending corrections.",
      actionLabel: "Retry",
      onAction: actions.reload,
    })
  );
}

/**
 * Builds the signed-out state.
 * @returns Permission card.
 */
function signInCard(): HTMLElement {
  return AsyncStateCard({
    kind: "permission",
    title: "Sign in to review correction requests",
    body: "Only authenticated analyst sessions can view submitted correction details.",
    actionLabel: "Sign in",
    onAction: () => {
      location.href = "/login";
    },
  });
}

/**
 * Builds the top summary card.
 * @param payload Queue payload.
 * @returns Summary card.
 */
function summaryCard(
  payload: AdvisorCorrectionRequestQueueResponse
): HTMLElement {
  return SectionCard({
    title: "Pending corrections",
    body: el(
      "div",
      { class: "metric-grid" },
      metric("Pending", payload.summary.pending),
      metric(
        "Oldest age",
        payload.summary.oldestAgeDays == null
          ? "None"
          : `${payload.summary.oldestAgeDays}d`
      ),
      metric("Last refreshed", fmtDate(payload.generatedAt))
    ),
  });
}

/**
 * Builds one correction request card with disposition controls.
 * @param item Pending correction request.
 * @param actions Page callbacks.
 * @returns Request card.
 */
function requestCard(
  item: AdvisorCorrectionRequestQueueItem,
  actions: InboxActions
): HTMLElement {
  const status = el("p", {
    class: "correction-inbox-status",
    "aria-live": "polite",
  });
  return SectionCard({
    title: item.advisorName,
    attrs: { class: "correction-inbox-card" },
    body: [
      el(
        "div",
        { class: "chip-row" },
        Tag({ children: humanize(item.status), kind: "warn" }),
        item.ageDays == null ? null : Tag({ children: `${item.ageDays}d old` }),
        item.firmName ? Tag({ children: item.firmName }) : null,
        item.sourceType ? Tag({ children: humanize(item.sourceType) }) : null
      ),
      DetailsCard({
        title: "Requested change",
        pairs: [
          ["Advisor", advisorLink(item)],
          ["Field", humanize(item.fieldName)],
          ["Displayed value", valueText(item.displayedValue)],
          ["Proposed value", item.proposedValue],
          ["Submitter note", valueText(item.submitterNote)],
        ],
      }),
      DetailsCard({
        title: "Source context",
        pairs: [
          ["Source ref", valueText(item.sourceRef)],
          ["Source context", valueText(item.sourceContext)],
          ["Submitter", item.submitterId],
          ["Created", item.createdAt ? fmtDate(item.createdAt) : EMPTY_VALUE],
        ],
      }),
      dispositionForm(item, status, actions),
      status,
    ],
  });
}

/**
 * Builds a link to the public advisor profile.
 * @param item Pending correction request.
 * @returns Anchor element.
 */
function advisorLink(item: AdvisorCorrectionRequestQueueItem): HTMLElement {
  return el("a", { href: item.advisorUrl }, item.advisorName);
}

/**
 * Builds the request disposition form.
 * @param item Pending correction request.
 * @param status Status element updated after submission.
 * @param actions Page callbacks.
 * @returns Disposition form.
 */
function dispositionForm(
  item: AdvisorCorrectionRequestQueueItem,
  status: HTMLElement,
  actions: InboxActions
): HTMLElement {
  const decision = el(
    "select",
    { name: "status", required: true },
    el(
      "option",
      { value: "", selected: true, disabled: true },
      "Choose decision..."
    ),
    el("option", { value: "accepted" }, "Accept"),
    el("option", { value: "rejected" }, "Reject")
  ) as HTMLSelectElement;
  const note = el("textarea", {
    name: "reviewerNote",
    rows: 3,
    placeholder: "Reviewer note",
    required: true,
  }) as HTMLTextAreaElement;
  const submit = Button({
    variant: "primary",
    type: "submit",
    children: "Submit disposition",
  }) as HTMLButtonElement;
  return el(
    "form",
    {
      class: "correction-inbox-form",
      onSubmit: event =>
        void submitDisposition(event, {
          item,
          decision,
          note,
          submit,
          status,
          actions,
        }),
    },
    label("Decision", decision),
    label("Reviewer note", note),
    submit
  );
}

/** Context shared by the disposition submit handler. */
interface DispositionContext {
  readonly item: AdvisorCorrectionRequestQueueItem;
  readonly decision: HTMLSelectElement;
  readonly note: HTMLTextAreaElement;
  readonly submit: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly actions: InboxActions;
}

/**
 * Persists an analyst disposition and refreshes the queue.
 * @param event Form submit event.
 * @param ctx Submit context.
 */
async function submitDisposition(
  event: Event,
  ctx: DispositionContext
): Promise<void> {
  event.preventDefault();
  Object.assign(ctx.submit, { disabled: true });
  Object.assign(ctx.status, { textContent: "Saving disposition..." });
  try {
    await postJson(
      `/AdvisorCorrectionRequest/${encodeURIComponent(ctx.item.id)}`,
      {
        status: ctx.decision.value,
        reviewerNote: ctx.note.value,
      }
    );
    Object.assign(ctx.status, { textContent: "Disposition saved." });
    ctx.actions.reload();
  } catch (error) {
    console.error("Correction disposition failed", error);
    Object.assign(ctx.status, {
      textContent:
        error instanceof Error && /401|403/.test(error.message)
          ? "Sign in with an analyst session to submit dispositions."
          : "Could not save disposition.",
    });
    Object.assign(ctx.submit, { disabled: false });
  }
}

/**
 * Builds the right-rail status card.
 * @param payload Queue payload.
 * @returns Status card.
 */
function statusCard(
  payload: AdvisorCorrectionRequestQueueResponse
): HTMLElement {
  return SectionCard({
    title: "Review workflow",
    body: [
      el("p", {}, `${payload.summary.pending} pending request(s).`),
      el(
        "p",
        {},
        "Accepted or rejected requests keep public profile facts unchanged until a follow-up public-note task uses reviewed data."
      ),
    ],
  });
}

/**
 * Builds one metric cell.
 * @param labelText Metric label.
 * @param value Metric value.
 * @returns Metric element.
 */
function metric(labelText: string, value: string | number): HTMLElement {
  return el(
    "div",
    { class: "metric" },
    el("span", { class: "metric-label" }, labelText),
    el("strong", {}, String(value))
  );
}

/**
 * Wraps a form control with a label.
 * @param text Label text.
 * @param control Form control.
 * @returns Label element.
 */
function label(text: string, control: HTMLElement): HTMLElement {
  return el("label", { class: "correction-inbox-field" }, text, control);
}

/**
 * Converts nullable response text to display copy.
 * @param value Candidate value.
 * @returns Non-empty value or fallback copy.
 */
function valueText(value: string | null): string {
  return value && value.length > 0 ? value : EMPTY_VALUE;
}
