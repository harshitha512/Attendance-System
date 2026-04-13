const jwt = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // ✅ FIX: Verify the real JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-dev-secret'
    );

    // ✅ FIX: Set admin info from token instead of querying DB
    // (DB query removed since we use hardcoded admin — add it back when you have an admins table)
    req.adminId = decoded.id;
    req.admin = decoded;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = { authenticate };
