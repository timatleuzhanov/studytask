import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@studytask.local";
  const password = await bcrypt.hash("adminadmin", 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Администратор",
      passwordHash: password,
      role: Role.ADMIN,
    },
    update: {},
  });
  console.log("Seed: admin user", email, "/ adminadmin");

  const teacherEmail = "teacher@studytask.local";
  const teacherHash = await bcrypt.hash("teacherteacher", 10);
  await prisma.user.upsert({
    where: { email: teacherEmail },
    create: {
      email: teacherEmail,
      name: "Преподаватель (демо)",
      passwordHash: teacherHash,
      role: Role.TEACHER,
    },
    update: {},
  });
  console.log("Seed: teacher user", teacherEmail, "/ teacherteacher");

  const timaAdminEmail = "timaadmin@gmail.com";
  const timaAdminHash = await bcrypt.hash("admin2010", 10);
  await prisma.user.upsert({
    where: { email: timaAdminEmail },
    create: {
      email: timaAdminEmail,
      name: "Тестовый админ",
      passwordHash: timaAdminHash,
      role: Role.ADMIN,
    },
    update: {
      passwordHash: timaAdminHash,
      role: Role.ADMIN,
    },
  });
  console.log("Seed: admin user", timaAdminEmail, "/ admin2010");

  const teacherGmail = "teacher@gmail.com";
  const teacherGmailHash = await bcrypt.hash("teacher2010", 10);
  await prisma.user.upsert({
    where: { email: teacherGmail },
    create: {
      email: teacherGmail,
      name: "Тестовый преподаватель",
      passwordHash: teacherGmailHash,
      role: Role.TEACHER,
    },
    update: {
      passwordHash: teacherGmailHash,
      role: Role.TEACHER,
    },
  });
  console.log("Seed: teacher user", teacherGmail, "/ teacher2010");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
