// What every admin server action returns: a toast for success, or a message
// (and per-field messages) the modal shows next to the inputs.
export type ActionResult =
  { ok: true; title: string; body?: string; data?: unknown } | { ok: false; error: string; fields?: Record<string, string> };

export const done = (title: string, body?: string, data?: unknown): ActionResult => ({ ok: true, title, body, data });
export const fail = (error: string, fields?: Record<string, string>): ActionResult => ({ ok: false, error, fields });
