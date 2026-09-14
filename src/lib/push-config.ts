// Push configuration, read once per call from the environment. Pure: tests
// pass an env object. A missing value turns the whole feature off rather than
// throwing, so a deploy without keys behaves exactly like one before push.

type Env = Record<string, string | undefined>;

export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function value(env: Env, key: string): string | null {
  const raw = env[key]?.trim();
  return raw ? raw : null;
}

export function readPushConfig(env: Env = process.env): PushConfig | null {
  const publicKey = value(env, "NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = value(env, "VAPID_PRIVATE_KEY");
  const subject = value(env, "VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  // Push services reject a subject that is not a contact URL.
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { publicKey, privateKey, subject };
}

export function readCronSecret(env: Env = process.env): string | null {
  const secret = value(env, "CRON_SECRET");
  return secret && secret.length >= 16 ? secret : null;
}
