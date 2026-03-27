/**
 * src/services/jobService.js
 * All data persisted in the `jobs` PostgreSQL table.
 */
"use strict";

import { query } from "../db/pool";

// ─── constants ───────────────────────────────────────────────────────────────

const VALID_STATUSES = ["open", "in_progress", "completed", "cancelled"];

const VALID_CATEGORIES = [
  "Smart Contracts",
  "Frontend Development",
  "Backend Development",
  "UI/UX Design",
  "Technical Writing",
  "DevOps",
  "Security Audit",
  "Data Analysis",
  "Mobile Development",
  "Other",
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function validatePublicKey(key) {
  if (!key || !/^G[A-Z0-9]{55}$/.test(key)) {
    const e = new Error("Invalid Stellar public key");
    e.status = 400;
    throw e;
  }
}

/** Convert snake_case DB row → camelCase API object */
function rowToJob(row) {
  return {
    id:                row.id,
    title:             row.title,
    description:       row.description,
    budget:            row.budget,
    category:          row.category,
    skills:            row.skills,
    status:            row.status,
    clientAddress:     row.client_address,
    freelancerAddress: row.freelancer_address,
    escrowContractId:  row.escrow_contract_id,
    applicantCount:    row.applicant_count,
    deadline:          row.deadline,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

// ─── service functions ───────────────────────────────────────────────────────

/**
 * Create a new job listing.
 * Note: the client's profile row must already exist (FK constraint).
 */
async function createJob({ title, description, budget, category, skills, deadline, clientAddress }) {
  validatePublicKey(clientAddress);

  if (!title || title.length < 10) {
    const e = new Error("Title must be at least 10 characters"); e.status = 400; throw e;
  }
  if (!description || description.length < 30) {
    const e = new Error("Description must be at least 30 characters"); e.status = 400; throw e;
  }
  if (!budget || isNaN(parseFloat(budget)) || parseFloat(budget) <= 0) {
    const e = new Error("Budget must be a positive number"); e.status = 400; throw e;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    const e = new Error("Invalid category"); e.status = 400; throw e;
  }

  const safeSkills = Array.isArray(skills) ? skills.slice(0, 8) : [];

  const { rows } = await query(
    `
    INSERT INTO jobs
      (title, description, budget, category, skills, status, client_address, deadline, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, NOW(), NOW())
    RETURNING *
    `,
    [
      title.trim(),
      description.trim(),
      parseFloat(budget).toFixed(7),
      category,
      safeSkills,
      clientAddress,
      deadline || null,
    ]
  );

  return rowToJob(rows[0]);
}

async function getJob(id) {
  const { rows } = await query("SELECT * FROM jobs WHERE id = $1", [id]);
  if (!rows.length) {
    const e = new Error("Job not found"); e.status = 404; throw e;
  }
  return rowToJob(rows[0]);
}

async function listJobs({ category, status = "open", limit = 50, search, minBudget, maxBudget } = {}) {
  const conditions = [];
  const params     = [];

  if (status && VALID_STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER(title) LIKE $${idx} OR LOWER(description) LIKE $${idx} OR EXISTS (
         SELECT 1 FROM unnest(skills) s WHERE LOWER(s) LIKE $${idx}
       ))`
    );
  }

  if (minBudget !== undefined && !isNaN(minBudget)) {
    params.push(minBudget);
    conditions.push(`budget >= $${params.length}`);
  }

  if (maxBudget !== undefined && !isNaN(maxBudget)) {
    params.push(maxBudget);
    conditions.push(`budget <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const safeLimit = Math.min(Number(limit) || 50, 100);
  params.push(safeLimit);

  const { rows } = await query(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );

  return rows.map(rowToJob);
}

async function listJobsByClient(clientAddress) {
  validatePublicKey(clientAddress);
  const { rows } = await query(
    "SELECT * FROM jobs WHERE client_address = $1 ORDER BY created_at DESC",
    [clientAddress]
  );
  return rows.map(rowToJob);
}

async function updateJobStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    const e = new Error("Invalid status"); e.status = 400; throw e;
  }

  const { rows } = await query(
    "UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [status, id]
  );

  if (!rows.length) {
    const e = new Error("Job not found"); e.status = 404; throw e;
  }

  return rowToJob(rows[0]);
}

async function assignFreelancer(jobId, freelancerAddress) {
  validatePublicKey(freelancerAddress);

  const { rows } = await query(
    `UPDATE jobs
     SET freelancer_address = $1, status = 'in_progress', updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [freelancerAddress, jobId]
  );

  if (!rows.length) {
    const e = new Error("Job not found"); e.status = 404; throw e;
  }

  return rowToJob(rows[0]);
}

export default {
  createJob,
  getJob,
  listJobs,
  listJobsByClient,
  updateJobStatus,
  assignFreelancer,
};