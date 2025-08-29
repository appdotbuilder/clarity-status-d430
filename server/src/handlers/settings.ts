import { db } from '../db';
import { siteSettingsTable } from '../db/schema';
import { type UpdateSiteSettingInput, type SiteSetting } from '../schema';
import { eq } from 'drizzle-orm';

export async function getSiteSetting(key: string): Promise<SiteSetting | null> {
    try {
        const results = await db.select()
            .from(siteSettingsTable)
            .where(eq(siteSettingsTable.key, key))
            .execute();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        console.error('Failed to get site setting:', error);
        throw error;
    }
}

export async function getAllSiteSettings(): Promise<SiteSetting[]> {
    try {
        const results = await db.select()
            .from(siteSettingsTable)
            .execute();

        return results;
    } catch (error) {
        console.error('Failed to get all site settings:', error);
        throw error;
    }
}

export async function updateSiteSetting(input: UpdateSiteSettingInput): Promise<SiteSetting> {
    try {
        // First try to update an existing setting
        const updateResult = await db.update(siteSettingsTable)
            .set({
                value: input.value,
                updated_at: new Date()
            })
            .where(eq(siteSettingsTable.key, input.key))
            .returning()
            .execute();

        if (updateResult.length > 0) {
            return updateResult[0];
        }

        // If no existing setting was found, insert a new one
        const insertResult = await db.insert(siteSettingsTable)
            .values({
                key: input.key,
                value: input.value
            })
            .returning()
            .execute();

        return insertResult[0];
    } catch (error) {
        console.error('Failed to update site setting:', error);
        throw error;
    }
}

export async function getMaintenanceMode(): Promise<boolean> {
    try {
        const setting = await getSiteSetting('maintenance_mode_enabled');
        return setting ? setting.value === 'true' : false;
    } catch (error) {
        console.error('Failed to get maintenance mode:', error);
        throw error;
    }
}

export async function setMaintenanceMode(enabled: boolean, message?: string): Promise<void> {
    try {
        // Update the maintenance mode enabled flag
        await updateSiteSetting({
            key: 'maintenance_mode_enabled',
            value: enabled.toString()
        });

        // Update the maintenance mode message if provided
        if (message !== undefined) {
            await updateSiteSetting({
                key: 'maintenance_mode_message',
                value: message
            });
        }
    } catch (error) {
        console.error('Failed to set maintenance mode:', error);
        throw error;
    }
}

export async function getMaintenanceModeMessage(): Promise<string | null> {
    try {
        const setting = await getSiteSetting('maintenance_mode_message');
        return setting ? setting.value : null;
    } catch (error) {
        console.error('Failed to get maintenance mode message:', error);
        throw error;
    }
}