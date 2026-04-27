import { Effect, Context, Layer } from "effect";

export namespace Auth {
  export class AuthError {
    readonly _tag = "AuthError";
  }
  export interface Service {
  }
  export const Service = Context.GenericTag<Service>("@opencode/Auth");
  export const defaultLayer = Layer.succeed(Service, {});
}
