BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (77);

SELECT
    tests.authenticate_as ('test_user');

-- Setup test data using existing demo app
-- NOTE: All changes will be automatically reverted at the end due to ROLLBACK
-- Create test channels with different platform configurations for com.demo.app
-- Using version ID 3 which is com.demo.app version 1.0.0 from seed data
INSERT INTO public.channels (app_id, name, version, ios, android, public, created_by)
VALUES 
    ('com.demo.app', 'iOS Only Channel Test', 3, true, false, false, tests.get_supabase_uid ('test_user')),
    ('com.demo.app', 'Android Only Channel Test', 3, false, true, false, tests.get_supabase_uid ('test_user')),
    ('com.demo.app', 'Both Platforms Channel Test', 3, true, true, false, tests.get_supabase_uid ('test_user')),
    ('com.demo.app', 'Neither Platform Channel Test', 3, false, false, false, tests.get_supabase_uid ('test_user'));

-- Test 1: update_channel_public_from_app - Should ALLOW different platform-specific channels
-- STATE: iOS Only Channel Test (ios=true, android=false, public=false), Android Only Channel Test (ios=false, android=true, public=false)
-- APPS: default_channel_ios=NULL, default_channel_android=NULL
SELECT
    lives_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'), 
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Should allow assigning different platform-specific channels'
    );

-- Test 16: Only iOS default marks iOS-only channel public and keeps platform flags unchanged
-- Ensure clean state and restore platform flags for iOS Only Channel Test
UPDATE public.apps 
SET default_channel_ios = NULL, 
    default_channel_android = NULL
WHERE app_id = 'com.demo.app';

UPDATE public.channels 
SET ios = true, android = false 
WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';

SELECT
    lives_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
              default_channel_android = NULL
          WHERE app_id = 'com.demo.app'$$,
        'Should allow setting only iOS default and mark iOS-only channel public'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS Only Channel Test should be public when set as default iOS channel'
    );

SELECT
    is (
        (SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS flag remains true on iOS-only channel'
    );

SELECT
    is (
        (SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        false,
        'Android flag remains false on iOS-only channel'
    );

-- Test 17: Only Android default marks Android-only channel public and keeps platform flags unchanged
-- Ensure clean state and restore platform flags for Android Only Channel Test
UPDATE public.apps 
SET default_channel_ios = NULL, 
    default_channel_android = NULL
WHERE app_id = 'com.demo.app';

UPDATE public.channels 
SET ios = false, android = true 
WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';

SELECT
    lives_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = NULL,
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Should allow setting only Android default and mark Android-only channel public'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        true,
        'Android Only Channel Test should be public when set as default Android channel'
    );

SELECT
    is (
        (SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        true,
        'Android flag remains true on Android-only channel'
    );

SELECT
    is (
        (SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        false,
        'iOS flag remains false on Android-only channel'
    );

-- Test 18: Prevent assigning iOS default to channel without iOS support (expected desired behavior)
SELECT
    throws_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
              default_channel_android = NULL
          WHERE app_id = 'com.demo.app'$$,
        'Cannot assign iOS default to channel "Android Only Channel Test" that does not support iOS. Choose an iOS-capable channel.',
        'Should reject choosing non-iOS channel as iOS default'
    );

-- Test 19: Prevent assigning Android default to channel without Android support (expected desired behavior)
SELECT
    throws_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = NULL,
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Cannot assign Android default to channel "iOS Only Channel Test" that does not support Android. Choose an Android-capable channel.',
        'Should reject choosing non-Android channel as Android default'
    );

-- Test 1b: Verify that the trigger automatically made the assigned channels public
-- STATE AFTER: iOS Only Channel Test should now be public, Android Only Channel Test should now be public
SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'Test 1b - Trigger effect: iOS Only Channel Test should be automatically made public'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        true,
        'Test 1b - Trigger effect: Android Only Channel Test should be automatically made public'
    );

-- Test 2: update_channel_public_from_app - Should REJECT iOS channel supporting both platforms with different Android channel
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=false), Android Only Channel Test (ios=false, android=true, public=true)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    throws_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), 
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Cannot assign different channels for iOS and Android when the iOS channel (Both Platforms Channel Test) supports both platforms. Use the same channel for both platforms or choose an iOS-only channel.',
        'Should reject iOS channel supporting both platforms with different Android channel'
    );

