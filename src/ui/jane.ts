import starYellow from "../assets/jane/star-yellow.svg";
import starLilac from "../assets/jane/star-lilac.svg";
import starLilac2 from "../assets/jane/star-lilac-2.svg";
import starPaleBlue from "../assets/jane/star-pale-blue.svg";
import starPink from "../assets/jane/star-pink.svg";
import starWhite from "../assets/jane/star-white.svg";
import starsSheet from "../assets/jane/stars-sheet.svg";
import { h } from "./dom";

/** Exact in-app credit. Do not add a licence label or an illustrator name. */
export const ART_CREDIT = "Illustration © Opendream, 2018";

export interface JaneStarSpec {
  src: string;
  name: string;
  decorative: true;
}

/** True vector stars from the 2018 Sex Safe Safe cover. Raster Jane crops are not shipped. */
export const JANE_STARS = {
  yellow: { src: starYellow, name: "yellow", decorative: true },
  lilac: { src: starLilac, name: "lilac", decorative: true },
  "lilac-2": { src: starLilac2, name: "lilac-2", decorative: true },
  "pale-blue": { src: starPaleBlue, name: "pale-blue", decorative: true },
  pink: { src: starPink, name: "pink", decorative: true },
  white: { src: starWhite, name: "white", decorative: true },
  sheet: { src: starsSheet, name: "sheet", decorative: true },
} as const satisfies Record<string, JaneStarSpec>;

export type JaneStarKind = keyof typeof JANE_STARS;

export function janeStar(kind: JaneStarKind, extra: Record<string, unknown> = {}) {
  const spec = JANE_STARS[kind];
  return h("img", {
    src: spec.src,
    alt: "",
    width: "32",
    height: "32",
    class: `jane-star jane-star-${spec.name}`,
    "data-testid": "jane-star",
    "data-star": spec.name,
    "aria-hidden": "true",
    decoding: "async",
    ...extra,
  });
}

export function quizSuccessArt() {
  return h("div", { class: "quiz-success", "data-testid": "quiz-success" },
    h("div", { class: "quiz-stars", "data-testid": "quiz-stars" },
      janeStar("yellow"), janeStar("lilac"), janeStar("pink"), janeStar("pale-blue")));
}

export function welcomeStars() {
  return h("div", { class: "welcome-stars", "data-testid": "welcome-stars" },
    janeStar("yellow", { class: "jane-star jane-star-yellow welcome-star-a" }),
    janeStar("lilac", { class: "jane-star jane-star-lilac welcome-star-b" }),
    janeStar("pink", { class: "jane-star jane-star-pink welcome-star-c" }));
}

/** Fetch remaining Jane vector files during the first paint so later screens make no new requests. */
export function preloadJaneArt() {
  if (typeof Image === "undefined") return;
  for (const spec of Object.values(JANE_STARS)) {
    const img = new Image();
    img.src = spec.src;
  }
}
