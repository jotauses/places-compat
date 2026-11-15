export function debounce<F extends (...a: never[]) => void>(
  fn: F,
  wait: number,
): F & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function debounced(this: unknown, ...args: Parameters<F>): void {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      fn.apply(this, args);
    }, wait);
  }

  debounced.cancel = cancel;
  return debounced as unknown as F & { cancel(): void };
}
