
const express = require('express');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const simulator = require('../services/simulator');
const router = express.Router();

router.use('/admin/simulator', requireAuth, requireRole('admin'));
router.get('/admin/simulator', (req, res) => res.json(simulator.getStatus()));
router.post('/admin/simulator/start', requireCsrf, (req, res) => res.json(simulator.start()));
router.post('/admin/simulator/stop', requireCsrf, (req, res) => res.json(simulator.stop()));

module.exports = router;
