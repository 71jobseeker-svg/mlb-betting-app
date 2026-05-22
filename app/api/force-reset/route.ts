import { NextRequest, NextResponse } from "next/server";
import { forceResetAllData } from "@/lib/persistence/reset";

export const dynamic = "force-dynamic";

function htmlPage(body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DiamondEdge — Force Reset</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #060a08; color: #e8f5e9; padding: 2rem; max-width: 40rem; margin: 0 auto; }
    h1 { color: #00e676; font-size: 1.5rem; }
    pre { background: #111a14; border: 1px solid #1e3328; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; }
    a { color: #ffc107; }
    .err { color: #f87171; }
  </style>
</head>
<body>${body}</body>
</html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/**
 * Browser visit (GET):
 *   https://YOUR_SITE/api/force-reset?confirm=reset
 *
 * Also supports POST with the same query param.
 */
export async function GET(request: NextRequest) {
  return handleReset(request);
}

export async function POST(request: NextRequest) {
  return handleReset(request);
}

async function handleReset(request: NextRequest) {
  const confirm = request.nextUrl.searchParams.get("confirm");
  if (confirm !== "reset") {
    return htmlPage(
      `<h1>Force reset</h1>
       <p class="err">Missing or invalid confirm parameter.</p>
       <p>Visit this URL to wipe all Redis data and set records to 0–0:</p>
       <pre>${request.nextUrl.origin}/api/force-reset?confirm=reset</pre>`,
      400
    );
  }

  try {
    const result = await forceResetAllData();

    return htmlPage(
      `<h1>✓ Force reset complete</h1>
       <p>All DiamondEdge keys were wiped. Records are <strong>0–0</strong> until the next Pacific slate day.</p>
       <ul>
         <li>Redis connected: ${result.redisConfigured ? "yes" : "no — check KV env vars"}</li>
         <li>Keys deleted: ${result.keysDeleted.length}</li>
         <li>Record tracking resumes on: <strong>${result.recordsPausedUntil}</strong> (PT)</li>
       </ul>
       <pre>${JSON.stringify(result, null, 2)}</pre>
       <p><a href="/">← Back to app</a></p>
       <p style="color:#7a9a82;font-size:0.85rem">You can deploy once, run this URL, then remove this route before launch if you prefer.</p>`
    );
  } catch (error) {
    console.error("force-reset failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return htmlPage(
      `<h1>Reset failed</h1>
       <p class="err">${message}</p>
       <p>Check Vercel logs and that KV_REST_API_URL / KV_REST_API_TOKEN are set.</p>`,
      500
    );
  }
}
