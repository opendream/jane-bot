/** wllama n_ctx. Chat-first needs ~2048; production card-first stays 1024. */
export const WLLAMA_N_CTX = 1024;
export const WLLAMA_N_CTX_CHAT_FIRST = 2048;

export function wllamaContextLength(chatFirst: boolean): number {
  return chatFirst ? WLLAMA_N_CTX_CHAT_FIRST : WLLAMA_N_CTX;
}
