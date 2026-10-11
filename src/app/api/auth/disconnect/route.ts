import { NextResponse } from "next/server";
import { saveStoredMLTokens } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export async function POST() {
  await saveStoredMLTokens(null);
  return NextResponse.json({ ok: true, message: "Desconectado com sucesso." });
}
