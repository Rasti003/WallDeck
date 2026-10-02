export function delegatedCommandWithContext(transcript: string) {
  const recent = transcript.trim().slice(-1_800);
  return `To zapis kolejnych wypowiedzi użytkownika w bieżącej rozmowie. Wykonaj polecenie, które GPT-Live właśnie przekazał do narzędzi, z uwzględnieniem wcześniejszych poprawek i kontekstu:\n${recent}`;
}
