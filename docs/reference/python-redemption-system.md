# Python Redemption System Reference

This document archives an alternative Python/Flask implementation of the redemption system. The current platform uses Node.js/Express with PostgreSQL.

## Overview

This Python implementation was considered as a reference but not adopted. The existing Node.js implementation provides equivalent functionality.

## Key Features from Python Reference

### 1. Checksum-Based Code Validation
The Python version uses MLR prefix with MD5 checksum:
```python
def generate_melori_code(self, code_type, length=12):
    prefix = self.config.CODE_PREFIXES.get(code_type, 'GEN')
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(length - 5))
    checksum = hashlib.md5(f"{prefix}{random_part}".encode()).hexdigest()[:2].upper()
    return f"MLR{prefix}{random_part}{checksum}"
```

### 2. DNS-Based Email Validation
Validates domain existence via MX/A records:
```python
def validate_domain_exists(self, domain):
    try:
        answers = dns.resolver.resolve(domain, 'MX')
        return len(answers) > 0
    except:
        try:
            answers = dns.resolver.resolve(domain, 'A')
            return len(answers) > 0
        except:
            return False
```

### 3. Dual Rate Limiting
- IP-based: 5 attempts per hour
- Email-based: 3 attempts per 24 hours

## Current Node.js Implementation

The active system uses:
- **Code Format**: `XXX-XXXXXXXX` (prefix + 8-char random)
- **Prefixes**: ALB (album), TRK (track), SUB (subscription), DSC (discount), MER (merchandise)
- **Rate Limiting**: 5 attempts per hour per email
- **Email Validation**: Disposable domain blocking with subdomain detection
- **Database**: PostgreSQL with `promo_campaigns`, `promo_codes`, `redemption_attempts` tables

## Dependencies (Not Installed)

```
Flask==2.3.3
mysql-connector-python==8.1.0
dnspython==2.4.2
python-dotenv==1.0.0
```

## Decision

Kept Node.js/Express + PostgreSQL stack for consistency with existing platform architecture, authentication, Stripe integration, and object storage.
