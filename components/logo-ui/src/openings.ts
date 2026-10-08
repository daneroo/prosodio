/**
 * Famous book openings for the hero logo. The default, _The Name of the Wind_,
 * is the prototype's; then _The Hobbit_, and two in the public domain (Project
 * Gutenberg text).
 * Provisional: the exact phrases are chosen later (spec #25).
 */
export const HERO_OPENINGS = {
  nameOfTheWind: {
    title: "The Name of the Wind",
    text: "It was night again. The Waystone Inn lay in silence, and it was a silence of three parts. The most obvious part was a hollow, echoing quiet, made by things that were lacking. If there had been a wind it would have sighed through the trees, set the inn's sign creaking on its hooks, and brushed the silence down the road like trailing autumn leaves.",
  },
  hobbit: {
    title: "The Hobbit",
    text: "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.",
  },
  twoCities: {
    title: "A Tale of Two Cities",
    text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.",
  },
  mobyDick: {
    title: "Moby-Dick",
    text: "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",
  },
} as const;

export type HeroOpening = keyof typeof HERO_OPENINGS;
