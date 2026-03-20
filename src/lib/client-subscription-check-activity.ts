/**
 * Счётчик параллельных проверок подписок (все каналы, одна подписка, по категории).
 * Шлёт `global-subscription-check-count` с `detail.count` — для бейджа в app-shell.
 */

let subscriptionCheckActivityRef = 0;

function emit(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('global-subscription-check-count', {
      detail: { count: subscriptionCheckActivityRef },
    })
  );
}

export function beginSubscriptionCheckActivity(): void {
  subscriptionCheckActivityRef += 1;
  emit();
}

export function endSubscriptionCheckActivity(): void {
  subscriptionCheckActivityRef = Math.max(0, subscriptionCheckActivityRef - 1);
  emit();
}
