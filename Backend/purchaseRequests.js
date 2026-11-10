
const express = require('express');
const { db } = require('./db');
const { requireAuth, requireRole } = require('./middleware');

const router = express.Router();

// Create a new purchase request
router.post(
  '/',
  requireAuth,
  requireRole('requestor'),
  (req, res) => {

    const {
      item_name,
      vendor,
      description,
      quantity,
      unit_cost,
      justification
    } = req.body;

    // Validate required fields
    if (
      typeof item_name !== 'string' ||
      typeof vendor !== 'string' ||
      typeof description !== 'string' ||
      typeof justification !== 'string' ||
      !item_name.trim() ||
      !vendor.trim() ||
      !description.trim() ||
      !justification.trim() ||
      quantity === undefined ||
      unit_cost === undefined ||
      quantity === '' ||
      unit_cost === ''
    ) {
      return res.status(400).json({
        error: 'Please complete all required fields.'
      });
    }

    const parsedQuantity = Number(quantity);
    const parsedCost = Number(unit_cost);

    if (
      !Number.isSafeInteger(parsedQuantity) ||
      parsedQuantity <= 0 ||
      !Number.isFinite(parsedCost) ||
      parsedCost < 0
    ) {
      return res.status(400).json({
        error: 'Quantity must be a positive whole number and cost must be non-negative.'
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO purchase_requests (
          requester_id,
          item_name,
          vendor,
          description,
          quantity,
          unit_cost,
          justification
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        item_name.trim(),
        vendor.trim(),
        description.trim(),
        parsedQuantity,
        parsedCost,
        justification.trim()
      );

      res.status(201).json({
        message: 'Purchase request submitted successfully.',
        requestId: result.lastInsertRowid,
        status: 'Pending'
      });

    } catch (error) {
      console.error('Purchase request error:', error.message);

      res.status(500).json({
        error: 'Unable to submit purchase request.'
      });
    }
  }
);

module.exports = router;
