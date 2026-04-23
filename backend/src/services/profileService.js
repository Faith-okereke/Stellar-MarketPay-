/**
 * src/services/profileService.js
 * All data persisted in the `profiles` PostgreSQL table.
 */
"use strict";

const pool = require("../db/pool");

// ─── helpers ────────────────────────────────────────────────────────────────

function validatePublicKey(key) {
  if (!key || !/^G[A-Z0-9]{55}$/.test(key)) {
    const e = new Error("Invalid Stellar public key");
    e.status = 400;
    throw e;
  }
}

/** Convert snake_case DB row → camelCase API object */
function rowToProfile(row) {
  return {
    publicKey:       row.public_key,
    displayName:     row.display_name,
    bio:             row.bio,
    skills:          row.skills,
    role:            row.role,
    completedJobs:   row.completed_jobs,
    totalEarnedXLM:  row.total_earned_xlm,
    rating:          row.rating !== null ? parseFloat(row.rating) : null,
    tier:            row.tier || "Newcomer",
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

function calculateFreelancerTier(completedJobs, averageRating) {
  const jobs = Number.isFinite(Number(completedJobs)) ? Number(completedJobs) : 0;
  const rating = typeof averageRating === "number" ? averageRating : null;

  if (jobs >= 25 && rating !== null && rating >= 4.8) return "Top Talent";
  if (jobs >= 10 && rating !== null && rating >= 4.5) return "Expert";
  if (jobs >= 3 && rating !== null && rating >= 4.0) return "Rising Star";
  return "Newcomer";
}

// ─── service functions ───────────────────────────────────────────────────────

async function getProfile(publicKey) {
  validatePublicKey(publicKey);

  const { rows } = await pool.query(
    `SELECT p.*,
       ROUND(AVG(r.stars)::numeric, 2) AS avg_rating,
       COUNT(r.id)::int                AS rating_count
     FROM profiles p
     LEFT JOIN ratings r ON r.rated_address = p.public_key
     WHERE p.public_key = $1
     GROUP BY p.public_key`,
    [publicKey]
  );

  if (!rows.length) {
    const e = new Error("Profile not found");
    e.status = 404;
    throw e;
  }

  const profile = rowToProfile(rows[0]);
  profile.rating      = rows[0].avg_rating !== null ? parseFloat(rows[0].avg_rating) : null;
  profile.ratingCount = rows[0].rating_count;
  profile.tier        = calculateFreelancerTier(profile.completedJobs, profile.rating);
  return profile;
}

async function upsertProfile({ publicKey, displayName, bio, skills, role }) {
  validatePublicKey(publicKey);

  const safeSkills = Array.isArray(skills) ? skills.slice(0, 15) : null;

  // INSERT … ON CONFLICT lets us handle create-or-update atomically.
  const { rows } = await pool.query(
    `
    INSERT INTO profiles (public_key, display_name, bio, skills, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (public_key) DO UPDATE
      SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), profiles.display_name),
          bio          = COALESCE(NULLIF(EXCLUDED.bio,          ''), profiles.bio),
          skills       = COALESCE(EXCLUDED.skills,                  profiles.skills),
          role         = COALESCE(NULLIF(EXCLUDED.role,         ''), profiles.role),
          updated_at   = NOW()
    RETURNING *
    `,
    [
      publicKey,
      displayName?.trim() || null,
      bio?.trim()         || null,
      safeSkills,
      role || "both",
    ]
  );

  return rowToProfile(rows[0]);
}

module.exports = { getProfile, upsertProfile, calculateFreelancerTier };
