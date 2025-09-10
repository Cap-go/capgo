BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (28);

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

SELECT
    tests.clear_authentication ();

SELECT
    * FROM finish ();

ROLLBACK;
