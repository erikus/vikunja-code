// The mage e2e harness exports API_URL with a trailing slash (Playwright's
// baseURL needs one for relative-path resolution), but helpers building
// absolute URLs must not end up with `/api/v1//user` — the API 404s those.
export function getApiUrl() {
	return (process.env.API_URL || 'http://localhost:3456/api/v1').replace(/\/+$/, '')
}
