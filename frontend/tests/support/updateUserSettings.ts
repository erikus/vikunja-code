import type {APIRequestContext} from '@playwright/test'
import {objectToSnakeCase} from '../../src/helpers/case'
import {getApiUrl} from './apiUrl'

export async function updateUserSettings(apiContext: APIRequestContext, token: string, settings: any) {
	const apiUrl = getApiUrl()

	const userResponse = await apiContext.get(`${apiUrl}/user`, {
		headers: {
			'Authorization': `Bearer ${token}`,
		},
	})
	if (!userResponse.ok()) {
		throw new Error(`Failed to fetch current user settings (${userResponse.status()})`)
	}

	const userData = await userResponse.json()
	// GET /user returns { settings: { frontend_settings: ... }, ... }
	// POST /user/settings/general expects { frontend_settings: ... } at the top level
	const oldSettings = userData.settings || {}

	const snakeSettings = objectToSnakeCase(settings)

	// Deep merge frontend_settings if provided
	const mergedSettings = {
		...oldSettings,
		...snakeSettings,
	}

	if (snakeSettings.frontend_settings) {
		mergedSettings.frontend_settings = {
			...(oldSettings.frontend_settings || {}),
			...snakeSettings.frontend_settings,
		}
	}

	const updateResponse = await apiContext.post(`${apiUrl}/user/settings/general`, {
		headers: {
			'Authorization': `Bearer ${token}`,
		},
		data: mergedSettings,
	})
	if (!updateResponse.ok()) {
		throw new Error(`Failed to update user settings (${updateResponse.status()})`)
	}
}
