export interface ChatSession {
  lastBotMessage?: string;
  awaitingUpload?: boolean;
}

const TTL = 600;

function key(chatId: number | string): string {
  return `session:chat:${chatId}`;
}

export async function getSession(kv: KVNamespace, chatId: number): Promise<ChatSession> {
  const raw = await kv.get(key(chatId));
  if (!raw) return {};
  try { return JSON.parse(raw) as ChatSession; } catch { return {}; }
}

export async function setSession(kv: KVNamespace, chatId: number, s: ChatSession): Promise<void> {
  await kv.put(key(chatId), JSON.stringify(s), { expirationTtl: TTL });
}

export async function updateSession(kv: KVNamespace, chatId: number, u: Partial<ChatSession>): Promise<void> {
  const cur = await getSession(kv, chatId);
  await setSession(kv, chatId, { ...cur, ...u });
}

export async function clearSession(kv: KVNamespace, chatId: number): Promise<void> {
  await kv.delete(key(chatId));
}
