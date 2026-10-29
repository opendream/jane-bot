/**
 * Reviewed allowlist of safe conversational words for grounded Jane chat.
 * A reply content word may appear if it is on the approved card OR in this
 * list. Keep short. Do not add action verbs, units, numbers, ages, person /
 * authority nouns (พ่อ, แม่, ผู้ปกครอง, ผู้ใหญ่) or place names.
 *
 * Multi-word Thai phrases are stored concatenated (no spaces) so they still
 * match after Intl.Segmenter splits them (ไม่ต้องกังวล, ซักถาม, ตรงนี้).
 * Synthetic strings only. Never logs text.
 */

export const CHAT_COVERAGE_ALLOW: readonly string[] = [
  // Ending particles (same set trim uses).
  "นะค่ะ", "นะคะ", "นะจ๊ะ", "นะจ้ะ", "ครับผม", "ค่ะนะ",
  "ค่ะ", "คะ", "ครับ", "จ้ะ", "จ๊ะ", "จ้า", "น้า", "นะ", "เลย",
  // Pronouns / address.
  "พี่", "น้อง", "หนู", "เธอ", "คุณ", "เรา", "เขา", "ฉัน", "มัน", "เจน",
  // Empathy, hedging, Jane's warm voice.
  "เข้าใจ", "กังวล", "ปรึกษา", "อบอุ่น", "ฟัง", "อยู่", "ตรง", "นี้", "นี่", "ทาง",
  "แฟน", "ช่วย", "คุย", "เล่า", "ถาม", "เพิ่ม", "ได้", "ยัง", "ไม่", "ทราบ",
  "แน่", "อาจ", "น่าจะ", "คง", "เหมือน", "ประมาณ", "พร้อม", "สั้น", "ดี",
  "หน่อย", "อีก", "ไหม", "มั้ย", "มาก", "น้อย", "จริง", "โอเค",
  // Connectives / function words. ไม่ต้องกังวล is the phrase; ต้อง is not a unigram.
  "แต่", "หรือ", "และ", "ถ้า", "ก็", "เพราะ", "เช่น", "ที่", "ของ", "ใน",
  "กับ", "จาก", "เพื่อ", "แล้ว", "เมื่อ", "ว่า", "ให้", "จะ", "กว่า", "มา",
  "ไป", "ด้วย", "กัน", "มี", "เป็น", "คือ", "ถูก", "เลย", "เรื่อง",
  // Pointing at the card / chip, no-fact warm line.
  "ขอ", "กด", "ข้อมูล", "ตอบ", "คำถาม", "บัตร", "ข้อ", "ตอน", "เจน",
  // Concatenated phrases Segmenter splits.
  "ไม่ต้องกังวล", "ซักถาม", "ตรงนี้", "วันนี้", "ตอนนี้", "เรื่องนี้",
  "ขอข้อมูล", "ยังไม่ทราบ", "พี่เจน", "ได้เลย",
  // English conversational (no take/heat/wash/parent/hospital/year/one/two/…).
  "i", "i'm", "im", "am", "are", "is", "was", "be", "been", "being",
  "you", "your", "we", "they", "them", "their", "it", "it's", "its",
  "this", "that", "here", "there", "more", "just", "please",
  "can", "could", "would", "should", "will", "may", "might",
  "not", "no", "yes", "ok", "okay", "sorry", "know", "yet",
  "tell", "ask", "talk", "listen", "like", "whenever", "when", "if",
  "but", "and", "or", "so", "because", "about", "what", "how", "why",
  "where", "also", "still", "really", "very", "much", "do", "does",
  "did", "done", "have", "has", "had", "my", "me", "us", "our",
  "a", "an", "the", "to", "of", "in", "on", "for", "with", "from",
  "at", "as", "by", "too", "else", "something", "anything", "nothing",
  "jane", "answer", "info", "show", "get", "cannot", "can't", "don't",
  "doesn't", "didn't", "won't", "wouldn't", "point",
];

export const CHAT_COVERAGE_ALLOW_SET: ReadonlySet<string> = new Set(
  CHAT_COVERAGE_ALLOW.map((w) => w.normalize("NFC").toLowerCase()),
);
