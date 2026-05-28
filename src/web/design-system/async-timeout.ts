/**
 * Rejects slow UI data requests with caller-provided copy.
 * @param promise - In-flight async operation.
 * @param ms - Timeout in milliseconds.
 * @param message - Error message used when the timeout wins.
 * @returns The original promise value when it resolves in time.
 */
export function withTimeout<T>(
  promise: Promise<T> | T,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
