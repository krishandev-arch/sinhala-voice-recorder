import { eq, desc, asc, like, and, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, phonemes, recordings, batchSubmissions, Phoneme, Recording } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all phonemes with optional filtering and sorting
 */
export async function getAllPhonemes(options?: {
  category?: string;
  search?: string;
  sortBy?: 'id' | 'category';
  sortOrder?: 'asc' | 'desc';
}): Promise<Phoneme[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [];
  if (options?.category) {
    conditions.push(eq(phonemes.category, options.category));
  }
  if (options?.search) {
    conditions.push(like(phonemes.script, `%${options.search}%`));
  }

  let baseQuery = db.select().from(phonemes);

  // Apply where clause if there are conditions
  const withWhere = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

  // Apply ordering
  if (options?.sortBy === 'category') {
    return await withWhere.orderBy(options.sortOrder === 'desc' ? desc(phonemes.category) : asc(phonemes.category));
  } else {
    return await withWhere.orderBy(asc(phonemes.sortOrder), asc(phonemes.id));
  }
}

/**
 * Get a single phoneme by ID
 */
export async function getPhonemeById(id: number): Promise<Phoneme | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(phonemes).where(eq(phonemes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all recordings for a user
 */
export async function getUserRecordings(userId: number): Promise<Recording[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(recordings)
    .where(eq(recordings.userId, userId))
    .orderBy(desc(recordings.createdAt));
}

/**
 * Get recording by ID
 */
export async function getRecordingById(id: number): Promise<Recording | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all recordings for a phoneme
 */
export async function getPhonemeRecordings(phonemeId: number): Promise<Recording[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(recordings)
    .where(eq(recordings.phonemeId, phonemeId))
    .orderBy(desc(recordings.createdAt));
}

/**
 * Create a new recording
 */
export async function createRecording(data: {
  phonemeId: number;
  userId: number;
  status?: string;
  fileKey?: string;
  duration?: number;
  sampleRate?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(recordings).values({
    phonemeId: data.phonemeId,
    userId: data.userId,
    status: (data.status as any) || 'Pending',
    fileKey: data.fileKey,
    duration: data.duration ? (data.duration.toString() as any) : undefined,
    sampleRate: data.sampleRate,
  });

  return result;
}

/**
 * Update recording status
 */
export async function updateRecordingStatus(
  recordingId: number,
  status: string,
  reviewedBy?: number,
  reviewNotes?: string,
  clearFileKey?: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    status: status as any,
  };

  if (reviewedBy) {
    updateData.reviewedBy = reviewedBy;
    updateData.reviewedAt = new Date();
  }

  if (reviewNotes !== undefined) {
    updateData.reviewNotes = reviewNotes;
  }
  if (clearFileKey) {
    updateData.fileKey = null;
  }

  return db.update(recordings).set(updateData).where(eq(recordings.id, recordingId));
}

/**
 * Get recording statistics
 */
export async function getRecordingStats() {
  const db = await getDb();
  if (!db) return { total: 0, approved: 0, recorded: 0, pending: 0, passed: 0, deleted: 0 };

  const allRecordings = await db.select().from(recordings);

  return {
    total: allRecordings.length,
    approved: allRecordings.filter((r) => r.status === 'Approved').length,
    recorded: allRecordings.filter((r) => r.status === 'Recorded').length,
    pending: allRecordings.filter((r) => r.status === 'Pending').length,
    passed: allRecordings.filter((r) => r.status === 'Passed').length,
    deleted: allRecordings.filter((r) => r.status === 'Deleted').length,
  };
}

/**
 * Get category statistics
 */
export async function getCategoryStats() {
  const db = await getDb();
  if (!db) return [];

  const allPhonemes = await db.select().from(phonemes);
  const allRecordings = await db.select().from(recordings);

  const categories = Array.from(new Set(allPhonemes.map((p) => p.category)));

  return categories.map((category) => {
    const phonemesInCategory = allPhonemes.filter((p) => p.category === category);
    const recordingsInCategory = allRecordings.filter((r) =>
      phonemesInCategory.some((p) => p.id === r.phonemeId)
    );

    return {
      category,
      total: phonemesInCategory.length,
      recorded: recordingsInCategory.length,
      approved: recordingsInCategory.filter((r) => r.status === 'Approved').length,
    };
  });
}

/**
 * Create batch submission
 */
export async function createBatchSubmission(userId: number, recordingCount: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(batchSubmissions).values({
    userId,
    recordingCount,
    status: 'pending',
  });
}

/**
 * Get pending batch submissions for admin review
 */
export async function getPendingBatchSubmissions() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(batchSubmissions)
    .where(eq(batchSubmissions.status, 'pending'))
    .orderBy(desc(batchSubmissions.createdAt));
}
