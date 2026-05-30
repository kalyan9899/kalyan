const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const Manager = require('../models/Manager');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'Username, password and role are required' });
    }

    const normalized = username.trim().toLowerCase();

    if (role === 'manager') {
      const manager = await Manager.findOne({ username: normalized });
      if (!manager || !(await bcrypt.compare(password, manager.password))) {
        return res.status(401).json({ message: 'Invalid manager credentials' });
      }
      const token = jwt.sign(
        { id: manager._id, role: 'manager', name: manager.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ token, role: 'manager', name: manager.name });
    }

    if (role === 'customer') {
      const client = await Client.findOne({ username: normalized });
      if (!client || !(await bcrypt.compare(password, client.password))) {
        return res.status(401).json({ message: 'Invalid customer credentials' });
      }
      const token = jwt.sign(
        { id: client._id, role: 'customer', name: client.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ token, role: 'customer', name: client.name });
    }

    return res.status(400).json({ message: 'Role must be customer or manager' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