-- Test 3: update_channel_public_from_app - Should REJECT Android channel supporting both platforms with different iOS channel
-- STATE: iOS Only Channel Test (ios=true, android=false, public=false), Both Platforms Channel Test (ios=true, android=true, public=false)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    throws_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'), 
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Cannot assign different channels for iOS and Android when the Android channel (Both Platforms Channel Test) supports both platforms. Use the same channel for both platforms or choose an Android-only channel.',
        'Should reject Android channel supporting both platforms with different iOS channel'
    );

-- Test 4: update_channel_public_from_app - Should ALLOW same channel for both platforms
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=false)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    lives_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), 
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Should allow same channel for both platforms'
    );

-- Test 4b: Verify that the trigger automatically made the Both Platforms Channel Test public
-- STATE AFTER: Both Platforms Channel Test should now be public
SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
        true,
        'Test 4b - Trigger effect: Both Platforms Channel Test should be automatically made public'
    );

-- Test 5: guard_channel_public - Should ALLOW making default channel public (already public from trigger)
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=true)
-- APPS: default_channel_ios=Both Platforms Channel Test, default_channel_android=Both Platforms Channel Test
SELECT
    lives_ok (
        $$UPDATE public.channels 
          SET public = true 
          WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'$$,
        'Should allow making default channel public'
    );

-- Test 6: guard_channel_public - Should REJECT making non-default channel public
-- STATE: iOS Only Channel Test (ios=true, android=false, public=false), Both Platforms Channel Test (ios=true, android=true, public=true)
-- APPS: default_channel_ios=Both Platforms Channel Test, default_channel_android=Both Platforms Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET public = true 
          WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'$$,
        'Cannot make channel "iOS Only Channel Test" public unless it is specifically set as a default channel in the apps table. Set the channel as default_channel_ios or default_channel_android first.',
        'Should reject making non-default channel public'
    );

-- Test 7: guard_channel_public - Should REJECT making default channel non-public
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=true)
-- APPS: default_channel_ios=Both Platforms Channel Test, default_channel_android=Both Platforms Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET public = false 
          WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'$$,
        'Cannot make channel "Both Platforms Channel Test" non-public as it is assigned as a default channel in the apps table. Remove the channel from default channels first.',
        'Should reject making default channel non-public'
    );

-- Test 8: guard_channel_public - Should REJECT disabling iOS platform for default iOS channel
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=true)
-- APPS: default_channel_ios=Both Platforms Channel Test, default_channel_android=Both Platforms Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET ios = false 
          WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'$$,
        'Cannot remove iOS platform support from channel "Both Platforms Channel Test" as it is assigned as default_channel_ios in the apps table. Remove the channel from default_channel_ios first.',
        'Should reject disabling iOS platform for default iOS channel'
    );

-- Test 9: guard_channel_public - Should REJECT disabling Android platform for default Android channel
-- STATE: Both Platforms Channel Test (ios=true, android=true, public=true)
-- APPS: default_channel_ios=Both Platforms Channel Test, default_channel_android=Both Platforms Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET android = false 
          WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'$$,
        'Cannot remove Android platform support from channel "Both Platforms Channel Test" as it is assigned as default_channel_android in the apps table. Remove the channel from default_channel_android first.',
        'Should reject disabling Android platform for default Android channel'
    );

-- Test 10: guard_channel_public - Should ALLOW platform changes for non-default channels
-- First remove default assignments
UPDATE public.apps 
SET default_channel_ios = NULL, 
    default_channel_android = NULL
WHERE app_id = 'com.demo.app';

-- STATE: iOS Only Channel Test (ios=true, android=false, public=false)
-- APPS: default_channel_ios=NULL, default_channel_android=NULL
SELECT
    lives_ok (
        $$UPDATE public.channels 
          SET ios = false, android = false 
          WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'$$,
        'Should allow platform changes for non-default channels'
    );

-- Test 11: Integration test - Full workflow with platform-specific channels
-- First restore iOS Only Channel Test to support iOS again
UPDATE public.channels 
SET ios = true, android = false 
WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';

