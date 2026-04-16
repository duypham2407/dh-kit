import { add } from "./simple-module";
import type { User } from "./types";
export { add as sum } from "./simple-module";

export function formatUser(user: User): string {
  return `${user.name}:${add(user.id, 1)}`;
}
