const pool = require('../config/db');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Register face for employee
const registerFace = async (req, res, next) => {
  try {
    const { employee_id } = req.params;
    const imageBuffer = req.file?.buffer;
    if (!imageBuffer) return res.status(400).json({ success: false, message: 'Image required' });

    // Verify employee exists
    const emp = await pool.query('SELECT id FROM employees WHERE id = $1', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Send to face service
    const formData = new FormData();
    formData.append('employee_id', employee_id);
    formData.append('image', imageBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });

    const faceRes = await fetch(`${process.env.FACE_SERVICE_URL}/register`, {
      method: 'POST', body: formData,
    });
    const faceData = await faceRes.json();

    if (!faceData.success) {
      return res.status(400).json({ success: false, message: faceData.message || 'Face registration failed' });
    }

    // FIX: registered_by is uuid type but req.adminId is integer from JWT — use NULL
    await pool.query(
      `INSERT INTO face_encodings (employee_id, encoding, registered_by)
       VALUES ($1, $2, NULL)`,
      [employee_id, JSON.stringify(faceData.encoding)]
    );

    // FIX: reload Python cache AFTER DB save so new face is immediately recognizable
    await fetch(`${process.env.FACE_SERVICE_URL}/reload`, { method: 'POST' }).catch(() => {});

    res.json({ success: true, message: 'Face registered successfully' });
  } catch (err) { next(err); }
};

// Check if employee has face registered
const hasFace = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, registered_at FROM face_encodings WHERE employee_id = $1 ORDER BY registered_at DESC LIMIT 1',
      [req.params.employee_id]
    );
    res.json({ success: true, has_face: result.rows.length > 0, data: result.rows[0] || null });
  } catch (err) { next(err); }
};

// Delete face encoding
const deleteFace = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM face_encodings WHERE employee_id = $1', [req.params.employee_id]);

    // Notify face service
    await fetch(`${process.env.FACE_SERVICE_URL}/delete/${req.params.employee_id}`, { method: 'DELETE' })
      .catch(() => {});

    res.json({ success: true, message: 'Face encoding deleted' });
  } catch (err) { next(err); }
};

module.exports = { registerFace, hasFace, deleteFace };
