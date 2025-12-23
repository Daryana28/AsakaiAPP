import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  res.cookies.set("asakai_session", "", base);
  res.cookies.set("asakai_role", "", base);

  return res;
}
