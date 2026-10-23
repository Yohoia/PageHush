import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Type, type Static } from 'typebox';
import { Check } from 'typebox/value';
import { articleResponseSchema } from '@pagehush/shared';
import type { Database } from '../db/client.js';
import { articleOperations } from '../db/schema.js';
import { CliArticleError } from './errors.js';

// PageHush currently has one author. Operation ownership survives device token rotation.
export const AUTHOR_OPERATION_SCOPE = 'pagehush:author';
export const OPERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const cliArticleSchema = Type.Object({
  ...articleResponseSchema.properties,
  publishedAt: Type.Union([Type.String(), Type.Null()]),
});
const outcomeSchema = Type.Object({
  requestId: Type.String(),
  status: Type.Literal('succeeded'),
  result: Type.Object({ article: cliArticleSchema, changed: Type.Boolean() }),
});
const failedOutcomeSchema = Type.Object({
  requestId: Type.String(),
  status: Type.Literal('failed'),
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});
const storedOutcomeSchema = Type.Union([outcomeSchema, failedOutcomeSchema]);
type Outcome = Static<typeof outcomeSchema>;
type FailedOutcome = Static<typeof failedOutcomeSchema>;
type OperationResult = Outcome['result'];
export type OperationKind = 'create' | 'publish' | 'delete';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  return value;
}

export function fingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

export async function reserveOperation(
  db: Database,
  id: string,
  ownerId: string,
  kind: OperationKind,
  hash: string | null,
) {
  await db
    .insert(articleOperations)
    .values({
      id,
      ownerId,
      kind,
      fingerprint: hash,
      expiresAt: new Date(Date.now() + OPERATION_RETENTION_MS),
    })
    .onConflictDoNothing();
}

export function validateOperation(
  row: typeof articleOperations.$inferSelect,
  ownerId: string,
  kind: OperationKind,
  hash: string | null,
) {
  if (row.ownerId !== ownerId) throw new CliArticleError(404, 'operation_unknown');
  if (row.kind !== kind || (hash !== null && row.fingerprint !== null && row.fingerprint !== hash))
    throw new CliArticleError(409, 'request_conflict');
  if (row.expiresAt.getTime() <= Date.now()) throw new CliArticleError(410, 'operation_expired');
}

export async function writeOperation(
  db: Database,
  input: { id: string; ownerId: string; kind: OperationKind; hash: string },
  perform: (tx: Database) => Promise<OperationResult>,
): Promise<Outcome> {
  await reserveOperation(db, input.id, input.ownerId, input.kind, input.hash);
  await db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(articleOperations)
      .where(eq(articleOperations.id, input.id))
      .for('update');
    validateOperation(operation, input.ownerId, input.kind, input.hash);
    if (operation.fingerprint === null)
      await tx
        .update(articleOperations)
        .set({ fingerprint: input.hash })
        .where(eq(articleOperations.id, input.id));
  });
  const completed = await db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(articleOperations)
      .where(eq(articleOperations.id, input.id))
      .for('update');
    validateOperation(operation, input.ownerId, input.kind, input.hash);
    if (operation.result !== null) return outcomeFromStored(input.id, operation.result);
    await tx
      .update(articleOperations)
      .set({ fingerprint: input.hash })
      .where(eq(articleOperations.id, input.id));
    try {
      const result = await tx.transaction(async (savepoint) => perform(savepoint));
      const outcome: Outcome = { requestId: input.id, status: 'succeeded', result };
      await tx
        .update(articleOperations)
        .set({ result: outcome })
        .where(eq(articleOperations.id, input.id));
      return outcome;
    } catch (error) {
      if (!(error instanceof CliArticleError)) throw error;
      const failed: FailedOutcome = {
        requestId: input.id,
        status: 'failed',
        error: { code: error.code, message: error.code },
      };
      await tx
        .update(articleOperations)
        .set({ result: failed })
        .where(eq(articleOperations.id, input.id));
      return failed;
    }
  });
  if (completed.status === 'failed')
    throw new CliArticleError(
      completed.error.code === 'revision_conflict'
        ? 409
        : completed.error.code === 'article_not_found'
          ? 404
          : 400,
      completed.error.code,
    );
  return completed;
}

export function outcomeFromStored(id: string, value: unknown): Outcome | FailedOutcome {
  if (!Check(storedOutcomeSchema, value))
    throw new CliArticleError(500, 'operation_result_invalid');
  return { ...value, requestId: id };
}
