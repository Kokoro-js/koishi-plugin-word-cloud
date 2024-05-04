export function removeLinks(text: string): string {
  // 使用正则表达式匹配 URL
  const urlRegex =
    /(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?/;

  // 循环匹配并替换所有链接
  let cleanedText = text;
  let match;
  while ((match = urlRegex.exec(cleanedText)) !== null) {
    cleanedText = cleanedText.replace(match[0], "");
  }

  return cleanedText;
}
