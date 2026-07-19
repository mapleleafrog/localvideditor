import React, { useEffect, useMemo, useState } from "react";
import { useEditor } from "../store";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import type { MotionDef, TransitionDef } from "../lib/effects-bridge";
import { FxPreview } from "./FxPreview";
import type { Overlay } from "../../../src/timeline/schema";

const MOTIONS: MotionDef[] = readyMotions();
const TRANSITIONS: TransitionDef[] = readyTransitions();

const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

const TIER_COLOR: Record<string, string> = { Core: "#6ee7a8", Ext: "#00d8ff", Adv: "#ff2e88" };

/** Top ~14 tags by frequency (lowercased, deduped) across a registry, for the filter-chip row. */
const topTags = (items: readonly { tags: readonly string[] }[], n = 14) => {
  const freq = new Map<string, number>();
  for (const it of items) for (const t of it.tags) {
    const k = t.toLowerCase();
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { top: sorted.slice(0, n), rest: sorted.slice(n) };
};

const overlayLabel = (o: Overlay, index: number) => {
  const kind = o.type === "fx" ? "FX" : o.type[0].toUpperCase() + o.type.slice(1);
  return `${kind} layer ${index + 1}`;
};

type Item = { id: string; name: string; category: string; engine: string; tier: string; tags: readonly string[] };

const Card: React.FC<{
  item: Item;
  hovered: boolean;
  applied: boolean;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  thumbClass: string;
}> = ({ item, hovered, applied, onHover, onPick, thumbClass }) => (
  <div
    className={"fxb-card" + (applied ? " applied" : "")}
    role="button"
    tabIndex={0}
    title={applied ? "already applied" : item.name}
    onMouseEnter={() => onHover(item.id)}
    onMouseLeave={() => onHover(null)}
    onClick={() => { if (!applied) onPick(item.id); }}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!applied) onPick(item.id);
      }
    }}
  >
    {applied && <span className="fxb-check" title="Already applied">✓</span>}
    {item.engine === "webgl" && (
      <span className="fxb-webgl" title="WebGL — Studio/editor preview needs a flag; renders fine">⚡</span>
    )}
    <FxPreview id={item.id} className={thumbClass} active={hovered} />
    <span className="fxb-card-name">{item.name}</span>
    <span className="fxb-card-tags">
      {item.tags.slice(0, 3).map((t) => (
        <span key={t} className="fxb-tag-pill">{t}</span>
      ))}
    </span>
    <span className="fxb-tier-dot" style={{ background: TIER_COLOR[item.tier] ?? "var(--muted)" }} title={item.tier} />
  </div>
);

/** Pop-up effect/transition browser — search + tag/category filters over a card grid with live
 *  hover previews (motions only; transition cards are static + an ⚡ badge for webgl engines).
 *  Re-validates its target every render (closes itself if the target vanished) and every pick
 *  handler re-reads the store fresh, so rapid picks / concurrent edits never act on stale props. */
