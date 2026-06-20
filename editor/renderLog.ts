// Parse the streamed `remotion render` CLI log into UI state: phase, rough
// progress, terminal success/error — and turn known failures into friendly text.

export type RenderState = {
  phase: string;
  progress: number | null; // 0..1
  done: string | null; // output file on success
  error: string | null; // friendly message on failure
};

export const friendlyRenderError = (log: string): string => {
  if (/Host not in allowlist|Downloading Chrome|chrome-headless-shell|status code of 403|Could not find.*[Cc]hrom|Failed to launch the browser/.test(log)) {
    return "Couldn't download/launch Chromium. On your own machine run `npx remotion browser ensure` and retry (on restricted networks, allowlist remotion.media).";
  }
  if (/Cannot find module|MODULE_NOT_FOUND/.test(log)) {
    return "A module is missing — run `npm install` and retry.";
  }
  const lines = log
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^__(DONE|FAILED)__/.test(l));
  const errLine = [...lines].reverse().find((l) => /error/i.test(l));
  return errLine ?? lines.slice(-2).join(" ") ?? "Render failed.";
};

export const parseRenderLog = (log: string): RenderState => {
  const done = log.match(/__DONE__ (.+\.mp4)/);
  if (done) return { phase: "Done", progress: 1, done: done[1].trim(), error: null };

  const pcts = log.match(/(\d{1,3})%/g);
  const progress = pcts ? Math.min(100, Number(pcts[pcts.length - 1].replace("%", ""))) / 100 : null;

  if (/__FAILED__/.test(log)) {
    return { phase: "Failed", progress, done: null, error: friendlyRenderError(log) };
  }

  const phase = /[Ee]ncod/.test(log)
    ? "Encoding"
    : /[Rr]ender/.test(log) && /frame/i.test(log)
      ? "Rendering frames"
      : /[Bb]undl/.test(log)
        ? "Bundling"
        : "Starting";
  return { phase, progress, done: null, error: null };
};
