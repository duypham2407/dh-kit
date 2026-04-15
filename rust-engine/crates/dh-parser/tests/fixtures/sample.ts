import defaultExport, { named as alias, type TypeOnly } from "./mod";
import defaultNs, * as comboNs from "./combo";
import * as ns from "./ns";
import type { Foo } from "./types";
import "./polyfill";
export { named as reNamed } from "./re-export";
export * from "./star";
export * as allNs from "./star-ns";
export type { Foo as FooType } from "./types";

const required = require("./cjs");
const maybe = condition ? require("./a") : require("./b");

async function lazyLoad() {
  return import("./dyn");
}

export interface User {
  id: string;
}

export type Id = string;

export enum Role {
  Admin,
  User,
}

export class Service extends Base implements Iface {
  value: number = 1;

  constructor() {}

  method(arg: string): void {
    helper();
    this.inner();
    factory()?.run();
    new Worker();
    const local = foo;
    foo = bar;
    const typed: User = user;
  }

  inner() {}
}

export function helper() {}
export const fn = async () => helper();

const keyed = { alpha: helper, beta: helper };

module.exports = Service;
exports.extra = helper;
