import { NextRequest, NextResponse } from "next/server";
import { resetAllLaunchData } from "@/lib/persistence/reset";

export const dynamic = "force-dynamic";

/**
 * One-time launch reset. Set RESET_LAUNCH_SECRET in Vercel, then:
 *   curl -X POST "https://YOUR_SITE/api/reset-launch?secret=YOUR_SECRET"
 * Remove RESET_LAUNCH_SECRET after use.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.RESET_LAUNCH_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "RESET_LAUNCH_SECRET is not configured" },
      { status: 403 }
    );
  }

  const provided =
    request.headers.get("x-reset-secret")?.trim() ??
    request.nextUrl.searchParams.get("secret")?.trim();

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await resetAllLaunchData();

  return NextResponse.json({
    ok: true,
    message: "Best Bets & AI Picks records reset to 0–0",
    ...result,
  });
}
