import React from "react";
import facebookIcon from "../assets/platforms/facebook.png";
import instagramIcon from "../assets/platforms/instagram.png";
import tiktokIcon from "../assets/platforms/tiktok.svg";
import youtubeIcon from "../assets/platforms/youtube.png";

const ICONS = {
  facebook: facebookIcon,
  instagram: instagramIcon,
  tiktok: tiktokIcon,
  youtube: youtubeIcon,
};

const LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Each brand glyph has different built-in padding inside its canvas.
// Multipliers normalize their visual weight so all four read at the same size.
// Applied via CSS transform — the layout box stays exactly `size`px, so flex
// alignment and gap spacing are unaffected.
const VISUAL_SCALE = {
  facebook: 1.0,
  instagram: 1.0,
  tiktok: 1.1,
  youtube: 1.45,
};

export default function PlatformIcon({ platform, size = 16, style }) {
  const src = ICONS[platform];
  if (!src) return null;
  const scale = VISUAL_SCALE[platform] || 1;
  return (
    <img
      src={src}
      alt={LABELS[platform] || platform}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block", transform: scale === 1 ? undefined : `scale(${scale})`, ...style }}
    />
  );
}
