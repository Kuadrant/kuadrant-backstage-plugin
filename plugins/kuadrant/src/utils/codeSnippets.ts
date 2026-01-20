import { Credentials } from '../types/api-management';

export interface CodeSnippets {
  curl: string;
  nodejs: string;
  python: string;
  go: string;
}

export function generateAuthCodeSnippets(
  credentials: Credentials | undefined,
  hostname: string,
  apiKey: string,
): CodeSnippets {
  const baseUrl = `https://${hostname}/api/v1/endpoint`;

  if (!credentials) {
    return generateAuthorizationHeaderSnippets(baseUrl, apiKey, 'Bearer');
  }

  if (credentials.authorizationHeader) {
    const prefix = credentials!.authorizationHeader!.prefix || '';
    return generateAuthorizationHeaderSnippets(baseUrl, apiKey, prefix);
  }

  if (credentials.customHeader) {
    const headerName = credentials!.customHeader!.name;
      const prefix = credentials!.customHeader!.prefix || '';
      return generateCustomHeaderSnippets(baseUrl, apiKey, headerName, prefix);
  }


  if (credentials.queryString) {
    const paramName = credentials!.queryString!.name;
    return generateQueryStringSnippets(baseUrl, apiKey, paramName);
  }

  if (credentials.cookie) {
    const cookieName = credentials!.cookie!.name;
    return generateCookieSnippets(baseUrl, apiKey, cookieName);
  }
  // Default to Authorization Bearer if no authScheme specified
  return generateAuthorizationHeaderSnippets(baseUrl, apiKey, 'Bearer');
}

function generateAuthorizationHeaderSnippets(
  baseUrl: string,
  apiKey: string,
  prefix: string,
): CodeSnippets {
  const authValue = prefix ? `${prefix} ${apiKey}` : apiKey;
  const prefixWithSpace = prefix ? `${prefix} ` : '';

  return {
    curl: `curl -X GET ${baseUrl} \\
  -H "Authorization: ${authValue}"`,

    nodejs: `const fetch = require('node-fetch');

const apiKey = '${apiKey}';
const endpoint = '${baseUrl}';

fetch(endpoint, {
  method: 'GET',
  headers: {
    'Authorization': '${prefixWithSpace}' + apiKey
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

    python: `import requests

api_key = '${apiKey}'
endpoint = '${baseUrl}'

headers = {
    'Authorization': '${prefixWithSpace}' + api_key
}

response = requests.get(endpoint, headers=headers)
print(response.json())`,

    go: `package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${apiKey}"
    endpoint := "${baseUrl}"

    client := &http.Client{}
    req, _ := http.NewRequest("GET", endpoint, nil)
    req.Header.Add("Authorization", "${prefixWithSpace}" + apiKey)

    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
  };
}

function generateCustomHeaderSnippets(
  baseUrl: string,
  apiKey: string,
  headerName: string,
  prefix: string,
): CodeSnippets {
  const headerValue = prefix ? `${prefix}${apiKey}` : apiKey;

  return {
    curl: `curl -X GET ${baseUrl} \\
  -H "${headerName}: ${headerValue}"`,

    nodejs: `const fetch = require('node-fetch');

const apiKey = '${apiKey}';
const endpoint = '${baseUrl}';

fetch(endpoint, {
  method: 'GET',
  headers: {
    '${headerName}': '${prefix}' + apiKey
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

    python: `import requests

api_key = '${apiKey}'
endpoint = '${baseUrl}'

headers = {
    '${headerName}': '${prefix}' + api_key
}

response = requests.get(endpoint, headers=headers)
print(response.json())`,

    go: `package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${apiKey}"
    endpoint := "${baseUrl}"

    client := &http.Client{}
    req, _ := http.NewRequest("GET", endpoint, nil)
    req.Header.Add("${headerName}", "${prefix}" + apiKey)

    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
  };
}

function generateQueryStringSnippets(
  baseUrl: string,
  apiKey: string,
  paramName: string,
): CodeSnippets {
  const urlWithParam = `${baseUrl}?${paramName}=${apiKey}`;

  return {
    curl: `curl -X GET "${urlWithParam}"`,

    nodejs: `const fetch = require('node-fetch');

const apiKey = '${apiKey}';
const endpoint = '${baseUrl}?${paramName}=' + apiKey;

fetch(endpoint, {
  method: 'GET'
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

    python: `import requests

api_key = '${apiKey}'
endpoint = '${baseUrl}'

params = {
    '${paramName}': api_key
}

response = requests.get(endpoint, params=params)
print(response.json())`,

    go: `package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${apiKey}"
    endpoint := "${baseUrl}?${paramName}=" + apiKey

    client := &http.Client{}
    req, _ := http.NewRequest("GET", endpoint, nil)

    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
  };
}

function generateCookieSnippets(
  baseUrl: string,
  apiKey: string,
  cookieName: string,
): CodeSnippets {
  return {
    curl: `curl -X GET ${baseUrl} \\
  --cookie "${cookieName}=${apiKey}"`,

    nodejs: `const fetch = require('node-fetch');

const apiKey = '${apiKey}';
const endpoint = '${baseUrl}';

fetch(endpoint, {
  method: 'GET',
  headers: {
    'Cookie': '${cookieName}=' + apiKey
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,

    python: `import requests

api_key = '${apiKey}'
endpoint = '${baseUrl}'

cookies = {
    '${cookieName}': api_key
}

response = requests.get(endpoint, cookies=cookies)
print(response.json())`,

    go: `package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    apiKey := "${apiKey}"
    endpoint := "${baseUrl}"

    client := &http.Client{}
    req, _ := http.NewRequest("GET", endpoint, nil)
    req.AddCookie(&http.Cookie{
        Name:  "${cookieName}",
        Value: apiKey,
    })

    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
  };
}
