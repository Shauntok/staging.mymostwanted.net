import assert from "node:assert/strict";
import test from "node:test";

const metadataModule = await import("./localized-home-metadata.mjs").catch(() => null);

test("localized home canonical URLs are omitted until a trusted indexable origin exists", () => {
  assert.equal(typeof metadataModule?.localizedHomeMetadata, "function");
  const build = metadataModule.localizedHomeMetadata;

  for (const locale of ["en", "zh-cn", "ms"]) {
    const disabled = build(locale, null);
    assert.deepEqual(disabled.robots, {index: false, follow: false});
    assert.equal("alternates" in disabled, false);
  }

  for (const origin of [
    "http://mmwr.example",
    "https://user:password@mmwr.example",
    "https://mmwr.example/preview",
    "https://mmwr.example?preview=true",
    "https://mmwr.example#preview",
  ]) {
    assert.deepEqual(build("en", origin), {robots: {index: false, follow: false}});
  }
  assert.deepEqual(build("fr", "https://mmwr.example"), {robots: {index: false, follow: false}});

  const enabled = build("zh-cn", "https://mmwr.example");
  assert.equal(enabled.robots.index, true);
  assert.equal(enabled.alternates.canonical, "https://mmwr.example/zh-cn");
  assert.deepEqual(enabled.alternates.languages, {
    "en-MY": "https://mmwr.example/en",
    "zh-CN": "https://mmwr.example/zh-cn",
    "ms-MY": "https://mmwr.example/ms",
    "x-default": "https://mmwr.example/en",
  });
});
