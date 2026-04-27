export function lazy<T>(fn: () => Promise<T>) {
  let p: Promise<T>;
  const w = () => p || (p = fn());
  w.reset = () => { p = undefined as any };
  return w;
}
