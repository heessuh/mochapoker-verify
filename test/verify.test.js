const test = require("node:test");
const assert = require("node:assert");
const V = require("../verify.js");

test("the three spec vectors pass", async () => {
  const r = await V.selfTest();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.results.length, 3);
});

function hand(overrides = {}) {
  const v = V.VECTORS[2];
  return {
    tableId: "abc123", handNumber: 42, algorithm: "mochapoker-v1", serverSeed: v.seed, serverSeedHash: v.hash,
    clientSeeds: { amy: "22222222222222222222222222222222", bob: "33333333333333333333333333333333", zed: "11111111111111111111111111111111" },
    material: v.material, deck: v.deck.split(" "), ...overrides,
  };
}

test("a good hand verifies, as a single hand, an array, or the wrapped format", async () => {
  for (const data of [hand(), [hand()], { format: "mochapoker-fairness", version: 1, tableId: "abc123", hands: [hand()] }]) {
    const out = await V.verifyAll(JSON.stringify(data));
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].ok, true);
  }
});

test("tampering is caught", async () => {
  const swapped = hand().deck.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.strictEqual((await V.verifyHand(hand({ deck: swapped }))).ok, false);
  assert.strictEqual((await V.verifyHand(hand({ serverSeedHash: "00".repeat(32) }))).ok, false);
  assert.strictEqual((await V.verifyHand(hand({ clientSeeds: { amy: "22222222222222222222222222222222" } }))).ok, false);
});

test("my seed check", async () => {
  assert.strictEqual((await V.verifyHand(hand(), "33333333333333333333333333333333")).ok, true);
  assert.strictEqual((await V.verifyHand(hand(), "44444444444444444444444444444444")).ok, false);
  const saw = hand({ youSaw: { serverSeedHash: V.VECTORS[2].hash, clientSeed: "22222222222222222222222222222222" } });
  assert.strictEqual((await V.verifyHand(saw)).ok, true);
  const wrong = hand({ youSaw: { serverSeedHash: "ab".repeat(32), clientSeed: "22222222222222222222222222222222" } });
  assert.strictEqual((await V.verifyHand(wrong)).ok, false);
});

test("garbage input gives a clear error or a failed hand, never a crash", async () => {
  await assert.rejects(() => V.verifyAll("not json"), /not valid JSON/);
  assert.strictEqual((await V.verifyAll("[1]"))[0].ok, false);
  assert.strictEqual((await V.verifyAll("{}"))[0].ok, false);
});
