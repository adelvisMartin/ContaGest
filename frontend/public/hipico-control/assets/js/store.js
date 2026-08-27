// Stable public facade. The versioned implementation lives in store-v2.js so callers
// keep the same module contract while IndexedDB migrations evolve independently.
export * from "./store-v2.js";
