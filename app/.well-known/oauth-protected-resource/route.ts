import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, protectedResourceMetadata } from "@/lib/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req), { headers: corsHeaders() });
}
