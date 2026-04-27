export const Log = {
  create: () => ({
    error: console.error,
    info: console.info,
    warn: console.warn,
    debug: console.debug,
  })
};
