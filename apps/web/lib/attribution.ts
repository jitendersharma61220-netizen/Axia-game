/**
 * First-touch attribution for the closed beta: which invite code, campaign or
 * friend's challenge link brought a visitor in. Stored locally until sign-up.
 */
export interface Attribution {
  inviteCode?: string;
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const KEY = 'axia_attribution';

export function readAttribution(): Attribution {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Attribution;
  } catch {
    return {};
  }
}

function write(a: Attribution) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Private mode / storage disabled: attribution is best-effort.
  }
}

/** UTM tags keep the first value seen; a newer invite code or challenge link replaces the old one. */
export function captureFromUrl(params: URLSearchParams) {
  const current = readAttribution();
  const next: Attribution = { ...current };
  const invite = params.get('invite');
  if (invite) next.inviteCode = invite.trim().toUpperCase();
  if (!current.utmSource && params.get('utm_source')) {
    next.utmSource = params.get('utm_source')!;
    next.utmMedium = params.get('utm_medium') ?? undefined;
    next.utmCampaign = params.get('utm_campaign') ?? undefined;
  }
  write(next);
}

export function rememberChallengeRef(sessionId: string) {
  write({ ...readAttribution(), ref: sessionId });
}

export function setInviteCode(code: string) {
  write({ ...readAttribution(), inviteCode: code.trim().toUpperCase() || undefined });
}
