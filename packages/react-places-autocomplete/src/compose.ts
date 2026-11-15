export const compose =
  <A extends unknown[]>(...fns: Array<((...args: A) => unknown) | null | undefined | false>) =>
  (...args: A): void => {
    fns.forEach((fn) => {
      if (fn) fn(...args);
    });
  };
