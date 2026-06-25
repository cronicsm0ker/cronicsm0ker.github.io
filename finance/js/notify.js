// notify.js — local notifications via the Notifications API + service worker.
//
// What's real here: web push/local notifications work in installed PWAs on
// Android and (since iOS 16.4) on iOS for home-screen-installed web apps.
//
// Apple Wallet: there is NO public API that lets any app (web or native) read
// your Apple Pay / Wallet transactions in the background. Wallet is a closed
// system. The realistic ways to detect a Wallet/Apple Pay charge are:
//   (a) the bank/issuer push or email that follows the charge (we parse those), or
//   (b) Apple Card holders exporting statements.
// So "notify me when a debt is made via Apple Wallet" is implemented as:
// detect the issuer's charge message → raise a local notification. We simulate
// that pipeline with the `simulateWalletCharge` helper.

export const Notify = {
  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  },

  async show(title, body, tag = 'pft') {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.info('[notify:fallback]', title, body);
      return false;
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
      } else {
        new Notification(title, { body, tag });
      }
      return true;
    } catch (e) {
      console.warn('notify failed', e);
      return false;
    }
  },
};

// Emulates the issuer-message → charge-detected → notify flow described above.
export function simulateWalletCharge() {
  const merchants = ['Starbucks', 'Uber', 'Steam', 'App Store', 'Amazon', 'Local Cafe'];
  const m = merchants[Math.floor(Math.random() * merchants.length)];
  const amount = Number((Math.random() * 40 + 3).toFixed(2));
  return { merchant: m, amount, source: 'wallet' };
}
