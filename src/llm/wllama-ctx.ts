/** wllama n_ctx. Chat-first (the default) needs ~2048; ?chatFirst=0 stays 1024. */
export const WLLAMA_N_CTX = 1024;
export const WLLAMA_N_CTX_CHAT_FIRST = 2048;

export function wllamaContextLength(chatFirst: boolean): number {
  return chatFirst ? WLLAMA_N_CTX_CHAT_FIRST : WLLAMA_N_CTX;
}
