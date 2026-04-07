import { ensureSeedData } from "@/server/penny";
import { prisma } from "@/db/prisma";

async function main() {
  await ensureSeedData();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
