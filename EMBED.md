# CT68.B1.Doll: putting the dolls in another page

The three caroler dolls can go into any three.js page, such as the Darkride (CT61). Everything they need is in one file, `embed/ct68_carolers.js`, about 1.6 MB:

- the rig;
- the singing, talking and blinking;
- the candles, with the blow-out and the flame level;
- the noise and the MIDI map;
- the dolls' textures.

It is a classic script, like every file of the Darkride. It uses the page's own three.js, so there is only one copy of three.js and the dolls share the page's renderer and scene. It works from the disk with no server.

## In the Darkride, step by step

1. Copy `CT68.B1.Doll\embed\ct68_carolers.js` into the Darkride folder, for example as `CT61.Bx.Darkride_lib/ct68_carolers.js`.
2. In `index.html`, load it after three.js:

   ```html
   <script src="CT61.B5.Darkride_lib/three.r186.min.js"></script>
   <script src="CT61.B5.Darkride_lib/ct68_carolers.js"></script>
   ```

3. Where the scene is built, make the dolls and place them:

   ```js
   const carolers = await CT68Carolers.create(THREE, {
     scale: 1,                      // 1: about 1 unit tall, standing on y = 0; the row is 1.6 wide
     roomLights: [hemi, keyLight],  // the lights that go dark when the candles are blown out
     singing: true,                 // start singing
   });
   carolers.group.position.set(x, y, z);   // where they stand in the ride
   carolers.group.rotation.y = angle;      // they face +Z in their own space
   scene.add(carolers.group);
   ```

   `create` returns a Promise because the textures are decoded first, which takes a fraction of a second. If the code is not `async`, use `CT68Carolers.create(…).then(c => { … })`.
4. In the render loop, before `renderer.render`, call `carolers.update(seconds)`. Use any clock that runs forward in seconds: `performance.now() / 1000`, or the ride's own time, so that a recording made in non-real time stays smooth.
5. Connect the controls to the Darkride's MIDI and buttons. Either:
   - call the actions from the ride's own MIDI layer: `carolers.sing()`, `carolers.blowOut()`, `carolers.setFlameLevel(v)`, `carolers.setControl01('headTurn', value / 127)`; or
   - pass the raw messages on: `carolers.handleMIDI(ev.data)` uses the dolls' own CC map (below).

## The API

`CT68Carolers.create(THREE, options)` gives back `carolers`. You can also call `CT68Carolers.create(options)` to use the page's global `THREE`.

**Options** (all optional):

| Option | Default | What it does |
|---|---|---|
| `scale` | 1 | the size of the dolls; the candle lights' reach and brightness scale with it |
| `lights` | true | each candle has a point light (in `carolers.group`); false: only the visible flames |
| `roomLights` | [] | your lights to dim with the candles. Their intensity when you pass them is taken as full. |
| `singing` / `talking` | false | start singing or talking |
| `autoBlink` | true | a blink every 8 to 20 seconds |
| `flameLevel` | 1 | 0 to 3 |
| `hair` | the A6 style | `{ line: 'back', thick: 0.55, opacity: 0.6 }` |
| `noise` | none | a list of Perlin-noise channels, `{ part, axis, amp, oct, mult, seed }` (see `OFFSETS`) |
| `blowout` | see below | timings, in seconds: `{ flicker: 1.6, die: 0.45, dark: 4, relight: 1.3, stagger: 0.22, darkness: 0.04 }` |
| `midiMap` | the defaults | a change to the CC map, for example `{ blowOut: 60 }` |
| `baseUrl` | — | load the dolls from a `dolls/` folder over http, instead of the packed data |

**What `carolers` has:**

