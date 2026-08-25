/**
 * Seeds the top-level category list shown in the browse-page filter
 * dropdown. Upserts on `slug`, so re-running is safe — existing categories
 * (e.g. `u-joints`/`steering-joints` from the GMB ingest) are untouched,
 * and running this twice does not create duplicates.
 */
import { prisma, disconnect } from '../lib/prisma.js';

const CATEGORIES = [
  { name: 'Engine Parts', slug: 'engine-parts' },
  { name: 'Suspension Parts', slug: 'suspension-parts' },
  { name: 'Gearbox Parts', slug: 'gearbox-parts' },
  { name: 'Electrical Parts', slug: 'electrical-parts' },
  { name: 'Lights & Mirrors', slug: 'lights-mirrors' },
  { name: 'Shock Absorbers', slug: 'shock-absorbers' },
  { name: 'Brake Parts', slug: 'brake-parts' },
  { name: 'Body Parts', slug: 'body-parts' },
];

async function main() {
  for (const category of CATEGORIES) {
    const result = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
    console.log(`${result.name} (${result.slug})`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
