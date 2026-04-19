import { prisma } from "@/db/prisma";
import { seedDevelopmentDatabase } from "@/db/seed";

seedDevelopmentDatabase()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
