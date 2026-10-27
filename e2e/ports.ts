/*
  Fixed ports, because the app server has to be told the API's address before the API
  is running.

  Playwright starts `webServer` first and `globalSetup` second, so the Vite dev server
  is handed `VITE_API_BASE_URL` from this file rather than from a port the mock API
  picked for itself. Both are on 127.0.0.1 and both are torn down with the run.
*/
export const APP_PORT = 4318;
export const MOCK_API_PORT = 4319;

export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const MOCK_API_URL = `http://127.0.0.1:${MOCK_API_PORT}`;
