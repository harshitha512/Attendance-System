const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');

const authCtrl       = require('../controllers/authController');
const employeeCtrl   = require('../controllers/employeeController');
const attendanceCtrl = require('../controllers/attendanceController');
const faceCtrl       = require('../controllers/faceController');
const leaveCtrl      = require('../controllers/leaveController');
const { bulkImportEmployees } = require('../controllers/bulkImport');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── AUTH ──────────────────────────────────────────────────────
router.post('/auth/login', [
  body('username').notEmpty(),
  body('password').notEmpty(),
], authCtrl.login);

router.get('/auth/me', authenticate, authCtrl.me);

// ── All routes below require authentication ───────────────────
router.use(authenticate);

// ── EMPLOYEES ─────────────────────────────────────────────────
router.get('/employees',             employeeCtrl.getAll);
router.get('/employees/departments', employeeCtrl.getDepartments);
router.get('/employees/:id',         employeeCtrl.getById);
router.post('/employees',            employeeCtrl.create);
router.put('/employees/:id',         employeeCtrl.update);
router.delete('/employees/:id',      employeeCtrl.remove);

// FIX: bulk import route added
router.post('/employees/bulk-import', upload.single('file'), bulkImportEmployees);

// ── FACE ──────────────────────────────────────────────────────
router.post('/employees/:employee_id/face',   upload.single('image'), faceCtrl.registerFace);
router.get('/employees/:employee_id/face',    faceCtrl.hasFace);
router.delete('/employees/:employee_id/face', faceCtrl.deleteFace);

// ── ATTENDANCE ────────────────────────────────────────────────
router.get('/attendance',               attendanceCtrl.getAttendance);
router.get('/attendance/summary/today', attendanceCtrl.getTodaySummary);
router.post('/attendance/mark',         upload.single('image'), attendanceCtrl.markAttendance);
router.put('/attendance/ot-update',     attendanceCtrl.updateOT);

// ── REPORTS ───────────────────────────────────────────────────
router.get('/reports', attendanceCtrl.getReports);

// ── LEAVES ────────────────────────────────────────────────────
router.get('/leaves/balances',  leaveCtrl.getBalances);   // must be before /leaves/:id
router.get('/leaves',           leaveCtrl.getLeaves);
router.post('/leaves',          leaveCtrl.createLeave);
router.patch('/leaves/:id',     leaveCtrl.updateLeave);
router.delete('/leaves/:id',    leaveCtrl.deleteLeave);

module.exports = router;