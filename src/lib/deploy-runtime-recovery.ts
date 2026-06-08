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
    "post-deploy runtime verification failed; deploying directly to public node once:",
    error instanceof Error ? error.message : String(error)
  );
  if ((await actions.deployPublicRuntime()) !== 200) return false;
  if ((await actions.restartPublicRuntime()) !== 200) return false;
  await actions.verifyFeed();
  return true;
}
