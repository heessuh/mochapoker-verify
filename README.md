# Mocha Poker shuffle verifier

A small, dependency-free web page that checks the shuffles at a Mocha Poker table without trusting the site’s own code. It is an independent implementation of the “mochapoker-v1” scheme described in [FAIRNESS.md](FAIRNESS.md).

## Use it

* Online: https://heessuh.github.io/mochapoker-verify/
* Offline: download this folder and open `index.html` in a browser. Nothing is uploaded anywhere.

In the app, open History and press “Copy fairness data” (one hand) or “Download all hands” (the whole session), then paste or load it on the page. For every hand you get:

1. sha256(server seed) equals the committed hash;
2. the deck recomputed from the seeds equals the revealed deck;
3. optionally, your own client seed is among the seeds that were used.

The page also runs the three test vectors from the spec on load (“Self-test ✓”).

## Input format

```json
{
  "format": "mochapoker-fairness",
  "version": 1,
  "tableId": "abc123",
  "hands": [
    {
      "tableId": "abc123",
      "handNumber": 42,
      "algorithm": "mochapoker-v1",
      "serverSeed": "64 hex characters",
      "serverSeedHash": "64 hex characters",
      "clientSeeds": { "playerId": "32 hex characters" },
      "material": "mochapoker-v1|abc123|42|playerId:...",
      "deck": ["9s", "Qs", "..."],
      "youSaw": { "serverSeedHash": "...", "clientSeed": "..." }
    }
  ]
}
```

A single hand object or a plain array of hands also works. `youSaw` is optional: it is what the exporting browser stored before the deal.

## Test

```
npm test
```

(Node 20 or newer. The page itself needs no build step.)

## Files

* `verify.js`: the whole implementation (about 150 lines, plain JavaScript and WebCrypto).
* `index.html`, `style.css`: the page.
* `FAIRNESS.md`: the specification and test vectors.
