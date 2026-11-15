// Opens `url` in a new browser tab, which also closes the popup.
export function openTab(url: string) {
  void chrome.tabs.create({ url })
}
