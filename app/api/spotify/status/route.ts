import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const at = req.cookies.get("sp_at")?.value;
  const rt = req.cookies.get("sp_rt")?.value;
  return NextResponse.json({ connected: !!(at || rt) });
}
