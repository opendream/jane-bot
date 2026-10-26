import {
  QUIZ_BACK, QUIZ_CONFIRM_ORDER, QUIZ_DOWN, QUIZ_NEXT, QUIZ_NO, QUIZ_OK,
  QUIZ_PLACEHOLDER_TAG, QUIZ_STOP, QUIZ_UP, QUIZ_WRAP,
  advanceQuiz, answerChoice, answerOrder, choiceWasCorrect, currentItem, moveIndex,
  type QuizSession,
} from "../core/quiz";
import { h } from "./dom";
import { quizSuccessArt } from "./jane";

export interface QuizHooks {
  update(next: QuizSession | null): void;
}

export function quizPanel(s: QuizSession, hooks: QuizHooks): HTMLElement {
  const stop = h("button", { class: "btn-ghost quiz-stop", "data-testid": "quiz-stop", type: "button", onclick: () => hooks.update(null) }, QUIZ_STOP);
  if (s.phase === "done") {
    return h("section", { class: "quiz", "data-testid": "quiz-panel", "data-phase": "done" },
      quizSuccessArt(),
      h("p", { "data-testid": "quiz-wrap" }, QUIZ_WRAP),
      h("button", { class: "chip", "data-testid": "quiz-back", type: "button", onclick: () => hooks.update(null) }, QUIZ_BACK),
      stop);
  }
  const item = currentItem(s);
  const ask = s.phase === "ask";
  const correct = s.phase === "explain" && choiceWasCorrect(s);
  return h("section", { class: "quiz", "data-testid": "quiz-panel", "data-phase": s.phase, "data-format": item.format, "data-id": item.id },
    correct ? quizSuccessArt() : null,
    item.status === "PLACEHOLDER" && h("span", { class: "tag placeholder", "data-testid": "quiz-placeholder" }, QUIZ_PLACEHOLDER_TAG),
    h("p", { class: "quiz-prompt", "data-testid": "quiz-prompt" }, item.prompt_th),
    ask && item.format === "ordering" ? orderBlock(s, hooks) : null,
    ask && item.format !== "ordering" ? choiceBlock(s, hooks) : null,
    s.phase === "explain" ? explainBlock(s, correct, hooks) : null,
    stop);
}

function choiceBlock(s: QuizSession, hooks: QuizHooks): HTMLElement {
  const item = currentItem(s);
  const chat = item.format === "multiple_choice_chat";
  return h("div", { class: chat ? "quiz-opts quiz-chat" : "quiz-opts" },
    ...item.options.map((label, i) =>
      h("button", {
        class: chat ? "quiz-bubble" : "btn-choice quiz-opt",
        type: "button",
        "data-testid": `quiz-opt-${i}`,
        style: "min-height:44px",
        onclick: () => hooks.update(answerChoice(s, i)),
      }, label)));
}

function orderBlock(s: QuizSession, hooks: QuizHooks): HTMLElement {
  const item = currentItem(s);
  return h("div", { class: "quiz-order" },
    ...s.order.map((optI, row) =>
      h("div", { class: "quiz-order-row", "data-testid": `quiz-order-${row}` },
        h("span", { class: "quiz-order-n" }, String(row + 1)),
        h("p", { class: "quiz-order-text" }, item.options[optI]),
        h("div", { class: "quiz-order-btns" },
          h("button", { type: "button", class: "quiz-arrow", "data-testid": `quiz-up-${row}`, "aria-label": QUIZ_UP, disabled: row === 0, style: "min-height:44px;min-width:44px",
            onclick: () => hooks.update({ ...s, order: moveIndex(s.order, row, -1) }) }, "↑"),
          h("button", { type: "button", class: "quiz-arrow", "data-testid": `quiz-down-${row}`, "aria-label": QUIZ_DOWN, disabled: row === s.order.length - 1, style: "min-height:44px;min-width:44px",
            onclick: () => hooks.update({ ...s, order: moveIndex(s.order, row, 1) }) }, "↓"),
        ))),
    h("button", { class: "btn-primary", type: "button", "data-testid": "quiz-confirm", onclick: () => hooks.update(answerOrder(s)) }, QUIZ_CONFIRM_ORDER));
}

function explainBlock(s: QuizSession, correct: boolean, hooks: QuizHooks): HTMLElement {
  const item = currentItem(s);
  return h("div", { class: "quiz-explain-block" },
    h("p", { class: "quiz-result", "data-testid": "quiz-result", "data-ok": String(correct) }, correct ? QUIZ_OK : QUIZ_NO),
    h("p", { "data-testid": "quiz-explain" }, item.explanation_th),
    h("button", { class: "chip", type: "button", "data-testid": "quiz-next", onclick: () => hooks.update(advanceQuiz(s)) },
      s.index + 1 >= s.items.length ? QUIZ_BACK : QUIZ_NEXT));
}
