/**
 * Seed 200 test skills for export API testing.
 *
 * Usage:
 *   cd clawhub
 *   bunx convex run --no-push devSeedExport:seedExportSkills
 *   bunx convex run --no-push statsMaintenance:updateGlobalStatsInternal
 *
 * Reset and re-seed:
 *   bunx convex run --no-push devSeedExport:seedExportSkills '{"reset": true}'
 *   bunx convex run --no-push statsMaintenance:updateGlobalStatsInternal
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./functions";

const TOTAL_SKILLS = 200;
const BATCH_SIZE = 20;

function makeSkillMd(index: number, slug: string, displayName: string, summary: string): string {
  return `---
name: ${slug}
description: ${summary}
---

# ${displayName}

${summary}

## Usage

\`\`\`bash
claw install ${slug}
\`\`\`

## Features

- Feature A for skill ${index}
- Feature B for skill ${index}
- Auto-generated for export API testing

## Configuration

No configuration required. Just install and use.
`;
}

function generateSkillSpecs() {
  const categories = [
    { prefix: "export-devops", name: "DevOps", summaries: ["container orchestration", "CI/CD pipeline automation", "infrastructure provisioning", "log aggregation", "service mesh management"] },
    { prefix: "export-web", name: "Web Dev", summaries: ["frontend bundling", "API gateway routing", "SSR optimization", "CSS preprocessing", "WebSocket management"] },
    { prefix: "export-data", name: "Data", summaries: ["ETL pipeline", "data validation", "schema migration", "query optimization", "cache invalidation"] },
    { prefix: "export-ml", name: "ML", summaries: ["model training", "feature engineering", "hyperparameter tuning", "model serving", "dataset versioning"] },
    { prefix: "export-security", name: "Security", summaries: ["vulnerability scanning", "secrets rotation", "access control", "audit logging", "encryption management"] },
    { prefix: "export-mobile", name: "Mobile", summaries: ["app bundling", "push notifications", "deep linking", "offline storage", "crash reporting"] },
    { prefix: "export-cloud", name: "Cloud", summaries: ["multi-region deployment", "cost optimization", "auto-scaling", "disaster recovery", "resource tagging"] },
    { prefix: "export-testing", name: "Testing", summaries: ["E2E test runner", "load testing", "mutation testing", "visual regression", "API contract testing"] },
  ];

  const specs: Array<{ index: number; slug: string; displayName: string; summary: string }> = [];
  for (let i = 0; i < TOTAL_SKILLS; i++) {
    const cat = categories[i % categories.length];
    const summaryIndex = Math.floor(i / categories.length) % cat.summaries.length;
    const variant = Math.floor(i / (categories.length * cat.summaries.length)) + 1;
    const slug = `${cat.prefix}-${String(i + 1).padStart(3, "0")}`;
    const displayName = `${cat.name} Tool ${i + 1}`;
    const summary = `${cat.summaries[summaryIndex]} helper (v${variant}) for ${cat.name.toLowerCase()} workflows.`;
    specs.push({ index: i + 1, slug, displayName, summary });
  }
  return specs;
}

export const seedExportSkills = internalAction({
  args: {
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const specs = generateSkillSpecs();
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let batchStart = 0; batchStart < specs.length; batchStart += BATCH_SIZE) {
      const batch = specs.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(specs.length / BATCH_SIZE);

      for (const spec of batch) {
        try {
          const skillMd = makeSkillMd(spec.index, spec.slug, spec.displayName, spec.summary);

          const storageId = await ctx.storage.store(
            new Blob([skillMd], { type: "text/markdown" }),
          );

          const result = (await ctx.runMutation(internal.devSeed.seedSkillMutation, {
            reset: args.reset,
            storageId,
            metadata: {},
            frontmatter: { name: spec.slug, description: spec.summary },
            clawdis: null,
            skillMd,
            slug: spec.slug,
            displayName: spec.displayName,
            summary: spec.summary,
            version: "1.0.0",
          })) as { ok: boolean; skipped?: boolean; skillId?: string };

          if (result.skipped) {
            skipped++;
          } else {
            created++;
          }
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to seed ${spec.slug}: ${msg}`);
        }
      }

      console.log(
        `Batch ${batchNum}/${totalBatches}: created=${created}, skipped=${skipped}, failed=${failed}`,
      );
    }

    console.log(
      `\nSeed complete: ${created} created, ${skipped} skipped, ${failed} failed (total=${specs.length})`,
    );
    return { ok: true, total: specs.length, created, skipped, failed };
  },
});
