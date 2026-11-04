// Mocha Poker shuffle verifier: an independent implementation of "mochapoker-v1" (see FAIRNESS.md).
// Plain JavaScript, no libraries. Uses only the browser's built-in WebCrypto (also available in Node 20+).
// Works as a normal <script> (so index.html runs from disk) and as a Node module (require("./verify.js")).
(function (root) {
  "use strict";

  const enc = new TextEncoder();
  const subtle = (globalThis.crypto || {}).subtle;

  const hexToBytes = (hex) => {
    if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("not a valid hex string");
    return Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));
  };
  const bytesToHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

  // The commitment: SHA-256 of the 32 raw bytes of the server seed (not of the hex text).
  async function commitmentOf(serverSeedHex) {
    return bytesToHex(await subtle.digest("SHA-256", hexToBytes(serverSeedHex)));
  }

  // A fresh deck, in the order the spec defines: clubs, diamonds, hearts, spades; 2..A in each.
  function freshDeck() {
    const deck = [];
    for (const suit of "cdhs") for (const rank of "23456789TJQKA") deck.push(rank + suit);
    return deck;
  }

  // The shuffle. Randomness is a stream of 32-bit numbers taken from HMAC-SHA256(key = server seed bytes,
  // message = material + "|" + 0, 1, 2, ...). Each 32-byte block gives eight big-endian numbers.
  async function deriveDeck(serverSeedHex, material) {
    const key = await subtle.importKey("raw", hexToBytes(serverSeedHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    let blockNumber = 0;
    let block = new DataView(new ArrayBuffer(32));
    let used = 32; // bytes used in the current block; 32 means "fetch the next block"

    async function nextUint32() {
      if (used === 32) {
        block = new DataView(await subtle.sign("HMAC", key, enc.encode(material + "|" + blockNumber++)));
        used = 0;
      }
      const value = block.getUint32(used, false); // big-endian
      used += 4;
      return value;
    }

    // Uniform integer in [0, n): throw away values at or above the largest multiple of n that fits in 2^32,
    // so no remainder is favored (no "modulo bias").
    async function randInt(n) {
      const limit = Math.floor(2 ** 32 / n) * n;
      let u = await nextUint32();
      while (u >= limit) u = await nextUint32();
      return u % n;
    }

    // Fisher-Yates from the end of the deck down to position 1.
    const deck = freshDeck();
    for (let i = 51; i >= 1; i--) {
      const j = await randInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // material = "mochapoker-v1|" + tableId + "|" + handNumber + "|" + "playerId:clientSeed" pairs sorted by playerId, joined by ","
  function buildMaterial(tableId, handNumber, clientSeeds) {
    const ids = Object.keys(clientSeeds).sort(); // plain string order
    return "mochapoker-v1|" + tableId + "|" + handNumber + "|" + ids.map((id) => id + ":" + clientSeeds[id]).join(",");
  }

  // The three test vectors published in FAIRNESS.md. If these pass, this page implements the spec.
  const VECTORS = [
    {
      seed: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
      material: "mochapoker-v1|tbl|1|",
      hash: "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd",
      deck: "Kc 5d Jd 5c Qc 9s 3h Ah Ad 8s 7d 5s Jh Kd 4c Th Ks Qh 8d Ac 3c 7s As Kh Jc 2h Ts 2c 6s 4h 4s 7h Qs 6d 9c 3d 8c 9d Qd 9h 4d Js 2d 7c 6h 2s Tc 6c 3s 8h 5h Td",
    },
    {
      seed: "ff".repeat(32),
      material: "mochapoker-v1|room7|12|p1:fedcba9876543210fedcba9876543210,p2:0123456789abcdef0123456789abcdef",
      hash: "af9613760f72635fbdb44a5a0a63c39f12af30f950a6ee5c971be188e89c4051",
      deck: "8c Ad 5h 9s Qc Jd Td 9c 7h 8h Qs 9h Jc 7d 2c 3c 4c 2d Jh 4h 4s Ks 2h 2s 4d 8s As Th Qh 6c Kc 5s Tc 6h 5d 3s Ac 7c 8d 5c 6s 3d Kh 7s Ah Ts Js 6d 9d 3h Kd Qd",
    },
    {
      seed: "a5".repeat(32),
      material: "mochapoker-v1|abc123|42|amy:22222222222222222222222222222222,bob:33333333333333333333333333333333,zed:11111111111111111111111111111111",
      hash: "fc8b64001c5fdd0f2f40fb67dae4a865a2c5bd17836676d6d5b58b7917e33717",
      deck: "9s Qs Qc Jc Kc Jd 4d As Tc Qh 4s 6h 6c 8c Td 5s Th 4c Qd 9c 5h Ac 3h Jh 7s 6d 3d Ad 7c Ks 2c 9d Kd Js 9h 8d 3c Ts 4h Ah 2d 2s 5d 7d 7h 6s 8h Kh 8s 3s 5c 2h",
    },
  ];

  async function selfTest() {
    const results = [];
    for (const [i, v] of VECTORS.entries()) {
      let hashOk = false, deckOk = false;
      try {
        hashOk = (await commitmentOf(v.seed)) === v.hash;
        deckOk = (await deriveDeck(v.seed, v.material)).join(" ") === v.deck;
      } catch (e) { /* stays false */ }
      results.push({ name: "Vector " + (i + 1), ok: hashOk && deckOk, hashOk, deckOk });
    }
    return { ok: results.every((r) => r.ok), results };
  }

  // Accepts: the app's export ({ format, hands: [...] }), an array of hands, or one hand.
  function parseInput(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("That is not valid JSON: " + e.message); }
    const hands = Array.isArray(data) ? data : Array.isArray(data && data.hands) ? data.hands : [data];
    const tableId = data && !Array.isArray(data) ? data.tableId : undefined;
    return hands.map((h) => (h && typeof h === "object" && h.tableId === undefined && tableId !== undefined ? { ...h, tableId } : h));
  }

  const check = (ok, label, detail) => ({ ok, label, detail });

  // Verify one hand. `mySeed` (optional) is a client seed the player remembers; the hand's own `youSaw` field
  // (saved by the player's browser before the deal) is used as well when present.
  async function verifyHand(hand, mySeed) {
    const checks = [];
    const bad = (what) => ({ handNumber: hand && hand.handNumber, ok: false, checks: [check(false, "Hand data", what)] });
    if (!hand || typeof hand !== "object") return bad("This entry is not a hand object.");
    if (typeof hand.serverSeed !== "string" || typeof hand.serverSeedHash !== "string" || !Array.isArray(hand.deck)
        || typeof hand.tableId !== "string" || hand.handNumber === undefined || !hand.clientSeeds || typeof hand.clientSeeds !== "object") {
      return bad("Missing one of: tableId, handNumber, serverSeed, serverSeedHash, clientSeeds, deck.");
    }
    if (hand.algorithm !== undefined && hand.algorithm !== "mochapoker-v1") return bad("Unknown algorithm " + hand.algorithm + " (this page only knows mochapoker-v1).");

    try {
      const computed = await commitmentOf(hand.serverSeed);
      const matches = computed === String(hand.serverSeedHash).toLowerCase();
      checks.push(check(matches, "sha256(server seed) equals the committed hash",
        matches ? "Commitment " + hand.serverSeedHash : "sha256 of the revealed seed is " + computed + ", but the commitment is " + hand.serverSeedHash));

      const saw = hand.youSaw && hand.youSaw.serverSeedHash;
      if (saw) {
        const same = saw.toLowerCase() === computed;
        checks.push(check(same, "Matches the commitment your browser saw before the deal",
          same ? "Your browser stored " + saw + " before the cards were dealt." : "Your browser stored " + saw + " before the deal, which is a different hash."));
      }

      const material = buildMaterial(hand.tableId, hand.handNumber, hand.clientSeeds);
      const deck = await deriveDeck(hand.serverSeed, material);
      const deckOk = deck.length === hand.deck.length && deck.every((c, i) => c === hand.deck[i]);
      checks.push(check(deckOk, "Recomputed deck equals the revealed deck",
        deckOk ? "Shuffled again from the seeds: all 52 cards are in the same order." : "The deck recomputed from the seeds is different from the revealed deck."));
      if (hand.material !== undefined) {
        const same = hand.material === material;
        checks.push(check(same, "Shuffle material matches", same ? material : "Export says " + hand.material + " but the seeds give " + material));
      }

      const seeds = [];
      if (hand.youSaw && hand.youSaw.clientSeed) seeds.push(["the seed your browser sent", hand.youSaw.clientSeed]);
      if (mySeed) seeds.push(["the seed you pasted", mySeed.trim().toLowerCase()]);
      for (const [what, seed] of seeds) {
        const included = Object.values(hand.clientSeeds).includes(seed);
        checks.push(check(included, "My seed is included", included ? "Found " + what + " among the player seeds." : "Did not find " + what + " among the player seeds."));
      }
    } catch (e) {
      checks.push(check(false, "Verification", "Could not run the checks: " + (e && e.message ? e.message : e)));
    }
    return { handNumber: hand.handNumber, tableId: hand.tableId, commitment: hand.serverSeedHash, ok: checks.every((c) => c.ok), checks };
  }

  async function verifyAll(text, mySeed) {
    const out = [];
    for (const h of parseInput(text)) out.push(await verifyHand(h, mySeed));
    return out;
  }

  const api = { hexToBytes, bytesToHex, commitmentOf, freshDeck, deriveDeck, buildMaterial, VECTORS, selfTest, parseInput, verifyHand, verifyAll };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MochaVerify = api;
})(typeof window !== "undefined" ? window : globalThis);
