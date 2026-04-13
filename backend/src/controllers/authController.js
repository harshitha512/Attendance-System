const jwt = require('jsonwebtoken');

// ✅ FIX: Added /auth/me endpoint so useAuth can verify token on page load/navigation
exports.me = async (req, res) => {
  try {
    const admin = {
      id: req.admin.id,
      username: req.admin.username,
      full_name: req.admin.full_name || 'Administrator',
    };
    res.json({ success: true, admin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Hardcoded credentials check
    if (username !== 'admin' || password !== 'Admin@1234') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = {
      id: 1,
      username: 'admin',
      full_name: 'Administrator',
    };

    // ✅ FIX: Generate a real JWT token instead of a plain string
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'fallback-dev-secret',
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, admin });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
