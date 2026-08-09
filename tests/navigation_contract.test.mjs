import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../site/", import.meta.url);
const navigation = JSON.parse(await readFile(new URL("data/navigation.json", root), "utf8"));

test("navigation catalog has one shared brand and reachable routes", async () => {
  assert.equal(navigation.brand.home, "index.html");
  const items = [...navigation.primary, ...navigation.groups.flatMap((group) => group.items)];
  assert.ok(items.length >= 12);
  for (const item of items) {
    await assert.doesNotReject(readFile(new URL(item.href, root)));
    assert.ok(item.label);
  }
});

test("navigation groups expose the research workflow", () => {
  assert.deepEqual(navigation.groups.map((group) => group.label), ["研究實驗室", "研究中心"]);
  assert.deepEqual(
    navigation.secondary.map((item) => item.href),
    ["composer.html", "research-lab.html", "beta-lab.html", "leverage-lab.html", "financing-lab.html", "risk-lab.html"],
  );
});
