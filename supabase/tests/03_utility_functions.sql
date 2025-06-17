BEGIN;

SELECT
    plan (11);

-- Test convert_bytes_to_gb
SELECT
    is (
        convert_bytes_to_gb (1073741824),
        1.0::double precision,
        'convert_bytes_to_gb test - valid input'
    );

SELECT
    is (
        convert_bytes_to_gb (-1073741824),
        -1.0::double precision,
        'convert_bytes_to_gb test - negative input'
    );

-- Test convert_bytes_to_mb
SELECT
    is (
        convert_bytes_to_mb (1048576),
        1.0::double precision,
        'convert_bytes_to_mb test - valid input'
    );

SELECT
    is (
        convert_bytes_to_mb (-1048576),
        -1.0::double precision,
        'convert_bytes_to_mb test - negative input'
    );

-- Test convert_gb_to_bytes
SELECT
    is (
        convert_gb_to_bytes (1),
        1073741824::double precision,
        'convert_gb_to_bytes test - valid input'
    );

SELECT
    is (
        convert_gb_to_bytes (-1),
        -1073741824::double precision,
        'convert_gb_to_bytes test - negative input'
    );

-- Test convert_mb_to_bytes
SELECT
    is (
        convert_mb_to_bytes (1),
        1048576::double precision,
        'convert_mb_to_bytes test - valid input'
    );

SELECT
    is (
        convert_mb_to_bytes (-1),
        -1048576::double precision,
        'convert_mb_to_bytes test - negative input'
    );

-- Test convert_number_to_percent
SELECT
    is (
        convert_number_to_percent (50, 100),
        50.0::double precision,
        'convert_number_to_percent test - valid input'
    );

SELECT
    is (
        convert_number_to_percent (150, 100),
        150.0::double precision,
        'convert_number_to_percent test - input exceeds max'
    );

SELECT
    is (
        convert_number_to_percent (50, 0),
        0.0::double precision,
        'convert_number_to_percent test - zero max value'
    );

SELECT
    *
FROM
    finish ();

ROLLBACK;
