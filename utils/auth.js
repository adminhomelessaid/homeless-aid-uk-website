const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class AuthUtils {
  // Password hashing
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Token generation
  static generateInvitationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static generateJWT(user) {
    const jwtSecret = process.env.JWT_SECRET || 'temporary-secret-key';
    
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.full_name,
      role: user.role,
      iss: 'homelessaid.co.uk'
    };

    return jwt.sign(payload, jwtSecret, {
      expiresIn: '4h',
      issuer: 'homelessaid.co.uk'
    });
  }

  static verifyJWT(token) {
    const jwtSecret = process.env.JWT_SECRET || 'temporary-secret-key';
    
    return jwt.verify(token, jwtSecret, {
      issuer: 'homelessaid.co.uk'
    });
  }

  // Password validation
  static validatePassword(password) {
    const errors = [];
    
    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Role permissions
  static hasPermission(userRole, requiredPermission) {
    const permissions = {
      admin: [
        'manage_users',
        'view_all_logs',
        'export_data',
        'manage_system',
        'view_analytics',
        'log_attendance'
      ],
      team_lead: [
        'view_all_logs',
        'export_data',
        'view_analytics',
        'log_attendance',
        'manage_team'
      ],
      volunteer: [
        'log_attendance',
        'view_own_logs'
      ]
    };

    return permissions[userRole]?.includes(requiredPermission) || false;
  }

  // User status helpers
  static getUserStatus(user) {
    if (!user.is_active) return 'deactivated';
    if (!user.password_hash) return 'pending_setup';
    if (!user.email_verified) return 'pending_verification';
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    if (user.last_login && new Date(user.last_login) > thirtyDaysAgo) {
      return 'active';
    } else {
      return 'inactive';
    }
  }

  // Email validation
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Username validation
  static validateUsername(username) {
    const errors = [];
    
    if (!username || username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    
    if (username.length > 50) {
      errors.push('Username must be no more than 50 characters long');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Generate secure password
  static generateSecurePassword(length = 12) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  // Audit logging
  static async logAuditAction(supabase, adminUserId, targetUserId, action, details, req) {
    try {
      const auditEntry = {
        admin_user_id: adminUserId,
        target_user_id: targetUserId,
        action,
        details,
        ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        user_agent: req.headers['user-agent']
      };

      await supabase
        .from('outreach_user_audit')
        .insert([auditEntry]);
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  }
}

module.exports = AuthUtils;