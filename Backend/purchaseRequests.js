
const express = require('express');
const { db } = require('./db');
const { requireAuth, requireRole } = require('./middleware');

const router = express.Router();


// View purchase requests
router.get('/', requireAuth, (req, res) => {

    try {
        let requests;

        if (req.user.role === 'requestor') {

            // Requesters only see their own requests
            requests = db.prepare(`
                SELECT *
                FROM purchase_requests
                WHERE requester_id = ?
                ORDER BY submitted_at DESC
            `).all(req.user.id);

        } else if (req.user.role === 'approver') {

            // Approvers see submitted requests
            requests = db.prepare(`
                SELECT
                    p.*,
                    u.username AS requester_name
                FROM purchase_requests p
                JOIN users u ON p.requester_id = u.id
                ORDER BY
                    CASE p.status
                        WHEN 'Pending' THEN 0
                        WHEN 'Approved' THEN 1
                        WHEN 'Denied' THEN 2
                    END,
                    p.submitted_at DESC
            `).all();

        } else {

            return res.status(403).json({
                error: 'You do not have permission to view purchase requests.'
            });

        }

        res.json({ requests });

    } catch (error) {

        console.error('Error retrieving purchase requests:', error);

        res.status(500).json({
            error: 'Unable to retrieve purchase requests.'
        });

    }

});


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

// Cancel a purchase request
router.delete(
    '/:id/cancel',
    requireAuth,
    requireRole('requestor'),
    (req, res) => {

        const requestId = Number(req.params.id);

        if (!Number.isSafeInteger(requestId) || requestId <= 0) {
            return res.status(400).json({
                error: 'Invalid purchase request ID.'
            });
        }

        try {

            const result = db.prepare(`
                UPDATE purchase_requests
                SET cancelled_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND requester_id = ?
                AND status = 'Pending'
                AND cancelled_at IS NULL
            `).run(requestId, req.user.id);

            if (result.changes === 0) {
                return res.status(409).json({
                    error: 'Request could not be cancelled. It may not exist, may not belong to you, or may no longer be pending.'
                });
            }

            res.json({
                message: 'Purchase request cancelled successfully.',
                requestId: requestId,
                status: 'Cancelled'
            });

        } catch (error) {

            console.error('Cancellation error:', error);

            res.status(500).json({
                error: 'Unable to cancel purchase request.'
            });

        }
    }
);



module.exports = router;
