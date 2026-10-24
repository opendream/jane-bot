// Answer-bank validator CLI (plan §1). Runs the same rules as tests/unit/bank.test.ts.
//   npm run bank:validate        (vite-node, so it can import the TypeScript sources; no new dependency)
// Exit 1 on any error. Prints card id, rule and message only — never matched PII values.
import { validateBank } from "../../src/core/bank.ts";
import { bankContext, BANK, BANK_FILES } from "../../src/core/bankData.ts";
import { THAI_COPY_STATUS } from "../../src/config.ts";

export function formatIssue(i) {
  return `${i.level.padEnd(7)} ${i.card} ${i.rule}: ${i.msg}`;
}

const today = new Date().toISOString().slice(0, 10);
const issues = validateBank(BANK, bankContext(undefined, THAI_COPY_STATUS, today));
for (const i of issues) console.log(formatIssue(i));
const errors = issues.filter((i) => i.level === "error").length;
console.log(`bank: ${BANK.length} cards in ${BANK_FILES.length} file(s), copy status ${THAI_COPY_STATUS}: ${errors} error(s), ${issues.length - errors} warning(s)`);
process.exit(errors ? 1 : 0);
