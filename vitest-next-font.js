// Test stub for `next/font/google`. The real module does build-time font
// fetching that isn't available under Vitest, so importing any font factory
// would throw during collection. Each factory returns the shape components
// consume (className + variable). Aliased in vitest.config.ts. Add a named
// export here when a new Google font is introduced.
const factory = () => ({ className: 'font-mock', variable: 'font-mock-var' });

export const Geist = factory;
export const Fraunces = factory;
export const JetBrains_Mono = factory;
