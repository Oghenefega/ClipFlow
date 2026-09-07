// #375: the OAuth flows persist DISPLAY-cased platform names ("YouTube",
// "TikTok", "Facebook", "Instagram"), while every lookup and every tracker row
// works in lowercase keys. `refreshYoutubeViews` compared `a.platform` to
// "youtube" directly, so it never matched a real account and #183's view-count
// ranking silently received zero rows for months.
//
// These pin the contract: stored casing is display casing, so any lookup must
// go through accountToPlatformKey rather than comparing the raw field.
const { accountToPlatformKey } = require("../../shared/captionResolve");

// The exact strings the OAuth flows write (oauth/youtube.js:196 and siblings).
const STORED = [
  { platform: "YouTube", expected: "youtube" },
  { platform: "TikTok", expected: "tiktok" },
  { platform: "Facebook", expected: "facebook" },
  { platform: "Instagram", expected: "instagram" },
];

describe("accountToPlatformKey — #375 display casing vs lookup keys", () => {
  test.each(STORED)("maps stored $platform to $expected", ({ platform, expected }) => {
    expect(accountToPlatformKey({ platform })).toBe(expected);
  });

  test("the raw comparison that caused the bug does NOT match a stored account", () => {
    // If this ever starts passing, the OAuth flows changed what they persist
    // and the surrounding assumptions need re-checking.
    const account = { platform: "YouTube" };
    expect(account.platform === "youtube").toBe(false);
    expect(accountToPlatformKey(account) === "youtube").toBe(true);
  });

  test("a Meta account with a linked IG business account resolves to instagram", () => {
    expect(accountToPlatformKey({ platform: "Meta", igAccountId: "123" })).toBe("instagram");
    expect(accountToPlatformKey({ platform: "Meta" })).toBeNull();
  });

  test("unknown and malformed accounts resolve to null rather than throwing", () => {
    expect(accountToPlatformKey({ platform: "Twitch" })).toBeNull();
    expect(accountToPlatformKey({})).toBeNull();
    expect(accountToPlatformKey(null)).toBeNull();
  });
});
