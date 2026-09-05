// #363 probe: does the overlay renderer's FIRST captured frame carry the
// title card? Run it with an encoder going in parallel to reproduce the race
// the old 20 ms capture had (7 blank of 25 under load before the fix, 0 after). Creates a fresh overlay session N times (exactly what one render
// does), captures frame 0 through captureFrames, and counts frames whose PNG is
// fully transparent (= caption missing). Run with: npx electron scripts/dev/overlay-first-frame-probe.js [N]
const path = require("path");
const { app, nativeImage } = require("electron");

const ROOT = path.join(__dirname, "..", "..");
const N = parseInt(process.argv[2] || "20", 10);
const { createOverlaySession } = require(path.join(ROOT, "src/main/subtitle-overlay-renderer.js"));

const captionStyle = {
  fontFamily: "Latina Essential", fontWeight: 900, fontSize: 64, bold: true,
  color: "#ffffff", lineSpacing: 1.15, strokeOn: true, strokeColor: "#000000",
  strokeWidth: 6, strokeOpacity: 1, yPercent: 50, widthPercent: 90,
};

function opaquePixels(pngBuf) {
  const img = nativeImage.createFromBuffer(pngBuf);
  const bmp = img.toBitmap(); // BGRA
  let n = 0;
  for (let i = 3; i < bmp.length; i += 4) if (bmp[i] > 0) n++;
  return n;
}

app.on("window-all-closed", () => {}); // keep the app alive between sessions
app.whenReady().then(async () => {
  // silence the renderer's own console chatter
  const origLog = console.log;
  console.log = (...a) => { if (!String(a[0]).startsWith("[OverlayRenderer")) origLog(...a); };

  let blank = 0, ok = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const session = await createOverlaySession({
      subtitleSegments: [],
      subtitleStyle: {},
      captionSegments: [{ id: "cap-1", text: "Bang vs NRG\nWTFLIP!!!", startSec: 0, endSec: 4.87 }],
      captionStyle,
      syncOffset: 0,
      clipStartTime: 0, clipEndTime: 5, timelineDuration: 5,
      sourceFile: null, resolutionProbeFile: null,
      targetWidth: 1080, targetHeight: 1920,
    });
    let first = null;
    let frames = 0;
    await session.captureFrames({
      writeFrame: async (buf) => { if (!first) first = buf; frames++; },
      shouldCancel: () => frames >= 1,
    });
    session.destroy();
    const px = first ? opaquePixels(first) : -1;
    if (px <= 0) blank++; else ok++;
    origLog(`run ${i + 1}/${N}: first frame opaque px = ${px} ${px <= 0 ? "  <-- BLANK (caption missing)" : ""}`);
  }
  origLog(`\nRESULT: ${blank} blank / ${ok} ok of ${N}  (${Date.now() - t0} ms)`);
  app.exit(0);
});
