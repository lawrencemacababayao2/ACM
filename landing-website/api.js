const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// A request that failed because of throttling carries retryAfterSeconds so the
// UI can show a live countdown instead of a vague error.
export class ApiError extends Error {
  constructor(message, { status, code, retryAfterSeconds } = {}) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    // Lets the anonymous session cookie (acm_anon) round-trip so a visitor is
    // not lumped with every neighbour on the same public IP.
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const header = Number(res.headers.get("Retry-After"));
    const retryAfterSeconds =
      Number(data?.retryAfterSeconds) || Number(data?.retryAfter) ||
      (res.headers.get("Retry-After") && Number.isFinite(header) ? header : 0) || undefined;
    throw new ApiError(data?.message || data?.error || "Request failed", {
      status: res.status,
      code: data?.error,
      retryAfterSeconds,
    });
  }
  return res.json();
}

export const api = {
  carousel: () => request("/carousel"),
  sections: () => request("/landing-sections"),
  faqs: () => request("/faqs"),
  chat: (message, lang, history) => request("/chatbot", { method: "POST", body: JSON.stringify({ message, lang, history }) }),
  translate: (texts, lang) => request("/translate", { method: "POST", body: JSON.stringify({ texts, lang }) }),
  // Public-only feed: published, website-visible programs and trainings. The
  // server filters drafts/cancelled rows and strips staff-only fields, so this
  // endpoint is the only way the site reads them.
  programsTrainings: ({ type, when, page, limit } = {}) => {
    const q = new URLSearchParams();
    if (type && type !== "all") q.set("type", type);
    if (when) q.set("when", when);
    if (page) q.set("page", String(page));
    if (limit) q.set("limit", String(limit));
    const qs = q.toString();
    return request(`/public/programs-trainings${qs ? `?${qs}` : ""}`);
  },
};