import { handleFetchError } from './errors';

/**
 * helper to create a mock Response with a given status and optional JSON body
 */
function mockResponse(
  status: number,
  body?: Record<string, unknown>,
): Response {
  return {
    status,
    json: body
      ? () => Promise.resolve(body)
      : () => Promise.reject(new Error('no body')),
  } as unknown as Response;
}

describe('handleFetchError', () => {
  describe('status 400', () => {
    it('returns the error field from the response body when present', async () => {
      const response = mockResponse(400, {
        error: 'Name must be unique',
      });
      const result = await handleFetchError(response);
      expect(result).toBe('Name must be unique');
    });

    it('returns the default message when response body has no error field', async () => {
      const response = mockResponse(400, {});
      const result = await handleFetchError(response);
      expect(result).toBe('Invalid request. Please check your input.');
    });

    it('returns the default message when response body is not parseable', async () => {
      const response = mockResponse(400);
      const result = await handleFetchError(response);
      expect(result).toBe('Invalid request. Please check your input.');
    });
  });

  describe('status 403', () => {
    it('returns permission denied message', async () => {
      const response = mockResponse(403);
      const result = await handleFetchError(response);
      expect(result).toBe('Permission denied. Contact your administrator.');
    });

    it('returns permission denied message regardless of body content', async () => {
      const response = mockResponse(403, {
        error: 'custom error ignored',
      });
      const result = await handleFetchError(response);
      expect(result).toBe('Permission denied. Contact your administrator.');
    });
  });

  describe('status 404', () => {
    it('returns resource not found message', async () => {
      const response = mockResponse(404);
      const result = await handleFetchError(response);
      expect(result).toBe('Resource not found. It may have been deleted.');
    });
  });

  describe('status 409', () => {
    it('returns conflict message', async () => {
      const response = mockResponse(409);
      const result = await handleFetchError(response);
      expect(result).toBe(
        'Resource already exists or conflicts with existing data.',
      );
    });
  });

  describe('status 500', () => {
    it('returns server error message', async () => {
      const response = mockResponse(500);
      const result = await handleFetchError(response);
      expect(result).toBe(
        'Server error. Please try again or contact support.',
      );
    });
  });

  describe('unknown status codes', () => {
    it('returns the error field from the body when present', async () => {
      const response = mockResponse(422, {
        error: 'Unprocessable entity',
      });
      const result = await handleFetchError(response);
      expect(result).toBe('Unprocessable entity');
    });

    it('returns a generic message with the status code when body has no error', async () => {
      const response = mockResponse(503, {});
      const result = await handleFetchError(response);
      expect(result).toBe('Request failed (503)');
    });

    it('returns a generic message with the status code when body is not parseable', async () => {
      const response = mockResponse(502);
      const result = await handleFetchError(response);
      expect(result).toBe('Request failed (502)');
    });
  });
});
