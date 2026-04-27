import { Context, Layer } from "effect";

export namespace Plugin {
  export interface AuthOAuthResult {
    url: string;
  }
  export interface Hooks {}
  export interface Service {
    get: (id: string) => any;
  }
  export const Service = Context.GenericTag<Service>("@opencode/Plugin");
  export const defaultLayer = Layer.succeed(Service, { get: () => null });
}
