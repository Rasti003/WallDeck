const incompleteEndingPattern = /(?:\b(?:o|do|na|dla|z|ze|w|we|od|pod|nad|przez|oraz|i|czy|jak|który|która|które|jaki|jaka|jakie|rasy|typu|modelu|marki|imieniu))$/iu;

export function looksLikeIncompleteVoiceTurn(transcript: string) {
  const normalized = transcript.trim().replace(/[,.!?;:…]+$/u, "").trim();
  return normalized.length > 0 && incompleteEndingPattern.test(normalized);
}
