export async function loadMath() {
  const math = await import("./math");
  return math.run();
}
