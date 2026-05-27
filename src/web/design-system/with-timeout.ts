/**
 * Generic promise timeout wrapper shared by design-system organisms that
 * front a slow data adapter. Rejects with an `Error` whose message comes
 * from the caller so the UI status copy stays consistent.
 */

/**
 * Rejects a slow data request with caller-provided copy.
 * @param promise - In-flight async operation.
 * @param ms - Timeout in milliseconds.
 * @param message - Error message used when the timeout wins.
 * @returns The original promise value when it resolves in time.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
