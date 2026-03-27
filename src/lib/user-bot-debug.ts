export type LastUserBotUpdate = {
  receivedAt: string;
  chatId: number | null;
  text: string | null;
  update: unknown;
};

export let lastUserBotUpdate: LastUserBotUpdate | null = null;

export function setLastUserBotUpdate(payload: Omit<LastUserBotUpdate, 'receivedAt'>) {
  lastUserBotUpdate = {
    receivedAt: new Date().toISOString(),
    ...payload,
  };
}

