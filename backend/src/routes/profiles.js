/**
 * src/routes/profiles.js
 */
"use strict";
const express = require("express");
const router  = express.Router();
const { createRateLimiter } = require("../middleware/rateLimiter");

const profileUpdateRateLimiter = createRateLimiter(5, 1); // 5 profile updates per minute
const generalProfileRateLimiter = createRateLimiter(30, 1); // 100 requests per minute for getting profiles

const { getProfile, upsertProfile } = require("../services/profileService");

router.get("/:publicKey", generalProfileRateLimiter, async (req, res, next) => {
  try {
    const profile = await getProfile(req.params.publicKey);
    res.json({ success: true, data: profile });
  } catch (e) {
    next(e);
  }
});

router.post("/", profileUpdateRateLimiter, async (req, res, next) => {
  try {
    const profile = await upsertProfile(req.body);
    res.json({ success: true, data: profile });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
