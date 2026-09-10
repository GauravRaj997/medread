import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function main() {
  const salt = crypto.randomBytes(16).toString("hex");
  const demoPassword = "MedRead@Demo123"; // change after first login
  const passwordHash = `${salt}:${hashPassword(demoPassword, salt)}`;

  const admin = await prisma.user.upsert({
    where: { email: "admin@medread.local" },
    update: {},
    create: {
      email: "admin@medread.local",
      emailVerified: true,
      passwordHash,
      role: "ADMIN",
      // Super-admin: has every permission, including the ability to grant/revoke
      // permissions for other admins. Everyone else starts with an empty array.
      permissions: [
        "MANAGE_USERS",
        "VIEW_USERS",
        "VIEW_FLAGGED_UPLOADS",
        "REVIEW_FLAGGED_UPLOADS",
        "VIEW_ANALYTICS",
        "MANAGE_SETTINGS",
        "VIEW_AUDIT_LOGS",
        "MANAGE_ADMIN_PERMISSIONS",
      ],
    },
  });

  console.log("\nSeed complete.\n");
  console.log("Demo admin login:");
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Password: ${demoPassword}`);
  console.log("\n(This account has role: ADMIN — it can access /admin/* routes)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });