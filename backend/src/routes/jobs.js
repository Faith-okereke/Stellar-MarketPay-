/**
 * src/routes/jobs.js
 */
"use strict";
const express = require("express");
const router  = express.Router();
const { createRateLimiter } = require("../middleware/rateLimiter");

const jobCreationRateLimiter = createRateLimiter(10, 1); // 10 job creations per minute
const generalJobRateLimiter = createRateLimiter(30, 1); // 100 requests per minute for listing/getting jobs


const { createJob, getJob, listJobs, listJobsByClient } = require("../services/jobService");
const { verifyJWT } = require("../middleware/auth");

// GET /api/jobs — list jobs (with optional ?category=&status=&limit=&search=&minBudget=&maxBudget=)
router.get("/", generalJobRateLimiter, async (req, res, next) => {
  try {
    const { category, status, limit, search, minBudget, maxBudget } = req.query;
    const data = await listJobs({
      category,
      status,
      limit: parseInt(limit) || 50,
      search,
      minBudget: parseFloat(minBudget),
      maxBudget: parseFloat(maxBudget)
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// GET /api/jobs/client/:publicKey — list jobs posted by a client
router.get("/client/:publicKey", generalJobRateLimiter, (req, res, next) => {
  try { res.json({ success: true, data: listJobsByClient(req.params.publicKey) }); }
  catch (e) { next(e); }
});

// GET /api/jobs/:id — get single job
router.get("/:id", generalJobRateLimiter ,(req, res, next) => {
  try { res.json({ success: true, data: getJob(req.params.id) }); }
  catch (e) { next(e); }
});

// POST /api/jobs — create a new job
router.post("/", jobCreationRateLimiter ,(req, res, next) => {
  try {
    const job = createJob(req.body);
    res.status(201).json({ success: true, data: job });
  } catch (e) { next(e); }
});

module.exports = router;
