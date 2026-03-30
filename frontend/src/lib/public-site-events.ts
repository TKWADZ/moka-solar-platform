export type PublicChatTab = 'contact' | 'ai';

export function openPublicChat(tab: PublicChatTab = 'contact', presetMessage?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('moka-public-chat:open', {
      detail: {
        tab,
        presetMessage,
      },
    }),
  );
}