export const EffectBrowser: React.FC = () => {
  const browser = useEditor((s) => s.browser);
  const closeBrowser = useEditor((s) => s.closeBrowser);
  const project = useEditor((s) => s.project);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [expandTags, setExpandTags] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Fresh filter state each time the browser opens for a (possibly different) target.
  useEffect(() => {
    if (browser) {
      setQuery("");
      setCat("");
      setActiveTags(new Set());
      setExpandTags(false);
      setHoveredId(null);
    }
  }, [browser]);

  const targetValid =
    !!browser &&
    (browser.mode === "overlay-add" ? !!project.overlays[browser.index] : !!project.clips[browser.index]);

  // Target vanished (deleted/undone) while open — close in an effect, not during render.
  useEffect(() => {
    if (browser && !targetValid) closeBrowser();
  }, [browser, targetValid, closeBrowser]);

  useEffect(() => {
    if (!browser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBrowser();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [browser, closeBrowser]);

  const isTransitionMode = browser?.mode === "clip-transition";
  const registry: Item[] = isTransitionMode ? TRANSITIONS : MOTIONS;
  const cats = useMemo(() => Array.from(new Set(registry.map((m) => m.category))), [registry]);
  const { top: tagTop, rest: tagRest } = useMemo(() => topTags(registry), [registry]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      registry.filter(
        (m) =>
          (!q || matches(q, m.name, m.id, m.category)) &&
          (!cat || m.category === cat) &&
          (activeTags.size === 0 || [...activeTags].every((t) => m.tags.map((x) => x.toLowerCase()).includes(t))),
      ),
    [registry, q, cat, activeTags],
  );
  const filtering = !!q || !!cat || activeTags.size > 0;

  if (!browser || !targetValid) return null;

  const title =
    browser.mode === "overlay-add"
      ? `Add effect — ${overlayLabel(project.overlays[browser.index], browser.index)}`
      : browser.mode === "clip-motion"
        ? `Set motion — Clip ${browser.index + 1}`
        : `Transition — Clip ${browser.index + 1} → ${browser.index + 2}`;

  const toggleTag = (t: string) =>
    setActiveTags((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const pick = (id: string) => {
    const st = useEditor.getState();
    const b = st.browser;
    if (!b) return;
    if (b.mode === "overlay-add") {
      const o = st.project.overlays[b.index];
      if (!o) return;
      if (o.motions.includes(id)) return; // already applied — no-op (removal stays in the Inspector)
      st.patchOverlay(b.index, { motions: [...o.motions, id] });
      st.flash(`Added ${id}`);
      // stays open — user can keep stacking
    } else if (b.mode === "clip-motion") {
      const c = st.project.clips[b.index];
      if (!c) return;
      st.patchClip(b.index, { motion: id });
      st.closeBrowser();
    } else {
      const c = st.project.clips[b.index];
      if (!c) return;
      st.patchClip(b.index, { transitionToNext: id });
      st.closeBrowser();
    }
  };

  const appliedIds =
    browser.mode === "overlay-add" ? new Set(project.overlays[browser.index]?.motions ?? []) : new Set<string>();

  return (
    <div className="fxb-backdrop" onPointerDown={() => closeBrowser()}>
      <div className="fxb-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="fxb-head">
          <strong>{title}</strong>
          <input
            autoFocus
            className="fxb-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={() => closeBrowser()} title="Close (Esc)">✕</button>
        </div>

        <div className="fxb-filters">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="fxb-chips">
            {tagTop.map((t) => (
              <button
                key={t}
                className={"fxb-chip" + (activeTags.has(t) ? " on" : "")}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {tagRest.length > 0 && !expandTags && (
              <button className="fxb-chip" onClick={() => setExpandTags(true)}>+{tagRest.length} more</button>
            )}
            {expandTags &&
              tagRest.map((t) => (
                <button
                  key={t}
                  className={"fxb-chip" + (activeTags.has(t) ? " on" : "")}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
          </div>
        </div>

        <div className="fxb-body">
          {filtering ? (
            <div className="fxb-grid">
              {filtered.map((m) => (
                <Card
                  key={m.id}
                  item={m}
                  hovered={!isTransitionMode && hoveredId === m.id}
                  applied={appliedIds.has(m.id)}
                  onHover={setHoveredId}
                  onPick={pick}
                  thumbClass="fxb-thumb"
                />
              ))}
              {filtered.length === 0 && <span className="muted">no matches</span>}
            </div>
          ) : (
            cats.map((c) => (
              <div key={c} className="fxb-cat-section">
                <div className="fxb-cat-title">{c}</div>
                <div className="fxb-grid">
                  {registry
                    .filter((m) => m.category === c)
                    .map((m) => (
                      <Card
                        key={m.id}
                        item={m}
                        hovered={hoveredId === m.id}
                        applied={appliedIds.has(m.id)}
                        onHover={setHoveredId}
                        onPick={pick}
                        thumbClass="fxb-thumb"
                      />
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
