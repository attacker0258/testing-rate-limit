import { RateLimiterMemory } from "rate-limiter-flexible";
import { cookies } from "next/headers";

// Per-IP limiter (stricter, to prevent mass abuse)
const ipLimiter = new RateLimiterMemory({
  points: 6,   // 6 requests
  duration: 24 * 60 * 60, // per day per IP
});

// Per-anonId limiter (fairness per device/browser)
const guestLimiter = new RateLimiterMemory({
  points: 2,   // 6 requests
  duration: 24 * 60 * 60, // per day per guestId
});

export async function GET(req) {
  const cookieStore = cookies();

  // --- Get IP ---
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  // --- Get/Create guestId ---
  let guestId = cookieStore.get("guest_id")?.value;
  let setNewCookie = false;

  if (!guestId) {
    guestId = crypto.randomUUID();
    setNewCookie = true;
  }

  try {
    // Apply both limiters
    await guestLimiter.consume(guestId, 1);  // 1 points per request
    await ipLimiter.consume(ip, 1);        // 1 point per request

    // --- Success ---
    const res = Response.json({ message: "hi" });

    // If new guestId, set cookie
    if (setNewCookie) {
      res.headers.append(
        "Set-Cookie",
        `guest_id=${guestId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000` // 1 year
      );
    }

    return res;

  } catch (rej) {
    // --- Blocked ---
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": Math.ceil(rej.msBeforeNext / 1000), // hint for client
      },
    });
  }
}
