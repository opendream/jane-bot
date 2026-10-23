# Third-party notices (summary; full texts ship with each project)

- **Qwen3-1.7B / Qwen3-4B** model weights, © Alibaba Cloud (Qwen team): Apache-2.0. Downloaded at run time, not included in this zip.
  MLC builds (mlc-ai on Hugging Face) and the GGUF conversion (unsloth) are derived from the Apache-2.0 base. Their model cards carry no separate licence metadata.
- **WebLLM** (@mlc-ai/web-llm 0.2.86) © MLC-AI: Apache-2.0. Bundled in `dist/assets`. WebGPU model libraries from github.com/mlc-ai/binary-mlc-llm-libs, downloaded at run time. That repo declares **no licence** on GitHub (checked 22 Oct 2026); they are compiled outputs of Apache-2.0 MLC/TVM. Clear this before any public release.
- **wllama** (@wllama/wllama 3.8.1) © ngxson: MIT. Bundled in `dist/assets` (includes llama.cpp, © ggml authors, MIT).
- **Typhoon** models are *not* used (OpenTyphoon terms pending review).
- **Answer-bank text** (cards compiled into `dist/assets`): CC BY-SA 4.0, attribution Opendream. Full legal code in `bank/LICENSE`; coverage and attribution in `bank/NOTICE`. Quiz content is adapted from 'Judies, Opendream 2017' (Opendream owns Judies and relicenses its quiz content under CC BY-SA 4.0). The application code remains Apache-2.0 (`LICENSE` at the zip root).
