import headerUrl from "../assets/jane/header.webp";
import avatarUrl from "../assets/jane/avatar.webp";
import avatar96Url from "../assets/jane/avatar-96.webp";
import emptyUrl from "../assets/jane/empty.webp";
import thinkingUrl from "../assets/jane/quiz-thinking.webp";
import surprisedUrl from "../assets/jane/quiz-surprised.webp";
import backUrl from "../assets/jane/quiz-back.webp";
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

export interface JaneImageSpec {
  src: string;
  width: number;
  height: number;
  alt: string;
  testid: string;
  className: string;
}

export const JANE_IMAGES = {
  header: { src: headerUrl, width: 642, height: 897, alt: "พี่เจน", testid: "jane-header", className: "jane-header" },
  avatar: { src: avatarUrl, width: 256, height: 256, alt: "พี่เจน", testid: "jane-avatar", className: "jane-avatar-lg" },
  avatar96: { src: avatar96Url, width: 96, height: 96, alt: "พี่เจน", testid: "jane-avatar", className: "jane-avatar" },
  empty: { src: emptyUrl, width: 720, height: 636, alt: "พี่เจนกับเพื่อนนั่งที่บันได", testid: "jane-empty", className: "jane-empty" },
  thinking: { src: thinkingUrl, width: 400, height: 468, alt: "พี่เจนยิ้ม", testid: "jane-quiz-thinking", className: "jane-quiz-img" },
  surprised: { src: surprisedUrl, width: 400, height: 562, alt: "พี่เจนทำหน้าประหลาดใจ", testid: "jane-quiz-surprised", className: "jane-quiz-img" },
  back: { src: backUrl, width: 340, height: 881, alt: "พี่เจนยืนหันหลัง", testid: "jane-quiz-back", className: "jane-quiz-back-img" },
} as const satisfies Record<string, JaneImageSpec>;

export type JaneImageKind = keyof typeof JANE_IMAGES;

export interface JaneStarSpec {
  src: string;
  name: string;
  decorative: true;
}

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

export function janeImg(kind: JaneImageKind, extra: Record<string, unknown> = {}) {
  const spec = JANE_IMAGES[kind];
  return h("img", {
    src: spec.src,
    alt: spec.alt,
    width: String(spec.width),
    height: String(spec.height),
    class: spec.className,
    "data-testid": spec.testid,
    decoding: "async",
    ...extra,
  });
}

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
    janeImg("surprised"),
    h("div", { class: "quiz-stars", "data-testid": "quiz-stars" },
      janeStar("yellow"), janeStar("lilac"), janeStar("pink"), janeStar("pale-blue")));
}

export function quizThinkingArt() {
  return h("div", { class: "quiz-thinking", "data-testid": "quiz-thinking" }, janeImg("thinking"));
}

export function quizTryAgainArt() {
  return h("div", { class: "quiz-back-card", "data-testid": "quiz-try-again" }, janeImg("back"));
}

export function emptyChatArt() {
  return h("div", { class: "empty-card", "data-testid": "chat-empty" }, janeImg("empty"));
}

export function welcomeStars() {
  return h("div", { class: "welcome-stars", "data-testid": "welcome-stars" },
    janeStar("yellow", { class: "jane-star jane-star-yellow welcome-star-a" }),
    janeStar("lilac", { class: "jane-star jane-star-lilac welcome-star-b" }),
    janeStar("pink", { class: "jane-star jane-star-pink welcome-star-c" }));
}

/** Fetch every Jane file during the first paint so later screens make no new requests. */
export function preloadJaneArt() {
  if (typeof Image === "undefined") return;
  for (const spec of [...Object.values(JANE_IMAGES), ...Object.values(JANE_STARS)]) {
    const img = new Image();
    img.src = spec.src;
  }
}
