/**
 * CLASPTEK ENTERPRISE PLATFORM — DELETE PERSONNEL DISPATCHER
 * File: api/admin/delete-personnel.js
 * 
 * Proxies to consolidated api/admin.js handler with action='delete-personnel'
 */

const adminHandler = require('../admin.js');

module.exports = async function handler(req, res) {
  if (req && !req.url) {
    req.url = '/api/admin/delete-personnel?action=delete-personnel';
  } else if (req && req.url && !req.url.includes('delete-personnel')) {
    req.url = '/api/admin/delete-personnel?action=delete-personnel';
  }
  return adminHandler(req, res);
};
