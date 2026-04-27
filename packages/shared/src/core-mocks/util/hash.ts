import * as crypto from "node:crypto";
export const Hash = {
  fast: (data: string) => crypto.createHash('md5').update(data).digest('hex'),
};
