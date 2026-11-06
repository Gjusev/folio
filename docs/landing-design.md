# Landing design (2026-11-06)

The landing page is the promo film (`Folio-videos/promo`, 57 s) cut into chapters. Same ground,
same type, same accent, same moves; the film's real-UI fragments live in `public/landing/promo/`
(cut caption-free by `Folio-videos/tools/cut-fragments.sh`, so every word on the page is
translated HTML).

## Concept

- **Idea:** the film becomes the page. You scroll through the same 57 seconds, paused where you
  want to read.
- **Metaphor:** a product film's edit: hero, chapters, one turn, end card.
- **Signature:** the turn. The 93 real papers of the demo bibliography let go of the citation
  graph, order themselves and collapse into the lines of a cited draft. It is the film's own
  clip, scrubbed by scroll (all-keyframe encode), with three captions that change by phase.
- **Emotion:** calm precision, a tool that shows its work.
- **Motion verb:** rise flat and settle. The editor window rises out of the floor tilted back
  and lands flat (the film's first move); everything else settles with a long expo-out tail.
- **Screenshot:** the hero, silver serif headline over the window landing flat.

## System

| role   | value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| ground | `#08090a` with a cool sheen from the top (`rgba(126,138,180,.24)`)     |
| raised | `#0f0f0e` (Folio's own surface, the inside of every fragment)          |
| ink    | `#f2f2ef`                                                              |
| muted  | `#8d929b`                                                              |
| line   | `rgba(255,255,255,.10)` (panel rings only)                             |
| accent | `#5fb3c8` (Folio teal: one word per headline, the action, the kickers) |

Type: IBM Plex Serif 500 for display (silver top-to-bottom gradient, the accent word in teal),
IBM Plex Sans 400/500 for text, IBM Plex Mono for chapter kickers and real commands. All three
are already in the app (fontsource), no extra download.

Shape: panels 16 px radius with a 1 px ring and a deep shadow; buttons fully round.

Motion: `cubic-bezier(.16,1,.3,1)` (expo-out) for arrivals, 0.9 s large / 0.5 s small, stagger
70 ms. One scroll driver (rAF) for the hero tilt and the turn scrub. Reduced motion: no tilt, no
scrub (the turn shows its end frame and all three captions), loops stay on their posters.

## Deliberate departures from the taste-skill house rules

The owner asked for the film's design on the page, so its identity stays: gradient-filled serif
headlines, one accent word, mono chapter kickers and the soft glow of the end card. They are used
once per section, never stacked.
