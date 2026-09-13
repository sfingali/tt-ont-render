export function wrapFlowText(text: string, max = 30): string[] {
  const lines: string[] = [];
  let line = "";
  const width = (value: string) =>
    Array.from(value).reduce(
      (sum, char) =>
        sum +
        (/\s/.test(char)
          ? 0.34
          : /[MW@]/.test(char)
            ? 0.94
            : /[ilI.,'!:;]/.test(char)
              ? 0.3
              : char.codePointAt(0)! > 0x2e80
                ? 1
                : /[A-Z]/.test(char)
                  ? 0.67
                  : 0.56),
      0,
    );
  for (const word of text.split(/\s+/)) {
    if (line && width(line + " " + word) > max * 0.5) {
      lines.push(line);
      line = "";
    }
    for (const char of Array.from((line ? " " : "") + word)) {
      if (line && width(line + char) > max * 0.5) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
