import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// Protects /admin/* routes with BOTH a role check and a per-route permission check.
// Protects user-only routes (dashboard, upload) — requires any valid session.

type Permission =
  | "MANAGE_USERS"
  | "VIEW_USERS"
  | "VIEW_FLAGGED_UPLOADS"
  | "REVIEW_FLAGGED_UPLOADS"
  | "VIEW_ANALYTICS"
  | "MANAGE_SETTINGS"
  | "VIEW_AUDIT_LOGS"
  | "MANAGE_ADMIN_PERMISSIONS";

interface SessionPayload {
  userId: string;
  role: "USER" | "ADMIN";
  permissions?: Permission[];
}

const USER_PROTECTED_PREFIXES = ["/dashboard", "/upload", "/prescription"];

// Maps each admin sub-route to the permission it requires.
// Add new admin pages here as they're built — nothing is accessible by
// default just because someone has role: ADMIN.
const ADMIN_ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/admin/users", permission: "VIEW_USERS" },
  { prefix: "/admin/flagged-uploads", permission: "VIEW_FLAGGED_UPLOADS" },
  { prefix: "/admin/analytics", permission: "VIEW_ANALYTICS" },
  { prefix: "/admin/settings", permission: "MANAGE_SETTINGS" },
  { prefix: "/admin/audit-logs", permission: "VIEW_AUDIT_LOGS" },
  { prefix: "/admin/permissions", permission: "MANAGE_ADMIN_PERMISSIONS" },
];

function getRequiredPermission(pathname: string): Permission | null {
  const match = ADMIN_ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
  return match ? match.permission : null;
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get("access_token")?.value;
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isUserProtected = USER_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isAdminRoute && !isUserProtected) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as SessionPayload;
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAdminRoute) {
    // Step 1: must be an admin at all
    if (payload.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Step 2: the /admin overview page itself needs no specific permission —
    // any admin can see the landing page. Sub-pages each require their own permission.
    const requiredPermission = getRequiredPermission(pathname);
    const userPermissions = payload.permissions ?? [];

    if (requiredPermission && !userPermissions.includes(requiredPermission)) {
      // Logged in, is an admin, but lacks this specific permission —
      // send them to the admin home instead of the login page.
      return NextResponse.redirect(new URL("/admin?denied=" + requiredPermission, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/upload/:path*", "/prescription/:path*"],
};