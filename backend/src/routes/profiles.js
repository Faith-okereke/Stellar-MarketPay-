/**
 * src/routes/profiles.js
 */
"use strict";
const express = require("express");
const router  = express.Router();
const { createRateLimiter } = require("../middleware/rateLimiter");

const profileUpdateRateLimiter = createRateLimiter(5, 1); // 5 profile updates per minute
const generalProfileRateLimiter = createRateLimiter(30, 1); // 100 requests per minute for getting profiles

const { getProfile, upsertProfile, updateAvailability } = require("../services/profileService");

router.get("/:publicKey", generalProfileRateLimiter ,async (req, res, next) => {
  try { res.json({ success: true, data: await getProfile(req.params.publicKey) }); }
  catch (e) { next(e); }
});

router.post("/", profileUpdateRateLimiter, async (req, res, next) => {
  try { res.json({ success: true, data: await upsertProfile(req.body) }); }
  catch (e) { next(e); }
});

router.post("/:publicKey/availability", profileUpdateRateLimiter, async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await updateAvailability(req.params.publicKey, req.body),
    });
  }
  catch (e) { next(e); }
});

router.post("/:publicKey/verify", profileUpdateRateLimiter, async (req, res, next) => {
  try {
    const { verifyIdentity } = require("../services/profileService");
    res.json({
      success: true,
      data: await verifyIdentity(req.params.publicKey, req.body.didHash),
    });
  }
  catch (e) { next(e); }
});

module.exports = router;
