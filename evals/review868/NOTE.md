# 868-query review pack — provenance

- Count: 868 unique Thai query strings. Format: flat JSON array (no labels or ids).
- sha256 of `queries.json`: `31f26dfc913934fafcfa0337831ae4cc4e82d7a7dc636ce6d89b2f486927a948`
- Lineage: successive synthetic review packs (529 → 590 → 639 → … → 833 → 868). Not fully regenerable from this repository, so the array is committed as an eval fixture.
- Items 0–371 (372 strings) can be regenerated from git history of bank triggers plus the e948 fixture query list (ordered dedupe, first occurrence wins).
- Items 372–867 (496 strings): hand-written synthetic review probes. 295 of those strings never appear in any repo file at any commit; 23 more appear only as substrings in fixtures/tests.
- PII scan: 0 emails, 0 @/LINE ids, 0 URLs, 0 phone-like or 13-digit numbers (only digit run: `2-1-1` PrEP dosing). Latin tokens only prep/pep/hiv/rsa/iud/prepare. No personal names (only anonymous-testing phrasing such as ไม่ระบุชื่อ / ไม่บอกชื่อ). Phrasing is short synthetic gate text (3–66 chars), not chat logs.
- Licence: CC BY-SA 4.0, attribution Opendream. See `evals/LICENSE` and `evals/NOTICE`.
