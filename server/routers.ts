import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getAllPhonemes,
  getPhonemeById,
  getUserRecordings,
  getRecordingById,
  getPhonemeRecordings,
  createRecording,
  updateRecordingStatus,
  getRecordingStats,
  getCategoryStats,
  createBatchSubmission,
  getPendingBatchSubmissions,
} from "./db";
import { TRPCError } from "@trpc/server";

// Helper to check if user is admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Phoneme procedures
  phoneme: router({
    /**
     * Get all phonemes with optional filtering and sorting
     */
    list: publicProcedure
      .input(
        z.object({
          category: z.string().optional(),
          search: z.string().optional(),
          sortBy: z.enum(['id', 'category']).optional(),
          sortOrder: z.enum(['asc', 'desc']).optional(),
        })
      )
      .query(async ({ input }) => {
        return getAllPhonemes({
          category: input.category,
          search: input.search,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
        });
      }),

    /**
     * Get a single phoneme by ID
     */
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPhonemeById(input.id);
      }),

    /**
     * Get categories for filtering
     */
    getCategories: publicProcedure.query(async () => {
      const allPhonemes = await getAllPhonemes();
      const categories = Array.from(new Set(allPhonemes.map((p) => p.category)));
      return categories.sort();
    }),

    /**
     * Get statistics for dashboard
     */
    getStats: publicProcedure.query(async () => {
      const recordingStats = await getRecordingStats();
      const categoryStats = await getCategoryStats();
      return { recordingStats, categoryStats };
    }),
  }),

  // Recording procedures
  recording: router({
    /**
     * Get all recordings for the current user
     */
    getUserRecordings: protectedProcedure.query(async ({ ctx }) => {
      return getUserRecordings(ctx.user.id);
    }),

    /**
     * Get all recordings for a specific phoneme
     */
    getPhonemeRecordings: publicProcedure
      .input(z.object({ phonemeId: z.number() }))
      .query(async ({ input }) => {
        return getPhonemeRecordings(input.phonemeId);
      }),

    /**
     * Get a single recording by ID
     */
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getRecordingById(input.id);
      }),

    /**
     * Create a new recording
     */
    create: protectedProcedure
      .input(
        z.object({
          phonemeId: z.number(),
          fileKey: z.string().optional(),
          duration: z.number().optional(),
          sampleRate: z.number().optional(),
          status: z.enum(['Pending', 'Recorded', 'Approved', 'Passed', 'Deleted']).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return createRecording({
          phonemeId: input.phonemeId,
          userId: ctx.user.id,
          status: input.status ?? 'Recorded',
          fileKey: input.fileKey,
          duration: input.duration,
          sampleRate: input.sampleRate,
        });
      }),

    /**
     * Update recording status (admin only)
     */
    updateStatus: adminProcedure
      .input(
        z.object({
          recordingId: z.number(),
          status: z.enum(['Pending', 'Recorded', 'Approved', 'Passed', 'Deleted']),
          reviewNotes: z.string().optional(),
          clearFileKey: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return updateRecordingStatus(
          input.recordingId,
          input.status,
          ctx.user.id,
          input.reviewNotes,
          input.clearFileKey
        );
      }),

    /**
     * Update multiple recordings status (admin only)
     */
    bulkUpdateStatus: adminProcedure
      .input(
        z.object({
          recordingIds: z.array(z.number()),
          status: z.enum(['Pending', 'Recorded', 'Approved', 'Passed', 'Deleted']),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updates = input.recordingIds.map((id) =>
          updateRecordingStatus(id, input.status, ctx.user.id)
        );
        return Promise.all(updates);
      }),

    /**
     * Get pending recordings for admin review
     */
    getPendingForReview: adminProcedure.query(async () => {
      const stats = await getRecordingStats();
      // Return pending recordings count and other stats
      return stats;
    }),
  }),

  // Batch submission procedures
  batch: router({
    /**
     * Submit a batch of recordings for review
     */
    submit: protectedProcedure
      .input(z.object({ recordingCount: z.number() }))
      .mutation(async ({ input, ctx }) => {
        return createBatchSubmission(ctx.user.id, input.recordingCount);
      }),

    /**
     * Get pending batch submissions (admin only)
     */
    getPending: adminProcedure.query(async () => {
      return getPendingBatchSubmissions();
    }),
  }),
});

export type AppRouter = typeof appRouter;
