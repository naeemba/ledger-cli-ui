// Sentry 11 collects cookies, request/response bodies, headers, user info and
// database query data unless told otherwise. This app handles ledger journals,
// encryption material and shared-page keys, so every Sentry.init passes this
// baseline, which is what Sentry 10 collected by default with sendDefaultPii
// unset. Taken from the Sentry 10 -> 11 migration guide.
const deny = ['forwarded', '-ip', 'remote-', 'via', '-user'];

export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { deny }, response: { deny } },
  httpBodies: [],
  urlQueryParams: { deny },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};
