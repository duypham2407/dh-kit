import { Effect, Ref } from "effect";

const TypeId = "~dh/InstanceState";

export interface InstanceState<A, E = never, R = never> {
  readonly [TypeId]: typeof TypeId;
  readonly ref: Ref.Ref<A>;
}

/**
 * Creates a new InstanceState.
 * In a more complex architecture this would be backed by a ScopedCache keyed by project/directory,
 * but for the MVP it acts as a simple Ref holder.
 */
export const make = <A, E = never, R = never>(
  init: () => Effect.Effect<A, E, R>
): Effect.Effect<InstanceState<A, E, R>, E, R> =>
  Effect.gen(function* () {
    const value = yield* init();
    const ref = yield* Ref.make(value);
    return {
      [TypeId]: TypeId,
      ref,
    };
  });

export const get = <A, E, R>(self: InstanceState<A, E, R>) => Ref.get(self.ref);

export const use = <A, E, R, B>(self: InstanceState<A, E, R>, select: (value: A) => B) =>
  Effect.map(get(self), select);

export const useEffect = <A, E, R, B, E2, R2>(
  self: InstanceState<A, E, R>,
  select: (value: A) => Effect.Effect<B, E2, R2>
) => Effect.flatMap(get(self), select);

export const update = <A, E, R>(
  self: InstanceState<A, E, R>,
  f: (a: A) => A
) => Ref.update(self.ref, f);

export const set = <A, E, R>(
  self: InstanceState<A, E, R>,
  a: A
) => Ref.set(self.ref, a);
