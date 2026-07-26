export const REQUIRED_PARAMS = ['board_id'];

export function generateId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${Array.from(random, (value) => value.toString(36)).join('')}`;
}

export function generateBoardId() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000;
  const digits = String(random).padStart(9, '0');
  return `b${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function buildConfigFromParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const missing = REQUIRED_PARAMS.filter((key) => !params.get(key));

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    config: {
      boardId: params.get('board_id'),
      studentKey: params.get('student_key'),
    },
  };
}

export function buildBoardUrl(values, baseUrl = new URL('./board.html', window.location.href)) {
  const url = new URL(baseUrl);
  url.search = '';

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
