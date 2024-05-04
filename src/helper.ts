const URL_REGEX =
  /(?:(?:(?:https?|ftp):)?\/\/)?(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?)(?::\d{2,5})?(?:[/?#]\S*)?/gi;

export function removeLinks(text: string): string {
  // 循环匹配并替换所有链接
  let cleanedText = text;
  let match;
  while ((match = URL_REGEX.exec(cleanedText)) !== null) {
    cleanedText = cleanedText.replace(match[0], "");
  }

  return cleanedText;
}
