/** Якоря совпадают с id разделов в public/help/index.html */
export type HelpDocSection =
  | 'introduction'
  | 'auth'
  | 'interface'
  | 'library'
  | 'download'
  | 'subscriptions'
  | 'queue'
  | 'player'
  | 'profile'
  | 'sharing'
  | 'cleanup'
  | 'shortcuts';

export const HELP_DOC_BASE = '/help';

export function helpDocHref(section?: HelpDocSection): string {
  if (!section) return HELP_DOC_BASE;
  return `${HELP_DOC_BASE}#${section}`;
}
