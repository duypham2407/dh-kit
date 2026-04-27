import { Effect, Layer, Scope, Exit } from "effect";

/**
 * Runs an Effect program in a vanilla Promise context.
 * Useful for bridging between legacy async/await code and the new Effect-based Provider layer.
 */
export const runPromise = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> => {
  return Effect.runPromise(effect);
};

/**
 * Runs an Effect program with provided layers in a vanilla Promise context.
 */
export const runPromiseWith = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R, never, never>
): Promise<A> => {
  return Effect.runPromise(Effect.provide(effect, layer));
};

/**
 * Scoped run promise.
 */
export const runPromiseScoped = <A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>
): Promise<A> => {
  return Effect.runPromise(Effect.scoped(effect));
};
