# Skill Operating Model

## How skills stay current

Skills should not be permanently embedded in one prompt or copied manually into production. Use a versioned registry with a controlled release pipeline:

1. Store each skill as a package containing metadata, instructions, deterministic rules, schemas, examples, and tests.
2. Pin a released skill version to every audit run.
3. Keep provider adapters and skill logic separate; provider API changes should not require rewriting every skill.
4. Run scheduled update checks against approved sources and internal change proposals.
5. Stage updates as candidates, run regression/evaluation datasets, and require human review before promotion.
6. Support one-click rollback to the last approved release.
7. Record changelog, reviewer, evaluation results, and effective date.

## What an update means

Updates may include new platform fields, changed platform policies, new audit rules, improved benchmark handling, prompt fixes, or better report language. They must never silently alter historical findings; historical runs retain their original skill version.

## Evaluation requirements

Each skill needs:

- schema validation;
- fixture-based metric tests;
- missing-data and inaccessible-account cases;
- hallucination checks against evidence;
- threshold boundary tests;
- tenant isolation tests;
- regression comparison against previously approved outputs;
- human review for high-impact recommendations.

## Claude contract

Claude is the reasoning and communication layer, not the calculator or authorization layer. The request envelope should include:

- tenant/client context permitted for the run;
- source period and freshness;
- normalized evidence with IDs;
- deterministic findings and calculations;
- approved skill instructions and version;
- client fact file;
- strict JSON output schema.

The response must contain finding IDs/evidence references, confidence, assumptions, recommended next step, and an explicit `no_recommendation` state when evidence is insufficient.

## Initial skill release sequence

1. Account health and ingestion quality.
2. Performance audit.
3. Creative fatigue.
4. Budget optimizer.
5. Report builder.
6. Ads plan.
7. Competitive research.
8. Copy generation.

Copy generation and any upload preparation stay downstream of account evidence and brand facts. Uploading is not part of the first release.
