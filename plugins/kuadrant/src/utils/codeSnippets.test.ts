import { generateAuthCodeSnippets } from './codeSnippets';
import { Credentials } from '../types/api-management';

describe('generateAuthCodeSnippets', () => {
  const hostname = 'api.example.com';
  const apiKey = 'test-api-key-123';
  const baseUrl = `https://${hostname}/api/v1/endpoint`;

  describe('Authorization Header credentials', () => {
    it('should generate snippets with Bearer prefix by default', () => {
      const credentials: Credentials = {
        authorizationHeader: {},
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`curl -X GET ${baseUrl}`);
      expect(snippets.curl).toContain(`-H "Authorization: ${apiKey}"`);

      expect(snippets.nodejs).toContain(`'Authorization': '' + apiKey`);
      expect(snippets.python).toContain(`'Authorization': '' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("Authorization", "" + apiKey)`);
    });

    it('should generate snippets with custom prefix', () => {
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: 'APIKEY',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "Authorization: APIKEY ${apiKey}"`);

      expect(snippets.nodejs).toContain(`'Authorization': 'APIKEY ' + apiKey`);
      expect(snippets.python).toContain(`'Authorization': 'APIKEY ' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("Authorization", "APIKEY " + apiKey)`);
    });

    it('should generate snippets with Bearer prefix', () => {
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: 'Bearer',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "Authorization: Bearer ${apiKey}"`);
      expect(snippets.nodejs).toContain(`'Authorization': 'Bearer ' + apiKey`);
      expect(snippets.python).toContain(`'Authorization': 'Bearer ' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("Authorization", "Bearer " + apiKey)`);
    });
  });

  describe('Custom Header credentials', () => {
    it('should generate snippets with custom header name and no prefix', () => {
      const credentials: Credentials = {
        customHeader: {
          name: 'X-API-Key',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "X-API-Key: ${apiKey}"`);

      expect(snippets.nodejs).toContain(`'X-API-Key': '' + apiKey`);
      expect(snippets.python).toContain(`'X-API-Key': '' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("X-API-Key", "" + apiKey)`);
    });

    it('should generate snippets with custom header name and prefix', () => {
      const credentials: Credentials = {
        customHeader: {
          name: 'X-Custom-Auth',
          prefix: 'Token-',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "X-Custom-Auth: Token-${apiKey}"`);

      expect(snippets.nodejs).toContain(`'X-Custom-Auth': 'Token-' + apiKey`);
      expect(snippets.python).toContain(`'X-Custom-Auth': 'Token-' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("X-Custom-Auth", "Token-" + apiKey)`);
    });
  });

  describe('Query String credentials', () => {
    it('should generate snippets with query parameter', () => {
      const credentials: Credentials = {
        queryString: {
          name: 'api_key',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`curl -X GET "${baseUrl}?api_key=${apiKey}"`);

      expect(snippets.nodejs).toContain(`const endpoint = '${baseUrl}?api_key=' + apiKey`);
      expect(snippets.nodejs).toContain(`fetch(endpoint, {`);

      expect(snippets.python).toContain(`params = {`);
      expect(snippets.python).toContain(`'api_key': api_key`);
      expect(snippets.python).toContain(`response = requests.get(endpoint, params=params)`);

      expect(snippets.go).toContain(`endpoint := "${baseUrl}?api_key=" + apiKey`);
    });

    it('should generate snippets with custom query parameter name', () => {
      const credentials: Credentials = {
        queryString: {
          name: 'token',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`?token=${apiKey}`);
      expect(snippets.nodejs).toContain(`?token=`);
      expect(snippets.python).toContain(`'token': api_key`);
      expect(snippets.go).toContain(`?token=`);
    });
  });

  describe('Cookie credentials', () => {
    it('should generate snippets with cookie', () => {
      const credentials: Credentials = {
        cookie: {
          name: 'session_token',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`--cookie "session_token=${apiKey}"`);

      expect(snippets.nodejs).toContain(`'Cookie': 'session_token=' + apiKey`);

      expect(snippets.python).toContain(`cookies = {`);
      expect(snippets.python).toContain(`'session_token': api_key`);
      expect(snippets.python).toContain(`response = requests.get(endpoint, cookies=cookies)`);

      expect(snippets.go).toContain(`req.AddCookie(&http.Cookie{`);
      expect(snippets.go).toContain(`Name:  "session_token"`);
      expect(snippets.go).toContain(`Value: apiKey`);
    });

    it('should generate snippets with custom cookie name', () => {
      const credentials: Credentials = {
        cookie: {
          name: 'auth_token',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`--cookie "auth_token=${apiKey}"`);
      expect(snippets.nodejs).toContain(`'Cookie': 'auth_token=' + apiKey`);
      expect(snippets.python).toContain(`'auth_token': api_key`);
      expect(snippets.go).toContain(`Name:  "auth_token"`);
    });
  });

  describe('Default behavior (no credentials)', () => {
    it('should default to Bearer authorization when credentials is undefined', () => {
      const snippets = generateAuthCodeSnippets(undefined, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "Authorization: Bearer ${apiKey}"`);
      expect(snippets.nodejs).toContain(`'Authorization': 'Bearer ' + apiKey`);
      expect(snippets.python).toContain(`'Authorization': 'Bearer ' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("Authorization", "Bearer " + apiKey)`);
    });

    it('should default to Bearer authorization when credentials is empty object', () => {
      const credentials: Credentials = {};

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "Authorization: Bearer ${apiKey}"`);
      expect(snippets.nodejs).toContain(`'Authorization': 'Bearer ' + apiKey`);
      expect(snippets.python).toContain(`'Authorization': 'Bearer ' + api_key`);
      expect(snippets.go).toContain(`req.Header.Add("Authorization", "Bearer " + apiKey)`);
    });
  });

  describe('All snippets structure', () => {
    it('should return all four language snippets', () => {
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: 'Bearer',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets).toHaveProperty('curl');
      expect(snippets).toHaveProperty('nodejs');
      expect(snippets).toHaveProperty('python');
      expect(snippets).toHaveProperty('go');

      expect(typeof snippets.curl).toBe('string');
      expect(typeof snippets.nodejs).toBe('string');
      expect(typeof snippets.python).toBe('string');
      expect(typeof snippets.go).toBe('string');

      expect(snippets.curl.length).toBeGreaterThan(0);
      expect(snippets.nodejs.length).toBeGreaterThan(0);
      expect(snippets.python.length).toBeGreaterThan(0);
      expect(snippets.go.length).toBeGreaterThan(0);
    });

    it('should include the hostname in all snippets', () => {
      const credentials: Credentials = {
        authorizationHeader: {},
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(hostname);
      expect(snippets.nodejs).toContain(hostname);
      expect(snippets.python).toContain(hostname);
      expect(snippets.go).toContain(hostname);
    });

    it('should include the API key in all snippets', () => {
      const credentials: Credentials = {
        authorizationHeader: {},
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(apiKey);
      expect(snippets.nodejs).toContain(apiKey);
      expect(snippets.python).toContain(apiKey);
      expect(snippets.go).toContain(apiKey);
    });
  });

  describe('Language-specific patterns', () => {
    const credentials: Credentials = {
      authorizationHeader: {
        prefix: 'Bearer',
      },
    };

    it('should generate valid cURL command', () => {
      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toMatch(/^curl -X GET/);
      expect(snippets.curl).toContain('\\');
      expect(snippets.curl).toContain('-H');
    });

    it('should generate valid Node.js code', () => {
      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.nodejs).toContain('const fetch = require');
      expect(snippets.nodejs).toContain('const apiKey =');
      expect(snippets.nodejs).toContain('const endpoint =');
      expect(snippets.nodejs).toContain('fetch(endpoint, {');
      expect(snippets.nodejs).toContain('.then(');
      expect(snippets.nodejs).toContain('.catch(');
    });

    it('should generate valid Python code', () => {
      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.python).toContain('import requests');
      expect(snippets.python).toContain('api_key =');
      expect(snippets.python).toContain('endpoint =');
      expect(snippets.python).toContain('headers = {');
      expect(snippets.python).toContain('response = requests.get(');
      expect(snippets.python).toContain('print(response.json())');
    });

    it('should generate valid Go code', () => {
      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.go).toContain('package main');
      expect(snippets.go).toContain('import (');
      expect(snippets.go).toContain('func main() {');
      expect(snippets.go).toContain('apiKey :=');
      expect(snippets.go).toContain('endpoint :=');
      expect(snippets.go).toContain('client := &http.Client{}');
      expect(snippets.go).toContain('req, _ := http.NewRequest(');
      expect(snippets.go).toContain('defer resp.Body.Close()');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty prefix in authorizationHeader', () => {
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: '',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "Authorization: ${apiKey}"`);
      expect(snippets.nodejs).toContain(`'Authorization': '' + apiKey`);
    });

    it('should handle empty prefix in customHeader', () => {
      const credentials: Credentials = {
        customHeader: {
          name: 'X-API-Key',
          prefix: '',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, apiKey);

      expect(snippets.curl).toContain(`-H "X-API-Key: ${apiKey}"`);
      expect(snippets.nodejs).toContain(`'X-API-Key': '' + apiKey`);
    });

    it('should handle placeholder API key', () => {
      const placeholderKey = '<your-api-key>';
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: 'Bearer',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, hostname, placeholderKey);

      expect(snippets.curl).toContain(placeholderKey);
      expect(snippets.nodejs).toContain(placeholderKey);
      expect(snippets.python).toContain(placeholderKey);
      expect(snippets.go).toContain(placeholderKey);
    });

    it('should handle special characters in hostname', () => {
      const specialHostname = 'api-v2.example-app.com';
      const credentials: Credentials = {
        authorizationHeader: {
          prefix: 'Bearer',
        },
      };

      const snippets = generateAuthCodeSnippets(credentials, specialHostname, apiKey);

      expect(snippets.curl).toContain(specialHostname);
      expect(snippets.nodejs).toContain(specialHostname);
      expect(snippets.python).toContain(specialHostname);
      expect(snippets.go).toContain(specialHostname);
    });
  });
});
