# opencode-sdk

Current TypeScript-side SDK placeholder for `dh`.

What exists today:

- package boundary reserved for the future forked SDK
- minimal protocol type surface used to keep the package shape explicit

What does not exist yet:

- vendored upstream OpenCode TypeScript SDK
- real runtime client or protocol bridge into the Go core
- upstream source import from the currently pinned discovery candidate in `FORK_ORIGIN.md`

Current research note:

- the current JS-SDK candidate is `anomalyco/opencode/packages/sdk/js` at `8b8d4fa066a1de331f6e478ae4055636a9271707`
- this does not currently share the same upstream lineage as the Go-runtime candidate

This package is still mostly a structural placeholder and remains part of the open Phase `-1` gap.
