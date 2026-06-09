/**
 * Callbacks used to recover a stale public runtime after cluster verification
 * fails.
 */
interface PublicRuntimeRecoveryActions {
  readonly deployPublicRuntime: () => Promise<number>;
  readonly restartPublicRuntime: () => Promise<number>;
  readonly verifyFeed: () => Promise<void>;
}

/**
 * Re-deploys directly to the public node and re-verifies after the normal
 * post-deploy runtime check fails. The direct `:9925` ops path is the deploy's
 * primary mechanism and is reachable from CI, so re-attempting it is the right
 * recovery when the freshness gate sees a stale serving node.
 * @param error - Verification error that triggered the recovery path.
 * @param actions - Runtime operations supplied by the deploy script.
 * @returns Whether recovery completed successfully.
 */
export async function recoverPublicRuntime(
  error: unknown,
  actions: PublicRuntimeRecoveryActions
): Promise<boolean> {
  console.warn(
    "post-deploy runtime verification failed; re-deploying to the public node once:",
    error instanceof Error ? error.message : String(error)
  );
  try {
    if ((await actions.deployPublicRuntime()) !== 200) return false;
    if ((await actions.restartPublicRuntime()) !== 200) return false;
    await actions.verifyFeed();
    return true;
  } catch (recoveryError) {
    console.warn(
      "public runtime recovery attempt failed:",
      recoveryError instanceof Error
        ? recoveryError.message
        : String(recoveryError)
    );
    return false;
  }
}
