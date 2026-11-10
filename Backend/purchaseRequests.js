
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
                ORDER BY submitted_at DESC, id DESC
            `).all(req.user.id);

        } else if (req.user.role === 'approver') {

            // Approvers only see requests from their department
if (!req.user.department) {
    return res.status(403).json({
        error: 'Ask an admin to assign your department first.'
    });
}

requests = db.prepare(`
    SELECT
        p.*,
        u.username AS requester_name
    FROM purchase_requests p
    JOIN users u ON u.id = p.requester_id
    WHERE p.department = ? COLLATE NOCASE
    ORDER BY p.submitted_at ASC, p.id ASC
`).all(req.user.department);

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
    if (!req.user.department) {
    return res.status(403).json({
        error: 'Ask an admin to assign your department first.'
    });
}

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

if (
    item_name.trim().length > 150 ||
    vendor.trim().length > 150 ||
    description.trim().length > 2000 ||
    justification.trim().length > 2000
) {
    return res.status(400).json({
        error: 'One or more fields are too long.'
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
        department,
        item_name,
        vendor,
        description,
        quantity,
        unit_cost,
        justification
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
    req.user.id,
    req.user.department,
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

// Approve or deny a pending purchase request
router.post(
    '/:id/decision',
    requireAuth,
    requireRole('approver'),
    (req, res) => {

        const requestId = Number(req.params.id);
        const decision = req.body?.decision;
        const comment = req.body?.comment ?? '';

        // Validate request ID
        if (!Number.isSafeInteger(requestId) || requestId <= 0) {
            return res.status(400).json({
                error: 'Invalid request ID.'
            });
        }

        // Validate decision
        if (decision !== 'Approved' && decision !== 'Denied') {
            return res.status(400).json({
                error: 'Decision must be Approved or Denied.'
            });
        }

        // Validate optional comment
        if (typeof comment !== 'string' || comment.length > 1000) {
            return res.status(400).json({
                error: 'Comment must be up to 1000 characters.'
            });
        }

        // Ensure the approver has a department
        if (!req.user.department) {
            return res.status(403).json({
                error: 'Your account needs a department.'
            });
        }

        try {

            // Change the status only if the request is
            // pending, not cancelled, and belongs
            // to the approver's department.
            const result = db.prepare(`
                UPDATE purchase_requests
                SET
                    status = ?,
                    decision_comment = ?,
                    decided_by = ?,
                    decided_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'Pending'
                  AND cancelled_at IS NULL
                  AND department = ? COLLATE NOCASE
            `).run(
                decision,
                decision === 'Denied'
                    ? (comment.trim() || null)
                    : null,
                req.user.id,
                requestId,
                req.user.department
            );

            // The request could not be updated
            if (result.changes === 0) {
                return res.status(409).json({
                    error: 'Request unavailable, outside your department, or already decided.'
                });
            }

            // Successful decision
            res.json({
                message: `Request #${requestId} ${decision.toLowerCase()} successfully.`,
                requestId,
                status: decision
            });

        } catch (error) {

            console.error('Decision failed:', error);

            res.status(500).json({
                error: 'Unable to save the decision.'
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
