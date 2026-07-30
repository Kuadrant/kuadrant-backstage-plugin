import { validateKubernetesName, validateURL } from './validation';

describe('validateKubernetesName', () => {
  describe('valid names', () => {
    it('accepts a simple lowercase name', () => {
      expect(validateKubernetesName('my-api')).toBeNull();
    });

    it('accepts a single character name', () => {
      expect(validateKubernetesName('a')).toBeNull();
    });

    it('accepts a single digit name', () => {
      expect(validateKubernetesName('1')).toBeNull();
    });

    it('accepts a name with hyphens in the middle', () => {
      expect(validateKubernetesName('my-cool-api')).toBeNull();
    });

    it('accepts a name starting and ending with digits', () => {
      expect(validateKubernetesName('123-abc-456')).toBeNull();
    });

    it('accepts a name at exactly 253 characters', () => {
      const name = 'a'.repeat(253);
      expect(validateKubernetesName(name)).toBeNull();
    });
  });

  describe('empty and whitespace', () => {
    it('rejects an empty string', () => {
      expect(validateKubernetesName('')).toBe('Name is required');
    });

    it('rejects a whitespace-only string', () => {
      expect(validateKubernetesName('   ')).toBe('Name is required');
    });

    it('rejects a tab-only string', () => {
      expect(validateKubernetesName('\t')).toBe('Name is required');
    });
  });

  describe('length limit', () => {
    it('rejects a name exceeding 253 characters', () => {
      const name = 'a'.repeat(254);
      expect(validateKubernetesName(name)).toBe(
        'Must be 253 characters or less',
      );
    });
  });

  describe('DNS-1123 format violations', () => {
    it('rejects uppercase letters', () => {
      expect(validateKubernetesName('MyApi')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects a name starting with a hyphen', () => {
      expect(validateKubernetesName('-my-api')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects a name ending with a hyphen', () => {
      expect(validateKubernetesName('my-api-')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects underscores', () => {
      expect(validateKubernetesName('my_api')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects dots', () => {
      expect(validateKubernetesName('my.api')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects spaces in the name', () => {
      expect(validateKubernetesName('my api')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });

    it('rejects special characters', () => {
      expect(validateKubernetesName('my@api!')).toBe(
        'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric',
      );
    });
  });
});

describe('validateURL', () => {
  describe('valid URLs', () => {
    it('accepts a valid http URL', () => {
      expect(validateURL('http://example.com')).toBeNull();
    });

    it('accepts a valid https URL', () => {
      expect(validateURL('https://example.com')).toBeNull();
    });

    it('accepts an https URL with path and query', () => {
      expect(validateURL('https://example.com/api/v1?key=val')).toBeNull();
    });

    it('accepts an https URL with port', () => {
      expect(validateURL('https://example.com:8443/path')).toBeNull();
    });
  });

  describe('empty and optional', () => {
    it('returns null for an empty string (field is optional)', () => {
      expect(validateURL('')).toBeNull();
    });
  });

  describe('invalid URLs', () => {
    it('rejects a non-URL string', () => {
      expect(validateURL('not-a-url')).toBe('Must be a valid URL');
    });

    it('rejects a string with no scheme', () => {
      expect(validateURL('example.com')).toBe('Must be a valid URL');
    });
  });

  describe('non-http schemes', () => {
    it('rejects ftp scheme', () => {
      expect(validateURL('ftp://example.com')).toBe(
        'Must be a valid HTTP or HTTPS URL',
      );
    });

    it('rejects mailto scheme', () => {
      expect(validateURL('mailto:user@example.com')).toBe(
        'Must be a valid HTTP or HTTPS URL',
      );
    });

    it('rejects file scheme', () => {
      expect(validateURL('file:///etc/passwd')).toBe(
        'Must be a valid HTTP or HTTPS URL',
      );
    });
  });
});
