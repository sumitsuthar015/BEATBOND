export const getSpeechRecognitionConstructor = <T,>(scope: Record<string, unknown>) => {
  const constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
  return typeof constructor === "function" ? constructor as new () => T : undefined;
};