| Member | What it does |
|---|---|
| `group` | the dolls and their candle lights: add it to your scene, move and turn it |
| `update(seconds)` | call once a frame; returns the room light, 0..1 |
| `setPose({ headTurn, headNod, armRaise, eyeX, eyeY, mouthOpen, mouthShape, sway, spin, blink }, now?)` | the pose of all three, eased over about 0.06 s (`now = true` jumps there). The ranges are in `CONTROLS`. |
| `setControl01(key, u)` | one control from 0..1, as from a fader |
| `resetPose()` | back to rest |
| `sing(on?)`, `talk(on?)` | with no argument, on or off by turns; returns the new state. `singing` and `talking` read it. |
| `spin360()`, `blink()`, `setAutoBlink(on)` | |
| `blowOut({ dark }?)` | the flames flicker, go out, stay dark for `dark` seconds (default 4), then light again; false if they are already out |
| `relight()` | light them now |
| `setFlameLevel(v)`, `flameLevel` | 0 to 3, 1 is normal: the flames' size (√level) and their light (level) |
| `flamePhase` | `'lit'`, `'flicker'`, `'dying'`, `'dark'` or `'relight'` |
| `roomLight` | 0..1: how lit the room should be now. Use it for lights you did not pass in `roomLights`, or for fog, sky or exposure. |
| `addRoomLight(light)` | dim another light with the candles |
| `setHair(h)`, `setNoise(channels, on)` | |
| `handleCC(cc, value)`, `handleMIDI(data)` | the dolls' own MIDI map; returns true if the CC was theirs |
| `on((type, detail) => …)` | events: `'sing'`, `'talk'`, `'blowout'`, `'spinEnd'`; returns a function that stops listening |
| `rigs`, `candles`, `performer`, `shown`, `target` | the parts, for anything more |
| `dispose()` | takes the dolls out and frees their geometry and textures |

`CT68Carolers` also has the following, for building your own UI or map:

- `VERSION`, `CONTROLS`, `TRIGGERS`, `LEVELS`, `MIDI_DEFAULTS`, `BLOWOUT`;
- the lower-level `buildDoll`, `Candles` and `Performer`.

## The dolls' MIDI map (`handleCC`)

| CC | What |
|---|---|
| 20 | Head turn |
| 21 | Head nod |
| 22 | Raise candle arm |
| 23 | Eyes left/right |
| 24 | Eyes up/down |
| 25 | Mouth open |
| 26 | Mouth shape |
| 27 | Body sway |
| 28 | Spin |
| 32 | Eyelids |
| 37 | Flame level (0 → 3) |
| 29 | Sing (button) |
| 30 | Spin 360° (button) |
| 33 | Blink (button) |
| 34 | Auto blink (button) |
| 35 | Talk (button) |
| 36 | Noise (button) |
| 38 | Blow out candles (button) |

Pose controls take values 0 → 127 across their range. A button presses when its CC goes from below 64 to 64 or more. CC 31 (record) belongs to the CT68 page and does nothing here.

## Notes for the host

- **Size and place:** the dolls are about 1 unit tall, standing on y = 0 and facing +Z. The middle doll is at x = 0, and the outer two are at x = ±0.8, turned in by 14°.
- **Lights:**
  - The dolls use `MeshStandardMaterial`, so they need light. In a dark ride, a spot on them plus the candles looks right.
  - The candle lights are three `PointLight`s. Only the middle one casts shadows.
  - If the host has many lights already, `lights: false` drops the candle lights and keeps the flames.
- **Darkness:**
  - While the candles are out, only the lights in `roomLights` are dimmed. Use `roomLight` for anything else.
  - The room never goes below `blowout.darkness` (4%). Set it to 0 for full black.
- **Shadows:** the dolls cast and receive shadows if the renderer has `shadowMap.enabled`.
- **Tone:** CT68 uses `ACESFilmicToneMapping` at exposure 1.1. The textures are sRGB.
- **three.js:** made with r180, and it uses only plain APIs. The Darkride's r186 should work, but the dolls have not been tried in the Darkride itself.
- **Several sets:** each `create` makes an independent set with its own candles and timing.

## Other ways in

- **An ES-module page served over http:** `import { createCarolers } from './CT68.B1.Doll/src/carolers.js'`, then `await createCarolers(THREE)`. It loads the dolls from `CT68.B1.Doll/dolls/` (or `baseUrl`).
- **The example:** `embed/example.html` is a host scene with the dolls added, scaled to 0.8 and placed. It has buttons for sing, talk, spin, blow out and flame level, and MIDI. It loads three.js as an ES module, so open it through a server: run the `ct68-a7` launch entry, or `python -m http.server 8788` in `CT68.B1.Doll`, then open http://127.0.0.1:8788/embed/example.html.
- **Rebuilding:** run `node build.mjs` in `CT68.B1.Doll` after changing `src/doll_rig.js`, `src/carolers.js` or a doll.
