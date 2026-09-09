CREATE TABLE `exercise_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`primaryMuscleGroup` text NOT NULL,
	`secondaryMuscleGroups` text NOT NULL,
	`equipment` text NOT NULL,
	`isCustom` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` integer NOT NULL,
	`lastError` text
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`folderId` integer,
	`notes` text,
	`exercises` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutExerciseId` text NOT NULL,
	`index` integer NOT NULL,
	`type` text NOT NULL,
	`weightKg` real,
	`reps` integer,
	`distanceMeters` integer,
	`durationSeconds` integer,
	`rpe` real,
	`customMetric` real,
	FOREIGN KEY (`workoutExerciseId`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_workout_exercise_id_idx` ON `sets` (`workoutExerciseId`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`workoutsCursor` text,
	`backfillPage` integer DEFAULT 1 NOT NULL,
	`backfillDone` integer DEFAULT false NOT NULL,
	`templatesSyncedAt` integer,
	`routinesSyncedAt` integer,
	`lastSyncAt` integer,
	`lastError` text
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workoutId` text NOT NULL,
	`index` integer NOT NULL,
	`title` text NOT NULL,
	`exerciseTemplateId` text NOT NULL,
	`supersetId` integer,
	`notes` text,
	FOREIGN KEY (`workoutId`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_id_idx` ON `workout_exercises` (`workoutId`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_template_id_idx` ON `workout_exercises` (`exerciseTemplateId`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`routineId` text,
	`startTime` integer NOT NULL,
	`endTime` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workouts_start_time_idx` ON `workouts` (`startTime`);