import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Mushroom } from "../components/Mushroom";
import { readyMotions } from "../effects";

// Showcase: every ready motion, one per slot, applied to a sprite + labeled.
// A QA/preview surface — overlay-style motions (beatFlash, crtScanlines,
// grainLoop, shimmerLoop) are designed for full-frame layers, so on a sprite
// box they read as a small panel effect; that's expected.
const SLOT = 24;
const MOTIONS = readyMotions();
export const MOTION_GALLERY_FRAMES = Math.max(SLOT, MOTIONS.length * SLOT);

const Label: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(MOTIONS.length - 1, Math.floor(frame / SLOT));
  const m = MOTIONS[i];
  if (!m) return null;
  return (
    <div style={{ position: "absolute", left: 48, top: 44, color: "#fff", fontFamily: "monospace" }}>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>{m.id}</div>
      <div style={{ fontSize: 22, opacity: 0.7, marginTop: 6 }}>
        {m.name} · {m.category} · {m.tier} · {i + 1}/{MOTIONS.length}
      </div>
    </div>
  );
};

export const MotionGallery: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#10182b" }}>
    <Img
      src={staticFile("clip-b.svg")}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.22 }}
    />
    {MOTIONS.map((m, i) => (
      <Mushroom
        key={m.id}
        src="orange-mush.gif"
        motionId={m.id}
        from={i * SLOT}
        durationInFrames={SLOT}
        windowInFrames={SLOT}
        left="50%"
        top="56%"
        size={220}
      />
    ))}
    <Label />
  </AbsoluteFill>
);