-- STATE: iOS Only Channel Test (ios=true, android=false, public=false), Android Only Channel Test (ios=false, android=true, public=false)
-- APPS: default_channel_ios=NULL, default_channel_android=NULL
SELECT
    lives_ok (
        $$UPDATE public.apps 
          SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'), 
              default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
          WHERE app_id = 'com.demo.app'$$,
        'Integration test - Should allow assigning platform-specific channels'
    );

-- Test 12: Integration test - Make iOS channel public (should work since it's assigned as default)
-- STATE: iOS Only Channel Test (ios=true, android=false, public=false)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    lives_ok (
        $$UPDATE public.channels 
          SET public = true 
          WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'$$,
        'Integration test - Should allow making default iOS channel public'
    );

-- Test 13: Integration test - Make Android channel public (should work since it's assigned as default)
-- STATE: Android Only Channel Test (ios=false, android=true, public=false)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    lives_ok (
        $$UPDATE public.channels 
          SET public = true 
          WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'$$,
        'Integration test - Should allow making default Android channel public'
    );

-- Test 14: Integration test - Should reject disabling iOS support on default iOS channel
-- STATE: iOS Only Channel Test (ios=true, android=false, public=true)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET ios = false 
          WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'$$,
        'Cannot remove iOS platform support from channel "iOS Only Channel Test" as it is assigned as default_channel_ios in the apps table. Remove the channel from default_channel_ios first.',
        'Integration test - Should reject disabling iOS support on default iOS channel'
    );

-- Test 15: Integration test - Should reject disabling Android support on default Android channel
-- STATE: Android Only Channel Test (ios=false, android=true, public=true)
-- APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
SELECT
    throws_ok (
        $$UPDATE public.channels 
          SET android = false 
          WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'$$,
        'Cannot remove Android platform support from channel "Android Only Channel Test" as it is assigned as default_channel_android in the apps table. Remove the channel from default_channel_android first.',
        'Integration test - Should reject disabling Android support on default Android channel'
    );

-- Test 20: set_default_channel can assign iOS default to a channel after ensuring platform support
-- Ensure Android Only Channel Test has ios=false initially
UPDATE public.channels SET ios = false WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';

SELECT
    lives_ok (
        $$SELECT public.set_default_channel('com.demo.app', 'Android Only Channel Test', 'ios')$$,
        'set_default_channel should enable iOS support and assign as iOS default'
    );

SELECT
    is (
        (SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'),
        (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        'iOS default should point to Android Only Channel Test'
    );

SELECT
    is (
        (SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        true,
        'Android Only Channel Test should now support iOS'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
        true,
        'Android Only Channel Test becomes public as default'
    );

-- Test 21: set_default_channel can assign Android default after ensuring platform support
-- Ensure iOS Only Channel Test has android=false initially
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET android = false, ios = true WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
UPDATE public.channels SET android = true, ios = false WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
UPDATE public.apps SET 
    default_channel_ios = (select id from public.channels where app_id = 'com.demo.app' and name = 'iOS Only Channel Test'), 
    default_channel_android = (select id from public.channels where app_id = 'com.demo.app' and name = 'Android Only Channel Test') 
WHERE app_id = 'com.demo.app';

SELECT
    lives_ok (
        $$SELECT public.set_default_channel('com.demo.app', 'iOS Only Channel Test', 'android')$$,
        'set_default_channel should enable Android support and assign as Android default'
    );

SELECT
    is (
        (SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'),
        (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        'Android default should point to iOS Only Channel Test'
    );

SELECT
    is (
        (SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS Only Channel Test should now support Android'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS Only Channel Test becomes public as default'
    );

SELECT
    tests.authenticate_as ('test_user');

-- Test 22: Guard enabling Android on iOS default when Android default differs
-- Ensure defaults: iOS default = iOS Only Channel Test, Android default = Android Only Channel Test
SELECT
    throws_ok(
        $$DO $b$
        BEGIN
          UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
          UPDATE public.channels SET android = false, ios = true WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
          UPDATE public.channels SET ios = false, android = true WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
          UPDATE public.apps 
            SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
                default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
            WHERE app_id = 'com.demo.app';
          UPDATE public.channels SET android = true WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
        END
        $b$ LANGUAGE plpgsql$$,
        'Cannot add Android platform support to channel "iOS Only Channel Test" as it is assigned as default_channel_ios and a different Android default is set. Use the same channel for both platforms or set Android default to this channel first.',
        'Should reject enabling Android support on iOS default when Android default differs'
    );

-- Test 23: Guard enabling iOS on Android default when iOS default differs
-- Ensure defaults: Android default = Android Only Channel Test, iOS default = iOS Only Channel Test
SELECT
    throws_ok(
        $$DO $b$
        BEGIN
          UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
          UPDATE public.channels SET android = false, ios = true WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
          UPDATE public.channels SET ios = false, android = true WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
          UPDATE public.apps 
            SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
                default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
            WHERE app_id = 'com.demo.app';
          UPDATE public.channels SET ios = true WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
        END
        $b$ LANGUAGE plpgsql$$,
        'Cannot add iOS platform support to channel "Android Only Channel Test" as it is assigned as default_channel_android and a different iOS default is set. Use the same channel for both platforms or set iOS default to this channel first.',
        'Should reject enabling iOS support on Android default when iOS default differs'
    );

-- Test 22: set_default_channel both — assign same channel for both platforms in one operation
-- Reset defaults first
UPDATE public.apps 
SET default_channel_ios = NULL, 
    default_channel_android = NULL
WHERE app_id = 'com.demo.app';

-- Use iOS Only Channel Test and enable android too, then set both defaults
UPDATE public.channels SET ios = true, android = false WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';

SELECT
    lives_ok (
        $$SELECT public.set_default_channel('com.demo.app', 'iOS Only Channel Test', 'both')$$,
        'set_default_channel(both) should enable android and set both defaults to the same channel'
    );

SELECT
    is (
        (SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'),
        (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        'iOS default points to iOS Only Channel Test'
    );

SELECT
    is (
        (SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'),
        (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        'Android default points to iOS Only Channel Test'
    );

SELECT
    is (
        (SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS Only Channel Test now supports Android'
    );

SELECT
    is (
        (SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
        true,
        'iOS Only Channel Test is public as both defaults'
    );

-- Test 24: set_default_channel('ios') on a both-platform channel when Android default differs should disable android on the selected channel
-- Prepare: defaults point to Both Platforms Channel Test for both
UPDATE public.apps 
SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), 
    default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
WHERE app_id = 'com.demo.app';

UPDATE public.channels SET android = true, ios = true WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test';

-- Create another both-platform channel for the edge case
INSERT INTO public.channels (app_id, name, version, ios, android, public, created_by)
VALUES ('com.demo.app', 'Both Two Channel Test', 3, true, true, false, tests.get_supabase_uid('test_user'))
ON CONFLICT (app_id, name) DO NOTHING;

-- Call set_default_channel to set iOS default to the new both-platform channel
SELECT lives_ok($$SELECT public.set_default_channel('com.demo.app', 'Both Two Channel Test', 'ios')$$,
  'set_default_channel ios should set iOS default and disable Android on selected channel if Android default differs');

-- Assert flags and defaults
SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'),
          'iOS default now points to Both Two Channel Test');
SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
          'Android default remains Both Platforms Channel Test');
SELECT is((SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'), true,
          'Both Two Channel Test iOS flag remains true');
SELECT is((SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'), false,
          'Both Two Channel Test Android flag was disabled');
SELECT is((SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), false,
          'Both Platforms Channel Test iOS flag was disabled');
SELECT is((SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), true,
          'Both Platforms Channel Test Android flag remains true');

-- Test 25: set_default_channel('android') on a both-platform channel when iOS default differs should disable iOS on the selected channel
-- Reset defaults back to Both Platforms Channel Test for both
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test';
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test';
UPDATE public.apps 
SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), 
    default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
WHERE app_id = 'com.demo.app';

-- Ensure Both Two flags are both true before calling
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test';

SELECT lives_ok($$SELECT public.set_default_channel('com.demo.app', 'Both Two Channel Test', 'android')$$,
  'set_default_channel android should set Android default and disable iOS on selected channel if iOS default differs');

SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'),
          'Android default now points to Both Two Channel Test');
SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
          'iOS default remains Both Platforms Channel Test');
SELECT is((SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'), true,
          'Both Two Channel Test Android flag remains true');
SELECT is((SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Two Channel Test'), false,
          'Both Two Channel Test iOS flag was disabled');
SELECT is((SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), false,
          'Both Platforms Channel Test Android flag was disabled');
SELECT is((SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), true,
          'Both Platforms Channel Test iOS flag remains true');


-- Test 26: unset_default_channel('ios') unsets iOS default and updates public flags coherently
-- Prepare: set iOS default to iOS Only Channel Test and Android default to Android Only Channel Test
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = false WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
UPDATE public.channels SET ios = false, android = true WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
UPDATE public.apps 
  SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
      default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
  WHERE app_id = 'com.demo.app';

SELECT lives_ok($$SELECT public.unset_default_channel('com.demo.app', 'ios')$$,
  'unset_default_channel ios should unset iOS default');

SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'iOS default is NULL after unset');

SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'),
  'Android default remains unchanged');

SELECT is((SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'), false,
  'Previous iOS default channel becomes non-public after unset');

SELECT is((SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'), true,
  'Android default remains public');

-- Test 27: unset_default_channel('android') unsets Android default and updates public flags coherently
-- Prepare: set defaults again
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = false WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test';
UPDATE public.channels SET ios = false, android = true WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test';
UPDATE public.apps 
  SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
      default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test')
  WHERE app_id = 'com.demo.app';

SELECT lives_ok($$SELECT public.unset_default_channel('com.demo.app', 'android')$$,
  'unset_default_channel android should unset Android default');

SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'Android default is NULL after unset');

SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'),
          (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'),
  'iOS default remains unchanged');

SELECT is((SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Android Only Channel Test'), false,
  'Previous Android default channel becomes non-public after unset');

SELECT is((SELECT public FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'iOS Only Channel Test'), true,
  'iOS default remains public');

-- Test 28: unset_default_channel('both') unsets both defaults and marks all channels non-public for this app
-- Prepare: set same channel for both defaults
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test';
UPDATE public.apps 
  SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
      default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
  WHERE app_id = 'com.demo.app';

SELECT lives_ok($$SELECT public.unset_default_channel('com.demo.app', 'both')$$,
  'unset_default_channel both should unset both defaults');

SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'iOS default is NULL after both unset');
SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'Android default is NULL after both unset');

-- Note: public flag behavior when both defaults are NULL is left unchanged by trigger; no assertion here

-- Test 29: unset_default_channel invalid platform should throw
SELECT throws_ok($$SELECT public.unset_default_channel('com.demo.app', 'windows')$$,
  'Invalid platform: windows (expected ios|android|both)',
  'Invalid platform rejected');

-- Test 30: Unsetting iOS when both defaults are the same should disable iOS support on that channel
-- Prepare: set Both Platforms Channel Test as both defaults with both supports
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test';
UPDATE public.apps 
  SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
      default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
  WHERE app_id = 'com.demo.app';

SELECT lives_ok($$SELECT public.unset_default_channel('com.demo.app', 'ios')$$,
  'unset_default_channel ios should work when both defaults are same');

SELECT is((SELECT default_channel_ios FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'iOS default is NULL after unset');
SELECT is((SELECT ios FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), false,
  'iOS support disabled on channel that remains Android default');

-- Test 31: Unsetting Android when both defaults are the same should disable Android support on that channel
-- Prepare: set Both Platforms Channel Test as both defaults with both supports
UPDATE public.apps SET default_channel_ios = NULL, default_channel_android = NULL WHERE app_id = 'com.demo.app';
UPDATE public.channels SET ios = true, android = true WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test';
UPDATE public.apps 
  SET default_channel_ios = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'),
      default_channel_android = (SELECT id FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test')
  WHERE app_id = 'com.demo.app';

SELECT lives_ok($$SELECT public.unset_default_channel('com.demo.app', 'android')$$,
  'unset_default_channel android should work when both defaults are same');

SELECT is((SELECT default_channel_android FROM public.apps WHERE app_id = 'com.demo.app'), NULL,
  'Android default is NULL after unset');
SELECT is((SELECT android FROM public.channels WHERE app_id = 'com.demo.app' AND name = 'Both Platforms Channel Test'), false,
  'Android support disabled on channel that remains iOS default');

SELECT
    tests.clear_authentication ();

SELECT
    * FROM finish ();

ROLLBACK;
