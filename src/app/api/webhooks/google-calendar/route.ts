import { NextResponse } from "next/server";
import { reconcileCalendar } from "@/lib/sync";
import { regenerateSummaries } from "@/lib/summaries";
export async function POST(request: Request) { const userId = request.headers.get("x-goog-channel-token"); if (!userId) return new NextResponse(null, { status: 204 }); await reconcileCalendar(userId); await regenerateSummaries(userId); return new NextResponse(null, { status: 204 }); }