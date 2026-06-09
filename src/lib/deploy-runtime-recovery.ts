/**
 * Callbacks used to recover a stale public runtime after cluster verification
 * fails.
 */
interface PublicRuntimeRecoveryActions {
  readonly deployPublicRuntime: () => Promise<number>;
  readonly restartPublicRuntime: () => Promise<number>;
  readonly verifyFeed: () => Promise<void>;
  /**
   * True when the direct public-node deploy (`:9925`) is unreachable from this
   * network — CI ops-port egress is firewalled (fabric-runbook §5), so the
   * direct path can only burn the deploy timeout and then fail. When set,
   * recovery re-verifies instead: the freshness gate already proved the
   * component propagated via cluster replication, so a verification error is
   * most likely a transient cold-start blip that a retry clears.
   */
  readonly skipDirectDeploy?: boolean;
}

/**
 * Logs a recovery failure cause without leaking a stack trace.
 * @param recoveryError - Unknown thrown value from a recovery action.
 */
function warnRecoveryFailed(recoveryError: unknown): void {
  console.warn(
    "public runtime recovery attempt failed:",
    recoveryError instanceof Error
      ? recoveryError.message
      : String(recoveryError)
  );
}

/**
 * Re-verifies the public runtime when the direct deploy path is unreachable.
 * @param actions - Runtime operations supplied by the deploy script.
 * @returns Whether the runtime verified on retry.
 */
async function reverifyPublicRuntime(
  actions: PublicRuntimeRecoveryActions
): Promise<boolean> {
  console.warn(
    "  direct public-node deploy is unreachable from this network (ops port firewalled); re-verifying the public runtime instead"
  );
  try {
    await actions.verifyFeed();
    return true;
  } catch (recoveryError) {
    warnRecoveryFailed(recoveryError);
    return false;
  }
}

/**
 * Retries public-node deployment and feed verification after the normal
 * post-deploy runtime check fails.
 * @param error - Verification error that triggered the recovery path.
 * @param actions - Runtime operations supplied by the deploy script.
 * @returns Whether recovery completed successfully.
 */
export async function recoverPublicRuntime(
  error: unknown,
  actions: PublicRuntimeRecoveryActions
): Promise<boolean> {
  console.warn(
    "post-deploy runtime verification failed; attempting recovery:",
    error instanceof Error ? error.message : String(error)
  );
  if (actions.skipDirectDeploy) return reverifyPublicRuntime(actions);
  try {
    if ((await actions.deployPublicRuntime()) !== 200) return false;
    if ((await actions.restartPublicRuntime()) !== 200) return false;
    await actions.verifyFeed();
    return true;
  } catch (recoveryError) {
    warnRecoveryFailed(recoveryError);
    return false;
  }
}
