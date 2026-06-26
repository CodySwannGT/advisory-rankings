const DIRECT_REPLICATION_FAILURE =
  "was deployed on the origin node but failed to replicate";

/**
 * Detects Harper's partial-success direct deploy response.
 *
 * Direct deploys target the public serving node. When that upload lands but
 * cross-node replication fails, Harper returns HTTP 500 even though the runtime
 * may already be serving the new component. The deploy gate should continue to
 * freshness checks instead of falling back to Fabric Studio's size-limited
 * proxy.
 * @param status - HTTP status returned by the direct Operations API.
 * @param body - Parsed response body from Harper.
 * @returns True when freshness checks should decide success.
 */
export function isFreshnessCheckableDirectDeployFailure(
  status: number,
  body: unknown
): boolean {
  return (
    status === 500 && deployMessage(body).includes(DIRECT_REPLICATION_FAILURE)
  );
}

/**
 * Reads Harper's deploy error text from known response fields.
 * @param body - Parsed response body from Harper.
 * @returns Concatenated deploy message text.
 */
function deployMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const record = body as Readonly<Record<string, unknown>>;
  return [record.error, record.message]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}
