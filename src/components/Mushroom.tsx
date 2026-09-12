import React from "react";
import { Img, staticFile } from "remotion";
import { Gif } from "@remotion/gif";
import { Layer } from "./Layer";

interface MushroomProps {
  src: string;
  motionId: string;
  from?: number;
  durationInFrames?: number;
  windowInFrames?: number;
  bpm?: number;
  /** Depth 0=far..1=near; default 0.4 gives a pleasant grounded shadow. */
  z?: number;
  left: string;
  top: string;
  size?: number;
  params?: Record<string, number>;
}

/** Thin sprite wrapper over Layer. Uses <Gif> so animated sprites actually
 *  animate, with crisp `pixelated` upscaling; falls back to <Img> for PNGs. */
export const Mushroom: React.FC<MushroomProps> = ({
  src,
  motionId,
  from,
  durationInFrames,
  windowInFrames,
  bpm,
  z = 0.4,
  left,
  top,
  size = 160,
  params,
}) => {
  const isGif = src.toLowerCase().endsWith(".gif");
  return (
    <Layer
      motionId={motionId}
      from={from}
      durationInFrames={durationInFrames}
      windowInFrames={windowInFrames}
      bpm={bpm}
      z={z}
      params={params}
      centered
      style={{ left, top }}
    >
      {isGif ? (
        // Native size + CSS scaling: @remotion/gif clears only the GIF's intrinsic area between
        // frames, so a canvas larger than the sprite kept the previous frame's pixels (ghosting).
        <Gif src={staticFile(src)} fit="contain" style={{ width: size, height: size, imageRendering: "pixelated" }} />
      ) : (
        <Img src={staticFile(src)} className="pixelated" style={{ width: size, height: "auto", display: "block" }} />
      )}
    </Layer>
  );
};
