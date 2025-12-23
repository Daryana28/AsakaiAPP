import { NextResponse } from "next/server";
import sql from "mssql";
import { getSqlPool } from "@/lib/mssql";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const remember = Boolean(body.remember);

  if (!username || !password) {
    return NextResponse.json({ message: "Username & password wajib diisi." }, { status: 400 });
  }

  try {
    const pool = await getSqlPool();

    const result = await pool
      .request()
      .input("username", sql.VarChar(50), username)
      .query(`
        SELECT TOP 1 username, password_hash, role, is_active
        FROM app_users
        WHERE username=@username
      `);

    const user = result.recordset?.[0];

    if (!user) return NextResponse.json({ message: "User tidak ditemukan." }, { status: 401 });
    if (user.is_active === false) return NextResponse.json({ message: "Akun nonaktif." }, { status: 403 });

    // sementara plaintext
    if (String(user.password_hash) !== password) {
      return NextResponse.json({ message: "Password salah." }, { status: 401 });
    }

    const role = String(user.role || "user");
    const maxAge = remember ? 60 * 60 * 24 * 7 : 60 * 60 * 8;

    const res = NextResponse.json({ ok: true, role });

    res.cookies.set("asakai_session", "ok", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    res.cookies.set("asakai_role", role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    return res;
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return NextResponse.json({ message: "Gagal login (server error)." }, { status: 500 });
  }
}
