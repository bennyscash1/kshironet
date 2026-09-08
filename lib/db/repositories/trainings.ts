import { execute, query, queryOne, withTransaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { Training, TrainingSession, TrainingWithCounts } from "@/lib/types";

export interface TrainingFilters {
  domain?: string;
  from?: string;
  to?: string;
}

export interface TrainingInput {
  name: string;
  domain?: string | null;
  start_date: string;
  end_date?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  color_hex?: string | null;
}

export interface TrainingSessionInput {
  battalion_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  instructor_name?: string | null;
  instructor_phone?: string | null;
  notes?: string | null;
}

export async function listTrainings(filters: TrainingFilters = {}): Promise<TrainingWithCounts[]> {
  let sql = `
    SELECT t.*,
      (SELECT COUNT(*)::int FROM training_sessions s WHERE s.training_id = t.id) AS session_count,
      (SELECT COUNT(DISTINCT s.battalion_id)::int FROM training_sessions s WHERE s.training_id = t.id) AS unit_count
    FROM trainings t`;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.domain) {
    conditions.push(`t.domain = $${params.length + 1}`);
    params.push(filters.domain);
  }
  if (filters.from) {
    conditions.push(`(t.end_date >= $${params.length + 1} OR (t.end_date IS NULL AND t.start_date >= $${params.length + 2}))`);
    params.push(filters.from, filters.from);
  }
  if (filters.to) {
    conditions.push(`t.start_date <= $${params.length + 1}`);
    params.push(filters.to);
  }

  if (conditions.length) {
    sql += ` WHERE ` + conditions.join(" AND ");
  }
  sql += ` ORDER BY t.start_date ASC`;

  return query<TrainingWithCounts>(sql, params);
}

export async function getTrainingById(id: number): Promise<Training | undefined> {
  return queryOne<Training>("SELECT * FROM trainings WHERE id = $1", [id]);
}

export async function listSessionsForTraining(trainingId: number): Promise<TrainingSession[]> {
  return query<TrainingSession>(
    "SELECT * FROM training_sessions WHERE training_id = $1 ORDER BY session_date ASC, start_time ASC",
    [trainingId]
  );
}

export interface TrainingBattalionRef {
  code: string;
  name: string;
  color_hex: string;
}

/** Distinct battalions a training reaches through its per-unit sessions — used to
 * label and filter the training on the calendar, mirroring getCertificationBattalions. */
export async function getTrainingBattalions(trainingId: number): Promise<TrainingBattalionRef[]> {
  return query<TrainingBattalionRef>(
    `SELECT DISTINCT b.code, b.name, b.color_hex FROM battalions b
       WHERE b.id IN (SELECT battalion_id FROM training_sessions WHERE training_id = $1)
       ORDER BY b.code`,
    [trainingId]
  );
}

export async function createTraining(
  input: TrainingInput,
  sessions: TrainingSessionInput[] = []
): Promise<number> {
  return withTransaction(async (client) => {
    const result = await execute(
      `INSERT INTO trainings
          (name, domain, start_date, end_date, contact_name, contact_phone, notes, color_hex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
      [
        input.name,
        input.domain ?? null,
        input.start_date,
        input.end_date || null,
        input.contact_name ?? null,
        input.contact_phone ?? null,
        input.notes ?? null,
        input.color_hex ?? null,
      ],
      client
    );
    const id = (result.rows[0] as { id: number }).id;
    for (const s of sessions) {
      await insertSession(id, s, client);
    }
    return id;
  });
}

export async function updateTraining(id: number, input: Partial<TrainingInput>) {
  const existing = await queryOne<Training>("SELECT * FROM trainings WHERE id = $1", [id]);
  if (!existing) throw new Error("Training not found");

  await execute(
    `UPDATE trainings SET
      name = $1, domain = $2, start_date = $3, end_date = $4,
      contact_name = $5, contact_phone = $6, notes = $7, color_hex = $8, updated_at = NOW()
     WHERE id = $9`,
    [
      input.name ?? existing.name,
      input.domain !== undefined ? input.domain : existing.domain,
      input.start_date ?? existing.start_date,
      input.end_date !== undefined ? input.end_date || null : existing.end_date,
      input.contact_name !== undefined ? input.contact_name : existing.contact_name,
      input.contact_phone !== undefined ? input.contact_phone : existing.contact_phone,
      input.notes !== undefined ? input.notes : existing.notes,
      input.color_hex !== undefined ? input.color_hex : existing.color_hex,
      id,
    ]
  );
}

export async function deleteTraining(id: number) {
  await execute("DELETE FROM trainings WHERE id = $1", [id]);
}

async function insertSession(
  trainingId: number,
  s: TrainingSessionInput,
  client?: PoolClient
) {
  await execute(
    `INSERT INTO training_sessions
        (training_id, battalion_id, session_date, start_time, end_time, location, instructor_name, instructor_phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      trainingId,
      s.battalion_id,
      s.session_date,
      s.start_time,
      s.end_time,
      s.location ?? null,
      s.instructor_name ?? null,
      s.instructor_phone ?? null,
      s.notes ?? null,
    ],
    client
  );
}

export async function replaceTrainingSessions(
  trainingId: number,
  sessions: TrainingSessionInput[]
) {
  await withTransaction(async (client) => {
    await execute("DELETE FROM training_sessions WHERE training_id = $1", [trainingId], client);
    for (const s of sessions) {
      await insertSession(trainingId, s, client);
    }
  });
}

export async function addSession(trainingId: number, input: TrainingSessionInput): Promise<void> {
  await insertSession(trainingId, input);
}

export async function updateSession(sessionId: number, input: Partial<TrainingSessionInput>) {
  const existing = await queryOne<TrainingSession>(
    "SELECT * FROM training_sessions WHERE id = $1",
    [sessionId]
  );
  if (!existing) throw new Error("Training session not found");

  await execute(
    `UPDATE training_sessions SET
      battalion_id = $1, session_date = $2, start_time = $3, end_time = $4,
      location = $5, instructor_name = $6, instructor_phone = $7, notes = $8, updated_at = NOW()
     WHERE id = $9`,
    [
      input.battalion_id ?? existing.battalion_id,
      input.session_date ?? existing.session_date,
      input.start_time ?? existing.start_time,
      input.end_time ?? existing.end_time,
      input.location !== undefined ? input.location : existing.location,
      input.instructor_name !== undefined ? input.instructor_name : existing.instructor_name,
      input.instructor_phone !== undefined ? input.instructor_phone : existing.instructor_phone,
      input.notes !== undefined ? input.notes : existing.notes,
      sessionId,
    ]
  );
}

export async function deleteSession(sessionId: number) {
  await execute("DELETE FROM training_sessions WHERE id = $1", [sessionId]);
}
