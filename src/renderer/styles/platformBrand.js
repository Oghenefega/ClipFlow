// #325: one definition of each platform's identity ON THE DARK THEME, shared by
// the Queue's per-platform caption blocks (QueueView) and the Captions panel
// (CaptionsView) so the two can never drift apart.
//
// These are not always the literal brand hex. The brand has to survive a #0a0b10
// background: TikTok's black is invisible here so its cyan carries the identity,
// and Facebook's #1877f2 is lifted for text while `bar` keeps the true blue.
//
//   accent — the platform name's text colour
//   bar    — the 2px top edge of a block (a full-strength brand hit)
//   edge   — the block's border
//   band   — the header wash, fading out to the right
//
// Deliberately no left-edge colour bar anywhere.
const PLATFORM_BRAND = {
  tiktok: {
    accent: "#25f4ee", bar: "#25f4ee", edge: "rgba(37,244,238,0.26)",
    band: "linear-gradient(90deg,rgba(37,244,238,0.08),rgba(37,244,238,0))",
  },
  instagram: {
    accent: "#f2588f", bar: "#d62976", edge: "rgba(214,41,118,0.30)",
    band: "linear-gradient(90deg,rgba(131,58,180,0.16),rgba(214,41,118,0.11) 45%,rgba(252,176,69,0))",
  },
  facebook: {
    accent: "#4a9bff", bar: "#1877f2", edge: "rgba(24,119,242,0.32)",
    band: "linear-gradient(90deg,rgba(24,119,242,0.11),rgba(24,119,242,0))",
  },
  youtube: {
    accent: "#ff0033", bar: "#ff0033", edge: "rgba(255,0,51,0.30)",
    band: "linear-gradient(90deg,rgba(255,0,51,0.10),rgba(255,0,51,0))",
  },
};

export default PLATFORM_BRAND;
