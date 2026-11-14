import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Every `waitFor` in this suite defaults to a one-second budget, and several pages here render
// a whole screen in jsdom after a deliberately delayed fixture load (`mocks/mock-api.ts` waits
// 120ms before answering, and the tests assert on the settled screen afterwards).
//
// On a fast runner that fits comfortably. On a slow laptop or a loaded CI container it does
// not, and the suite then fails for reasons that have nothing to do with the code — which is
// the worst kind of failure, because the next person to see it assumes the page is broken.
//
// The budget is raised rather than the delay removed: the delay is what makes the
// fixture-fallback path testable at all, since without it the fixture would answer before the
// API rejection could land and "falls back when the API is unreachable" would never exercise
// the fallback. Ten seconds is generous for a jsdom render and still bounded, so a genuine
// hang fails rather than runs until the suite's own timeout.
configure({ asyncUtilTimeout: 10_000 });
