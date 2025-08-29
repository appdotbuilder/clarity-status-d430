import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { siteSettingsTable } from '../db/schema';
import { type UpdateSiteSettingInput } from '../schema';
import { 
    getSiteSetting, 
    getAllSiteSettings, 
    updateSiteSetting, 
    getMaintenanceMode, 
    setMaintenanceMode, 
    getMaintenanceModeMessage 
} from '../handlers/settings';
import { eq } from 'drizzle-orm';

describe('Settings Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('getSiteSetting', () => {
        it('should return null when setting does not exist', async () => {
            const result = await getSiteSetting('nonexistent_key');
            expect(result).toBeNull();
        });

        it('should return setting when it exists', async () => {
            // Insert test setting
            await db.insert(siteSettingsTable)
                .values({
                    key: 'test_key',
                    value: 'test_value'
                })
                .execute();

            const result = await getSiteSetting('test_key');
            expect(result).not.toBeNull();
            expect(result!.key).toEqual('test_key');
            expect(result!.value).toEqual('test_value');
            expect(result!.id).toBeDefined();
            expect(result!.created_at).toBeInstanceOf(Date);
            expect(result!.updated_at).toBeInstanceOf(Date);
        });
    });

    describe('getAllSiteSettings', () => {
        it('should return empty array when no settings exist', async () => {
            const result = await getAllSiteSettings();
            expect(result).toEqual([]);
        });

        it('should return all settings', async () => {
            // Insert multiple test settings
            await db.insert(siteSettingsTable)
                .values([
                    { key: 'setting1', value: 'value1' },
                    { key: 'setting2', value: 'value2' },
                    { key: 'setting3', value: null }
                ])
                .execute();

            const result = await getAllSiteSettings();
            expect(result).toHaveLength(3);
            
            const keys = result.map(s => s.key);
            expect(keys).toContain('setting1');
            expect(keys).toContain('setting2');
            expect(keys).toContain('setting3');

            const setting1 = result.find(s => s.key === 'setting1');
            expect(setting1!.value).toEqual('value1');

            const setting3 = result.find(s => s.key === 'setting3');
            expect(setting3!.value).toBeNull();
        });
    });

    describe('updateSiteSetting', () => {
        it('should create new setting when it does not exist', async () => {
            const input: UpdateSiteSettingInput = {
                key: 'new_setting',
                value: 'new_value'
            };

            const result = await updateSiteSetting(input);
            
            expect(result.key).toEqual('new_setting');
            expect(result.value).toEqual('new_value');
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);

            // Verify it was saved to database
            const dbResult = await db.select()
                .from(siteSettingsTable)
                .where(eq(siteSettingsTable.id, result.id))
                .execute();
            
            expect(dbResult).toHaveLength(1);
            expect(dbResult[0].key).toEqual('new_setting');
            expect(dbResult[0].value).toEqual('new_value');
        });

        it('should update existing setting', async () => {
            // Create initial setting
            const initialResult = await db.insert(siteSettingsTable)
                .values({
                    key: 'existing_setting',
                    value: 'old_value'
                })
                .returning()
                .execute();

            const input: UpdateSiteSettingInput = {
                key: 'existing_setting',
                value: 'updated_value'
            };

            const result = await updateSiteSetting(input);
            
            expect(result.id).toEqual(initialResult[0].id);
            expect(result.key).toEqual('existing_setting');
            expect(result.value).toEqual('updated_value');
            expect(result.updated_at.getTime()).toBeGreaterThan(initialResult[0].updated_at.getTime());

            // Verify only one record exists
            const dbResults = await db.select()
                .from(siteSettingsTable)
                .where(eq(siteSettingsTable.key, 'existing_setting'))
                .execute();
            
            expect(dbResults).toHaveLength(1);
            expect(dbResults[0].value).toEqual('updated_value');
        });

        it('should handle null values', async () => {
            const input: UpdateSiteSettingInput = {
                key: 'nullable_setting',
                value: null
            };

            const result = await updateSiteSetting(input);
            
            expect(result.key).toEqual('nullable_setting');
            expect(result.value).toBeNull();
        });

        it('should update null value to non-null', async () => {
            // Create setting with null value
            await db.insert(siteSettingsTable)
                .values({
                    key: 'null_setting',
                    value: null
                })
                .execute();

            const input: UpdateSiteSettingInput = {
                key: 'null_setting',
                value: 'now_has_value'
            };

            const result = await updateSiteSetting(input);
            expect(result.value).toEqual('now_has_value');
        });
    });

    describe('getMaintenanceMode', () => {
        it('should return false when maintenance mode setting does not exist', async () => {
            const result = await getMaintenanceMode();
            expect(result).toBe(false);
        });

        it('should return false when maintenance mode is disabled', async () => {
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_enabled',
                    value: 'false'
                })
                .execute();

            const result = await getMaintenanceMode();
            expect(result).toBe(false);
        });

        it('should return true when maintenance mode is enabled', async () => {
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_enabled',
                    value: 'true'
                })
                .execute();

            const result = await getMaintenanceMode();
            expect(result).toBe(true);
        });

        it('should return false for invalid values', async () => {
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_enabled',
                    value: 'invalid'
                })
                .execute();

            const result = await getMaintenanceMode();
            expect(result).toBe(false);
        });
    });

    describe('setMaintenanceMode', () => {
        it('should enable maintenance mode', async () => {
            await setMaintenanceMode(true);

            const result = await getMaintenanceMode();
            expect(result).toBe(true);

            // Verify database state
            const dbResult = await db.select()
                .from(siteSettingsTable)
                .where(eq(siteSettingsTable.key, 'maintenance_mode_enabled'))
                .execute();
            
            expect(dbResult).toHaveLength(1);
            expect(dbResult[0].value).toEqual('true');
        });

        it('should disable maintenance mode', async () => {
            // First enable it
            await setMaintenanceMode(true);
            
            // Then disable it
            await setMaintenanceMode(false);

            const result = await getMaintenanceMode();
            expect(result).toBe(false);

            // Verify database state
            const dbResult = await db.select()
                .from(siteSettingsTable)
                .where(eq(siteSettingsTable.key, 'maintenance_mode_enabled'))
                .execute();
            
            expect(dbResult).toHaveLength(1);
            expect(dbResult[0].value).toEqual('false');
        });

        it('should set maintenance mode with message', async () => {
            const message = 'Scheduled maintenance in progress';
            await setMaintenanceMode(true, message);

            const result = await getMaintenanceMode();
            expect(result).toBe(true);

            const messageResult = await getMaintenanceModeMessage();
            expect(messageResult).toEqual(message);

            // Verify both settings in database
            const settings = await getAllSiteSettings();
            const enabledSetting = settings.find(s => s.key === 'maintenance_mode_enabled');
            const messageSetting = settings.find(s => s.key === 'maintenance_mode_message');
            
            expect(enabledSetting!.value).toEqual('true');
            expect(messageSetting!.value).toEqual(message);
        });

        it('should update existing maintenance mode and message', async () => {
            // Set initial state
            await setMaintenanceMode(false, 'Initial message');
            
            // Update both
            await setMaintenanceMode(true, 'Updated message');

            const modeResult = await getMaintenanceMode();
            const messageResult = await getMaintenanceModeMessage();
            
            expect(modeResult).toBe(true);
            expect(messageResult).toEqual('Updated message');

            // Verify only one record exists for each key
            const allSettings = await getAllSiteSettings();
            const enabledSettings = allSettings.filter(s => s.key === 'maintenance_mode_enabled');
            const messageSettings = allSettings.filter(s => s.key === 'maintenance_mode_message');
            
            expect(enabledSettings).toHaveLength(1);
            expect(messageSettings).toHaveLength(1);
        });

        it('should not update message when not provided', async () => {
            // Set initial message
            await setMaintenanceMode(true, 'Initial message');
            
            // Update mode without message
            await setMaintenanceMode(false);

            const modeResult = await getMaintenanceMode();
            const messageResult = await getMaintenanceModeMessage();
            
            expect(modeResult).toBe(false);
            expect(messageResult).toEqual('Initial message'); // Should remain unchanged
        });

        it('should clear message when empty string provided', async () => {
            // Set initial message
            await setMaintenanceMode(true, 'Initial message');
            
            // Clear message
            await setMaintenanceMode(true, '');

            const messageResult = await getMaintenanceModeMessage();
            expect(messageResult).toEqual('');
        });
    });

    describe('getMaintenanceModeMessage', () => {
        it('should return null when message does not exist', async () => {
            const result = await getMaintenanceModeMessage();
            expect(result).toBeNull();
        });

        it('should return message when it exists', async () => {
            const message = 'System maintenance in progress';
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_message',
                    value: message
                })
                .execute();

            const result = await getMaintenanceModeMessage();
            expect(result).toEqual(message);
        });

        it('should return null when message value is null', async () => {
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_message',
                    value: null
                })
                .execute();

            const result = await getMaintenanceModeMessage();
            expect(result).toBeNull();
        });

        it('should return empty string when message is empty', async () => {
            await db.insert(siteSettingsTable)
                .values({
                    key: 'maintenance_mode_message',
                    value: ''
                })
                .execute();

            const result = await getMaintenanceModeMessage();
            expect(result).toEqual('');
        });
    });

    describe('Integration scenarios', () => {
        it('should handle complete maintenance mode workflow', async () => {
            // Initially no maintenance mode
            expect(await getMaintenanceMode()).toBe(false);
            expect(await getMaintenanceModeMessage()).toBeNull();

            // Enable with message
            await setMaintenanceMode(true, 'Scheduled maintenance from 2-4 AM EST');
            expect(await getMaintenanceMode()).toBe(true);
            expect(await getMaintenanceModeMessage()).toEqual('Scheduled maintenance from 2-4 AM EST');

            // Update message during maintenance
            await setMaintenanceMode(true, 'Maintenance extended until 5 AM EST');
            expect(await getMaintenanceMode()).toBe(true);
            expect(await getMaintenanceModeMessage()).toEqual('Maintenance extended until 5 AM EST');

            // Disable maintenance
            await setMaintenanceMode(false);
            expect(await getMaintenanceMode()).toBe(false);
            expect(await getMaintenanceModeMessage()).toEqual('Maintenance extended until 5 AM EST'); // Message preserved
        });

        it('should manage multiple settings efficiently', async () => {
            // Create various settings
            await updateSiteSetting({ key: 'site_name', value: 'My Status Page' });
            await updateSiteSetting({ key: 'admin_email', value: 'admin@example.com' });
            await updateSiteSetting({ key: 'timezone', value: 'UTC' });
            await setMaintenanceMode(true, 'Routine maintenance');

            const allSettings = await getAllSiteSettings();
            expect(allSettings.length).toBeGreaterThanOrEqual(4);

            const settingKeys = allSettings.map(s => s.key);
            expect(settingKeys).toContain('site_name');
            expect(settingKeys).toContain('admin_email');
            expect(settingKeys).toContain('timezone');
            expect(settingKeys).toContain('maintenance_mode_enabled');
            expect(settingKeys).toContain('maintenance_mode_message');
        });
    });
});