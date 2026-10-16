BEGIN;
SELECT plan(1);

SELECT hasnt_table(
    'public', 'manifest_trash_restore_pending',
    'manifest trash recovery is retired'
);

SELECT finish();
ROLLBACK;
