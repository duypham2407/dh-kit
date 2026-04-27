export const withStatics = (f: any) => (s: any) => Object.assign(s, f(s));
