import { redirect } from 'next/navigation';

const VALID_TABS = ['library', 'subscriptions', 'queue', 'settings'];

/** Корневой путь "/" — редирект в /library или на соответствующий путь по ?tab= (обратная совместимость). */
export default async function MainPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params?.tab;
  if (tab && VALID_TABS.includes(tab)) {
    redirect(`/${tab}`);
  }
  redirect('/library');
}
