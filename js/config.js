export const REQUIRED_PARAMS = ['board_id'];

export function generateId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${Array.from(random, (value) => value.toString(36)).join('')}`;
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
