import {test, expect} from '../../support/fixtures'
import {getApiUrl} from '../../support/apiUrl'

// Requires the Dex OIDC test provider (started as a service container in CI).
// Skip when the API has no OpenID providers configured, e.g. under the local
// mage harness.
async function openidConfigured(): Promise<boolean> {
	try {
		const response = await fetch(`${getApiUrl()}/info`)
		const info = await response.json()
		return (info?.auth?.openid_connect?.providers?.length ?? 0) > 0
	} catch {
		return false
	}
}

test.describe('OpenID Login', () => {
	test('logs in via Dex provider', async ({page}) => {
		test.skip(!await openidConfigured(), 'No OpenID provider configured on the API')
		await page.goto('/login')
		await page.locator('text=Dex').click()

		// Wait for navigation to Dex origin
		await expect(page.locator('h2')).toContainText('Log in to Your Account')

		// Fill in the Dex login form
		await page.locator('#login').fill('test@example.com')
		await page.locator('#password').fill('12345678')
		await page.locator('#submit-login').click()

		// Should redirect back to the app
		await expect(page).toHaveURL(/\//)
		await expect(page.locator('main.app-content .content h1')).toContainText('test')
		await expect(page.locator('.show-tasks h2')).toContainText('Current Tasks')
	})
})
