// Class components as sources name them: lecture, lab, tutorial… The UI shows
// student words for them (Docs/17: نظري / عملي); the code keeps the source's.

const ORDER = ['LEC', 'LAB', 'TUT', 'SEM', 'CLN', 'PRA'];

/** Lecture first, then lab, and so on; unknown components last, by name. */
export const componentOrder = (a: string, b: string) =>
  (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);
